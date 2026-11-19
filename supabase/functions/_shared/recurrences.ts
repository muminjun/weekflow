import { z } from "npm:zod@4.6.7";
import { admin } from "./http.ts";
const yearSchema = z.object({
  schemaVersion: z.literal(1),
  source: z.literal("KASI-SpcdeInfoService"),
  year: z.number().int(),
  complete: z.literal(true),
  fetchedAt: z.iso.datetime(),
  items: z.array(
    z.object({
      date: z.iso.date(),
      names: z.array(z.string()),
      isHoliday: z.boolean(),
    }),
  ),
});
function localDate(zone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const get = (type: string) => parts.find((p) => p.type === type)!.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}
const addDays = (date: string, n: number) =>
  new Date(Date.parse(date + "T00:00:00Z") + n * 86400000)
    .toISOString()
    .slice(0, 10);
async function holidaysFor(
  years: number[],
  cache: Map<number, string[] | null>,
) {
  for (const year of years) {
    if (cache.has(year)) continue;
    try {
      const response = await fetch(
        `https://muminjun.github.io/weekflow/holidays/${year}.json`,
        { signal: AbortSignal.timeout(5000) },
      );
      if (!response.ok) throw Error("HOLIDAY_UNAVAILABLE");
      const data = yearSchema.parse(await response.json());
      if (data.year !== year) throw Error("YEAR_MISMATCH");
      cache.set(
        year,
        data.items.filter((i) => i.isHoliday).map((i) => i.date),
      );
    } catch {
      cache.set(year, null);
    }
  }
  return years.every((y) => cache.get(y) !== null)
    ? years.flatMap((y) => cache.get(y)!)
    : null;
}
// PostgREST caps every response at max_rows, so page through distinct owners by id.
const PAGE = 500;
export async function prepareRecurrences() {
  const db = admin();
  const cache = new Map<number, string[] | null>();
  let generated = 0,
    paused = 0,
    failed = 0,
    after: string | null = null;
  for (;;) {
    const { data, error } = await db.rpc("recurrence_users", {
      p_after: after,
      p_limit: PAGE,
    });
    if (error) throw error;
    const users = (data ?? []) as { id: string; timezone: string }[];
    for (const p of users) {
      // One bad profile (e.g. a zone Intl rejects) must not stop everyone else.
      try {
        const from = localDate(p.timezone),
          to = addDays(from, 7),
          years = [
            ...new Set([Number(from.slice(0, 4)), Number(to.slice(0, 4))]),
          ];
        const holidays = await holidaysFor(years, cache);
        const result = await db.rpc("materialize_for_user", {
          p_user: p.id,
          p_from: from,
          p_to: to,
          p_holidays: holidays,
        });
        if (result.error) throw result.error;
        generated += result.data.generated;
        paused += result.data.paused;
      } catch {
        failed++;
      }
    }
    if (users.length < PAGE) break;
    after = users[users.length - 1].id;
  }
  if (failed) console.warn("recurrence_preparation_failed", { count: failed });
  return { generated, paused, failed };
}
