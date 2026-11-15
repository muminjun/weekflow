import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
const schema = z.object({
  schemaVersion: z.literal(1),
  year: z.number().int(),
  source: z.literal("KASI-SpcdeInfoService"),
  fetchedAt: z.iso.datetime(),
  complete: z.boolean(),
  items: z.array(
    z.object({
      date: z.iso.date(),
      names: z.array(z.string()),
      isHoliday: z.boolean(),
    }),
  ),
});
export function useHolidays(years: number[]) {
  return useQuery({
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
            const value = schema.parse(await res.json());
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
    staleTime: 3600000,
  });
}
