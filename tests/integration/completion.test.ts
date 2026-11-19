// Migration 015: block_sessions, week_templates, calendar feed tokens and client errors.
// Same auth shim as reliability.test.ts (JWT subject via request.jwt.claim.sub).
import { PGlite } from "@electric-sql/pglite";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { beforeAll, afterAll, it, expect, describe } from "vitest";
import { calendarFeed } from "../../supabase/functions/calendar-feed/ics";

let db: PGlite;
async function newUser() {
  const id = crypto.randomUUID();
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
type Change = {
  table: string;
  action: string;
  row: Record<string, unknown>;
  expected_version?: number;
};
const apply = (changes: Change[], ack = true) =>
  db.query("select apply_changes($1,$2::jsonb,$3)", [
    crypto.randomUUID(),
    JSON.stringify(changes),
    ack,
  ]);
async function block(start = "2026-11-17T01:00:00Z", hours = 1) {
  const id = crypto.randomUUID();
  const end = new Date(Date.parse(start) + hours * 3600000).toISOString();
  await apply([
    {
      table: "time_blocks",
      action: "insert",
      row: {
        id,
        kind: "event",
        event_title: "focus",
        start_at: start,
        end_at: end,
        local_date: start.slice(0, 10),
      },
    },
  ]);
  return id;
}
const session = (
  id: string,
  block_id: string,
  started_at: string,
  ended_at: string | null,
  note = "",
): Change => ({
  table: "block_sessions",
  action: "insert",
  row: { id, block_id, started_at, ended_at, note },
});
const tmplBlock = (over: Record<string, unknown> = {}) => ({
  weekday: 1,
  start_minute: 540,
  duration: 60,
  kind: "event",
  title: "Standup",
  category_id: null,
  note: "",
  ...over,
});
const template = (id: string, over: Record<string, unknown> = {}): Change => ({
  table: "week_templates",
  action: "insert",
  row: { id, name: "평상 주", blocks: [tmplBlock()], goals: ["ship"], ...over },
});
const version = () =>
  one<{ v: string }>("select dataset_version()::text v").then((r) =>
    Number(r.v),
  );

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

describe("block_sessions", () => {
  it("supports insert, versioned update, conflict and delete", async () => {
    const u = await newUser();
    const b = await block();
    const s = crypto.randomUUID();
    await apply([session(s, b, "2026-11-17T01:00:00Z", null)]);
    expect(
      await one("select ended_at,version from block_sessions where id=$1", [s]),
    ).toEqual({ ended_at: null, version: 1 });
    await apply([
      {
        table: "block_sessions",
        action: "update",
        expected_version: 1,
        row: { id: s, ended_at: "2026-11-17T01:50:00Z", note: "deep" },
      },
    ]);
    const row = await one<{ version: number; note: string; user_id: string }>(
      "select version,note,user_id from block_sessions where id=$1",
      [s],
    );
    expect(row).toEqual({ version: 2, note: "deep", user_id: u });
    await expect(
      apply([
        {
          table: "block_sessions",
          action: "update",
          expected_version: 1,
          row: { id: s, note: "stale" },
        },
      ]),
    ).rejects.toThrow("VERSION_CONFLICT");
    await apply([
      {
        table: "block_sessions",
        action: "delete",
        expected_version: 2,
        row: { id: s },
      },
    ]);
    expect(
      await one<{ n: number }>(
        "select count(*)::int n from block_sessions where id=$1",
        [s],
      ),
    ).toEqual({ n: 0 });
  });
  it("validates range, note length, unknown fields and block ownership", async () => {
    const u = await newUser();
    const b = await block();
    await expect(
      apply([
        session(
          crypto.randomUUID(),
          b,
          "2026-11-17T02:00:00Z",
          "2026-11-17T01:00:00Z",
        ),
      ]),
    ).rejects.toThrow("INVALID_SESSION_RANGE");
    await expect(
      apply([
        session(
          crypto.randomUUID(),
          b,
          "2026-11-17T01:00:00Z",
          "2026-11-18T01:15:00Z",
        ),
      ]),
    ).rejects.toThrow("INVALID_SESSION_RANGE");
    await expect(
      apply([
        session(
          crypto.randomUUID(),
          b,
          "2026-11-17T01:00:00Z",
          "2026-11-17T02:00:00Z",
          "x".repeat(1001),
        ),
      ]),
    ).rejects.toThrow("INVALID_SESSION_NOTE");
    const bad = session(crypto.randomUUID(), b, "2026-11-17T01:00:00Z", null);
    bad.row.planned_minutes = 30;
    await expect(apply([bad])).rejects.toThrow("UNKNOWN_FIELD");
    // Another user's block cannot be referenced (composite FK).
    const other = await newUser();
    const foreign = await block();
    await as(u);
    await expect(
      apply([
        session(crypto.randomUUID(), foreign, "2026-11-17T01:00:00Z", null),
      ]),
    ).rejects.toThrow();
    void other;
  });
  it("allows only one open session per user", async () => {
    await newUser();
    const b1 = await block("2026-11-17T01:00:00Z");
    const b2 = await block("2026-11-17T03:00:00Z");
    const first = crypto.randomUUID();
    await apply([session(first, b1, "2026-11-17T01:00:00Z", null)]);
    await expect(
      apply([session(crypto.randomUUID(), b2, "2026-11-17T03:00:00Z", null)]),
    ).rejects.toThrow("SESSION_ALREADY_OPEN");
    // Closing the first and opening the second in one batch succeeds.
    await apply([
      {
        table: "block_sessions",
        action: "update",
        expected_version: 1,
        row: { id: first, ended_at: "2026-11-17T01:30:00Z" },
      },
      session(crypto.randomUUID(), b2, "2026-11-17T03:00:00Z", null),
    ]);
    expect(
      await one<{ n: number }>(
        "select count(*)::int n from block_sessions where user_id=auth.uid() and ended_at is null",
      ),
    ).toEqual({ n: 1 });
  });
  it("cascades with its block", async () => {
    await newUser();
    const b = await block();
    await apply([
      session(
        crypto.randomUUID(),
        b,
        "2026-11-17T01:00:00Z",
        "2026-11-17T01:30:00Z",
      ),
    ]);
    await apply([
      {
        table: "time_blocks",
        action: "delete",
        expected_version: 1,
        row: { id: b },
      },
    ]);
    expect(
      await one<{ n: number }>(
        "select count(*)::int n from block_sessions where user_id=auth.uid()",
      ),
    ).toEqual({ n: 0 });
  });
});

describe("week_templates", () => {
  it("supports insert, versioned update, conflict and delete", async () => {
    await newUser();
    const t = crypto.randomUUID();
    await apply([template(t)]);
    await apply([
      {
        table: "week_templates",
        action: "update",
        expected_version: 1,
        row: { id: t, name: "시험 주", goals: [] },
      },
    ]);
    expect(
      await one("select name,goals,version from week_templates where id=$1", [
        t,
      ]),
    ).toEqual({ name: "시험 주", goals: [], version: 2 });
    await expect(
      apply([
        {
          table: "week_templates",
          action: "delete",
          expected_version: 1,
          row: { id: t },
        },
      ]),
    ).rejects.toThrow("VERSION_CONFLICT");
    await apply([
      {
        table: "week_templates",
        action: "delete",
        expected_version: 2,
        row: { id: t },
      },
    ]);
  });
  it("validates name, blocks and goals", async () => {
    const u = await newUser();
    const cat = await one<{ id: string }>(
      "select id from categories where user_id=$1 limit 1",
      [u],
    );
    await apply([
      template(crypto.randomUUID(), {
        blocks: [
          tmplBlock({
            category_id: cat.id,
            weekday: 7,
            start_minute: 1425,
            duration: 1440,
            kind: "task",
          }),
        ],
      }),
    ]);
    const cases: [Record<string, unknown>, string][] = [
      [{ name: " " }, "INVALID_TEMPLATE_NAME"],
      [{ name: "x".repeat(81) }, "INVALID_TEMPLATE_NAME"],
      [{ blocks: [tmplBlock({ weekday: 8 })] }, "INVALID_TEMPLATE_BLOCKS"],
      [{ blocks: [tmplBlock({ weekday: 1.5 })] }, "INVALID_TEMPLATE_BLOCKS"],
      [
        { blocks: [tmplBlock({ start_minute: 545 })] },
        "INVALID_TEMPLATE_BLOCKS",
      ],
      [
        { blocks: [tmplBlock({ start_minute: 1440 })] },
        "INVALID_TEMPLATE_BLOCKS",
      ],
      [{ blocks: [tmplBlock({ duration: 0 })] }, "INVALID_TEMPLATE_BLOCKS"],
      [{ blocks: [tmplBlock({ duration: 1455 })] }, "INVALID_TEMPLATE_BLOCKS"],
      [{ blocks: [tmplBlock({ duration: "60" })] }, "INVALID_TEMPLATE_BLOCKS"],
      [{ blocks: [tmplBlock({ kind: "meeting" })] }, "INVALID_TEMPLATE_BLOCKS"],
      [{ blocks: [tmplBlock({ title: " " })] }, "INVALID_TEMPLATE_BLOCKS"],
      [
        { blocks: [tmplBlock({ title: undefined })] },
        "INVALID_TEMPLATE_BLOCKS",
      ],
      [
        { blocks: [tmplBlock({ note: "x".repeat(1001) })] },
        "INVALID_TEMPLATE_BLOCKS",
      ],
      [{ blocks: [tmplBlock({ extra: 1 })] }, "INVALID_TEMPLATE_BLOCKS"],
      [
        { blocks: [tmplBlock({ category_id: "nope" })] },
        "INVALID_TEMPLATE_BLOCKS",
      ],
      [
        { blocks: [tmplBlock({ category_id: crypto.randomUUID() })] },
        "TEMPLATE_CATEGORY_FORBIDDEN",
      ],
      [
        { blocks: Array.from({ length: 201 }, () => tmplBlock()) },
        "INVALID_TEMPLATE_BLOCKS",
      ],
      [{ blocks: {} }, "INVALID_TEMPLATE_BLOCKS"],
      [
        { goals: Array.from({ length: 21 }, () => "g") },
        "INVALID_TEMPLATE_GOALS",
      ],
      [{ goals: ["x".repeat(241)] }, "INVALID_TEMPLATE_GOALS"],
      [{ goals: [1] }, "INVALID_TEMPLATE_GOALS"],
    ];
    for (const [over, message] of cases)
      await expect(
        apply([template(crypto.randomUUID(), over)]),
        JSON.stringify(over).slice(0, 80),
      ).rejects.toThrow(message);
  });
  it("limits each user to 30 templates", async () => {
    await newUser();
    await apply(
      Array.from({ length: 30 }, (_, i) =>
        template(crypto.randomUUID(), { name: `t${i}` }),
      ),
    );
    await expect(apply([template(crypto.randomUUID())])).rejects.toThrow(
      "TEMPLATE_LIMIT",
    );
    // Another user is unaffected.
    await newUser();
    await apply([template(crypto.randomUUID())]);
  });
});

it("RLS isolates both tables between users and blocks direct writes", async () => {
  const a = await newUser();
  const b = await block();
  const s = crypto.randomUUID(),
    t = crypto.randomUUID();
  await apply([
    session(s, b, "2026-11-17T01:00:00Z", "2026-11-17T01:30:00Z"),
    template(t),
  ]);
  const other = await newUser();
  await db.exec("set role authenticated");
  expect((await db.query("select id from block_sessions")).rows).toHaveLength(
    0,
  );
  expect((await db.query("select id from week_templates")).rows).toHaveLength(
    0,
  );
  await expect(
    db.exec(`update week_templates set name='mine' where id='${t}'`),
  ).rejects.toThrow();
  await expect(
    db.exec(
      `insert into week_templates(user_id,name) values('${other}','direct')`,
    ),
  ).rejects.toThrow();
  // apply_changes refuses to touch another user's row.
  await expect(
    apply([
      {
        table: "week_templates",
        action: "update",
        expected_version: 1,
        row: { id: t, name: "stolen" },
      },
    ]),
  ).rejects.toThrow("FORBIDDEN");
  await expect(
    apply([
      {
        table: "block_sessions",
        action: "delete",
        expected_version: 1,
        row: { id: s },
      },
    ]),
  ).rejects.toThrow("FORBIDDEN");
  await as(a);
  await db.exec("set role authenticated");
  expect((await db.query("select id from block_sessions")).rows).toEqual([
    { id: s },
  ]);
  await db.exec("reset role");
});

it("read_dataset includes both tables and dataset_version bumps on every write", async () => {
  await newUser();
  const empty = await one<{ d: Record<string, unknown> }>(
    "select read_dataset() d",
  );
  expect(empty.d.block_sessions).toEqual([]);
  expect(empty.d.week_templates).toEqual([]);
  const b = await block();
  let v = await version();
  const s = crypto.randomUUID(),
    t = crypto.randomUUID();
  await apply([session(s, b, "2026-11-17T01:00:00Z", null, "n")]);
  expect(await version()).toBeGreaterThan(v);
  v = await version();
  await apply([template(t)]);
  expect(await version()).toBeGreaterThan(v);
  v = await version();
  await apply([
    {
      table: "week_templates",
      action: "update",
      expected_version: 1,
      row: { id: t, name: "x" },
    },
  ]);
  expect(await version()).toBeGreaterThan(v);
  v = await version();
  await apply([
    {
      table: "block_sessions",
      action: "delete",
      expected_version: 1,
      row: { id: s },
    },
  ]);
  expect(await version()).toBeGreaterThan(v);
  await apply([
    session(s, b, "2026-11-17T01:00:00Z", "2026-11-17T01:45:00Z", "n"),
  ]);
  const d = (
    await one<{ d: Record<string, unknown> }>("select read_dataset() d")
  ).d;
  expect(Object.keys((d.block_sessions as object[])[0]).sort()).toEqual(
    [
      "block_id",
      "created_at",
      "ended_at",
      "id",
      "note",
      "started_at",
      "updated_at",
      "user_id",
      "version",
    ].sort(),
  );
  expect(Object.keys((d.week_templates as object[])[0]).sort()).toEqual(
    [
      "blocks",
      "created_at",
      "goals",
      "id",
      "name",
      "updated_at",
      "user_id",
      "version",
    ].sort(),
  );
  expect((d.week_templates as { blocks: unknown[] }[])[0].blocks).toEqual([
    tmplBlock(),
  ]);
});

it("backup export/import round-trips both tables into another account", async () => {
  const a = await newUser();
  const cat = await one<{ id: string }>(
    "select id from categories where user_id=$1 and name='WORK'",
    [a],
  );
  const b = await block();
  await apply([
    session(
      crypto.randomUUID(),
      b,
      "2026-11-17T01:00:00Z",
      "2026-11-17T01:40:00Z",
      "closed",
    ),
    session(crypto.randomUUID(), b, "2026-11-17T01:45:00Z", null, "running"),
    template(crypto.randomUUID(), {
      blocks: [
        tmplBlock({ category_id: cat.id }),
        tmplBlock({ category_id: null, weekday: 3 }),
      ],
    }),
  ]);
  const data = (
    await one<{ d: Record<string, unknown> }>("select read_dataset() d")
  ).d;
  delete data.in_app_notifications;
  const backup = JSON.stringify({ schemaVersion: 1, app: "WEEKFLOW", data });

  const c = await newUser();
  // c already has a running timer: the imported open session must be skipped, not fail the import.
  const cb = await block("2026-11-20T01:00:00Z");
  await apply([session(crypto.randomUUID(), cb, "2026-11-20T01:00:00Z", null)]);
  await db.query("select import_backup($1::jsonb,'merge','MERGE')", [backup]);
  await db.query("select import_backup($1::jsonb,'merge','MERGE')", [backup]);
  const sessions = await db.query<{ note: string; block_owner: string }>(
    "select s.note,b.user_id::text block_owner from block_sessions s join time_blocks b on b.id=s.block_id where s.user_id=$1 order by s.started_at",
    [c],
  );
  expect(sessions.rows.map((r) => r.note)).toEqual(["closed", ""]);
  expect(sessions.rows.every((r) => r.block_owner === c)).toBe(true);
  const tmpl = await db.query<{ blocks: { category_id: string | null }[] }>(
    "select blocks from week_templates where user_id=$1",
    [c],
  );
  expect(tmpl.rows).toHaveLength(1);
  const cCat = await one<{ id: string }>(
    "select id from categories where user_id=$1 and name='WORK'",
    [c],
  );
  expect(tmpl.rows[0].blocks.map((x) => x.category_id)).toEqual([
    cCat.id,
    null,
  ]);

  // Replace mode restores the running session too and leaves exactly the backup's rows.
  await db.query("select import_backup($1::jsonb,'replace','REPLACE')", [
    backup,
  ]);
  expect(
    (
      await db.query<{ note: string }>(
        "select note from block_sessions where user_id=$1 order by started_at",
        [c],
      )
    ).rows.map((r) => r.note),
  ).toEqual(["closed", "running"]);
  // Backups written before 015 (no new keys) still import.
  const legacy = { ...data };
  delete legacy.block_sessions;
  delete legacy.week_templates;
  await db.query("select import_backup($1::jsonb,'merge','MERGE')", [
    JSON.stringify({ schemaVersion: 1, app: "WEEKFLOW", data: legacy }),
  ]);
});

it("account deletion removes sessions, templates, feeds and error reports", async () => {
  const u = await newUser();
  const b = await block();
  await apply([
    session(crypto.randomUUID(), b, "2026-11-17T01:00:00Z", null),
    template(crypto.randomUUID()),
  ]);
  await db.exec(
    `select rotate_calendar_feed();select report_client_error('{"message":"x"}'::jsonb);reset role;delete from auth.users where id='${u}';`,
  );
  const r = await one<Record<string, number>>(
    `select (select count(*)::int from block_sessions where user_id=$1) s,(select count(*)::int from week_templates where user_id=$1) t,(select count(*)::int from calendar_feeds where user_id=$1) f,(select count(*)::int from client_errors where user_id=$1) e`,
    [u],
  );
  expect(r).toEqual({ s: 0, t: 0, f: 0, e: 0 });
});

describe("calendar feed", () => {
  it("rotates tokens, stores only the hash, and reports status", async () => {
    const u = await newUser();
    expect(
      (await one<{ s: unknown }>("select calendar_feed_status() s")).s,
    ).toEqual({ enabled: false, created_at: null, last_used_at: null });
    const t1 = (await one<{ t: string }>("select rotate_calendar_feed() t")).t;
    expect(t1).toMatch(/^[A-Za-z0-9_-]{64}$/);
    const hash = (t: string) => createHash("sha256").update(t).digest("hex");
    const stored = await one<{ token_hash: string }>(
      "select token_hash from calendar_feeds where user_id=$1",
      [u],
    );
    expect(stored.token_hash).toBe(hash(t1));
    expect(JSON.stringify(stored)).not.toContain(t1);
    const status = (
      await one<{ s: Record<string, unknown> }>(
        "select calendar_feed_status() s",
      )
    ).s;
    expect(status.enabled).toBe(true);
    expect(status.last_used_at).toBeNull();
    // Clients cannot read the table.
    await db.exec("set role authenticated");
    await expect(db.exec("select * from calendar_feeds")).rejects.toThrow();
    await expect(
      db.exec(`select calendar_feed_events('${hash(t1)}')`),
    ).rejects.toThrow();
    await db.exec("reset role");

    const ok = (
      await one<{ r: { status: string; events: unknown[]; timezone: string } }>(
        "select calendar_feed_events($1) r",
        [hash(t1)],
      )
    ).r;
    expect(ok.status).toBe("ok");
    expect(ok.timezone).toBe("Asia/Seoul");
    expect(
      (
        await one<{ s: Record<string, unknown> }>(
          "select calendar_feed_status() s",
        )
      ).s.last_used_at,
    ).not.toBeNull();

    const t2 = (await one<{ t: string }>("select rotate_calendar_feed() t")).t;
    expect(t2).not.toBe(t1);
    expect(
      (
        await one<{ r: { status: string } }>(
          "select calendar_feed_events($1) r",
          [hash(t1)],
        )
      ).r.status,
    ).toBe("not_found");
    expect(
      (
        await one<{ r: { status: string } }>(
          "select calendar_feed_events($1) r",
          [hash(t2)],
        )
      ).r.status,
    ).toBe("ok");
    await db.exec("select revoke_calendar_feed()");
    expect(
      (
        await one<{ r: { status: string } }>(
          "select calendar_feed_events($1) r",
          [hash(t2)],
        )
      ).r.status,
    ).toBe("not_found");
    expect(
      (
        await one<{ s: Record<string, unknown> }>(
          "select calendar_feed_status() s",
        )
      ).s.enabled,
    ).toBe(false);
    expect(
      (
        await one<{ r: { status: string } }>(
          "select calendar_feed_events('garbage') r",
        )
      ).r.status,
    ).toBe("not_found");
  });
  it("returns titled event and task blocks in the window and rate limits at 30/min", async () => {
    const u = await newUser();
    const token = (await one<{ t: string }>("select rotate_calendar_feed() t"))
      .t;
    const h = createHash("sha256").update(token).digest("hex");
    const task = crypto.randomUUID(),
      wt = crypto.randomUUID();
    // Fixed instants relative to now, snapped to quarter hours.
    const q = (offsetDays: number) =>
      new Date(
        Math.floor((Date.now() + offsetDays * 86400000) / 900000) * 900000,
      );
    const near = q(1);
    const z = await one<{ m: string }>(
      "select (date_trunc('week',($1::timestamptz at time zone 'Asia/Seoul'))::date)::text m",
      [near.toISOString()],
    );
    await db.exec(
      `insert into tasks(id,user_id,title,description) values('${task}','${u}','Write, report; now','desc');insert into week_tasks(id,user_id,task_id,week_start) values('${wt}','${u}','${task}','${z.m}');`,
    );
    const end = new Date(near.getTime() + 3600000);
    await db.query(
      "insert into time_blocks(user_id,kind,week_task_id,start_at,end_at,local_date) values($1,'task',$2,$3,$4,current_date)",
      [u, wt, near.toISOString(), end.toISOString()],
    );
    for (const [days, title, state] of [
      [2, "kept", "planned"],
      [3, "skipped one", "skipped"],
      [-40, "too old", "planned"],
      [120, "too far", "planned"],
    ] as const) {
      const s = q(days);
      await db.query(
        "insert into time_blocks(user_id,kind,event_title,start_at,end_at,local_date,state) values($1,'event',$2,$3,$4,current_date,$5)",
        [
          u,
          title,
          s.toISOString(),
          new Date(s.getTime() + 1800000).toISOString(),
          state,
        ],
      );
    }
    const r = (
      await one<{
        r: { status: string; events: { title: string; kind: string }[] };
      }>("select calendar_feed_events($1) r", [h])
    ).r;
    expect(r.events.map((e) => [e.kind, e.title])).toEqual([
      ["task", "Write, report; now"],
      ["event", "kept"],
    ]);
    for (let i = 2; i <= 30; i++)
      expect(
        (
          await one<{ r: { status: string } }>(
            "select calendar_feed_events($1) r",
            [h],
          )
        ).r.status,
      ).toBe("ok");
    const limited = (
      await one<{ r: { status: string; retry_after: number } }>(
        "select calendar_feed_events($1) r",
        [h],
      )
    ).r;
    expect(limited.status).toBe("rate_limited");
    expect(limited.retry_after).toBeGreaterThan(0);
    // A new window opens after a minute.
    await db.exec(
      `update calendar_feeds set rate_window_start=now()-interval '61 seconds' where user_id='${u}'`,
    );
    expect(
      (
        await one<{ r: { status: string } }>(
          "select calendar_feed_events($1) r",
          [h],
        )
      ).r.status,
    ).toBe("ok");
  });
  it("builds RFC 5545 output with escaping, folding, stable UIDs and UTC times", () => {
    const ics = calendarFeed(
      [
        {
          id: "b1",
          kind: "event",
          title: "회의, 준비; \\ 메모\n둘째 줄 " + "가".repeat(40),
          note: "line1\nline2",
          start_at: "2026-11-17T10:00:00+09:00",
          end_at: "2026-11-17T11:30:00+09:00",
          state: "planned",
          version: 3,
          updated_at: "2026-11-16T00:00:00Z",
        },
        {
          id: "b2",
          kind: "task",
          title: "done task",
          note: "",
          start_at: "2026-11-18T00:00:00Z",
          end_at: "2026-11-18T00:15:00Z",
          state: "done",
          version: 1,
          updated_at: "2026-11-16T00:00:00Z",
        },
      ],
      { timezone: "Asia/Seoul", now: new Date("2026-11-19T00:00:00Z") },
    );
    const lines = ics.split("\r\n");
    expect(lines[0]).toBe("BEGIN:VCALENDAR");
    expect(ics).toContain("X-WR-CALNAME:WEEKFLOW\r\n");
    expect(ics).toContain("UID:b1@weekflow\r\n");
    expect(ics).toContain("DTSTAMP:20261119T000000Z\r\n");
    expect(ics).toContain(
      "DTSTART:20261117T010000Z\r\nDTEND:20261117T023000Z\r\n",
    );
    expect(ics).toContain("SEQUENCE:2\r\n");
    expect(ics).toContain("DESCRIPTION:line1\\nline2\r\n");
    expect(ics).toContain("SUMMARY:✓ done task\r\n");
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    for (const l of lines)
      expect(new TextEncoder().encode(l).length).toBeLessThanOrEqual(75);
    const unfolded = ics.replace(/\r\n /g, "");
    expect(unfolded).toContain(
      "SUMMARY:회의\\, 준비\\; \\\\ 메모\\n둘째 줄 " + "가".repeat(40) + "\r\n",
    );
  });
});

it("report_client_error truncates fields and silently caps at 30 per user per hour", async () => {
  const u = await newUser();
  await db.exec("set role authenticated");
  await db.query("select report_client_error($1::jsonb)", [
    JSON.stringify({
      message: "m".repeat(900),
      stack: "s".repeat(5000),
      url: "u".repeat(600),
      user_agent: "a".repeat(400),
      release: "r".repeat(50),
    }),
  ]);
  for (let i = 0; i < 40; i++)
    await db.query("select report_client_error($1::jsonb)", [
      JSON.stringify({ message: `e${i}` }),
    ]);
  await expect(db.exec("select * from client_errors")).rejects.toThrow();
  await expect(
    db.exec("select report_client_error('[1]'::jsonb)"),
  ).rejects.toThrow("VALIDATION_ERROR");
  await db.exec("reset role");
  const r = await one<Record<string, number>>(
    "select count(*)::int n,max(char_length(message))::int m,max(char_length(stack))::int s,max(char_length(url))::int u,max(char_length(user_agent))::int a,max(char_length(release))::int r from client_errors where user_id=$1",
    [u],
  );
  expect(r).toEqual({ n: 30, m: 500, s: 4000, u: 500, a: 300, r: 40 });
  await db.exec("set request.jwt.claim.sub='';set role anon");
  await expect(
    db.exec(`select report_client_error('{"message":"x"}'::jsonb)`),
  ).rejects.toThrow();
  await db.exec("reset role");
  // Retention removes reports older than 30 days.
  await db.exec(
    `update client_errors set created_at=now()-interval '31 days' where user_id='${u}'`,
  );
  const purged = await one<{ p: { client_errors: number } }>(
    "select purge_expired_records() p",
  );
  expect(purged.p.client_errors).toBeGreaterThanOrEqual(30);
});
