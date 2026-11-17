import type { Dataset } from "./types";
import { availability } from "./selectors";
import { localMinute } from "./planner";
import { formatInTimeZone } from "date-fns-tz";
export interface SuggestedSlot {
  date: string;
  start: number;
  end: number;
}
/** Deterministic availability suggestions. Never writes or assumes unconfirmed holidays. */
export function suggestSlots(
  data: Dataset,
  days: string[],
  duration: number,
  holidays: ReadonlySet<string>,
  now = new Date().toISOString(),
): SuggestedSlot[] {
  const length = Math.max(15, Math.ceil(duration / 15) * 15);
  const today = formatInTimeZone(now, data.profile.timezone, "yyyy-MM-dd");
  const current = localMinute(now, data.profile.timezone);
  const result: SuggestedSlot[] = [];
  for (const date of days) {
    if (date < today) continue;
    for (const [from, to] of availability(data, date, holidays.has(date))
      .free) {
      const start =
        Math.ceil(Math.max(from, date === today ? current + 1 : 0) / 15) * 15;
      if (start + length <= to) {
        result.push({ date, start, end: start + length });
        break;
      }
    }
  }
  return result.slice(0, 7);
}
