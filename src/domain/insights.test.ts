import { describe, it, expect } from "vitest";
import { emptyData } from "../data/demo";
import type { Block, Dataset, Task, WeekTask } from "./types";
import { toUTC } from "./planner";
import {
  categoryMinutes,
  chronicCarryOvers,
  completionTrend,
  estimateAccuracy,
  insightMessages,
  median,
  objectParticle,
  weekInsights,
  weekdayRatios,
} from "./insights";

const WEEK = "2026-11-09"; // Monday
const AFTER = new Date("2026-11-20T00:00:00Z"); // week is over
const MID = new Date("2026-11-11T03:00:00Z"); // Wednesday noon KST

function setup() {
  const d = emptyData(crypto.randomUUID());
  const meta = () => ({
    id: crypto.randomUUID(),
    user_id: d.profile.id,
    version: 1,
  });
  const task = (title: string, extra: Partial<Task> = {}) => {
    const t: Task = {
      ...meta(),
      title,
      description: "",
      category_id: null,
      due_on: null,
      estimate_minutes: null,
      state: "open",
      completed_at: null,
      ...extra,
    };
    d.tasks.push(t);
    return t;
  };
  const weekTask = (
    t: Task,
    week = WEEK,
    state: WeekTask["state"] = "open",
  ) => {
    const w: WeekTask = {
      ...meta(),
      task_id: t.id,
      week_start: week,
      state,
      completed_at: null,
      sort_order: 0,
    };
    d.week_tasks.push(w);
    return w;
  };
  const block = (
    date: string,
    start: number,
    end: number,
    extra: Partial<Block> = {},
  ) => {
    const b: Block = {
      ...meta(),
      kind: "event",
      week_task_id: null,
      event_title: "일정",
      event_note: "",
      category_id: null,
      start_at: toUTC(date, start, d.profile.timezone),
      end_at: toUTC(date, end, d.profile.timezone),
      local_date: date,
      state: "planned",
      completed_at: null,
      ...extra,
    };
    d.time_blocks.push(b);
    return b;
  };
  const taskBlock = (
    w: WeekTask,
    date: string,
    start: number,
    end: number,
    state: Block["state"] = "planned",
  ) =>
    block(date, start, end, {
      kind: "task",
      week_task_id: w.id,
      event_title: null,
      state,
    });
  return { d, task, weekTask, block, taskBlock };
}
const cat = (d: Dataset, i: number) => d.categories[i];

describe("median", () => {
  it("handles empty, odd and even inputs", () => {
    expect(median([])).toBeNull();
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3])).toBe(2.5);
  });
});

describe("objectParticle", () => {
  it("picks 을/를 by final consonant", () => {
    expect(objectParticle("보고서")).toBe("를");
    expect(objectParticle("기획안")).toBe("을");
    expect(objectParticle("report")).toBe("을(를)");
  });
});

describe("categoryMinutes", () => {
  it("uses the task's category for task blocks and the block's for events", () => {
    const { d, task, weekTask, block, taskBlock } = setup();
    const work = cat(d, 0),
      study = cat(d, 2);
    const w = weekTask(task("보고서", { category_id: work.id }));
    taskBlock(w, "2026-11-09", 540, 660, "done");
    taskBlock(w, "2026-11-10", 540, 600);
    taskBlock(w, "2026-11-11", 540, 600, "skipped");
    block("2026-11-12", 600, 690, { category_id: study.id });
    block("2026-11-12", 700, 730);
    // outside the week
    taskBlock(w, "2026-11-16", 540, 600, "done");
    const rows = categoryMinutes(d, WEEK);
    expect(rows).toEqual([
      expect.objectContaining({ id: work.id, planned: 180, done: 120 }),
      expect.objectContaining({ id: study.id, planned: 90, done: 0 }),
      expect.objectContaining({ id: null, name: "미분류", planned: 30 }),
    ]);
  });
  it("keeps the top five and merges the rest into 기타", () => {
    const { d, block } = setup();
    for (let i = 0; i < 6; i++)
      block("2026-11-09", 0, 60 * (6 - i), { category_id: cat(d, i).id });
    block("2026-11-10", 0, 10);
    const rows = categoryMinutes(d, WEEK);
    expect(rows).toHaveLength(6);
    expect(rows[5]).toEqual(
      expect.objectContaining({ id: "other", name: "기타", planned: 70 }),
    );
  });
  it("does not add 기타 for a single leftover category", () => {
    const { d, block } = setup();
    for (let i = 0; i < 6; i++)
      block("2026-11-09", 0, 60 * (6 - i), { category_id: cat(d, i).id });
    expect(categoryMinutes(d, WEEK).map((r) => r.name)).not.toContain("기타");
  });
});

