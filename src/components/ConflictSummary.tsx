import { formatInTimeZone } from "date-fns-tz";
import type { Change, Dataset } from "../domain/types";
const tableNames: Record<string, string> = {
  tasks: "할 일",
  week_tasks: "이번 주 할 일",
  time_blocks: "일정 블록",
  goals: "목표",
  goal_week_tasks: "목표 연결",
  categories: "카테고리",
  week_reviews: "주간 회고",
  availability_rules: "집중 가능 시간",
  availability_overrides: "날짜별 집중 가능 시간",
  recurrence_rules: "반복 규칙",
  tracker_marks: "수행표",
  profiles: "기본 설정",
};
const stateNames: Record<string, string> = {
  open: "진행 중",
  planned: "계획",
  done: "완료",
  skipped: "건너뜀",
  carried: "이월",
  archived: "보관",
};
type Row = Record<string, unknown>;
// Only fields a person recognizes; ids, versions and owners stay hidden.
function describe(row: Row | undefined, data: Dataset, zone: string) {
  if (!row) return ["삭제되었거나 아직 서버에 없어요."];
  const lines: string[] = [];
  const title =
    row.title ?? row.name ?? row.event_title ?? titleFromLink(row, data);
  if (typeof title === "string" && title) lines.push(title);
  if (typeof row.start_at === "string" && typeof row.end_at === "string")
    lines.push(
      `${formatInTimeZone(row.start_at, zone, "M월 d일 HH:mm")} – ${formatInTimeZone(row.end_at, zone, "HH:mm")}`,
    );
  for (const key of ["local_date", "due_on", "week_start"])
    if (typeof row[key] === "string") lines.push(String(row[key]));
  if (typeof row.state === "string")
    lines.push(`상태: ${stateNames[row.state] ?? row.state}`);
  if (typeof row.mark === "string")
    lines.push(`기록: ${stateNames[row.mark] ?? row.mark}`);
  for (const key of ["event_note", "description", "note"])
    if (typeof row[key] === "string" && row[key]) lines.push(String(row[key]));
  return lines.length ? lines : ["세부 내용 없음"];
}
function titleFromLink(row: Row, data: Dataset) {
  const wt = data.week_tasks.find((w) => w.id === row.week_task_id);
  return data.tasks.find((t) => t.id === (wt?.task_id ?? row.task_id))?.title;
}
export function ConflictSummary({
  changes,
  server,
}: {
  changes: Change[];
  server: Dataset;
}) {
  const zone = server.profile.timezone;
  return (
    <div className="conflict-compare">
      {changes.map((change, i) => {
        const key = change.table === "profiles" ? "profile" : change.table;
        const rows = server[key as keyof Dataset];
        const theirs = (
          Array.isArray(rows)
            ? rows.find((r) => "id" in r && r.id === change.row.id)
            : rows
        ) as Row | undefined;
        const mine =
          change.action === "delete"
            ? ["삭제"]
            : describe({ ...theirs, ...(change.row as Row) }, server, zone);
        return (
          <section key={i} aria-label={tableNames[change.table]}>
            <h3>{tableNames[change.table] ?? change.table}</h3>
            <div>
              <h4>내 변경</h4>
              <ul>
                {mine.map((line, j) => (
                  <li key={j}>{line}</li>
                ))}
              </ul>
            </div>
            <div>
              <h4>서버 변경</h4>
              <ul>
                {describe(theirs, server, zone).map((line, j) => (
                  <li key={j}>{line}</li>
                ))}
              </ul>
            </div>
          </section>
        );
      })}
    </div>
  );
}
