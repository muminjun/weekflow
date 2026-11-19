// Regression tests for migration 014; same auth shim as database.test.ts.
import { PGlite } from "@electric-sql/pglite";
import { readdirSync, readFileSync } from "node:fs";
import { beforeAll, afterAll, it, expect } from "vitest";
let db: PGlite;
const users: string[] = [];
async function newUser() {
  const id = crypto.randomUUID();
  users.push(id);
  await db.exec(
    `reset role;insert into auth.users values ('${id}');set request.jwt.claim.sub='${id}';select public.ensure_profile();`,
  );
  return id;
}
const as = (id: string) =>
  db.exec(`reset role;set request.jwt.claim.sub='${id}'`);
async function one<T>(sql: string, params: unknown[] = []) {
  return (await db.query<T>(sql, params)).rows[0];
}
beforeAll(async () => {
  db = new PGlite();
  await db.exec(
    `create schema auth; create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$; create role authenticated; create role anon;create role service_role; grant usage on schema public,auth to authenticated,anon; grant execute on function auth.uid() to authenticated,anon;`,
  );
  for (const f of readdirSync("supabase/migrations")
    .filter((f) => f.endsWith(".sql"))
    .sort())
    await db.exec(
      readFileSync(`supabase/migrations/${f}`, "utf8").replace(
        "create extension if not exists pgcrypto;",
        "",
      ),
    );
}, 30000);
afterAll(async () => {
  await db?.close();
});

it("re-arms cancelled reminders after notifications toggle off and on", async () => {
  const u = await newUser();
  const block = crypto.randomUUID();
  await db.exec(
    `update notification_preferences set enabled=true,event_reminder_minutes=10 where user_id='${u}';insert into time_blocks(id,user_id,kind,event_title,start_at,end_at,local_date) values('${block}','${u}','event','future',date_trunc('hour',now())+interval '1 day',date_trunc('hour',now())+interval '1 day 1 hour',current_date);select schedule_notifications();`,
  );
  await db.exec(
    `update notification_jobs set attempts=3 where source_id='${block}';update notification_preferences set enabled=false where user_id='${u}';select schedule_notifications();`,
  );
  expect(
    await one(
      "select state,count(*) over()::int n from notification_jobs where source_id=$1",
      [block],
    ),
  ).toEqual({ state: "cancelled", n: 1 });
  await db.exec(
    `update notification_preferences set enabled=true where user_id='${u}';select schedule_notifications();`,
  );
  expect(
    await one(
      "select j.state,j.attempts,j.due_at=b.start_at-interval '10 minutes' timed from notification_jobs j join time_blocks b on b.id=j.source_id where j.source_id=$1",
      [block],
    ),
  ).toEqual({ state: "pending", attempts: 0, timed: true });
});

it("re-arms the original reminder when a block moves 10:00 -> 11:00 -> 10:00", async () => {
  const u = await newUser();
  const block = crypto.randomUUID();
  await db.exec(
    `update notification_preferences set enabled=true,event_reminder_minutes=10 where user_id='${u}';insert into time_blocks(id,user_id,kind,event_title,start_at,end_at,local_date) values('${block}','${u}','event','move',date_trunc('hour',now())+interval '2 days',date_trunc('hour',now())+interval '2 days 1 hour',current_date);select schedule_notifications();`,
  );
  await db.exec(
    `update time_blocks set start_at=start_at+interval '1 hour',end_at=end_at+interval '1 hour' where id='${block}';select schedule_notifications();`,
  );
  await db.exec(
    `update time_blocks set start_at=start_at-interval '1 hour',end_at=end_at-interval '1 hour' where id='${block}';select schedule_notifications();`,
  );
  const r = await db.query<{ state: string; current: boolean }>(
    "select j.state,(j.payload->>'start_at')=b.start_at::text current from notification_jobs j join time_blocks b on b.id=j.source_id where j.source_id=$1 order by j.payload->>'start_at'",
    [block],
  );
  expect(r.rows).toEqual([
    { state: "pending", current: true },
    { state: "cancelled", current: false },
  ]);
});

