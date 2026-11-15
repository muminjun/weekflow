import { Check, RotateCcw } from "lucide-react";
import type { Dataset } from "../domain/types";
import { stats } from "../domain/selectors";
import { uuid } from "../data/demo";
import type { Commit } from "./Editors";
export function Review({
  data,
  week,
  commit,
}: {
  data: Dataset;
  week: string;
  commit: Commit;
}) {
  const review = data.week_reviews.find((r) => r.week_start === week);
  const current = stats(data, week),
    s = review?.stats_snapshot ?? current;
  const save = (key: string, value: unknown) =>
    commit([
      {
        table: "week_reviews",
        action: review ? "update" : "insert",
        expected_version: review?.version,
        row: {
          id: review?.id ?? uuid(),
          week_start: week,
          did_well: review?.did_well ?? "",
          could_improve: review?.could_improve ?? "",
          next_week_action: review?.next_week_action ?? "",
          stats_snapshot: review?.stats_snapshot ?? null,
          finalized_at: review?.finalized_at ?? null,
          [key]: value,
        },
      },
    ]);
  return (
    <section className="weekly-review">
      <div className="section-heading">
        <h2>WEEKLY REVIEW</h2>
        <span className="muted small">한 주를 돌아보고, 다음 흐름으로.</span>
        <span className="hairline" />
        {review?.finalized_at ? (
          <button
            className="text-button"
            onClick={() => {
              if (
                window.confirm(
                  "현재 주의 데이터로 확정 통계를 다시 계산할까요?",
                )
              )
                void save("stats_snapshot", current);
            }}
          >
            <RotateCcw size={13} />
            통계 다시 계산
          </button>
        ) : (
          <button
            className="text-button"
            onClick={() =>
              void commit([
                {
                  table: "week_reviews",
                  action: review ? "update" : "insert",
                  expected_version: review?.version,
                  row: {
                    id: review?.id ?? uuid(),
                    week_start: week,
                    did_well: review?.did_well ?? "",
                    could_improve: review?.could_improve ?? "",
                    next_week_action: review?.next_week_action ?? "",
                    stats_snapshot: current,
                    finalized_at: new Date().toISOString(),
                  },
                },
              ])
            }
          >
            <Check size={14} />
            회고 확정
          </button>
        )}
      </div>
      <div className="review-stats">
        <div>
          <strong>
            {s.done}
            <small> / {s.total}</small>
          </strong>
          <span>완료한 할 일</span>
        </div>
        <div>
          <strong>
            {Math.round((s.plannedMinutes / 60) * 10) / 10}
            <small> h</small>
          </strong>
          <span>계획한 작업 시간</span>
        </div>
        <div>
          <strong>
            {Math.round((s.doneMinutes / 60) * 10) / 10}
            <small> h</small>
          </strong>
          <span>완료한 계획 시간</span>
        </div>
        <div>
          <strong>
            {Math.round((s.eventMinutes / 60) * 10) / 10}
            <small> h</small>
          </strong>
          <span>고정 일정</span>
        </div>
        <div>
          <strong>{s.carried}</strong>
          <span>이월한 할 일</span>
        </div>
      </div>
      <div className="review-prompts">
        {(["did_well", "could_improve", "next_week_action"] as const).map(
          (k, i) => (
            <label key={week + k}>
              <span>
                <b>0{i + 1}</b>
                {["이번 주 잘한 점", "아쉬웠던 점", "다음 주 개선할 점"][i]}
              </span>
              <textarea
                aria-label={
                  ["이번 주 잘한 점", "아쉬웠던 점", "다음 주 개선할 점"][i]
                }
                placeholder="짧은 한 줄도 좋아요."
                defaultValue={review?.[k] ?? ""}
                onBlur={(e) => {
                  if (e.target.value !== (review?.[k] ?? ""))
                    void save(k, e.target.value);
                }}
              />
            </label>
          ),
        )}
      </div>
      <p className="review-footnote">
        {review?.finalized_at
          ? "확정된 통계 · 이후 주의 변경으로 바뀌지 않습니다."
          : "작성 내용은 입력을 마치면 저장됩니다."}{" "}
        완료한 계획 시간은 실측 집중 시간이 아닙니다.
      </p>
    </section>
  );
}
