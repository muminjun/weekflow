// PostgreSQL engine tests; auth shim emulates JWT claims, never OAuth.
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { beforeAll, afterAll, it, expect } from "vitest";
let db: PGlite;
const a = "11111111-1111-4111-8111-111111111111",
  b = "22222222-2222-4222-8222-222222222222";
beforeAll(async () => {
  db = new PGlite();
  await db.exec(
    `create schema auth; create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$; create role authenticated; create role anon;create role service_role; grant usage on schema public,auth to authenticated,anon; grant execute on function auth.uid() to authenticated,anon;`,
  );
  for (const f of [
    "001_schema.sql",
    "002_api.sql",
    "003_recurrence_backup.sql",
    "004_notifications.sql",
    "005_notification_index.sql",
    "006_import_natural_keys.sql",
    "007_import_uuid.sql",
    "008_write_boundary.sql",
    "009_recurrence_lineage.sql",
    "010_notification_preferences.sql",
    "011_server_recurrence.sql",
    "012_recurrence_template_validation.sql",
    "013_profile_reinitialization.sql",
    "014_reliability_fixes.sql",
    "015_focus_templates_feed_errors.sql",
  ])
    await db.exec(
      readFileSync(`supabase/migrations/${f}`, "utf8").replace(
        "create extension if not exists pgcrypto;",
        "",
      ),
    );
  await db.exec(
    `insert into auth.users values ('${a}'),('${b}');set request.jwt.claim.sub='${a}';select public.ensure_profile();set request.jwt.claim.sub='${b}';select public.ensure_profile();`,
  );
}, 30000);
afterAll(async () => {
  await db?.close();
});
it("reinitializes missing categories without duplicating existing availability", async () => {
  const c = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
  await db.exec(
    `insert into auth.users values ('${c}');set request.jwt.claim.sub='${c}';select ensure_profile();delete from categories where user_id='${c}';`,
  );
  await db.exec("select ensure_profile();select ensure_profile();");
  const rows = await db.query<{ categories: number; windows: number }>(
    "select (select count(*)::int from categories where user_id=$1) categories, (select count(*)::int from availability_rules where user_id=$1) windows",
    [c],
  );
  expect(rows.rows[0]).toEqual({ categories: 6, windows: 5 });
  await db.exec(`delete from auth.users where id='${c}';`);
});
it("creates separate default profiles and 6 owned categories", async () => {
  const r = await db.query<{ n: number }>(
    "select count(*)::int as n from categories",
  );
  expect(r.rows[0].n).toBe(12);
});
it("RLS prevents B from reading A and rejects forged FK", async () => {
  await db.exec(
    `set request.jwt.claim.sub='${a}';select apply_changes('${crypto.randomUUID()}', '[{"table":"tasks","action":"insert","row":{"id":"33333333-3333-4333-8333-333333333333","title":"private"}}]'::jsonb, false);set role authenticated;set request.jwt.claim.sub='${b}';`,
  );
  const r = await db.query("select * from tasks");
  expect(r.rows).toHaveLength(0);
  await expect(
    db.exec(
      `insert into week_tasks(user_id,task_id,week_start) values('${b}','33333333-3333-4333-8333-333333333333','2026-11-09')`,
    ),
  ).rejects.toThrow();
  await db.exec("reset role");
});
it("replaying a mutation creates exactly one row", async () => {
  await db.exec(`set request.jwt.claim.sub='${a}'`);
  const id = crypto.randomUUID(),
    mid = crypto.randomUUID();
  const sql = `select apply_changes('${mid}', '[{"table":"tasks","action":"insert","row":{"id":"${id}","title":"once"}}]'::jsonb,false)`;
  await db.exec(sql);
  await db.exec(sql);
  const r = await db.query("select * from tasks where title='once'");
  expect(r.rows).toHaveLength(1);
});
it("detects concurrent versions and rolls back the batch", async () => {
  await db.exec(`set request.jwt.claim.sub='${a}'`);
  await expect(
    db.exec(
      `select apply_changes('${crypto.randomUUID()}','[{"table":"tasks","action":"update","expected_version":99,"row":{"id":"33333333-3333-4333-8333-333333333333","title":"stolen"}}]'::jsonb,false)`,
    ),
  ).rejects.toThrow("VERSION_CONFLICT");
  const r = await db.query<{ title: string }>(
    "select title from tasks where id='33333333-3333-4333-8333-333333333333'",
  );
  expect(r.rows[0].title).toBe("private");
});
it("anonymous cannot invoke mutation or read private data", async () => {
  await db.exec("set request.jwt.claim.sub='';set role anon");
  await expect(db.exec("select * from tasks")).rejects.toThrow();
  await expect(
    db.exec(`select apply_changes('${crypto.randomUUID()}','[]'::jsonb,false)`),
  ).rejects.toThrow();
  await db.exec("reset role");
});

