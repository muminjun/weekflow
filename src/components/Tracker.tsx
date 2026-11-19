import { formatInTimeZone } from "date-fns-tz";
import type { Change, Dataset, WeekTask } from "../domain/types";
import { dayStatus, addDays, dayLabel } from "../domain/planner";
import { uuid } from "../data/demo";
export function Tracker({
  data,
  weekTask,
  commit,
}: {
  data: Dataset;
  weekTask: WeekTask;
  commit: (c: Change[]) => Promise<void>;
}) {
  const completion = weekTask.completed_at
    ? formatInTimeZone(
        weekTask.completed_at,
        data.profile.timezone,
        "yyyy-MM-dd",
      )
    : null;
  const title =
    data.tasks.find((t) => t.id === weekTask.task_id)?.title ?? "할 일";
  return (
    <div
      className="tracker"
      role="group"
      aria-label={`${title} 요일별 수행 기록`}
    >
      {Array.from({ length: 7 }, (_, i) => {
        const date = addDays(weekTask.week_start, i);
        const manual = data.week_task_day_marks.find(
          (m) => m.week_task_id === weekTask.id && m.local_date === date,
        );
        const blocks = data.time_blocks.filter(
          (b) =>
            b.week_task_id === weekTask.id &&
            formatInTimeZone(
              b.start_at,
              data.profile.timezone,
              "yyyy-MM-dd",
            ) === date,
        );
        const status = dayStatus(
          blocks.map((b) => b.state),
          manual?.mark,
        );
        const line =
          weekTask.state === "done" &&
          completion &&
          date > completion &&
          completion >= weekTask.week_start &&
          completion <= addDays(weekTask.week_start, 6);
        const label = {
          empty: "기록 없음",
          planned: "계획",
          partial: "일부 완료",
          done: "완료",
        }[status];
        const weekday = ["월", "화", "수", "목", "금", "토", "일"][i];
        const day = dayLabel(date);
        const next =
          manual?.mark === "planned"
            ? "완료로 기록"
            : manual?.mark === "done"
              ? "직접 기록 지우기"
              : "계획으로 기록";
        return (
          <button
            key={date}
            data-weekday={weekday}
            className={`tracker-cell ${line ? "after-done" : ""}`}
            data-tooltip={`${day}: ${label}${manual ? " (직접 기록)" : ""}`}
            aria-label={`${title} ${day}: ${label}${manual ? "(직접 기록)" : ""}. 누르면 ${next}`}
            onClick={() => {
              const mark =
                manual?.mark === "planned"
                  ? "done"
                  : manual?.mark === "done"
                    ? null
                    : "planned";
              void commit([
                {
                  table: "week_task_day_marks",
                  action: mark ? (manual ? "update" : "insert") : "delete",
                  row: mark
                    ? {
                        id: manual?.id ?? uuid(),
                        week_task_id: weekTask.id,
                        local_date: date,
                        mark,
                      }
                    : { id: manual!.id },
                  expected_version: manual?.version,
                },
              ]);
            }}
          >
            {status === "done"
              ? "×"
              : status === "partial"
                ? "◐"
                : status === "planned"
                  ? "●"
                  : ""}
          </button>
        );
      })}
    </div>
  );
}
