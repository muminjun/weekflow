import { addDays, dayLabel, timeLabel, toUTC, today, weekOf } from "./planner";
import type { Change, Dataset } from "./types";

export interface QuickAdd {
  title: string;
  /** Local date of a block to create, when a time was given. */
  date?: string;
  start?: number;
  duration?: number;
  due?: string;
  categoryId?: string;
  /** Human-readable pieces that were understood, for preview chips. */
  chips: string[];
}

const weekdays = "월화수목금토일";
const relative: Record<string, number> = { 오늘: 0, 내일: 1, 모레: 2, 글피: 3 };

/** Monday-based weekday index (0 = 월) of a yyyy-MM-dd date. */
const weekdayOf = (date: string) =>
  (new Date(date + "T12:00:00Z").getUTCDay() + 6) % 7;

function resolveDate(token: string, todayDate: string): string | undefined {
  if (token in relative) return addDays(todayDate, relative[token]);
  const md = /^(\d{1,2})(?:\/|월\s*)(\d{1,2})일?$/.exec(token);
  if (md) {
    const year = Number(todayDate.slice(0, 4));
    const pad = (n: string) => n.padStart(2, "0");
    let date = `${year}-${pad(md[1])}-${pad(md[2])}`;
    // "1/5" typed in December means next January.
    if (date < addDays(todayDate, -60)) date = `${year + 1}${date.slice(4)}`;
    return Number.isNaN(Date.parse(date)) ? undefined : date;
  }
  const wd = /^(이번\s*주|다음\s*주|담주)?\s*([월화수목금토일])(?:요일)?$/.exec(
    token,
  );
  if (wd) {
    const target = weekdays.indexOf(wd[2]);
    const base = weekOf(todayDate);
    if (wd[1] && /다음|담/.test(wd[1])) return addDays(base, 7 + target);
    if (wd[1]) return addDays(base, target);
    // A bare weekday means the next one, including today.
    const offset = (target - weekdayOf(todayDate) + 7) % 7;
    return addDays(todayDate, offset);
  }
  return undefined;
}

const datePattern =
  "(?:오늘|내일|모레|글피|\\d{1,2}\\/\\d{1,2}|\\d{1,2}월\\s*\\d{1,2}일|(?:(?:이번|다음|담)\\s*주\\s*)?[월화수목금토일]요일|(?:(?:이번|다음|담)\\s*주\\s*)[월화수목금토일])";
const meridiem = "(오전|오후|아침|낮|저녁|밤|새벽)?\\s*";
const clock = `${meridiem}(\\d{1,2})(?::(\\d{2})|시(?:\\s*(반|\\d{1,2}분))?)`;

function toMinute(
  period: string | undefined,
  hourText: string,
  minuteText: string | undefined,
  colon: boolean,
): number | undefined {
  let hour = Number(hourText);
  const minute =
    minuteText === "반" ? 30 : minuteText ? parseInt(minuteText, 10) : 0;
  if (hour > 24 || minute > 59) return undefined;
  if (period && /오후|저녁|밤/.test(period) && hour < 12) hour += 12;
  else if (period && /오전|아침|새벽/.test(period) && hour === 12) hour = 0;
  else if (!period && !colon && hour >= 1 && hour <= 6) hour += 12; // "3시" → 15:00
  return hour * 60 + minute;
}

const snap15 = (n: number) => Math.round(n / 15) * 15;
/** Durations round up so a block is never shorter than asked. */
const ceil15 = (n: number) => Math.ceil(n / 15) * 15;

/**
 * Reads a Korean quick-add line such as "내일 3시 회의 1시간 #업무" or
 * "금까지 보고서". Pure: the caller decides what to save.
 */
