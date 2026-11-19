import { formatInTimeZone } from "date-fns-tz";
import type { Block, Change, Dataset, WeekTask } from "./types";
import { availability, blockSlice } from "./selectors";
import {
  addDays,
  localMinute,
  subtract,
  toUTC,
  union,
  type Interval,
} from "./planner";

export interface AutoScheduleOptions {
  /** Gap kept around existing blocks and between proposals (default 15). */
  bufferMinutes?: number;
  /** Cap on Todo minutes per day, counting Todo blocks already placed that day. */
  maxFocusMinutesPerDay?: number;
  /** Todos longer than this are split into parts of at most 90 minutes (default 120). */
  splitLongerThan?: number;
  /** Days before this local date are skipped (default: today in the profile time zone). */
  fromDate?: string;
  /** Holidays not confirmed yet: nothing is placed (default true). */
  holidaysKnown?: boolean;
  /** Reference instant; on today only times after it are used (default: now). */
  now?: string;
}

export interface Placement {
  weekTaskId: string;
  date: string;
  /** Local minute of the day, 15-minute aligned. */
  start: number;
  duration: number;
  /** 1-based part index and part count; 1/1 when not split. */
  part: number;
  parts: number;
  /** Placed after the due date because no slot existed before it. */
  afterDue: boolean;
}

export type UnplacedCode =
  "holidays-unknown" | "week-passed" | "no-slot" | "daily-limit";

export interface UnplacedTask {
  weekTaskId: string;
  code: UnplacedCode;
  reason: string;
}

export interface AutoScheduleResult {
  placements: Placement[];
  unplaced: UnplacedTask[];
}

const STEP = 15;
const MAX_PART = 90;
const MIN_PART = 30;

const ceilStep = (n: number) => Math.ceil(n / STEP) * STEP;

/** Open Todos of the week whose Todo is open and that have no active block yet. */
export function unplacedWeekTasks(data: Dataset, week: string): WeekTask[] {
  return data.week_tasks.filter(
    (w) =>
      w.week_start === week &&
      w.state === "open" &&
      data.tasks.some(
        (task) => task.id === w.task_id && task.state === "open",
      ) &&
      !data.time_blocks.some(
        (b) => b.week_task_id === w.id && b.state !== "skipped",
      ),
  );
}

/** Duration rounded up to 15 minutes; a missing estimate counts as 60. */
export const taskDuration = (estimate: number | null | undefined) =>
  Math.max(STEP, ceilStep(estimate ?? 60));

/** Splits a duration into near-equal 15-minute-aligned parts of 30–90 minutes. */
export function splitDuration(duration: number, splitLongerThan = 120) {
  if (duration <= splitLongerThan) return [duration];
  const count = Math.ceil(duration / MAX_PART);
  const units = duration / STEP;
  const each = Math.floor(units / count);
  const extra = units % count;
  return Array.from(
    { length: count },
    (_, i) => (each + (i < extra ? 1 : 0)) * STEP,
  ).map((n) => Math.max(MIN_PART, n));
}

interface Day {
  date: string;
  /** Focus windows (availability minus events), clipped to after "now" on today. */
  focus: Interval[];
  /** Occupied intervals, already widened by the buffer. */
  taken: Interval[];
  todoMinutes: number;
}

/**
 * Drafts placements for every unplaced open Todo of the week. Pure and
 * deterministic: Todos are ordered by due date (overdue first, none last),
 * then by longer estimate; each part goes into the earliest free 15-minute
 * aligned slot inside focus windows, never overlapping existing non-skipped
 * blocks or earlier proposals.
 */
