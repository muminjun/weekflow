import { it, expect } from "vitest";
import { parseHolidayMonth } from "./holiday";
// Synthetic official-format fixture; never shipped as a calendar cache.
const xml =
  "<response><header><resultCode>00</resultCode></header><body><totalCount>2</totalCount><items><item><locdate>20260101</locdate><dateName>신정</dateName><isHoliday>Y</isHoliday></item><item><locdate>20260102</locdate><dateName>기념일</dateName><isHoliday>N</isHoliday></item></items></body></response>";
it("validates official XML, skips non-holidays and rejects partial/error responses", () => {
  expect(parseHolidayMonth(xml, 2026, 1)).toEqual([
    { date: "2026-01-01", name: "신정" },
  ]);
  expect(() =>
    parseHolidayMonth(xml.replace("<totalCount>2", "<totalCount>3"), 2026, 1),
  ).toThrow("INCOMPLETE_PAGE");
  expect(() => parseHolidayMonth(xml.replace(">00<", ">30<"), 2026, 1)).toThrow(
    "KASI_RESPONSE_ERROR",
  );
  expect(() => parseHolidayMonth(xml, 2026, 2)).toThrow("WRONG_MONTH");
});