describe("weekdayRatios", () => {
  it("divides done by non-skipped planned task minutes per weekday", () => {
    const { d, task, weekTask, block, taskBlock } = setup();
    const w = weekTask(task("a"));
    taskBlock(w, "2026-11-09", 540, 600, "done");
    taskBlock(w, "2026-11-09", 600, 660);
    taskBlock(w, "2026-11-09", 660, 720, "skipped");
    taskBlock(w, "2026-11-11", 540, 600, "done");
    block("2026-11-10", 540, 600, { state: "done" }); // events don't count
    const rows = weekdayRatios(d, WEEK, AFTER);
    expect(rows.map((r) => r.label).join("")).toBe("월화수목금토일");
    expect(rows[0]).toEqual(
      expect.objectContaining({ planned: 120, done: 60, ratio: 0.5 }),
    );
    expect(rows[1].ratio).toBeNull();
    expect(rows[2].ratio).toBe(1);
    expect(rows.every((r) => r.elapsed && r.over)).toBe(true);
  });
  it("splits a block that crosses midnight and marks future days", () => {
    const { d, task, weekTask, taskBlock } = setup();
    const w = weekTask(task("a"));
    const b = taskBlock(w, "2026-11-09", 1380, 1440, "done");
    b.end_at = toUTC("2026-11-10", 60, d.profile.timezone);
    const rows = weekdayRatios(d, WEEK, MID);
    expect(rows[0].planned).toBe(60);
    expect(rows[1].planned).toBe(60);
    expect(rows.map((r) => r.elapsed)).toEqual([
      true,
      true,
      true,
      false,
      false,
      false,
      false,
    ]);
    // Today (Wednesday) has started but is not over yet.
    expect(rows.map((r) => r.over)).toEqual([
      true,
      true,
      false,
      false,
      false,
      false,
      false,
    ]);
  });
});

describe("estimateAccuracy", () => {
  it("compares placed minutes with the estimate and takes the median", () => {
    const { d, task, weekTask, taskBlock } = setup();
    const a = weekTask(task("a", { estimate_minutes: 60 }));
    taskBlock(a, "2026-11-09", 540, 600);
    taskBlock(a, "2026-11-10", 540, 570); // 90 → +50%
    const b = weekTask(task("b", { estimate_minutes: 120 }));
    taskBlock(b, "2026-11-09", 600, 720); // 120 → 0%
    const c = weekTask(task("c", { estimate_minutes: 100 }));
    taskBlock(c, "2026-11-09", 720, 900); // 180 → +80%
    taskBlock(c, "2026-11-11", 720, 900, "skipped");
    const n = weekTask(task("no estimate"));
    taskBlock(n, "2026-11-09", 900, 960);
    const r = estimateAccuracy(d, WEEK);
    expect(r.samples.map((s) => s.title)).toEqual(["c", "a", "b"]);
    expect(r.samples[0]).toEqual(
      expect.objectContaining({ estimate: 100, placed: 180, ratio: 1.8 }),
    );
    expect(r.medianDeviation).toBeCloseTo(0.5);
  });
  it("is null without samples", () => {
    expect(estimateAccuracy(setup().d, WEEK).medianDeviation).toBeNull();
  });
});

describe("chronicCarryOvers", () => {
  it("lists open tasks carried in two or more weeks", () => {
    const { d, task, weekTask } = setup();
    const report = task("보고서"),
      once = task("한 번"),
      finished = task("끝남", { state: "done" });
    for (const wk of ["2026-10-26", "2026-11-02", "2026-11-09"])
      weekTask(report, wk, "carried");
    weekTask(report, "2026-11-16");
    weekTask(once, "2026-11-02", "carried");
    weekTask(finished, "2026-10-26", "carried");
    weekTask(finished, "2026-11-02", "carried");
    expect(chronicCarryOvers(d)).toEqual([
      { taskId: report.id, title: "보고서", count: 3 },
    ]);
  });
});

describe("completionTrend", () => {
  it("uses finalized snapshots, skips empty weeks and appends the live week", () => {
    const { d, task, weekTask } = setup();
    const review = (week: string, done: number, total: number | null) =>
      d.week_reviews.push({
        id: crypto.randomUUID(),
        user_id: d.profile.id,
        version: 1,
        week_start: week,
        did_well: "",
        could_improve: "",
        next_week_action: "",
        stats_snapshot:
          total === null
            ? null
            : {
                done,
                total,
                eventMinutes: 0,
                plannedMinutes: 0,
                doneMinutes: 0,
                carried: 0,
              },
        finalized_at: null,
      });
    for (let i = 10; i >= 1; i--) {
      const wk = new Date(Date.UTC(2026, 10, 9 - 7 * i))
        .toISOString()
        .slice(0, 10);
      review(wk, 1, i === 3 ? 0 : 4);
    }
    review("2026-10-05", 0, null);
    review("2026-11-16", 4, 4); // later week is ignored
    weekTask(task("a"), WEEK, "done");
    weekTask(task("b"), WEEK);
    const t = completionTrend(d, WEEK);
    expect(t).toHaveLength(9);
    expect(t.filter((p) => p.live)).toEqual([
      expect.objectContaining({ week: WEEK, rate: 0.5 }),
    ]);
    expect(t.map((p) => p.week)).toEqual([...t.map((p) => p.week)].sort());
    expect(t.some((p) => p.week === "2026-10-19")).toBe(false);
  });
});

