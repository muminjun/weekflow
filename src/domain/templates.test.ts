import { describe, expect, it } from "vitest";
import { emptyData } from "../data/demo";
import { applyLocal } from "../data/local";
import { localMinute, toUTC } from "./planner";
import type { Block, Dataset } from "./types";
import {
  applyTemplate,
  duplicateBlock,
  placeTaskChanges,
  templateFromWeek,
} from "./templates";

// 2026-11-16 is a Monday.
const week = "2026-11-16";
const next = "2026-11-23";
let n = 0;
const newId = () => `id-${++n}`;

function fixture(): Dataset {
  const d = emptyData("u");
  d.profile.timezone = "Asia/Seoul";
  const cat = d.categories[0].id;
  d.tasks.push({
    id: "t1",
    user_id: "u",
    version: 1,
    title: "보고서",
    description: "",
    category_id: cat,
    due_on: "2026-11-20",
    estimate_minutes: 90,
    state: "open",
    completed_at: null,
  });
  d.week_tasks.push({
    id: "w1",
    user_id: "u",
    version: 1,
    task_id: "t1",
    week_start: week,
    state: "open",
    completed_at: null,
    sort_order: 0,
  });
  const block = (
    id: string,
    date: string,
    start: number,
    end: number,
    extra: Partial<Block>,
  ): Block => ({
    id,
    user_id: "u",
    version: 1,
    kind: "event",
    week_task_id: null,
    event_title: null,
    event_note: "",
    category_id: null,
    start_at: toUTC(date, start, "Asia/Seoul"),
    end_at: toUTC(date, end, "Asia/Seoul"),
    local_date: date,
    state: "planned",
    completed_at: null,
    ...extra,
  });
  d.time_blocks.push(
    block("b1", "2026-11-16", 600, 660, {
      event_title: "팀 미팅",
      event_note: "회의실 A",
      category_id: cat,
    }),
    block("b2", "2026-11-17", 540, 660, { kind: "task", week_task_id: "w1" }),
    block("b3", "2026-11-18", 540, 600, {
      event_title: "취소됨",
      state: "skipped",
    }),
    block("b4", "2026-11-19", 780, 840, {
      kind: "task",
      week_task_id: "w1",
      state: "done",
    }),
    // Outside the week.
    block("b5", "2026-11-24", 600, 660, { event_title: "다음 주" }),
  );
  d.goals.push(
    {
      id: "g1",
      user_id: "u",
      version: 1,
      week_start: week,
      title: "집중하기",
      note: "",
      sort_order: 0,
    },
    {
      id: "g2",
      user_id: "u",
      version: 1,
      week_start: next,
      title: "집중하기",
      note: "",
      sort_order: 0,
    },
  );
  return d;
}

describe("templateFromWeek", () => {
  it("captures the week's non-skipped blocks and goals", () => {
    const d = fixture();
    const t = templateFromWeek(d, week, "  평상 주  ", newId);
    expect(t.name).toBe("평상 주");
    expect(t.goals).toEqual(["집중하기"]);
    expect(t.blocks).toEqual([
      {
        weekday: 1,
        start_minute: 600,
        duration: 60,
        kind: "event",
        title: "팀 미팅",
        category_id: d.categories[0].id,
        note: "회의실 A",
      },
      expect.objectContaining({
        weekday: 2,
        start_minute: 540,
        duration: 120,
        kind: "task",
        title: "보고서",
      }),
      expect.objectContaining({ weekday: 4, start_minute: 780, kind: "task" }),
    ]);
  });
});

