import { XMLParser } from "fast-xml-parser";
import { z } from "zod";
const itemSchema = z.object({
  locdate: z.string().regex(/^\d{8}$/),
  dateName: z.string().min(1).max(200),
  isHoliday: z.enum(["Y", "N"]),
});
export function parseHolidayMonth(xml: string, year: number, month: number) {
  if (xml.includes("<!DOCTYPE") || xml.length > 2000000)
    throw Error("INVALID_XML");
  const parsed = new XMLParser({
    ignoreAttributes: true,
    parseTagValue: false,
    processEntities: false,
  }).parse(xml) as {
    response?: {
      header?: { resultCode?: string };
      body?: { totalCount?: string; items?: { item?: unknown } };
    };
  };
  if (parsed.response?.header?.resultCode !== "00")
    throw Error("KASI_RESPONSE_ERROR");
  const body = parsed.response.body;
  if (!body || !/^\d+$/.test(body.totalCount ?? ""))
    throw Error("INVALID_COUNT");
  const raw = body.items?.item;
  const items = z
    .array(itemSchema)
    .parse(!raw ? [] : Array.isArray(raw) ? raw : [raw]);
  if (items.length !== Number(body.totalCount)) throw Error("INCOMPLETE_PAGE");
  const prefix = `${year}${String(month).padStart(2, "0")}`;
  for (const i of items) {
    if (!i.locdate.startsWith(prefix)) throw Error("WRONG_MONTH");
    const date = `${i.locdate.slice(0, 4)}-${i.locdate.slice(4, 6)}-${i.locdate.slice(6)}`;
    if (
      Number.isNaN(Date.parse(date)) ||
      new Date(date).toISOString().slice(0, 10) !== date
    )
      throw Error("INVALID_DATE");
  }
  return items
    .filter((i) => i.isHoliday === "Y")
    .map((i) => ({
      date: `${i.locdate.slice(0, 4)}-${i.locdate.slice(4, 6)}-${i.locdate.slice(6)}`,
      name: i.dateName,
    }));
}