export function autoSchedule(
  data: Dataset,
  week: string,
  holidays: ReadonlySet<string>,
  options: AutoScheduleOptions = {},
): AutoScheduleResult {
  const zone = data.profile.timezone;
  const now = options.now ?? new Date().toISOString();
  const today = formatInTimeZone(now, zone, "yyyy-MM-dd");
  const requested = options.fromDate ?? today;
  const fromDate = requested > today ? requested : today;
  const buffer = Math.max(0, ceilStep(options.bufferMinutes ?? 15));
  const limit = options.maxFocusMinutesPerDay;
  const splitAt = options.splitLongerThan ?? 120;
  const taskOf = new Map(data.tasks.map((t) => [t.id, t]));
  const pending = unplacedWeekTasks(data, week)
    .map((w) => ({ w, task: taskOf.get(w.task_id)! }))
    .sort(
      (a, b) =>
        (a.task.due_on ?? "9999-12-31").localeCompare(
          b.task.due_on ?? "9999-12-31",
        ) ||
        taskDuration(b.task.estimate_minutes) -
          taskDuration(a.task.estimate_minutes) ||
        a.w.sort_order - b.w.sort_order ||
        a.w.id.localeCompare(b.w.id),
    );
  const refuse = (code: UnplacedCode, reason: string) => ({
    placements: [],
    unplaced: pending.map(({ w }) => ({ weekTaskId: w.id, code, reason })),
  });
  if (options.holidaysKnown === false)
    return refuse(
      "holidays-unknown",
      "공휴일 정보를 확인하지 못해서 배치하지 않았어요.",
    );
  const nowMinute = localMinute(now, zone);
  const days: Day[] = Array.from({ length: 7 }, (_, i) => addDays(week, i))
    .filter((date) => date >= fromDate)
    .map((date) => {
      const { focus } = availability(data, date, holidays.has(date));
      const blocks = data.time_blocks
        .filter((b) => b.state !== "skipped")
        .map((b) => ({ b, i: blockSlice(b, date, zone) }))
        .filter((x): x is { b: Block; i: Interval } => !!x.i);
      const cutoff = date === today ? ceilStep(nowMinute + 1) : 0;
      return {
        date,
        focus: subtract(focus, [[0, cutoff]]),
        taken: union(blocks.map(({ i: [s, e] }) => [s - buffer, e + buffer])),
        todoMinutes: union(
          blocks.filter((x) => x.b.kind === "task").map((x) => x.i),
        ).reduce((n, [s, e]) => n + e - s, 0),
      };
    });
  if (!days.length) return refuse("week-passed", "이번 주에 남은 날이 없어요.");

  const placements: Placement[] = [];
  const unplaced: UnplacedTask[] = [];
  for (const { w, task } of pending) {
    const parts = splitDuration(taskDuration(task.estimate_minutes), splitAt);
    const due = task.due_on;
    const overdue = !!due && due < fromDate;
    const beforeDue = due && !overdue ? days.filter((d) => d.date <= due) : [];
    const afterDue = due && !overdue ? days.filter((d) => d.date > due) : days;
    let blockedByLimit = false;
    const attempt = (candidates: Day[], late: boolean) => {
      const placed: { day: Day; slot: Interval }[] = [];
      let after: { date: string; minute: number } | null = null;
      for (const length of parts) {
        let found: { day: Day; slot: Interval } | null = null;
        for (const day of candidates) {
          if (after && day.date < after.date) continue;
          const used =
            day.todoMinutes +
            placed
              .filter((p) => p.day === day)
              .reduce((n, p) => n + p.slot[1] - p.slot[0], 0);
          if (limit !== undefined && used + length > limit) {
            blockedByLimit = true;
            continue;
          }
          const taken = union([
            ...day.taken,
            ...placed
              .filter((p) => p.day === day)
              .map((p): Interval => [p.slot[0] - buffer, p.slot[1] + buffer]),
          ]);
          const floor = after && after.date === day.date ? after.minute : 0;
          for (const [from, to] of subtract(day.focus, taken)) {
            const start = ceilStep(Math.max(from, floor));
            if (start + length <= to) {
              found = { day, slot: [start, start + length] };
              break;
            }
          }
          if (found) break;
        }
        if (!found) return null;
        placed.push(found);
        after = { date: found.day.date, minute: found.slot[1] };
      }
      return placed.map((p, i) => ({ ...p, late, index: i }));
    };
    const result =
      (beforeDue.length ? attempt(beforeDue, false) : null) ??
      attempt(afterDue, !!due && !overdue);
    if (!result) {
      unplaced.push({
        weekTaskId: w.id,
        code: blockedByLimit ? "daily-limit" : "no-slot",
        reason: blockedByLimit
          ? "하루 최대 집중 시간을 넘지 않는 빈 시간이 없어요."
          : parts.length > 1
            ? `${parts.length}개로 나눈 시간을 모두 넣을 빈 시간이 없어요.`
            : `연속 ${parts[0]}분의 빈 시간이 없어요.`,
      });
      continue;
    }
    for (const p of result) {
      p.day.taken = union([
        ...p.day.taken,
        [p.slot[0] - buffer, p.slot[1] + buffer],
      ]);
      p.day.todoMinutes += p.slot[1] - p.slot[0];
      placements.push({
        weekTaskId: w.id,
        date: p.day.date,
        start: p.slot[0],
        duration: p.slot[1] - p.slot[0],
        part: p.index + 1,
        parts: result.length,
        afterDue: p.late,
      });
    }
  }
  return { placements, unplaced };
}

/**
 * True when every placement still sits in today-or-later free focus time of
 * the current data and the placements do not overlap each other.
 */
export function placementsStillFit(
  data: Dataset,
  placements: Placement[],
  holidays: ReadonlySet<string>,
  now = new Date().toISOString(),
): boolean {
  const zone = data.profile.timezone;
  const today = formatInTimeZone(now, zone, "yyyy-MM-dd");
  const current = localMinute(now, zone);
  const byDate = new Map<string, Placement[]>();
  for (const p of placements)
    byDate.set(p.date, [...(byDate.get(p.date) ?? []), p]);
  for (const [date, list] of byDate) {
    if (date < today) return false;
    const free = availability(data, date, holidays.has(date)).free;
    const sorted = [...list].sort((a, b) => a.start - b.start);
    for (const [i, p] of sorted.entries()) {
      const end = p.start + p.duration;
      if (date === today && p.start <= current) return false;
      if (i > 0 && p.start < sorted[i - 1].start + sorted[i - 1].duration)
        return false;
      if (!free.some(([s, e]) => p.start >= s && end <= e)) return false;
    }
  }
  return true;
}

/** Builds the time_blocks insert rows for the given placements. */
export function placementChanges(
  data: Dataset,
  placements: Placement[],
  makeId: () => string,
): Change[] {
  const zone = data.profile.timezone;
  return placements.map((p) => ({
    table: "time_blocks",
    action: "insert",
    row: {
      id: makeId(),
      kind: "task",
      week_task_id: p.weekTaskId,
      event_title: null,
      event_note: "",
      category_id: null,
      start_at: toUTC(p.date, p.start, zone),
      end_at: toUTC(p.date, p.start + p.duration, zone),
      local_date: p.date,
      state: "planned",
      completed_at: null,
    },
  }));
}
