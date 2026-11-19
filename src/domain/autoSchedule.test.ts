import { describe, it, expect } from "vitest";
import { emptyData, uuid } from "../data/demo";
import type { Block, Dataset } from "./types";
import { toUTC } from "./planner";
import {
  autoSchedule,
  placementChanges,
  placementsStillFit,
  splitDuration,
  taskDuration,
  unplacedWeekTasks,
} from "./autoSchedule";

const WEEK = "2026-11-16";
const ZONE = "Asia/Seoul";
const MONDAY_MIDNIGHT = toUTC(WEEK, 0, ZONE);

function setup() {
  const data = emptyData(uuid());
  let order = 0;
  const addTodo = (
    title: string,
    estimate: number | null,
    due: string | null = null,
    extra: { week?: string; state?: "open" | "done" } = {},
  ) => {
    const taskId = uuid(),
      id = uuid();
    data.tasks.push({
      id: taskId,
      user_id: data.profile.id,
      version: 1,
      title,
      description: "",
      category_id: null,
      due_on: due,
      estimate_minutes: estimate,
      state: "open",
      completed_at: null,
    });
    data.week_tasks.push({
      id,
      user_id: data.profile.id,
      version: 1,
      task_id: taskId,
      week_start: extra.week ?? WEEK,
      state: extra.state ?? "open",
      completed_at: null,
      sort_order: order++,
    });
    return id;
  };
  const addBlock = (
    date: string,
    start: number,
    end: number,
    kind: Block["kind"] = "event",
    extra: Partial<Block> = {},
  ) =>
    data.time_blocks.push({
      id: uuid(),
      user_id: data.profile.id,
      version: 1,
      kind,
      week_task_id: kind === "task" ? uuid() : null,
      event_title: kind === "event" ? "busy" : null,
      event_note: "",
      category_id: null,
      start_at: toUTC(date, start, ZONE),
      end_at: toUTC(date, end, ZONE),
      local_date: date,
      state: "planned",
      completed_at: null,
      ...extra,
    });
  return { data, addTodo, addBlock };
}

const run = (
  data: Dataset,
  options: Parameters<typeof autoSchedule>[3] = {},
  holidays: ReadonlySet<string> = new Set(),
) => autoSchedule(data, WEEK, holidays, { now: MONDAY_MIDNIGHT, ...options });

describe("helpers", () => {
  it("rounds estimates up to 15 minutes with a 60-minute default", () => {
    expect(taskDuration(null)).toBe(60);
    expect(taskDuration(1)).toBe(15);
    expect(taskDuration(50)).toBe(60);
    expect(taskDuration(0)).toBe(15);
  });
  it("splits only above the threshold into 30–90 minute aligned parts", () => {
    expect(splitDuration(120)).toEqual([120]);
    expect(splitDuration(135)).toEqual([75, 60]);
    expect(splitDuration(180)).toEqual([90, 90]);
    expect(splitDuration(195)).toEqual([75, 60, 60]);
    expect(splitDuration(300)).toEqual([75, 75, 75, 75]);
    for (const total of [135, 150, 225, 405, 600]) {
      const parts = splitDuration(total);
      expect(parts.reduce((a, b) => a + b, 0)).toBe(total);
      for (const p of parts) {
        expect(p % 15).toBe(0);
        expect(p).toBeGreaterThanOrEqual(30);
        expect(p).toBeLessThanOrEqual(90);
      }
    }
    expect(splitDuration(90, 60)).toEqual([90]);
  });
  it("lists only open, unblocked Todos of the week", () => {
    const { data, addTodo, addBlock } = setup();
    const open = addTodo("open", 30);
    addTodo("done", 30, null, { state: "done" });
    addTodo("other week", 30, null, { week: "2026-11-23" });
    const placed = addTodo("placed", 30);
    const skipped = addTodo("skipped block", 30);
    addBlock(WEEK, 600, 630, "task", { week_task_id: placed });
    addBlock(WEEK, 630, 660, "task", {
      week_task_id: skipped,
      state: "skipped",
    });
    expect(unplacedWeekTasks(data, WEEK).map((w) => w.id)).toEqual([
      open,
      skipped,
    ]);
  });
});

