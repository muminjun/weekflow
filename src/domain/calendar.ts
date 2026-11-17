export interface CalendarEvent {
  id: string;
  title: string;
  note?: string;
  start: string;
  end: string;
}
function escapeText(value: string) {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\r\n|\r|\n/g, "\\n")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,");
}
function fold(line: string) {
  const lines: string[] = [];
  let part = "",
    bytes = 0;
  for (const char of line) {
    const length = new TextEncoder().encode(char).length;
    if (bytes + length > 75) {
      lines.push(part);
      part = " ";
      bytes = 1;
    }
    part += char;
    bytes += length;
  }
  lines.push(part);
  return lines.join("\r\n");
}
function stamp(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime()))
    throw Error("일정 시간을 확인해 주세요.");
  return date
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");
}
/** UTC instants preserve the real time across device timezones and midnight. */
export function calendarFile(event: CalendarEvent) {
  if (Date.parse(event.end) <= Date.parse(event.start))
    throw Error("일정 종료 시간을 확인해 주세요.");
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//WEEKFLOW//Planner//KO",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${escapeText(event.id)}@weekflow`,
    `DTSTAMP:${stamp(new Date().toISOString())}`,
    `DTSTART:${stamp(event.start)}`,
    `DTEND:${stamp(event.end)}`,
    `SUMMARY:${escapeText(event.title)}`,
    `DESCRIPTION:${escapeText(event.note ?? "")}`,
    "END:VEVENT",
    "END:VCALENDAR",
    "",
  ]
    .map(fold)
    .join("\r\n");
}
