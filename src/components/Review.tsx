import { confirmAction } from "../ui/Confirmations";
import { Check, RotateCcw } from "lucide-react";
import type { Dataset, Review as WeekReview } from "../domain/types";
import { stats } from "../domain/selectors";
import { weekInsights, type WeekInsights } from "../domain/insights";
import { uuid } from "../data/demo";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import type { Commit } from "./Editors";
type Field = "did_well" | "could_improve" | "next_week_action";
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
  // Saves read the newest row at run time and run one after another, so a
  // quick edit followed by finalizing cannot overwrite or duplicate the row.
  const latest = useRef(review);
  useLayoutEffect(() => {
    latest.current = review;
  });
  // The row this component last wrote, with the version the local store
  // gives it, in case the dataset has not re-rendered between saves yet.
  const written = useRef<WeekReview | undefined>(undefined);
  const queue = useRef(Promise.resolve());
  const drafts = useRef(new Map<Field, string>());
  const save = (fields: Partial<Record<string, unknown>>) => {
    queue.current = queue.current
      .then(async () => {
        const seen = latest.current,
          mine = written.current;
        const r =
          mine && (!seen || Number(seen.version) < Number(mine.version))
            ? mine
            : seen;
        const row = {
          id: r?.id ?? uuid(),
          week_start: week,
          did_well: r?.did_well ?? "",
          could_improve: r?.could_improve ?? "",
          next_week_action: r?.next_week_action ?? "",
          stats_snapshot: r?.stats_snapshot ?? null,
          finalized_at: r?.finalized_at ?? null,
          ...fields,
        };
        await commit([
          {
            table: "week_reviews",
            action: r ? "update" : "insert",
            expected_version: r?.version,
            row,
          },
        ]);
        written.current = {
          ...r,
          ...row,
          version: Number(r?.version ?? 0) + 1,
        } as WeekReview;
      })
      .then(
        () => undefined,
        () => undefined,
      );
    return queue.current;
  };
  const flush = () => {
    const pending = Object.fromEntries(drafts.current);
    drafts.current.clear();
    for (const [k, v] of Object.entries(pending))
      if (v === (latest.current?.[k as Field] ?? "")) delete pending[k];
    return Object.keys(pending).length ? save(pending) : queue.current;
  };
  const flushRef = useRef(flush);
  useLayoutEffect(() => {
    flushRef.current = flush;
  });
  const timer = useRef<number | undefined>(undefined);
  // Closing the dialog unmounts without a blur; keep what was typed.
  useEffect(
    () => () => {
      window.clearTimeout(timer.current);
      void flushRef.current();
    },
    [],
  );
  return (
    <section className="weekly-review">
      <div className="section-heading">
        <h2>주간 회고</h2>
        <span className="muted small">한 주를 돌아보고, 다음 흐름으로.</span>
        <span className="hairline" />
        {review?.finalized_at ? (
          <button
            className="text-button"
            onClick={async () => {
              if (
                await confirmAction(
                  "현재 주의 데이터로 확정 통계를 다시 계산할까요?",
                )
              )
                void save({ stats_snapshot: current });
            }}
          >
            <RotateCcw size={13} />
            통계 다시 계산
          </button>
        ) : (
          <button
            className="text-button"
            onClick={() => {
              const pending = Object.fromEntries(drafts.current);
              drafts.current.clear();
              void save({
                ...pending,
                stats_snapshot: current,
                finalized_at: new Date().toISOString(),
              });
            }}
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
      <Insights data={data} week={week} />
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
                onChange={(e) => {
                  drafts.current.set(k, e.target.value);
                  window.clearTimeout(timer.current);
                  timer.current = window.setTimeout(() => void flush(), 1200);
                }}
                onBlur={() => {
                  window.clearTimeout(timer.current);
                  void flush();
                }}
              />
            </label>
          ),
        )}
      </div>
      <p className="review-footnote">
        {review?.finalized_at
          ? "확정된 통계 · 이후 주의 변경으로 바뀌지 않습니다."
          : "작성 내용은 입력하는 동안 자동으로 저장돼요."}{" "}
        완료한 계획 시간은 실측 집중 시간이 아닙니다.
      </p>
    </section>
  );
}

const hours = (m: number) => `${Math.round((m / 60) * 10) / 10}h`;
const percent = (r: number) => `${Math.round(r * 100)}%`;
const shortWeek = (w: string) =>
  `${Number(w.slice(5, 7))}/${Number(w.slice(8))}`;

