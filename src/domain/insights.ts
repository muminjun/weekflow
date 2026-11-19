import { formatInTimeZone } from "date-fns-tz";
import type { Block, Dataset } from "./types";
import { addDays, toUTC } from "./planner";
import { blockSlice, stats } from "./selectors";
import { measuredMinutes } from "./focus";

export interface CategoryMinutes {
  /** Category id, `null` for uncategorised, `"other"` for the merged rest. */
  id: string | null;
  name: string;
  color: string;
  planned: number;
  done: number;
}
export interface WeekdayRatio {
  date: string;
  label: string;
  planned: number;
  done: number;
  /** done / planned, or null when nothing was planned that day. */
  ratio: number | null;
  /** The day has started (today or earlier). */
  elapsed: boolean;
  /** The day has ended, so its ratio is final enough to coach on. */
  over: boolean;
}
export interface EstimateSample {
  taskId: string;
  title: string;
  estimate: number;
  placed: number;
  /** placed / estimate */
  ratio: number;
}
export interface CarryOver {
  taskId: string;
  title: string;
  count: number;
}
export interface TrendPoint {
  week: string;
  done: number;
  total: number;
  rate: number;
  live: boolean;
}
/** Focus timer runs inside the week — measured, unlike planned/done minutes. */
export interface FocusSummary {
  minutes: number;
  sessions: number;
}
export interface WeekInsights {
  categories: CategoryMinutes[];
  weekdays: WeekdayRatio[];
  estimate: { samples: EstimateSample[]; medianDeviation: number | null };
  carryOvers: CarryOver[];
  trend: TrendPoint[];
  focus: FocusSummary;
  messages: string[];
}

const WEEKDAYS = ["월", "화", "수", "목", "금", "토", "일"];
const UNCATEGORISED = "#DFE0DC";
/** Minimum number of data points before a sentence is worth saying. */
const MIN_SAMPLES = 2;

export const median = (values: number[]) => {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b),
    m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
/** 을/를 after a word, by whether its last Hangul syllable has a final consonant. */
export const objectParticle = (word: string) => {
  const code = word.trim().charCodeAt(word.trim().length - 1) - 0xac00;
  if (code < 0 || code > 11171) return "을(를)";
  return code % 28 ? "을" : "를";
};
const pct = (n: number) => Math.round(n * 100);
const hours = (m: number) => Math.round((m / 60) * 10) / 10;

/** Lookups shared by the calculations below. */
function index(data: Dataset) {
  const tasks = new Map(data.tasks.map((t) => [t.id, t]));
  const weekTasks = new Map(data.week_tasks.map((w) => [w.id, w]));
  const taskOf = (b: Block) =>
    b.kind === "task" && b.week_task_id
      ? tasks.get(weekTasks.get(b.week_task_id)?.task_id ?? "")
      : undefined;
  return { tasks, taskOf };
}

/** Minutes of a block inside each day of the week, keyed by date. */
function dailyMinutes(b: Block, week: string, zone: string) {
  const out: [string, number][] = [];
  for (let i = 0; i < 7; i++) {
    const date = addDays(week, i),
      s = blockSlice(b, date, zone);
    if (s && s[1] > s[0]) out.push([date, s[1] - s[0]]);
  }
  return out;
}

function weekBlocks(data: Dataset, week: string) {
  const zone = data.profile.timezone,
    start = toUTC(week, 0, zone),
    end = toUTC(addDays(week, 7), 0, zone);
  return data.time_blocks
    .filter(
      (b) => b.state !== "skipped" && b.start_at < end && b.end_at > start,
    )
    .map((b) => {
      const days = dailyMinutes(b, week, zone);
      return { b, days, minutes: days.reduce((n, [, m]) => n + m, 0) };
    });
}