it("status-only edits of an acknowledged overlap are not TIME_CONFLICT, moves still are", async () => {
  await newUser(); // fresh owner; newUser() leaves its JWT subject active
  const b1 = crypto.randomUUID(),
    b2 = crypto.randomUUID();
  const insert = (id: string, start: string, end: string) =>
    JSON.stringify([
      {
        table: "time_blocks",
        action: "insert",
        row: {
          id,
          kind: "event",
          event_title: "overlap",
          start_at: start,
          end_at: end,
          local_date: "2026-11-09",
        },
      },
    ]);
  const update = (row: Record<string, unknown>, version: number) =>
    JSON.stringify([
      {
        table: "time_blocks",
        action: "update",
        row: { id: b2, ...row },
        expected_version: version,
      },
    ]);
  await db.query("select apply_changes($1,$2::jsonb,false)", [
    crypto.randomUUID(),
    insert(b1, "2026-11-09T01:00:00Z", "2026-11-09T02:00:00Z"),
  ]);
  await db.query("select apply_changes($1,$2::jsonb,true)", [
    crypto.randomUUID(),
    insert(b2, "2026-11-09T01:30:00Z", "2026-11-09T02:30:00Z"),
  ]);
  // Same instant in a different textual form is not a move.
  await db.query("select apply_changes($1,$2::jsonb,false)", [
    crypto.randomUUID(),
    update({ state: "done", start_at: "2026-11-09 10:30:00+09" }, 1),
  ]);
  await db.query("select apply_changes($1,$2::jsonb,false)", [
    crypto.randomUUID(),
    update({ event_title: "renamed" }, 2),
  ]);
  await expect(
    db.query("select apply_changes($1,$2::jsonb,false)", [
      crypto.randomUUID(),
      update({ start_at: "2026-11-09T01:45:00Z" }, 3),
    ]),
  ).rejects.toThrow("TIME_CONFLICT");
  // Skipping while moving never warns; un-skipping into an overlap does.
  await db.query("select apply_changes($1,$2::jsonb,false)", [
    crypto.randomUUID(),
    update({ state: "skipped", start_at: "2026-11-09T01:45:00Z" }, 3),
  ]);
  await expect(
    db.query("select apply_changes($1,$2::jsonb,false)", [
      crypto.randomUUID(),
      update({ state: "planned" }, 4),
    ]),
  ).rejects.toThrow("TIME_CONFLICT");
  expect(
    await one("select state,version from time_blocks where id=$1", [b2]),
  ).toEqual({ state: "skipped", version: 4 });
});

it("rejects time zones that browsers' Intl rejects", async () => {
  const u = await newUser();
  for (const zone of ["Factory", "posixrules", "posix/Asia/Seoul", "right/UTC"])
    await expect(
      db.exec(`update profiles set timezone='${zone}' where id='${u}'`),
    ).rejects.toThrow("INVALID_TIMEZONE");
  await db.exec(`update profiles set timezone='Asia/Tokyo' where id='${u}'`);
  expect(
    await one<{ timezone: string }>(
      "select timezone from profiles where id=$1",
      [u],
    ),
  ).toEqual({ timezone: "Asia/Tokyo" });
});

it("pages through distinct recurrence owners for the service role only", async () => {
  const owners = [await newUser(), await newUser(), await newUser()];
  for (const o of owners) {
    await as(o);
    for (let i = 0; i < 2; i++)
      await db.exec(
        `insert into recurrence_rules(user_id,kind,frequency,weekdays,starts_on,template) values('${o}','task','weekly',array[1]::smallint[],'2026-11-16','{"title":"r${i}"}')`,
      );
  }
  await db.exec("reset role");
  const seen: string[] = [];
  let after: string | null = null;
  for (;;) {
    const page: { id: string }[] = (
      await db.query<{ id: string }>(
        "select id::text from recurrence_users($1,1)",
        [after],
      )
    ).rows;
    seen.push(...page.map((p) => p.id));
    if (page.length < 1) break;
    after = page[0].id;
  }
  for (const o of owners) expect(seen.filter((s) => s === o)).toHaveLength(1);
  await db.exec("set role authenticated");
  await expect(db.exec("select recurrence_users(null,10)")).rejects.toThrow();
  await db.exec("reset role");
});

it("test-push rate limit is atomic and service-only", async () => {
  const u = await newUser();
  await db.exec("reset role");
  const first = await one<{ ok: boolean }>("select request_push_test($1) ok", [
    u,
  ]);
  const second = await one<{ ok: boolean }>("select request_push_test($1) ok", [
    u,
  ]);
  expect([first.ok, second.ok]).toEqual([true, false]);
  expect(
    await one(
      "select count(*)::int n from in_app_notifications where user_id=$1 and kind='push_test'",
      [u],
    ),
  ).toEqual({ n: 1 });
  await db.exec(`set role authenticated;set request.jwt.claim.sub='${u}'`);
  await expect(db.query("select request_push_test($1)", [u])).rejects.toThrow();
  await db.exec("reset role");
});

it("a shared push endpoint moves to the account that subscribed last", async () => {
  const x = await newUser(),
    y = await newUser();
  const endpoint = `https://fcm.googleapis.com/fcm/send/${crypto.randomUUID()}`;
  const sub = (u: string) =>
    db.query(
      "insert into push_subscriptions(user_id,endpoint,p256dh,auth_secret) values($1,$2,'k','a') on conflict(user_id,endpoint) do update set is_active=true",
      [u, endpoint],
    );
  await sub(x);
  await sub(y);
  const r = await db.query<{ user_id: string }>(
    "select user_id::text from push_subscriptions where endpoint=$1",
    [endpoint],
  );
  expect(r.rows).toEqual([{ user_id: y }]);
});

