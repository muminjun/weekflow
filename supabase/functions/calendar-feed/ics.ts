// RFC 5545 feed builder. Escaping and folding mirror src/domain/calendar.ts.
// Pure module (no Deno APIs) so integration tests can import it directly.
export interface FeedEvent {
  id: string;
  kind: "event" | "task";
  title: string | null;
  note: string | null;
  start_at: string;
  end_at: string;
  state: "planned" | "done" | "skipped";
  version: number;
  updated_at: string;
}
export function escapeText(value: string) {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\r\n|\r|\n/g, "\\n")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,");
}
const encoder = new TextEncoder();
/** Folds at 75 octets without splitting a UTF-8 character. */
export function fold(line: string) {
  const lines: string[] = [];
  let part = "",
    bytes = 0;
  for (const char of line) {
    const length = encoder.encode(char).length;
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
/** UTC basic format, e.g. 20261109T010000Z. */
export function stamp(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) throw Error("INVALID_TIME");
  return date
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");
}
export function calendarFeed(
  events: FeedEvent[],
  options: { timezone?: string | null; now?: Date } = {},
) {
  const now = stamp(options.now ?? new Date());
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//WEEKFLOW//Planner Feed//KO",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:WEEKFLOW",
    ...(options.timezone
      ? [`X-WR-TIMEZONE:${escapeText(options.timezone)}`]
      : []),
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
    "X-PUBLISHED-TTL:PT1H",
  ];
  for (const e of events) {
    const start = Date.parse(e.start_at),
      end = Date.parse(e.end_at);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start)
      continue;
    const title = (e.title ?? "").trim() || "WEEKFLOW";
    lines.push(
      "BEGIN:VEVENT",
      `UID:${escapeText(e.id)}@weekflow`,
      `DTSTAMP:${now}`,
      `LAST-MODIFIED:${stamp(e.updated_at)}`,
      `SEQUENCE:${Math.max(0, Math.trunc(e.version) - 1)}`,
      `DTSTART:${stamp(e.start_at)}`,
      `DTEND:${stamp(e.end_at)}`,
      `SUMMARY:${escapeText(e.kind === "task" && e.state === "done" ? `✓ ${title}` : title)}`,
      ...(e.note ? [`DESCRIPTION:${escapeText(e.note)}`] : []),
      `CATEGORIES:${e.kind === "task" ? "TASK" : "EVENT"}`,
      "TRANSP:OPAQUE",
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR", "");
  return lines.map(fold).join("\r\n");
}