export function categoryMinutes(
  data: Dataset,
  week: string,
  limit = 5,
): CategoryMinutes[] {
  const { taskOf } = index(data);
  const byId = new Map<string | null, CategoryMinutes>();
  for (const { b, minutes } of weekBlocks(data, week)) {
    const id =
      (b.kind === "task" ? taskOf(b)?.category_id : b.category_id) ?? null;
    let row = byId.get(id);
    if (!row) {
      const c = id ? data.categories.find((x) => x.id === id) : undefined;
      row = {
        id: c ? id : null,
        name: c?.name ?? "미분류",
        color: c?.color ?? UNCATEGORISED,
        planned: 0,
        done: 0,
      };
      byId.set(id, row);
    }
    row.planned += minutes;
    if (b.state === "done") row.done += minutes;
  }
  // A deleted category and "no category" read the same to the user.
  const merged = new Map<string | null, CategoryMinutes>();
  for (const r of byId.values()) {
    const m = merged.get(r.id);
    if (m) {
      m.planned += r.planned;
      m.done += r.done;
    } else merged.set(r.id, { ...r });
  }
  const rows = [...merged.values()]
    .filter((r) => r.planned > 0)
    .sort((a, b) => b.planned - a.planned || a.name.localeCompare(b.name));
  if (rows.length <= limit + 1) return rows;
  const rest = rows.slice(limit);
  return [
    ...rows.slice(0, limit),
    {
      id: "other",
      name: "기타",
      color: UNCATEGORISED,
      planned: rest.reduce((n, r) => n + r.planned, 0),
      done: rest.reduce((n, r) => n + r.done, 0),
    },
  ];
}

export function weekdayRatios(
  data: Dataset,
  week: string,
  now = new Date(),
): WeekdayRatio[] {
  const today = formatInTimeZone(now, data.profile.timezone, "yyyy-MM-dd");
  const rows: WeekdayRatio[] = WEEKDAYS.map((label, i) => {
    const date = addDays(week, i);
    return {
      date,
      label,
      planned: 0,
      done: 0,
      ratio: null,
      elapsed: date <= today,
      over: date < today,
    };
  });
  for (const { b, days } of weekBlocks(data, week)) {
    if (b.kind !== "task") continue;
    for (const [date, m] of days) {
      const row = rows.find((r) => r.date === date)!;
      row.planned += m;
      if (b.state === "done") row.done += m;
    }
  }
  for (const r of rows) r.ratio = r.planned ? r.done / r.planned : null;
  return rows;
}

export function estimateAccuracy(data: Dataset, week: string) {
  const { taskOf } = index(data);
  const placed = new Map<string, number>();
  for (const { b, minutes } of weekBlocks(data, week)) {
    const t = taskOf(b);
    if (t?.estimate_minutes && t.estimate_minutes > 0)
      placed.set(t.id, (placed.get(t.id) ?? 0) + minutes);
  }
  const samples: EstimateSample[] = [...placed].map(([id, m]) => {
    const t = data.tasks.find((x) => x.id === id)!;
    return {
      taskId: id,
      title: t.title,
      estimate: t.estimate_minutes!,
      placed: m,
      ratio: m / t.estimate_minutes!,
    };
  });
  samples.sort((a, b) => Math.abs(b.ratio - 1) - Math.abs(a.ratio - 1));
  return {
    samples,
    medianDeviation: median(samples.map((s) => s.ratio - 1)),
  };
}

/** Open tasks that were carried over two or more times, worst first. */
export function chronicCarryOvers(data: Dataset, min = 2): CarryOver[] {
  const counts = new Map<string, Set<string>>();
  for (const w of data.week_tasks)
    if (w.state === "carried")
      counts.set(
        w.task_id,
        (counts.get(w.task_id) ?? new Set()).add(w.week_start),
      );
  const { tasks } = index(data);
  return [...counts]
    .map(([taskId, weeks]) => ({
      taskId,
      title: tasks.get(taskId)?.title ?? "",
      count: weeks.size,
      open: tasks.get(taskId)?.state === "open",
    }))
    .filter((c) => c.open && c.title && c.count >= min)
    .sort((a, b) => b.count - a.count || a.title.localeCompare(b.title))
    .map(({ taskId, title, count }) => ({ taskId, title, count }));
}

/** Up to `weeks` finalized weeks before `week`, plus `week` itself live. */
export function completionTrend(
  data: Dataset,
  week: string,
  weeks = 8,
): TrendPoint[] {
  const past = data.week_reviews
    .filter((r) => r.week_start < week && r.stats_snapshot?.total)
    .sort((a, b) => a.week_start.localeCompare(b.week_start))
    .slice(-weeks)
    .map((r) => {
      const { done, total } = r.stats_snapshot!;
      return {
        week: r.week_start,
        done,
        total,
        rate: done / total,
        live: false,
      };
    });
  const s = stats(data, week);
  return s.total
    ? [
        ...past,
        {
          week,
          done: s.done,
          total: s.total,
          rate: s.done / s.total,
          live: true,
        },
      ]
    : past;
}

