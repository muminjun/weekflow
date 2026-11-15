import { mkdir, writeFile, rename } from "node:fs/promises";
import { parseHolidayMonth } from "../src/domain/holiday";
const key = process.env.KASI_SERVICE_KEY;
if (!key)
  throw Error(
    "KASI_SERVICE_KEY is required. No synthetic calendar is generated.",
  );
const now = new Date().getFullYear();
const years = process.argv.slice(2).length
  ? process.argv.slice(2).map(Number)
  : [now - 1, now, now + 1];
await mkdir("public/holidays", { recursive: true });
let failed = false;
for (const year of years) {
  try {
    if (!Number.isInteger(year) || year < 2000 || year > 2100)
      throw Error("INVALID_YEAR");
    const grouped = new Map<string, Set<string>>();
    for (let month = 1; month <= 12; month++) {
      const url = new URL(
        "https://apis.data.go.kr/B090041/openapi/service/SpcdeInfoService/getRestDeInfo",
      );
      url.search = new URLSearchParams({
        ServiceKey: decodeURIComponent(key),
        solYear: String(year),
        solMonth: String(month).padStart(2, "0"),
        numOfRows: "1000",
        pageNo: "1",
      }).toString();
      const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
      if (!res.ok) throw Error("HTTP_" + res.status);
      const items = parseHolidayMonth(await res.text(), year, month);
      for (const i of items) {
        if (!grouped.has(i.date)) grouped.set(i.date, new Set());
        grouped.get(i.date)!.add(i.name);
      }
    }
    if (!grouped.size) throw Error("UNPUBLISHED_YEAR");
    const data = {
      schemaVersion: 1,
      source: "KASI-SpcdeInfoService",
      year,
      fetchedAt: new Date().toISOString(),
      complete: true,
      items: [...grouped.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, names]) => ({
          date,
          names: [...names].sort(),
          isHoliday: true,
        })),
    };
    const file = `public/holidays/${year}.json`;
    await writeFile(file + ".tmp", JSON.stringify(data, null, 2));
    await rename(file + ".tmp", file);
    console.log(`${year}: verified full year, ${data.items.length} dates`);
  } catch {
    console.error(
      `${year}: update failed; previous cache retained. Check API approval and year availability.`,
    );
    failed = true;
  }
}
if (failed) process.exitCode = 1;
