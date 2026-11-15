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
export async function prepareRecurrences() {
  const db = admin();
  const { data: rules, error } = await db
    .from("recurrence_rules")
    .select("user_id")
    .eq("is_active", true)
    .limit(1000);
  if (error) throw error;
  const users = [...new Set((rules ?? []).map((r) => r.user_id))];
  if (!users.length) return { generated: 0, paused: 0 };
  const { data: profiles, error: profileError } = await db
    .from("profiles")
    .select("id,timezone")
    .in("id", users);
  if (profileError) throw profileError;
  const cache = new Map<number, string[] | null>();
  let generated = 0,
    paused = 0,
    failed = 0;
  for (const p of profiles ?? []) {
    const from = localDate(p.timezone),
      to = addDays(from, 7),
      years = [...new Set([Number(from.slice(0, 4)), Number(to.slice(0, 4))])];
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
    const holidays = years.every((y) => cache.get(y) !== null)
      ? years.flatMap((y) => cache.get(y)!)
      : null;
    const result = await db.rpc("materialize_for_user", {
      p_user: p.id,
      p_from: from,
      p_to: to,
      p_holidays: holidays,
    });
    if (result.error) {
      failed++;
      continue;
    }
    generated += result.data.generated;
    paused += result.data.paused;
  }
  if (failed) console.warn("recurrence_preparation_failed", { count: failed });
  return { generated, paused, failed };
}
