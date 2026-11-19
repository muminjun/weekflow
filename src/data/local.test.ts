import { describe, it, expect } from "vitest";
import { emptyData, uuid } from "./demo";
import { applyLocal } from "./local";
import { normalizeDataset } from "./sync";
import { inverseOf } from "./history";
import type {
  Block,
  BlockSession,
  Dataset,
  Occurrence,
  Task,
  WeekTask,
} from "../domain/types";

function fixture() {
  const d = emptyData(uuid());
  const user = d.profile.id;
  const meta = () => ({ id: uuid(), user_id: user, version: 1 });
  const task: Task = {
    ...meta(),
    title: "반복 할 일",
    description: "",
    category_id: null,
    due_on: null,
    estimate_minutes: null,
    state: "open",
    completed_at: null,
  };
  const week: WeekTask = {
    ...meta(),
    task_id: task.id,
    week_start: "2026-11-16",
    state: "open",
    completed_at: null,
    sort_order: 0,
  };
  const block: Block = {
    ...meta(),
    kind: "task",
    week_task_id: week.id,
    event_title: null,
    event_note: "",
    category_id: null,
    start_at: "2026-11-16T00:00:00.000Z",
    end_at: "2026-11-16T01:00:00.000Z",
    local_date: "2026-11-16",
    state: "planned",
    completed_at: null,
  };
  const session: BlockSession = {
    ...meta(),
    block_id: block.id,
    started_at: "2026-11-16T00:00:00.000Z",
    ended_at: "2026-11-16T00:30:00.000Z",
    note: "",
  };
  const rule = uuid();
  const occurrence = (extra: Partial<Occurrence>): Occurrence => ({
    ...meta(),
    version: 3,
    rule_id: rule,
    local_date: "2026-11-16",
    state: "generated",
    task_id: null,
    time_block_id: null,
    overrides: {},
    ...extra,
  });
  d.tasks.push(task);
  d.week_tasks.push(week);
  d.time_blocks.push(block);
  d.block_sessions.push(session);
  d.week_task_day_marks.push({
    ...meta(),
    week_task_id: week.id,
    local_date: "2026-11-16",
    mark: "done",
  });
  return { d, task, week, block, session, occurrence };
}

describe("normalizeDataset", () => {
  it("defaults tables a server without migration 015 omits", () => {
    const d = emptyData(uuid()) as unknown as Record<string, unknown>;
    delete d.block_sessions;
    delete d.week_templates;
    const n = normalizeDataset(d as unknown as Dataset);
    expect(n.block_sessions).toEqual([]);
    expect(n.week_templates).toEqual([]);
  });
  it("canonicalises session timestamps", () => {
    const { d, session } = fixture();
    d.block_sessions[0] = {
      ...session,
      started_at: "2026-11-16T09:00:00+09:00",
      ended_at: null,
    };
    const n = normalizeDataset(d);
    expect(n.block_sessions[0].started_at).toBe("2026-11-16T00:00:00.000Z");
    expect(n.block_sessions[0].ended_at).toBeNull();
  });
});