it("recurring Todos are independent, bounded and idempotent", async () => {
  await db.exec(
    `set request.jwt.claim.sub='${a}';select apply_changes('${crypto.randomUUID()}', '[{"table":"recurrence_rules","action":"insert","row":{"id":"44444444-4444-4444-8444-444444444444","kind":"task","frequency":"weekly","weekdays":[1,3,5],"starts_on":"2026-11-09","template":{"title":"recurring"}}}]'::jsonb,false);select materialize_recurrences('2026-11-09','2026-11-15',null);select materialize_recurrences('2026-11-09','2026-11-15',null)`,
  );
  const r = await db.query<{ n: number }>(
    "select count(*)::int n from tasks where title='recurring'",
  );
  expect(r.rows[0].n).toBe(3);
  await expect(
    db.exec("select materialize_recurrences('2026-11-09','2028-01-01',null)"),
  ).rejects.toThrow("RANGE_LIMIT");
});
it("rollover keeps blocks and preserves history without duplicates", async () => {
  await db.exec(
    `set request.jwt.claim.sub='${a}';insert into week_tasks(id,user_id,task_id,week_start) values('55555555-5555-4555-8555-555555555555','${a}','33333333-3333-4333-8333-333333333333','2026-11-09');select roll_over(array['55555555-5555-4555-8555-555555555555']::uuid[],'2026-11-16');select roll_over(array['55555555-5555-4555-8555-555555555555']::uuid[],'2026-11-16')`,
  );
  const r = await db.query<{ state: string }>(
    "select state from week_tasks where task_id='33333333-3333-4333-8333-333333333333' order by week_start",
  );
  expect(r.rows.map((r) => r.state)).toEqual(["carried", "open"]);
});