export function parseQuickAdd(
  input: string,
  options: {
    today: string;
    categories?: { id: string; name: string; archived_at?: string | null }[];
  },
): QuickAdd {
  let text = ` ${input.trim()} `;
  const chips: string[] = [];
  const result: QuickAdd = { title: "", chips };
  const take = (pattern: RegExp, accept: (m: RegExpExecArray) => boolean) => {
    const m = pattern.exec(text);
    if (m && accept(m)) text = text.replace(m[0], " ");
  };

  take(/\s#(\S+)/, (m) => {
    const name = m[1].toLocaleLowerCase();
    const category = options.categories
      ?.filter((c) => !c.archived_at)
      .find((c) => c.name.toLocaleLowerCase().startsWith(name));
    if (!category) return false;
    result.categoryId = category.id;
    chips.push(`#${category.name}`);
    return true;
  });

  take(
    new RegExp(`\\s(${datePattern}|[월화수목금토일])\\s*까지(?=\\s)`),
    (m) => {
      const due = resolveDate(m[1].replace(/\s+/g, " ").trim(), options.today);
      if (!due) return false;
      result.due = due;
      chips.push(`${dayLabel(due)}까지`);
      return true;
    },
  );

  take(new RegExp(`\\s(${datePattern})(?=\\s)`), (m) => {
    const date = resolveDate(m[1].replace(/\s+/g, " ").trim(), options.today);
    if (!date) return false;
    result.date = date;
    return true;
  });

  take(new RegExp(`\\s${clock}\\s*[-~–]\\s*${clock}(?=\\s)`), (m) => {
    const start = toMinute(m[1], m[2], m[3] ?? m[4], !!m[3]);
    let end = toMinute(m[5] ?? m[1], m[6], m[7] ?? m[8], !!m[7]);
    if (start === undefined || end === undefined) return false;
    if (end <= start && end + 720 > start) end += 720; // "3시-5시" after noon
    if (end <= start) return false;
    result.start = snap15(start);
    result.duration = Math.max(15, ceil15(end - result.start));
    return true;
  });

  if (result.start === undefined)
    take(new RegExp(`\\s${clock}(?=\\s)`), (m) => {
      const start = toMinute(m[1], m[2], m[3] ?? m[4], !!m[3]);
      if (start === undefined || start >= 1440) return false;
      result.start = snap15(start);
      return true;
    });

  if (result.duration === undefined)
    take(
      /\s(?:(\d+(?:\.\d+)?)\s*(?:시간|h)(?:\s*(\d{1,2})\s*분)?|(\d{1,3})\s*(?:분|m))(?=\s)/i,
      (m) => {
        const minutes = m[3]
          ? Number(m[3])
          : Number(m[1]) * 60 + Number(m[2] ?? 0);
        if (!minutes || minutes > 24 * 60) return false;
        result.duration = Math.max(15, ceil15(minutes));
        return true;
      },
    );

  if (result.start !== undefined) {
    result.date ??= options.today;
    result.duration ??= 60;
    if (result.start + result.duration > 1440)
      result.duration = 1440 - result.start;
    chips.unshift(
      `${dayLabel(result.date)} ${timeLabel(result.start)}–${timeLabel(result.start + result.duration)}`,
    );
  } else if (result.date) {
    // A date without a time is a deadline-free Todo for that week.
    chips.unshift(dayLabel(result.date));
  } else if (result.duration !== undefined) chips.push(`${result.duration}분`);

  result.title = text.replace(/\s+/g, " ").trim();
  return result;
}

/**
 * The rows a quick-add line creates: a Todo, its week link and, when a time
 * was given, a placed block — one batch, so one undo removes all of it.
 */
export function quickAddChanges(
  raw: string,
  data: Dataset,
  week: string,
  newId: () => string,
) {
  const zone = data.profile.timezone;
  const now = today(zone);
  // Relative words read from today while it is on screen, else the shown week.
  const base = now >= week && now < addDays(week, 7) ? now : week;
  const q = parseQuickAdd(raw, { today: base, categories: data.categories });
  const title = q.title || raw.trim();
  const taskId = newId(),
    weekTaskId = newId();
  const target = q.date ? weekOf(q.date) : week;
  const changes: Change[] = [
    {
      table: "tasks",
      action: "insert",
      row: {
        id: taskId,
        title,
        description: "",
        state: "open",
        category_id:
          q.categoryId ??
          data.categories.find((c) => !c.archived_at)?.id ??
          null,
        estimate_minutes: q.duration ?? 60,
        due_on: q.due ?? null,
        completed_at: null,
      },
    },
    {
      table: "week_tasks",
      action: "insert",
      row: {
        id: weekTaskId,
        task_id: taskId,
        week_start: target,
        state: "open",
        sort_order: data.week_tasks.filter((w) => w.week_start === target)
          .length,
        completed_at: null,
      },
    },
  ];
  if (q.date && q.start !== undefined && q.duration)
    changes.push({
      table: "time_blocks",
      action: "insert",
      row: {
        id: newId(),
        kind: "task",
        week_task_id: weekTaskId,
        event_title: null,
        event_note: "",
        category_id: null,
        start_at: toUTC(q.date, q.start, zone),
        end_at: toUTC(q.date, q.start + q.duration, zone),
        local_date: q.date,
        state: "planned",
        completed_at: null,
      },
    });
  return { changes, title, chips: q.chips, week: target, parsed: q };
}
/** Same reading as quickAddChanges, for a live preview while typing. */
export function previewQuickAdd(raw: string, data: Dataset, week: string) {
  const now = today(data.profile.timezone);
  const base = now >= week && now < addDays(week, 7) ? now : week;
  return parseQuickAdd(raw, { today: base, categories: data.categories });
}