describe("applyTemplate", () => {
  it("reuses an existing open Todo and skips goals already present", () => {
    const d = fixture();
    const t = templateFromWeek(d, week, "평상 주", newId);
    const result = applyTemplate(d, t, next, newId);
    // 보고서 has no week_tasks row next week, so one Todo link is created
    // for both its blocks; the goal already exists next week.
    const tables = result.changes.map((c) => c.table);
    expect(tables.filter((x) => x === "tasks")).toHaveLength(1);
    expect(tables.filter((x) => x === "week_tasks")).toHaveLength(1);
    expect(tables.filter((x) => x === "time_blocks")).toHaveLength(3);
    expect(tables).not.toContain("goals");
    const applied = applyLocal(d, result.changes);
    const added = applied.time_blocks.filter((b) => b.local_date >= next);
    expect(added.map((b) => b.local_date).sort()).toEqual([
      "2026-11-23",
      "2026-11-24",
      "2026-11-24",
      "2026-11-26",
    ]);
    expect(added.every((b) => b.state === "planned")).toBe(true);
  });

  it("links task blocks to the week's existing open Todo instead of duplicating", () => {
    const d = fixture();
    const t = templateFromWeek(d, week, "평상 주", newId);
    const result = applyTemplate(d, { ...t, goals: ["새 목표"] }, week, newId);
    expect(result.changes.some((c) => c.table === "tasks")).toBe(false);
    const tasks = result.changes.filter(
      (c) => c.table === "time_blocks" && c.row.kind === "task",
    );
    expect(tasks.every((c) => c.row.week_task_id === "w1")).toBe(true);
    expect(result.placements.filter((p) => p.reused)).toHaveLength(2);
    expect(result.changes.find((c) => c.table === "goals")?.row).toMatchObject({
      title: "새 목표",
      week_start: week,
      sort_order: 1,
    });
  });

  it("reports overlaps with existing blocks without dropping them", () => {
    const d = fixture();
    const result = applyTemplate(
      d,
      {
        blocks: [
          {
            weekday: 1,
            start_minute: 630,
            duration: 60,
            kind: "event",
            title: "겹치는 일정",
            category_id: null,
            note: "",
          },
        ],
        goals: [],
      },
      week,
      newId,
    );
    expect(result.changes).toHaveLength(1);
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0].overlaps).toEqual([
      { id: "b1", title: "팀 미팅" },
    ]);
  });

  it("keeps wall-clock times across a DST change", () => {
    const d = fixture();
    d.profile.timezone = "America/New_York";
    // 2026-11-01 is the US fall-back Sunday; its week starts 2026-10-26.
    const result = applyTemplate(
      d,
      {
        blocks: [
          {
            weekday: 7,
            start_minute: 545,
            duration: 50,
            kind: "event",
            title: "브런치",
            category_id: "missing",
            note: "",
          },
        ],
        goals: [],
      },
      "2026-10-26",
      newId,
    );
    const row = result.changes[0].row as unknown as Block;
    expect(row.local_date).toBe("2026-11-01");
    expect(localMinute(row.start_at, "America/New_York")).toBe(540);
    expect(localMinute(row.end_at, "America/New_York")).toBe(600);
    expect(row.category_id).toBeNull();
  });
});

describe("duplicateBlock", () => {
  it("copies fields to a new id, planned and not completed", () => {
    const d = fixture();
    const done = d.time_blocks.find((b) => b.id === "b4")!;
    const change = duplicateBlock(
      done,
      "2026-11-20",
      600,
      () => "copy",
      "Asia/Seoul",
    );
    expect(change).toMatchObject({
      table: "time_blocks",
      action: "insert",
      row: {
        id: "copy",
        kind: "task",
        week_task_id: "w1",
        local_date: "2026-11-20",
        state: "planned",
        completed_at: null,
        start_at: toUTC("2026-11-20", 600, "Asia/Seoul"),
        end_at: toUTC("2026-11-20", 660, "Asia/Seoul"),
      },
    });
  });
});

describe("placeTaskChanges", () => {
  it("links an unlinked task to the week and places it in one batch", () => {
    const d = fixture();
    const result = placeTaskChanges(d, "t1", next, "2026-11-24", 605, newId);
    expect(result.linked).toBe(false);
    expect(result.changes.map((c) => c.table)).toEqual([
      "week_tasks",
      "time_blocks",
    ]);
    expect(result.changes[1].row).toMatchObject({
      week_task_id: result.weekTaskId,
      start_at: toUTC("2026-11-24", 600, "Asia/Seoul"),
      end_at: toUTC("2026-11-24", 690, "Asia/Seoul"),
    });
  });
  it("reuses the existing week link", () => {
    const d = fixture();
    const result = placeTaskChanges(d, "t1", week, "2026-11-17", 900, newId);
    expect(result).toMatchObject({ linked: true, weekTaskId: "w1" });
    expect(result.changes).toHaveLength(1);
  });
});
