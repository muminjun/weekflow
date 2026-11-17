import { formatInTimeZone } from "date-fns-tz";
import type { Change, Dataset, WeekTask } from "../domain/types";
import { dayStatus, addDays } from "../domain/planner";
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
  return (
    <div className="tracker" role="group" aria-label="요일별 수행 기록">
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
        return (
          <button
            key={date}
            data-weekday={["월", "화", "수", "목", "금", "토", "일"][i]}
            className={`tracker-cell ${line ? "after-done" : ""}`}
            data-tooltip={`${date}: ${label}${manual ? " (직접 기록)" : ""}`}
            aria-pressed={status !== "empty"}
            aria-label={`${date} ${label}, 눌러 직접 기록 변경`}
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
