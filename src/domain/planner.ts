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
// Time-zone conversions dominate timeline renders (blocks × days × pointer
// moves), and both functions are pure, so results are memoized in a bounded map.
function memo<T>(compute: (key: string) => T) {
  const cache = new Map<string, T>();
  return (key: string) => {
    let value = cache.get(key);
    if (value === undefined) {
      if (cache.size > 20000) cache.clear();
      cache.set(key, (value = compute(key)));
    }
    return value;
  };
}
const utcOf = memo((key) => {
  const [date, minute, zone] = key.split("|");
  const m = Number(minute);
  return fromZonedTime(
    `${addDays(date, Math.floor(m / 1440))}T${timeLabel(m % 1440)}:00`,
    zone,
  ).toISOString();
});
const minuteOf = memo((key) => {
  const [iso, zone] = key.split("|");
  return (
    Number(formatInTimeZone(iso, zone, "H")) * 60 +
    Number(formatInTimeZone(iso, zone, "m"))
  );
});
export const toUTC = (date: string, minute: number, zone: string) =>
  utcOf(`${date}|${minute}|${zone}`);
export const localMinute = (iso: string, zone: string) =>
  minuteOf(`${iso}|${zone}`);
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
const clockMinute = (text: string) => {
  const t = text
    .trim()
    .replace(/시\s*(\d{1,2})\s*분?$/, ":$1")
    .replace(/시$/, "");
  const m = /^(\d{1,2})(?::(\d{2}))?$/.exec(t) ?? /^(\d{1,2})(\d{2})$/.exec(t);
  if (!m) return NaN;
  const h = Number(m[1]),
    min = Number(m[2] ?? 0);
  return min < 60 && h <= 24 ? h * 60 + min : NaN;
};
/**
 * Parses "09:00-12:00, 13:00-18:00". Also accepts "9-12", "0900~1200",
 * "9시-12시 30분"; an empty value, "휴무" or "없음" means no windows.
 */
export function parseWindows(text: string): Interval[] {
  const value = text.trim();
  if (!value || /^(휴무|없음|쉼|-)$/.test(value)) return [];
  const windows = value
    .split(/[,，、]/)
    .filter((part) => part.trim())
    .map((part): Interval => {
      const [a, b, extra] = part.split(/\s*[-~–]\s*/);
      const start = clockMinute(a ?? ""),
        end = b === undefined ? NaN : clockMinute(b);
      if (
        extra !== undefined ||
        !Number.isFinite(start) ||
        !Number.isFinite(end) ||
        end > 1440 ||
        start >= end
      )
        throw Error(
          `‘${part.trim()}’을 이해하지 못했어요. 09:00-12:00처럼 시작과 끝을 적거나, 비워 두면 휴무예요.`,
        );
      return [start, end];
    });
  const sorted = [...windows].sort((x, y) => x[0] - y[0]);
  for (let i = 1; i < sorted.length; i++)
    if (sorted[i][0] < sorted[i - 1][1])
      throw Error("겹치는 구간이 있어요. 구간이 서로 겹치지 않게 적어 주세요.");
  return sorted;
}
/** "11월 16일(월)" for a yyyy-MM-dd date, without loading a date-fns locale. */
export const dayLabel = (date: string) =>
  `${Number(date.slice(5, 7))}월 ${Number(date.slice(8, 10))}일(${"일월화수목금토"[new Date(date + "T12:00:00Z").getUTCDay()]})`;