describe("insightMessages", () => {
  const empty = {
    categories: [],
    weekdays: [],
    estimate: { samples: [], medianDeviation: null },
    carryOvers: [],
    trend: [],
  };
  it("says nothing without data", () => {
    expect(insightMessages(empty, true)).toEqual([]);
    expect(weekInsights(setup().d, WEEK, AFTER).messages).toEqual([]);
  });
  it("needs at least two estimate samples", () => {
    const sample = {
      taskId: "x",
      title: "x",
      estimate: 60,
      placed: 84,
      ratio: 1.4,
    };
    expect(
      insightMessages(
        { ...empty, estimate: { samples: [sample], medianDeviation: 0.4 } },
        true,
      ),
    ).toEqual([]);
    expect(
      insightMessages(
        {
          ...empty,
          estimate: { samples: [sample, sample], medianDeviation: 0.4 },
        },
        true,
      ),
    ).toEqual(["예상 시간보다 보통 40% 더 길게 계획했어요."]);
  });
  it("only compares the trend once the week is over", () => {
    const p = (rate: number, live = false) => ({
      week: "w",
      done: 0,
      total: 1,
      rate,
      live,
    });
    const trend = [p(0.8), p(0.6), p(0.4, true)];
    expect(insightMessages({ ...empty, trend }, false)).toEqual([]);
    expect(insightMessages({ ...empty, trend }, true)).toEqual([
      "이번 주 완료율 40%는 지난 2주 평균보다 30%p 낮아요.",
    ]);
  });
  it("builds coaching lines from a realistic week, capped at three", () => {
    const { d, task, weekTask, taskBlock } = setup();
    const work = cat(d, 0).id;
    const report = task("보고서", { category_id: work, estimate_minutes: 60 });
    for (const wk of ["2026-10-26", "2026-11-02"])
      weekTask(report, wk, "carried");
    const a = weekTask(report);
    const b = weekTask(
      task("기획", { category_id: work, estimate_minutes: 60 }),
    );
    const c = weekTask(task("운동", { category_id: cat(d, 3).id }));
    taskBlock(a, "2026-11-09", 540, 630, "done"); // Mon 100%
    taskBlock(b, "2026-11-11", 540, 570); // Wed: 30 of 60 done
    taskBlock(b, "2026-11-11", 570, 600, "done");
    taskBlock(c, "2026-11-12", 540, 600, "done");
    const r = weekInsights(d, WEEK, AFTER);
    expect(r.messages).toEqual([
      "‘보고서’를 2번 이월했어요 — 쪼개거나 마감을 정해 보세요.",
      "예상 시간보다 보통 25% 더 길게 계획했어요.",
      "수요일 완료율이 가장 낮아요(50%).",
    ]);
  });
});

describe("measured focus", () => {
  const session = (
    d: Dataset,
    block_id: string,
    started_at: string,
    ended_at: string | null,
  ) =>
    d.block_sessions.push({
      id: crypto.randomUUID(),
      user_id: d.profile.id,
      version: 1,
      block_id,
      started_at,
      ended_at,
      note: "",
    });
  it("sums sessions clipped to the week, separate from planned minutes", () => {
    const { d, task, weekTask, taskBlock } = setup();
    const b = taskBlock(
      weekTask(task("보고서")),
      "2026-11-09",
      540,
      660,
      "done",
    );
    // Mon 09:00–09:50 KST
    session(d, b.id, "2026-11-09T00:00:00.000Z", "2026-11-09T00:50:00.000Z");
    // Sun 23:30 KST before the week → only 30 minutes inside
    session(d, b.id, "2026-11-08T14:30:00.000Z", "2026-11-08T15:30:00.000Z");
    // next week: not counted
    session(d, b.id, "2026-11-16T00:00:00.000Z", "2026-11-16T01:00:00.000Z");
    const i = weekInsights(d, WEEK, AFTER);
    expect(i.focus).toEqual({ minutes: 80, sessions: 2 });
    expect(i.messages.some((m) => m.includes("실측 집중은 1.3시간(2회)"))).toBe(
      true,
    );
    expect(i.messages.find((m) => m.includes("실측"))).toContain("67%");
  });
  it("counts a running session up to now and stays quiet with one session", () => {
    const { d, block } = setup();
    const b = block("2026-11-11", 600, 720);
    session(d, b.id, "2026-11-11T02:00:00.000Z", null); // Wed 11:00 KST
    const i = weekInsights(d, WEEK, MID); // Wed 12:00 KST
    expect(i.focus).toEqual({ minutes: 60, sessions: 1 });
    expect(i.messages.some((m) => m.includes("실측"))).toBe(false);
  });
});