describe("applyLocal", () => {
  it("inserts, updates and deletes focus sessions and templates", () => {
    const { d, block } = fixture();
    const id = uuid(),
      template = uuid();
    let next = applyLocal(d, [
      {
        table: "block_sessions",
        action: "insert",
        row: {
          id,
          block_id: block.id,
          started_at: "2026-11-16T02:00:00.000Z",
          ended_at: null,
          note: "",
        },
      },
      {
        table: "week_templates",
        action: "insert",
        row: { id: template, name: "평상 주", blocks: [], goals: [] },
      },
    ]);
    expect(next.block_sessions.find((s) => s.id === id)).toMatchObject({
      version: 1,
      user_id: d.profile.id,
    });
    next = applyLocal(next, [
      {
        table: "block_sessions",
        action: "update",
        expected_version: 1,
        row: { id, ended_at: "2026-11-16T02:30:00.000Z" },
      },
      { table: "week_templates", action: "delete", row: { id: template } },
    ]);
    expect(next.block_sessions.find((s) => s.id === id)).toMatchObject({
      version: 2,
      ended_at: "2026-11-16T02:30:00.000Z",
    });
    expect(next.week_templates).toEqual([]);
  });
  it("treats a table missing from an older cache as empty", () => {
    const { d } = fixture();
    delete (d as unknown as Record<string, unknown>).week_templates;
    const next = applyLocal(d, [
      {
        table: "week_templates",
        action: "insert",
        row: { id: uuid(), name: "시험 주", blocks: [], goals: [] },
      },
    ]);
    expect(next.week_templates).toHaveLength(1);
  });
  it("deleting a block removes its sessions and tombstones its occurrence", () => {
    const { d, block, occurrence } = fixture();
    const occ = occurrence({ time_block_id: block.id });
    d.recurrence_occurrences.push(occ);
    const next = applyLocal(d, [
      { table: "time_blocks", action: "delete", row: { id: block.id } },
    ]);
    expect(next.block_sessions).toEqual([]);
    expect(next.recurrence_occurrences[0]).toMatchObject({
      state: "cancelled",
      time_block_id: null,
      task_id: null,
      version: 4,
    });
  });
  it("deleting a task mirrors the server's tombstone, cascades and set-null bumps", () => {
    const { d, task, week, block, occurrence } = fixture();
    const own = occurrence({ task_id: task.id });
    // An occurrence of a different rule that only points at the cascaded block.
    const other = occurrence({ time_block_id: block.id });
    const untouched = occurrence({});
    d.recurrence_occurrences.push(own, other, untouched);
    d.goals.push({
      id: uuid(),
      user_id: d.profile.id,
      version: 1,
      week_start: "2026-11-16",
      title: "목표",
      note: "",
      sort_order: 0,
    });
    d.goal_week_tasks.push({
      user_id: d.profile.id,
      goal_id: d.goals[0].id,
      week_task_id: week.id,
    });
    const next = applyLocal(d, [
      { table: "tasks", action: "delete", row: { id: task.id } },
    ]);
    expect(next.week_tasks).toEqual([]);
    expect(next.time_blocks).toEqual([]);
    expect(next.block_sessions).toEqual([]);
    expect(next.week_task_day_marks).toEqual([]);
    expect(next.goal_week_tasks).toEqual([]);
    const byId = new Map(next.recurrence_occurrences.map((o) => [o.id, o]));
    expect(byId.get(own.id)).toMatchObject({
      state: "cancelled",
      task_id: null,
      version: 4,
    });
    // FK `on delete set null` is an update: version + 1, state unchanged.
    expect(byId.get(other.id)).toMatchObject({
      state: "generated",
      time_block_id: null,
      version: 4,
    });
    expect(byId.get(untouched.id)!.version).toBe(3);
  });
  it("deleting a week task cascades to its blocks, marks and links", () => {
    const { d, week, occurrence, block } = fixture();
    d.recurrence_occurrences.push(occurrence({ time_block_id: block.id }));
    const next = applyLocal(d, [
      { table: "week_tasks", action: "delete", row: { id: week.id } },
    ]);
    expect(next.tasks).toHaveLength(1);
    expect(next.time_blocks).toEqual([]);
    expect(next.block_sessions).toEqual([]);
    expect(next.week_task_day_marks).toEqual([]);
    expect(next.recurrence_occurrences[0]).toMatchObject({
      time_block_id: null,
      version: 4,
    });
  });
  it("undo restores a deleted block together with its sessions", () => {
    const { d, block } = fixture();
    const next = applyLocal(d, [
      { table: "time_blocks", action: "delete", row: { id: block.id } },
    ]);
    const inverse = inverseOf(d, next);
    expect(inverse.map((c) => [c.table, c.action])).toEqual([
      ["time_blocks", "insert"],
      ["block_sessions", "insert"],
    ]);
  });
});