/** Measured minutes of the week's focus sessions, clipped to the week. */
export function focusSummary(
  data: Dataset,
  week: string,
  now = new Date(),
): FocusSummary {
  const zone = data.profile.timezone,
    from = toUTC(week, 0, zone),
    to = toUTC(addDays(week, 7), 0, zone),
    t = now.getTime();
  const sessions = (data.block_sessions ?? []).filter(
    (x) => measuredMinutes([x], from, to, t) > 0,
  );
  return {
    minutes: measuredMinutes(sessions, from, to, t),
    sessions: sessions.length,
  };
}

/**
 * Rule-based coaching lines. Each rule only speaks when it has enough data;
 * saying nothing is better than saying something misleading.
 */
export function insightMessages(
  i: Omit<WeekInsights, "messages" | "focus"> & { focus?: FocusSummary },
  weekOver: boolean,
  max = 3,
): string[] {
  const out: string[] = [];
  const c = i.carryOvers[0];
  if (c)
    out.push(
      `‘${c.title}’${objectParticle(c.title)} ${c.count}번 이월했어요 — 쪼개거나 마감을 정해 보세요.`,
    );
  const f = i.focus;
  if (f && f.sessions >= MIN_SAMPLES) {
    const done = i.weekdays.reduce((n, d) => n + d.done, 0);
    out.push(
      `타이머로 잰 실측 집중은 ${hours(f.minutes)}시간(${f.sessions}회)이에요` +
        (done >= 60
          ? ` — 완료한 계획 시간 ${hours(done)}시간의 ${pct(f.minutes / done)}%예요.`
          : "."),
    );
  }
  const dev = i.estimate.medianDeviation;
  if (i.estimate.samples.length >= MIN_SAMPLES && dev !== null) {
    if (dev >= 0.15)
      out.push(`예상 시간보다 보통 ${pct(dev)}% 더 길게 계획했어요.`);
    else if (dev <= -0.15)
      out.push(
        `예상 시간보다 보통 ${pct(-dev)}% 짧게 계획했어요 — 시간이 충분한지 확인해 보세요.`,
      );
  }
  // Only finished days with at least an hour planned count.
  const days = i.weekdays.filter(
    (d) => d.over && d.ratio !== null && d.planned >= 60,
  );
  if (days.length >= MIN_SAMPLES) {
    const low = days.reduce((a, b) => (b.ratio! < a.ratio! ? b : a));
    const high = days.reduce((a, b) => (b.ratio! > a.ratio! ? b : a));
    if (high.ratio! - low.ratio! >= 0.2)
      out.push(`${low.label}요일 완료율이 가장 낮아요(${pct(low.ratio!)}%).`);
  }
  // A week still in progress would always look worse than finished weeks.
  const past = i.trend.filter((p) => !p.live),
    now = i.trend.find((p) => p.live);
  if (weekOver && now && past.length >= MIN_SAMPLES) {
    const avg = past.reduce((n, p) => n + p.rate, 0) / past.length,
      diff = pct(now.rate) - pct(avg);
    if (Math.abs(diff) >= 10)
      out.push(
        `이번 주 완료율 ${pct(now.rate)}%는 지난 ${past.length}주 평균보다 ${Math.abs(diff)}%p ${diff > 0 ? "높아요" : "낮아요"}.`,
      );
  }
  const total = i.categories.reduce((n, r) => n + r.planned, 0),
    top = i.categories[0];
  if (
    top &&
    top.id !== "other" &&
    i.categories.length >= MIN_SAMPLES &&
    total >= 120
  )
    out.push(
      `‘${top.name}’에 전체 계획 시간의 ${pct(top.planned / total)}%(${hours(top.planned)}시간)를 썼어요.`,
    );
  return out.slice(0, max);
}

export function weekInsights(
  data: Dataset,
  week: string,
  now = new Date(),
): WeekInsights {
  const base = {
    categories: categoryMinutes(data, week),
    weekdays: weekdayRatios(data, week, now),
    estimate: estimateAccuracy(data, week),
    carryOvers: chronicCarryOvers(data),
    trend: completionTrend(data, week),
    focus: focusSummary(data, week, now),
  };
  const weekOver =
    now.getTime() >=
    Date.parse(toUTC(addDays(week, 7), 0, data.profile.timezone));
  return { ...base, messages: insightMessages(base, weekOver) };
}