it("import restores the profile zone before validating time block dates", async () => {
  const u = await newUser();
  const data = (
    await one<{ d: Record<string, unknown> }>("select read_dataset() d")
  ).d;
  delete data.in_app_notifications;
  const task = crypto.randomUUID(),
    week = crypto.randomUUID(),
    block = crypto.randomUUID();
  (data.profile as Record<string, unknown>).timezone = "America/Los_Angeles";
  data.tasks = [{ id: task, title: "late sunday" }];
  data.week_tasks = [{ id: week, task_id: task, week_start: "2026-11-09" }];
  // 2026-11-15 23:00 in Los Angeles is already Monday 2026-11-16 in Seoul.
  data.time_blocks = [
    {
      id: block,
      kind: "task",
      week_task_id: week,
      start_at: "2026-11-16T07:00:00Z",
      end_at: "2026-11-16T08:00:00Z",
      local_date: "2026-11-15",
    },
  ];
  await db.query("select import_backup($1::jsonb,'replace','REPLACE')", [
    JSON.stringify({ schemaVersion: 1, app: "WEEKFLOW", data }),
  ]);
  expect(
    await one(
      "select p.timezone,b.local_date::text from profiles p join time_blocks b on b.user_id=p.id where p.id=$1",
      [u],
    ),
  ).toEqual({ timezone: "America/Los_Angeles", local_date: "2026-11-15" });
});

it("changing the profile zone recomputes existing block dates", async () => {
  const u = await newUser();
  const block = crypto.randomUUID();
  await db.exec(
    `insert into time_blocks(id,user_id,kind,event_title,start_at,end_at,local_date) values('${block}','${u}','event','late','2026-11-16T07:00:00Z','2026-11-16T08:00:00Z','2026-11-16');update profiles set timezone='America/Los_Angeles' where id='${u}';`,
  );
  expect(
    await one("select local_date::text d from time_blocks where id=$1", [
      block,
    ]),
  ).toEqual({ d: "2026-11-15" });
});

it("retention purges only old read notifications and old mutation receipts", async () => {
  const u = await newUser();
  await db.exec(
    `reset role;insert into in_app_notifications(user_id,kind,title,read_at,created_at) values('${u}','t','old read',now(),now()-interval '91 days'),('${u}','t','old unread',null,now()-interval '91 days'),('${u}','t','new read',now(),now()-interval '10 days');insert into client_mutations(user_id,mutation_id,operation,created_at) values('${u}',gen_random_uuid(),'batch',now()-interval '31 days'),('${u}',gen_random_uuid(),'batch',now()-interval '1 day');`,
  );
  await db.exec("select purge_expired_records()");
  const titles = await db.query<{ title: string }>(
    "select title from in_app_notifications where user_id=$1 order by title",
    [u],
  );
  expect(titles.rows.map((r) => r.title)).toEqual(["new read", "old unread"]);
  expect(
    await one("select count(*)::int n from client_mutations where user_id=$1", [
      u,
    ]),
  ).toEqual({ n: 1 });
  await db.exec("set role authenticated");
  await expect(db.exec("select purge_expired_records()")).rejects.toThrow();
  await db.exec("reset role");
});

it("dataset_version changes on every owner write, including deletes, and only for that owner", async () => {
  const u = await newUser(),
    other = await newUser();
  await as(u);
  const version = async () =>
    Number((await one<{ v: string }>("select dataset_version()::text v")).v);
  const otherBefore = await one<{ v: string }>(
    "select version::text v from dataset_versions where user_id=$1",
    [other],
  );
  const v0 = await version();
  const task = crypto.randomUUID();
  await db.query("select apply_changes($1,$2::jsonb,false)", [
    crypto.randomUUID(),
    JSON.stringify([
      { table: "tasks", action: "insert", row: { id: task, title: "v" } },
    ]),
  ]);
  const v1 = await version();
  expect(v1).toBeGreaterThan(v0);
  expect(await version()).toBe(v1);
  await db.query("select apply_changes($1,$2::jsonb,false)", [
    crypto.randomUUID(),
    JSON.stringify([
      {
        table: "tasks",
        action: "delete",
        row: { id: task },
        expected_version: 1,
      },
    ]),
  ]);
  expect(await version()).toBeGreaterThan(v1);
  expect(
    await one("select version::text v from dataset_versions where user_id=$1", [
      other,
    ]),
  ).toEqual(otherBefore);
  await db.exec(`set role authenticated;set request.jwt.claim.sub='${u}'`);
  expect(await version()).toBeGreaterThan(v1);
  await expect(db.exec("select * from dataset_versions")).rejects.toThrow();
  await db.exec("set request.jwt.claim.sub=''");
  await expect(db.exec("select dataset_version()")).rejects.toThrow(
    "UNAUTHENTICATED",
  );
  await db.exec("set role anon");
  await expect(db.exec("select dataset_version()")).rejects.toThrow();
  await db.exec("reset role");
  // Account deletion cascades cleanly and leaves no counter behind.
  await db.exec(`delete from auth.users where id='${u}'`);
  expect(
    await one("select count(*)::int n from dataset_versions where user_id=$1", [
      u,
    ]),
  ).toEqual({ n: 0 });
});
