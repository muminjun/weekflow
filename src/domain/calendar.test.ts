import { expect, it } from "vitest";
import { calendarFile } from "./calendar";
it("exports exact midnight-crossing UTC times, stable UID and escaped user text", () => {
  const file = calendarFile({
    id: "block-1",
    title: "회의, 준비;\nBEGIN:VEVENT",
    note: "한글 메모 ".repeat(30),
    start: "2026-11-17T14:45:00Z",
    end: "2026-11-17T15:15:00Z",
  });
  expect(file).toContain("DTSTART:20261117T144500Z\r\nDTEND:20261117T151500Z");
  expect(file).toContain("UID:block-1@weekflow");
  expect(file).toContain("SUMMARY:회의\\, 준비\\;\\nBEGIN:VEVENT");
  expect(file.match(/\r\nBEGIN:VEVENT\r\n/g)).toHaveLength(1);
  for (const line of file.split("\r\n"))
    expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
  expect(file).toContain("END:VCALENDAR\r\n");
});
