import { addDays as plusDays, format, parseISO, startOfWeek } from "date-fns";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
export type Interval = [number, number];
export const addDays = (date: string, n: number) =>
  format(plusDays(parseISO(date), n), "yyyy-MM-dd");
export const weekOf = (date: string) =>
  format(startOfWeek(parseISO(date), { weekStartsOn: 1 }), "yyyy-MM-dd");
export const today = (zone = "Asia/Seoul") =>
  formatInTimeZone(new Date(), zone, "yyyy-MM-dd");
export const snap = (n: number) =>
  Math.max(0, Math.min(1440, Math.round(n / 15) * 15));
export const timeLabel = (n: number) =>
  `${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;
export const toUTC = (date: string, minute: number, zone: string) =>
  fromZonedTime(
    `${addDays(date, Math.floor(minute / 1440))}T${timeLabel(minute % 1440)}:00`,
    zone,
  ).toISOString();
export const localMinute = (iso: string, zone: string) =>
  Number(formatInTimeZone(iso, zone, "H")) * 60 +
  Number(formatInTimeZone(iso, zone, "m"));
export function union(windows: Interval[]): Interval[] {
  const result: Interval[] = [];
  for (const [a, b] of windows
    .filter(([s, e]) => e > s)
    .sort((a, b) => a[0] - b[0])) {
    const last = result.at(-1);
    if (last && a <= last[1]) last[1] = Math.max(last[1], b);
    else result.push([a, b]);
  }
  return result;
}
export function subtract(base: Interval[], removed: Interval[]): Interval[] {
  let out = union(base);
  for (const [a, b] of union(removed))
    out = out.flatMap(([s, e]): Interval[] =>
      b <= s || a >= e
        ? [[s, e]]
        : [
            ...(a > s ? [[s, a] as Interval] : []),
            ...(b < e ? [[b, e] as Interval] : []),
          ],
    );
  return out;
}
export const minutes = (windows: Interval[]) =>
  union(windows).reduce((sum, [a, b]) => sum + b - a, 0);
export type DayStatus = "empty" | "planned" | "partial" | "done";
export function dayStatus(
  states: string[],
  manual?: "planned" | "done",
): DayStatus {
  if (manual) return manual;
  const active = states.filter((s) => s !== "skipped");
  if (!active.length) return "empty";
  const done = active.filter((s) => s === "done").length;
  return done === active.length ? "done" : done ? "partial" : "planned";
}
export const csvCell = (value: unknown) => {
  let s = String(value ?? "");
  if (/^[\s]*[=+\-@]/.test(s)) s = "'" + s;
  return '"' + s.replaceAll('"', '""') + '"';
};
export function occurrenceDates(
  rule: {
    starts_on: string;
    ends_on?: string | null;
    weekdays: number[];
    skip_public_holidays: boolean;
  },
  from: string,
  to: string,
  holidays: Set<string> | null,
): string[] {
  if (to < from || to > addDays(from, 30)) throw Error("RANGE_LIMIT");
  if (rule.skip_public_holidays && !holidays)
    throw Error("HOLIDAY_DATA_UNKNOWN");
  const dates = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const dow = ((parseISO(d).getDay() + 6) % 7) + 1;
    if (
      d >= rule.starts_on &&
      (!rule.ends_on || d <= rule.ends_on) &&
      rule.weekdays.includes(dow) &&
      !(rule.skip_public_holidays && holidays?.has(d))
    )
      dates.push(d);
  }
  return dates;
}
export function overlapLanes(
  items: { id: string; start: number; end: number }[],
): Map<string, { lane: number; count: number }> {
  const out = new Map<string, { lane: number; count: number }>();
  const sorted = [...items].sort((a, b) => a.start - b.start || a.end - b.end);
  let group: typeof items = [];
  let edge = -1;
  const finish = () => {
    const ends: number[] = [];
    const assigned = group.map((item) => {
      let lane = ends.findIndex((end) => end <= item.start);
      if (lane < 0) lane = ends.length;
      ends[lane] = item.end;
      return { id: item.id, lane };
    });
    for (const a of assigned)
      out.set(a.id, { lane: a.lane, count: ends.length });
  };
  for (const item of sorted) {
    if (item.start >= edge && group.length) {
      finish();
      group = [];
      edge = -1;
    }
    group.push(item);
    edge = Math.max(edge, item.end);
  }
  if (group.length) finish();
  return out;
}
