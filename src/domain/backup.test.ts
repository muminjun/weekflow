import { it, expect } from "vitest";
import { emptyData } from "../data/demo";
import { exportBackup, parseBackup } from "./backup";
it("exports only domain data and rejects malformed relations or versions", () => {
  const data = emptyData(crypto.randomUUID());
  const out = exportBackup(data);
  expect(out).not.toContain("push_subscriptions");
  expect(parseBackup(out).schemaVersion).toBe(1);
  expect(() =>
    parseBackup(out.replace('"schemaVersion": 1', '"schemaVersion": 99')),
  ).toThrow();
  const broken = JSON.parse(out);
  broken.data.tasks.push({ id: "bad", title: "bad" });
  expect(() => parseBackup(JSON.stringify(broken))).toThrow();
});

it("round-trips focus sessions and week templates and accepts older backups", () => {
  const data = emptyData(crypto.randomUUID());
  const user = data.profile.id;
  const block = {
    id: crypto.randomUUID(),
    user_id: user,
    version: 1,
    kind: "event" as const,
    week_task_id: null,
    event_title: "집중",
    event_note: "",
    category_id: null,
    start_at: "2026-11-16T00:00:00.000Z",
    end_at: "2026-11-16T01:00:00.000Z",
    local_date: "2026-11-16",
    state: "planned" as const,
    completed_at: null,
  };
  data.time_blocks.push(block);
  data.block_sessions.push({
    id: crypto.randomUUID(),
    user_id: user,
    version: 2,
    block_id: block.id,
    started_at: "2026-11-16T00:00:00.000Z",
    ended_at: "2026-11-16T00:40:00.000Z",
    note: "초안",
  });
  data.week_templates.push({
    id: crypto.randomUUID(),
    user_id: user,
    version: 1,
    name: "평상 주",
    blocks: [
      {
        weekday: 1,
        start_minute: 540,
        duration: 90,
        kind: "event",
        title: "회의",
        category_id: null,
        note: "",
      },
    ],
    goals: ["운동 3번"],
  });
  const parsed = parseBackup(exportBackup(data));
  expect(parsed.data.block_sessions).toEqual(data.block_sessions);
  expect(parsed.data.week_templates).toEqual(data.week_templates);

  const old = JSON.parse(exportBackup(data));
  delete old.data.block_sessions;
  delete old.data.week_templates;
  const legacy = parseBackup(JSON.stringify(old));
  expect(legacy.data.block_sessions).toEqual([]);
  expect(legacy.data.week_templates).toEqual([]);

  const bad = (mutate: (b: typeof old) => void) => {
    const b = JSON.parse(exportBackup(data));
    mutate(b);
    return () => parseBackup(JSON.stringify(b));
  };
  // orphan session
  expect(
    bad((b) => (b.data.block_sessions[0].block_id = crypto.randomUUID())),
  ).toThrow();
  // longer than a day
  expect(
    bad(
      (b) => (b.data.block_sessions[0].ended_at = "2026-11-17T00:00:01.000Z"),
    ),
  ).toThrow();
  // two open sessions
  expect(
    bad((b) => {
      b.data.block_sessions[0].ended_at = null;
      b.data.block_sessions.push({
        ...b.data.block_sessions[0],
        id: crypto.randomUUID(),
      });
    }),
  ).toThrow();
  // off-grid template minute and too many goals
  expect(
    bad((b) => (b.data.week_templates[0].blocks[0].start_minute = 545)),
  ).toThrow();
  expect(
    bad((b) => (b.data.week_templates[0].goals = Array(21).fill("x"))),
  ).toThrow();
  expect(bad((b) => (b.data.week_templates[0].name = ""))).toThrow();
});
