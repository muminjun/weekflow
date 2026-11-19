import { useQuery } from "@tanstack/react-query";
type HolidayYear = {
  schemaVersion: 1;
  year: number;
  source: "KASI-SpcdeInfoService";
  fetchedAt: string;
  complete: boolean;
  items: { date: string; names: string[]; isHoliday: boolean }[];
};
const isoDate = /^\d{4}-\d{2}-\d{2}$/;
/**
 * Validates the published holiday file by hand; this runs on every planner
 * load, and keeping zod out of it keeps zod in the lazily loaded backup code.
 */
export function parseHolidayYear(value: unknown): HolidayYear {
  const v = value as Partial<HolidayYear> | null;
  const valid =
    !!v &&
    v.schemaVersion === 1 &&
    Number.isInteger(v.year) &&
    v.source === "KASI-SpcdeInfoService" &&
    typeof v.fetchedAt === "string" &&
    !Number.isNaN(Date.parse(v.fetchedAt)) &&
    typeof v.complete === "boolean" &&
    Array.isArray(v.items) &&
    v.items.every(
      (i) =>
        !!i &&
        typeof i.date === "string" &&
        isoDate.test(i.date) &&
        !Number.isNaN(Date.parse(i.date)) &&
        Array.isArray(i.names) &&
        i.names.every((n) => typeof n === "string") &&
        typeof i.isHoliday === "boolean",
    );
  if (!valid) throw Error("INVALID_HOLIDAY_FILE");
  return v as HolidayYear;
}
export type HolidayStatus = "loading" | "known" | "unknown";
/**
 * "loading" while the first fetch is in flight (show nothing, not "미확인"),
 * "known" once every requested year validated, "unknown" when any year failed
 * (network error, non-2xx, schema mismatch or an incomplete year).
 */
export function holidayStatus(
  data: { known: boolean } | undefined,
  isPending: boolean,
): HolidayStatus {
  if (data) return data.known ? "known" : "unknown";
  return isPending ? "loading" : "unknown";
}
export function useHolidays(years: number[]) {
  const query = useQuery({
    queryKey: ["holidays", ...years],
    queryFn: async () => {
      const results = await Promise.all(
        years.map(async (year) => {
          try {
            const res = await fetch(
              `${import.meta.env.BASE_URL}holidays/${year}.json`,
              { cache: "no-cache" },
            );
            if (!res.ok) return null;
            const value = parseHolidayYear(await res.json());
            return value.year === year && value.complete ? value : null;
          } catch {
            return null;
          }
        }),
      );
      return {
        years: results,
        known: results.every(Boolean),
        items: results.flatMap((y) => y?.items ?? []),
        fetchedAt:
          results
            .filter(Boolean)
            .map((y) => y!.fetchedAt)
            .sort()[0] ?? null,
      };
    },
    // Fetch failures resolve to known:false (they never throw), so retry an
    // unknown result after a minute instead of caching it for an hour.
    staleTime: (q) => (q.state.data?.known ? 3600000 : 60000),
  });
  const holidayState = holidayStatus(query.data, query.isPending);
  return {
    ...query,
    holidayState,
    /** First fetch in flight — do not show "공휴일 미확인" yet. */
    isHolidayLoading: holidayState === "loading",
    /** Settled and at least one year could not be verified. */
    unknown: holidayState === "unknown",
  };
}