/** Weekly coaching computed from the local dataset; nothing leaves the device. */
function Insights({ data, week }: { data: Dataset; week: string }) {
  const i: WeekInsights = useMemo(() => weekInsights(data, week), [data, week]);
  const maxCategory = Math.max(1, ...i.categories.map((c) => c.planned));
  const hasDays = i.weekdays.some((d) => d.planned > 0);
  const empty =
    !i.categories.length &&
    !hasDays &&
    !i.carryOvers.length &&
    i.trend.length < 2 &&
    !i.estimate.samples.length &&
    !i.focus.sessions;
  const planned = i.weekdays.reduce((n, d) => n + d.planned, 0),
    done = i.weekdays.reduce((n, d) => n + d.done, 0);
  return (
    <section className="insights" aria-labelledby="insights-title">
      <h3 id="insights-title">주간 인사이트</h3>
      {empty ? (
        <p className="insights-empty">
          시간 블록을 배치하고 완료를 표시하면 인사이트가 쌓여요.
        </p>
      ) : (
        <>
          {i.focus.sessions > 0 && (
            <dl className="insight-focus" aria-label="계획·완료·실측 시간">
              <div>
                <dt>계획</dt>
                <dd>{hours(planned)}</dd>
              </div>
              <div>
                <dt>완료</dt>
                <dd>{hours(done)}</dd>
              </div>
              <div className="measured">
                <dt>실측 집중</dt>
                <dd>
                  {hours(i.focus.minutes)}
                  <small> · 타이머 {i.focus.sessions}회</small>
                </dd>
              </div>
            </dl>
          )}
          {i.messages.length > 0 && (
            <ul className="insight-messages">
              {i.messages.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          )}
          <div className="insight-grid">
            {i.categories.length > 0 && (
              <figure className="insight-card">
                <figcaption>카테고리별 시간 · 계획 대비 완료</figcaption>
                <ul className="category-bars" aria-hidden="true">
                  {i.categories.map((c) => (
                    <li key={c.id ?? "none"}>
                      <span className="category-name">
                        <i style={{ background: c.color }} />
                        <span>{c.name}</span>
                      </span>
                      <span className="bar-track">
                        <span
                          className="bar-planned"
                          style={{
                            width: `${(c.planned / maxCategory) * 100}%`,
                          }}
                        >
                          <span
                            className="bar-done"
                            style={{
                              width: `${(c.done / c.planned) * 100}%`,
                            }}
                          />
                        </span>
                      </span>
                      <span className="bar-value">
                        {hours(c.done)} / {hours(c.planned)}
                      </span>
                    </li>
                  ))}
                </ul>
                <table className="sr-only">
                  <caption>카테고리별 계획 시간과 완료 시간</caption>
                  <thead>
                    <tr>
                      <th scope="col">카테고리</th>
                      <th scope="col">계획</th>
                      <th scope="col">완료</th>
                    </tr>
                  </thead>
                  <tbody>
                    {i.categories.map((c) => (
                      <tr key={c.id ?? "none"}>
                        <th scope="row">{c.name}</th>
                        <td>{hours(c.planned)}</td>
                        <td>{hours(c.done)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </figure>
            )}
            {hasDays && (
              <figure className="insight-card">
                <figcaption>요일별 완료율 · 작업 블록 기준</figcaption>
                <div className="column-chart" aria-hidden="true">
                  {i.weekdays.map((d) => (
                    <div
                      key={d.date}
                      className={d.elapsed ? "column" : "column upcoming"}
                    >
                      <span className="column-value">
                        {d.ratio === null ? "–" : percent(d.ratio)}
                      </span>
                      <span className="column-track">
                        <span
                          className="column-fill"
                          style={{ height: `${(d.ratio ?? 0) * 100}%` }}
                        />
                      </span>
                      <span className="column-label">{d.label}</span>
                    </div>
                  ))}
                </div>
                <table className="sr-only">
                  <caption>요일별 완료율</caption>
                  <thead>
                    <tr>
                      <th scope="col">요일</th>
                      <th scope="col">완료율</th>
                      <th scope="col">완료 / 계획</th>
                    </tr>
                  </thead>
                  <tbody>
                    {i.weekdays.map((d) => (
                      <tr key={d.date}>
                        <th scope="row">{d.label}요일</th>
                        <td>
                          {d.ratio === null ? "계획 없음" : percent(d.ratio)}
                          {d.elapsed ? "" : " (아직 오지 않은 날)"}
                        </td>
                        <td>
                          {hours(d.done)} / {hours(d.planned)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </figure>
            )}
            {i.trend.length >= 2 && (
              <figure className="insight-card">
                <figcaption>
                  할 일 완료율 추이 · 최근 {i.trend.length}주
                </figcaption>
                <div className="column-chart trend" aria-hidden="true">
                  {i.trend.map((p) => (
                    <div
                      key={p.week}
                      className={p.live ? "column live" : "column"}
                    >
                      <span className="column-value">{percent(p.rate)}</span>
                      <span className="column-track">
                        <span
                          className="column-fill"
                          style={{ height: `${p.rate * 100}%` }}
                        />
                      </span>
                      <span className="column-label">
                        {p.live ? "이번 주" : shortWeek(p.week)}
                      </span>
                    </div>
                  ))}
                </div>
                <table className="sr-only">
                  <caption>주별 할 일 완료율</caption>
                  <thead>
                    <tr>
                      <th scope="col">주 시작일</th>
                      <th scope="col">완료율</th>
                      <th scope="col">완료 / 전체</th>
                    </tr>
                  </thead>
                  <tbody>
                    {i.trend.map((p) => (
                      <tr key={p.week}>
                        <th scope="row">
                          {p.week}
                          {p.live ? " (이번 주, 진행 중)" : ""}
                        </th>
                        <td>{percent(p.rate)}</td>
                        <td>
                          {p.done} / {p.total}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </figure>
            )}
            {(i.estimate.samples.length > 0 || i.carryOvers.length > 0) && (
              <div className="insight-card insight-lists">
                {i.estimate.samples.length > 0 && (
                  <div>
                    <h4>예상 시간 대비 배치한 시간</h4>
                    <ul>
                      {i.estimate.samples.slice(0, 3).map((x) => (
                        <li key={x.taskId}>
                          <span>{x.title}</span>
                          <span className="muted">
                            {hours(x.estimate)} → {hours(x.placed)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {i.carryOvers.length > 0 && (
                  <div>
                    <h4>자주 이월한 할 일</h4>
                    <ul>
                      {i.carryOvers.slice(0, 3).map((c) => (
                        <li key={c.taskId}>
                          <span>{c.title}</span>
                          <span className="muted">{c.count}번</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </section>
  );
}