it("imports backups into a different account and rolls back malformed data", async () => {
  await db.exec(`set request.jwt.claim.sub='${a}'`);
  const r = await db.query<{ read_dataset: Record<string, unknown> }>(
    "select read_dataset()",
  );
  const data = r.rows[0].read_dataset;
  delete data.in_app_notifications;
  const backup = {
    schemaVersion: 1,
    app: "WEEKFLOW",
    timezone: "Asia/Seoul",
    exportedAt: "2026-11-15T00:00:00Z",
    data,
  };
  await db.exec(`set request.jwt.claim.sub='${b}'`);
  await db.query("select import_backup($1::jsonb,$2,$3)", [
    JSON.stringify(backup),
    "merge",
    "MERGE",
  ]);
  const tasks = await db.query<{ user_id: string }>(
    "select user_id from tasks where user_id=$1",
    [b],
  );
  expect(tasks.rows.length).toBeGreaterThan(0);
  expect(tasks.rows.every((t) => t.user_id === b)).toBe(true);
});
it("rejects cross-week goal links and out-of-week day marks", async () => {
  await db.exec(
    `set request.jwt.claim.sub='${a}';insert into goals(id,user_id,week_start,title) values('66666666-6666-4666-8666-666666666666','${a}','2026-11-16','goal')`,
  );
  await expect(
    db.exec(
      `insert into goal_week_tasks(user_id,goal_id,week_task_id) values('${a}','66666666-6666-4666-8666-666666666666','55555555-5555-4555-8555-555555555555')`,
    ),
  ).rejects.toThrow("GOAL_WEEK_MISMATCH");
  await expect(
    db.exec(
      `insert into week_task_day_marks(user_id,week_task_id,local_date,mark) values('${a}','55555555-5555-4555-8555-555555555555','2026-12-01','planned')`,
    ),
  ).rejects.toThrow("DAY_OUTSIDE_WEEK");
});
it("warns before overlapping placement, permits explicit acknowledgement, never invents completion", async () => {
  await db.exec(`set request.jwt.claim.sub='${a}'`);
  const block1 = crypto.randomUUID(),
    block2 = crypto.randomUUID();
  const changes = (id: string, start: string, end: string) =>
    JSON.stringify([
      {
        table: "time_blocks",
        action: "insert",
        row: {
          id,
          kind: "event",
          event_title: "meeting",
          start_at: start,
          end_at: end,
          local_date: "2026-11-09",
        },
      },
    ]);
  await db.query("select apply_changes($1,$2::jsonb,false)", [
    crypto.randomUUID(),
    changes(block1, "2026-11-09T01:00:00Z", "2026-11-09T02:00:00Z"),
  ]);
  await expect(
    db.query("select apply_changes($1,$2::jsonb,false)", [
      crypto.randomUUID(),
      changes(block2, "2026-11-09T01:30:00Z", "2026-11-09T03:00:00Z"),
    ]),
  ).rejects.toThrow("TIME_CONFLICT");
  await db.query("select apply_changes($1,$2::jsonb,true)", [
    crypto.randomUUID(),
    changes(block2, "2026-11-09T01:30:00Z", "2026-11-09T03:00:00Z"),
  ]);
  const r = await db.query<{ state: string }>(
    "select state from time_blocks where id=$1",
    [block2],
  );
  expect(r.rows[0].state).toBe("planned");
  await expect(
    db.query("select apply_changes($1,$2::jsonb,true)", [
      crypto.randomUUID(),
      changes(
        crypto.randomUUID(),
        "2026-11-09T05:07:00Z",
        "2026-11-09T06:00:00Z",
      ),
    ]),
  ).rejects.toThrow("QUARTER_HOUR_REQUIRED");
});
it("cancelled recurrence occurrences are not recreated", async () => {
  await db.exec(`set request.jwt.claim.sub='${a}'`);
  const r = await db.query<{ task_id: string; version: number }>(
    "select t.id as task_id,t.version from tasks t join recurrence_occurrences o on o.task_id=t.id where o.rule_id='44444444-4444-4444-8444-444444444444' limit 1",
  );
  await db.query("select apply_changes($1,$2::jsonb,false)", [
    crypto.randomUUID(),
    JSON.stringify([
      {
        table: "tasks",
        action: "delete",
        row: { id: r.rows[0].task_id },
        expected_version: r.rows[0].version,
      },
    ]),
  ]);
  await db.exec(
    "select materialize_recurrences('2026-11-09','2026-11-15',null)",
  );
  const c = await db.query<{ n: number }>(
    "select count(*)::int n from recurrence_occurrences where rule_id='44444444-4444-4444-8444-444444444444' and state='cancelled'",
  );
  expect(c.rows[0].n).toBe(1);
});
it("replacement import failure rolls back all deletions", async () => {
  await db.exec(`set request.jwt.claim.sub='${b}'`);
  const r = await db.query<{ read_dataset: Record<string, unknown> }>(
    "select read_dataset()",
  );
  const data = r.rows[0].read_dataset;
  delete data.in_app_notifications;
  const before = (
    await db.query<{ n: number }>(
      "select count(*)::int n from tasks where user_id=$1",
      [b],
    )
  ).rows[0].n;
  (data.tasks as Record<string, unknown>[])[0].category_id =
    "99999999-9999-4999-8999-999999999999";
  const backup = { schemaVersion: 1, app: "WEEKFLOW", data };
  await expect(
    db.query("select import_backup($1::jsonb,$2,$3)", [
      JSON.stringify(backup),
      "replace",
      "REPLACE",
    ]),
  ).rejects.toThrow("IMPORT_INVALID_FK");
  const after = (
    await db.query<{ n: number }>(
      "select count(*)::int n from tasks where user_id=$1",
      [b],
    )
  ).rows[0].n;
  expect(after).toBe(before);
});

