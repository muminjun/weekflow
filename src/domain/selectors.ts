import type { Block, Dataset, Stats } from "./types";
import {
  addDays,
  localMinute,
  minutes,
  subtract,
  toUTC,
  type Interval,
} from "./planner";
export function blockSlice(
  b: Block,
  date: string,
  zone: string,
): Interval | null {
  const s = toUTC(date, 0, zone),
    e = toUTC(date, 1440, zone);
  if (b.start_at >= e || b.end_at <= s) return null;
  return [
    b.start_at < s ? 0 : localMinute(b.start_at, zone),
    b.end_at >= e ? 1440 : localMinute(b.end_at, zone),
  ];
}
export function availability(data: Dataset, date: string, holiday: boolean) {
  const dow = ((new Date(date + "T12:00:00").getDay() + 6) % 7) + 1;
  const override = data.availability_overrides.find(
    (x) => x.local_date === date,
  );
  const base: Interval[] = override
    ? override.mode === "closed"
      ? []
      : override.windows.map((w) => [w.startMinute, w.endMinute])
    : holiday
      ? []
      : data.availability_rules
          .filter((r) => r.weekday === dow)
          .map((r) => [r.start_minute, r.end_minute]);
  const blocks = data.time_blocks
    .filter((b) => b.state !== "skipped")
    .map((b) => ({ b, i: blockSlice(b, date, data.profile.timezone) }))
    .filter((x): x is { b: Block; i: Interval } => !!x.i);
  const focus = subtract(
    base,
    blocks.filter((x) => x.b.kind === "event").map((x) => x.i),
  );
  const free = subtract(
    focus,
    blocks.filter((x) => x.b.kind === "task").map((x) => x.i),
  );
  return {
    base,
    focus,
    free,
    focusMinutes: minutes(focus),
    freeMinutes: minutes(free),
  };
}
export function stats(data: Dataset, week: string): Stats {
  const wt = data.week_tasks.filter((w) => w.week_start === week);
  const weekStart = toUTC(week, 0, data.profile.timezone),
    weekEnd = toUTC(addDays(week, 7), 0, data.profile.timezone);
  const blocks = data.time_blocks.filter(
    (b) =>
      b.start_at < weekEnd && b.end_at > weekStart && b.state !== "skipped",
  );
  const length = (b: Block) =>
    (Math.min(Date.parse(b.end_at), Date.parse(weekEnd)) -
      Math.max(Date.parse(b.start_at), Date.parse(weekStart))) /
    60000;
  return {
    done: wt.filter((w) => w.state === "done").length,
    total: wt.length,
    eventMinutes: blocks
      .filter((b) => b.kind === "event")
      .reduce((n, b) => n + length(b), 0),
    plannedMinutes: blocks
      .filter((b) => b.kind === "task")
      .reduce((n, b) => n + length(b), 0),
    doneMinutes: blocks
      .filter((b) => b.kind === "task" && b.state === "done")
      .reduce((n, b) => n + length(b), 0),
    carried: wt.filter((w) => w.state === "carried").length,
  };
}
export const titleOf = (data: Dataset, b: Block) =>
  b.kind === "event"
    ? (b.event_title ?? "일정")
    : (data.tasks.find(
        (t) =>
          t.id ===
          data.week_tasks.find((w) => w.id === b.week_task_id)?.task_id,
      )?.title ?? "연결된 작업");
export const colorOf = (data: Dataset, b: Block) =>
  data.categories.find(
    (c) =>
      c.id ===
      (b.kind === "event"
        ? b.category_id
        : data.tasks.find(
            (t) =>
              t.id ===
              data.week_tasks.find((w) => w.id === b.week_task_id)?.task_id,
          )?.category_id),
  )?.color ?? "#DFE0DC";