describe("autoSchedule", () => {
  it("orders by due date (overdue first, none last), then longer estimates", () => {
    const { data, addTodo } = setup();
    const none = addTodo("no due", 30);
    const longNone = addTodo("no due long", 90);
    const friday = addTodo("due friday", 30, "2026-11-20");
    const overdue = addTodo("overdue", 30, "2026-11-10");
    const { placements, unplaced } = run(data, { bufferMinutes: 0 });
    expect(unplaced).toEqual([]);
    expect(placements.map((p) => [p.weekTaskId, p.start])).toEqual([
      [overdue, 540],
      [friday, 570],
      [longNone, 600],
      [none, 690],
    ]);
    expect(placements.every((p) => p.date === WEEK)).toBe(true);
  });

  it("keeps a buffer around existing blocks and between proposals", () => {
    const { data, addTodo, addBlock } = setup();
    addBlock(WEEK, 600, 660); // event 10:00–11:00
    addBlock(WEEK, 720, 750, "task", { state: "done" }); // Todo block 12:00–12:30
    const a = addTodo("a", 30);
    const b = addTodo("b", 30);
    const c = addTodo("c", 60);
    const { placements } = run(data);
    const of = (id: string) => placements.find((p) => p.weekTaskId === id)!;
    expect(of(c)).toMatchObject({ date: WEEK, start: 765, duration: 60 });
    expect(of(a)).toMatchObject({ start: 540, duration: 30 });
    expect(of(b)).toMatchObject({ start: 675, duration: 30 });
    // No two proposals overlap and all are 15-minute aligned.
    const sorted = [...placements].sort((x, y) => x.start - y.start);
    for (let i = 1; i < sorted.length; i++)
      expect(sorted[i].start).toBeGreaterThanOrEqual(
        sorted[i - 1].start + sorted[i - 1].duration + 15,
      );
    expect(placements.every((p) => p.start % 15 === 0)).toBe(true);
  });

  it("places only inside focus windows and skips holidays and closed days", () => {
    const { data, addTodo } = setup();
    data.availability_overrides.push({
      id: uuid(),
      user_id: data.profile.id,
      version: 1,
      local_date: "2026-11-17",
      mode: "closed",
      windows: [],
    });
    // Monday full of a long event, Tuesday closed, Wednesday a holiday.
    data.time_blocks.push({
      id: uuid(),
      user_id: data.profile.id,
      version: 1,
      kind: "event",
      week_task_id: null,
      event_title: "all day",
      event_note: "",
      category_id: null,
      start_at: toUTC(WEEK, 540, ZONE),
      end_at: toUTC(WEEK, 1080, ZONE),
      local_date: WEEK,
      state: "planned",
      completed_at: null,
    });
    const id = addTodo("x", 60);
    const { placements } = run(data, {}, new Set(["2026-11-18"]));
    expect(placements).toEqual([
      {
        weekTaskId: id,
        date: "2026-11-19",
        start: 540,
        duration: 60,
        part: 1,
        parts: 1,
        afterDue: false,
      },
    ]);
  });

  it("ignores skipped blocks when finding free time", () => {
    const { data, addTodo, addBlock } = setup();
    addBlock(WEEK, 540, 1080, "event", { state: "skipped" });
    addTodo("x", 30);
    expect(run(data).placements[0]).toMatchObject({ date: WEEK, start: 540 });
  });

  it("refuses to place anything when holidays are not confirmed", () => {
    const { data, addTodo } = setup();
    const id = addTodo("x", 30);
    const result = run(data, { holidaysKnown: false });
    expect(result.placements).toEqual([]);
    expect(result.unplaced).toEqual([
      {
        weekTaskId: id,
        code: "holidays-unknown",
        reason: "공휴일 정보를 확인하지 못해서 배치하지 않았어요.",
      },
    ]);
  });

  it("skips past days and times before now on today", () => {
    const { data, addTodo } = setup();
    addTodo("x", 30);
    const now = toUTC("2026-11-18", 601, ZONE); // Wed 10:01
    const result = autoSchedule(data, WEEK, new Set(), { now });
    expect(result.placements[0]).toMatchObject({
      date: "2026-11-18",
      start: 615,
    });
    const later = autoSchedule(data, WEEK, new Set(), {
      now: MONDAY_MIDNIGHT,
      fromDate: "2026-11-19",
    });
    expect(later.placements[0]).toMatchObject({
      date: "2026-11-19",
      start: 540,
    });
    const passed = autoSchedule(data, WEEK, new Set(), {
      now: toUTC("2026-11-23", 0, ZONE),
    });
    expect(passed.placements).toEqual([]);
    expect(passed.unplaced[0].code).toBe("week-passed");
  });

  it("never goes past the due date when a slot before it exists", () => {
    const { data, addTodo, addBlock } = setup();
    addBlock(WEEK, 540, 1080);
    addBlock("2026-11-17", 540, 960); // Tuesday free only 16:00–18:00
    const id = addTodo("due tue", 120, "2026-11-17");
    const { placements } = run(data, { bufferMinutes: 0 });
    expect(placements).toEqual([
      expect.objectContaining({
        weekTaskId: id,
        date: "2026-11-17",
        start: 960,
        afterDue: false,
      }),
    ]);
  });

  it("falls back to after the due date and flags it when nothing fits before", () => {
    const { data, addTodo, addBlock } = setup();
    addBlock(WEEK, 540, 1080);
    const id = addTodo("due mon", 60, "2026-11-16");
    const { placements } = run(data);
    expect(placements).toEqual([
      expect.objectContaining({
        weekTaskId: id,
        date: "2026-11-17",
        start: 540,
        afterDue: true,
      }),
    ]);
  });

  it("splits long Todos into ordered parts across free time", () => {
    const { data, addTodo, addBlock } = setup();
    addBlock(WEEK, 660, 1080); // Monday free 09:00–11:00
    const id = addTodo("long", 240);
    const { placements } = run(data);
    expect(
      placements.map((p) => [p.date, p.start, p.duration, p.part, p.parts]),
    ).toEqual([
      [WEEK, 540, 90, 1, 3],
      ["2026-11-17", 540, 75, 2, 3],
      ["2026-11-17", 630, 75, 3, 3],
    ]);
    expect(placements.every((p) => p.weekTaskId === id)).toBe(true);
  });

  it("does not split at or below the threshold and honors a custom threshold", () => {
    const { data, addTodo } = setup();
    addTodo("two hours", 120);
    expect(run(data).placements).toHaveLength(1);
    expect(run(data, { splitLongerThan: 60 }).placements).toHaveLength(2);
  });

  it("respects a daily focus cap including existing Todo blocks", () => {
    const { data, addTodo, addBlock } = setup();
    addBlock(WEEK, 540, 600, "task"); // 60 minutes of Todo already on Monday
    const a = addTodo("a", 60);
    const b = addTodo("b", 60);
    const { placements } = run(data, { maxFocusMinutesPerDay: 120 });
    expect(placements.find((p) => p.weekTaskId === a)?.date).toBe(WEEK);
    expect(placements.find((p) => p.weekTaskId === b)?.date).toBe("2026-11-17");
  });

  it("reports what did not fit with a reason and keeps placing the rest", () => {
    const { data, addTodo, addBlock } = setup();
    for (let i = 0; i < 7; i++) addBlock(`2026-11-${16 + i}`, 540, 1020); // only 17:00–18:00 free
    const big = addTodo("too big", 90);
    const small = addTodo("fits", 60);
    const { placements, unplaced } = run(data, { bufferMinutes: 0 });
    expect(placements.map((p) => p.weekTaskId)).toEqual([small]);
    expect(unplaced).toEqual([
      {
        weekTaskId: big,
        code: "no-slot",
        reason: "연속 90분의 빈 시간이 없어요.",
      },
    ]);
    const capped = run(data, { bufferMinutes: 0, maxFocusMinutesPerDay: 30 });
    expect(capped.unplaced.map((u) => u.code)).toEqual([
      "daily-limit",
      "daily-limit",
    ]);
  });

  it("places a split Todo all-or-nothing", () => {
    const { data, addTodo, addBlock } = setup();
    for (let i = 0; i < 7; i++) addBlock(`2026-11-${16 + i}`, 540, 1020);
    const id = addTodo("huge", 600);
    const { placements, unplaced } = run(data, { bufferMinutes: 0 });
    expect(placements).toEqual([]);
    expect(unplaced[0]).toMatchObject({ weekTaskId: id, code: "no-slot" });
    expect(unplaced[0].reason).toContain("7개로 나눈");
  });

  it("is deterministic", () => {
    const { data, addTodo } = setup();
    for (let i = 0; i < 6; i++) addTodo(`t${i}`, 45 + i * 15);
    expect(run(data)).toEqual(run(data));
  });
});

describe("placementsStillFit and placementChanges", () => {
  it("detects stale proposals and builds planned Todo block inserts", () => {
    const { data, addTodo, addBlock } = setup();
    const id = addTodo("x", 45);
    const { placements } = run(data);
    expect(
      placementsStillFit(data, placements, new Set(), MONDAY_MIDNIGHT),
    ).toBe(true);
    expect(
      placementsStillFit(data, placements, new Set(), toUTC(WEEK, 600, ZONE)),
    ).toBe(false);
    let n = 0;
    expect(placementChanges(data, placements, () => `id-${n++}`)).toEqual([
      {
        table: "time_blocks",
        action: "insert",
        row: {
          id: "id-0",
          kind: "task",
          week_task_id: id,
          event_title: null,
          event_note: "",
          category_id: null,
          start_at: toUTC(WEEK, 540, ZONE),
          end_at: toUTC(WEEK, 585, ZONE),
          local_date: WEEK,
          state: "planned",
          completed_at: null,
        },
      },
    ]);
    addBlock(WEEK, 540, 570);
    expect(
      placementsStillFit(data, placements, new Set(), MONDAY_MIDNIGHT),
    ).toBe(false);
  });
});