it("series revisions preserve cancelled and performed dates across ancestor rules", async () => {
  await db.exec(
    `set request.jwt.claim.sub='${a}';insert into recurrence_rules(id,user_id,parent_rule_id,kind,frequency,weekdays,starts_on,template) values('77777777-7777-4777-8777-777777777777','${a}','44444444-4444-4444-8444-444444444444','task','weekly',array[1,3,5]::smallint[],'2026-11-09','{"title":"new revision"}');select materialize_recurrences('2026-11-09','2026-11-15',null)`,
  );
  const r = await db.query<{ n: number }>(
    "select count(*)::int n from recurrence_occurrences where rule_id='77777777-7777-4777-8777-777777777777'",
  );
  expect(r.rows[0].n).toBe(0);
});
it("cancels opt-out reminders and replaces changed reminder timing", async () => {
  await db.exec(
    `set request.jwt.claim.sub='${a}';update notification_preferences set enabled=true,weekly_review=true,rollover_prompt=true,event_reminder_minutes=10 where user_id='${a}';insert into time_blocks(id,user_id,kind,event_title,start_at,end_at,local_date) values('88888888-8888-4888-8888-888888888888','${a}','event','future',date_trunc('hour',now())+interval '1 day',date_trunc('hour',now())+interval '1 day 1 hour',current_date);select schedule_notifications();update notification_preferences set weekly_review=false,rollover_prompt=false,event_reminder_minutes=60 where user_id='${a}';select schedule_notifications();`,
  );
  const wrong = await db.query<{ n: number }>(
    "select count(*)::int n from notification_jobs where user_id=$1 and kind in ('review','rollover') and state='pending'",
    [a],
  );
  expect(wrong.rows[0].n).toBe(0);
  const block = await db.query<{ n: number }>(
    "select count(*)::int n from notification_jobs j join time_blocks b on b.id=j.source_id where j.source_id='88888888-8888-4888-8888-888888888888' and j.state='pending' and j.due_at=b.start_at-interval '60 minutes'",
  );
  expect(block.rows[0].n).toBe(1);
});
it("server scheduler materializes the authenticated owner scope only through a service-only RPC", async () => {
  await db.exec(`set request.jwt.claim.sub='${a}';set role authenticated`);
  await expect(
    db.exec(
      `select materialize_for_user('${b}','2026-11-16','2026-11-22',null)`,
    ),
  ).rejects.toThrow();
  await db.exec("reset role");
  await db.exec(
    `select materialize_for_user('${b}','2026-11-16','2026-11-22',null)`,
  );
  const r = await db.query<{ uid: string }>("select auth.uid()::text uid");
  expect(r.rows[0].uid).toBe(a);
  const rows = await db.query<{ n: number }>(
    "select count(*)::int n from recurrence_occurrences where user_id=$1 and local_date between '2026-11-16' and '2026-11-22'",
    [b],
  );
  expect(rows.rows[0].n).toBeGreaterThan(0);
});
it("rejects recurrence templates that could poison the server reminder scheduler", async () => {
  await db.exec(`set request.jwt.claim.sub='${a}'`);
  const command = (template: Record<string, unknown>) =>
    JSON.stringify([
      {
        table: "recurrence_rules",
        action: "insert",
        row: {
          id: crypto.randomUUID(),
          kind: "event",
          frequency: "weekly",
          weekdays: [1],
          starts_on: "2026-11-16",
          template,
        },
      },
    ]);
  await expect(
    db.query("select apply_changes($1,$2::jsonb,false)", [
      crypto.randomUUID(),
      command({
        title: "invalid foreign category",
        startMinute: 540,
        duration: 60,
        category_id: "99999999-9999-4999-8999-999999999999",
      }),
    ]),
  ).rejects.toThrow("TEMPLATE_CATEGORY_FORBIDDEN");
  await expect(
    db.query("select apply_changes($1,$2::jsonb,false)", [
      crypto.randomUUID(),
      command({ title: "invalid time", startMinute: 1800, duration: 60 }),
    ]),
  ).rejects.toThrow("INVALID_EVENT_TEMPLATE");
});
