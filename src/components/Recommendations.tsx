import { useState, useEffect, useId } from "react";
import { format, parseISO } from "date-fns";
import type { Change, Dataset } from "../domain/types";
import { addDays, timeLabel, today } from "../domain/planner";
import { suggestSlots } from "../domain/suggestions";
import {
  autoSchedule,
  placementChanges,
  placementsStillFit,
  unplacedWeekTasks,
  type AutoScheduleResult,
  type Placement,
} from "../domain/autoSchedule";
import { uuid } from "../data/demo";
import { Select } from "../ui/Select";
import { Modal } from "./Modal";
export function Recommendations({
  data,
  week,
  holidays,
  known,
  onRetry,
  onClose,
  onPlace,
  onApplyAll,
}: {
  data: Dataset;
  week: string;
  holidays: ReadonlySet<string>;
  known: boolean;
  onRetry: () => void;
  onClose: () => void;
  onPlace: (id: string, date: string, start: number, duration: number) => void;
  /**
   * Applies every selected "이번 주 자동 배치" proposal at once. `changes` are
   * ready-made `time_blocks` inserts (kind "task", state "planned"); pass them
   * to a single `commit(changes)` call so one undo reverts the whole batch.
   * When omitted, the auto-schedule section is hidden.
   */
  onApplyAll?: (changes: Change[]) => void | Promise<void>;
}) {
  const [notice, setNotice] = useState("");
  const [, refresh] = useState(0);
  useEffect(() => {
    const update = () => refresh((v) => v + 1);
    const timer = setInterval(update, 60000);
    window.addEventListener("focus", update);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", update);
    };
  }, []);
  const unplaced = unplacedWeekTasks(data, week);
  const [chosen, setSelected] = useState(unplaced[0]?.id ?? "");
  // Once the chosen Todo is placed it leaves the list; fall back to the next.
  const selected = unplaced.some((w) => w.id === chosen)
    ? chosen
    : (unplaced[0]?.id ?? "");
  const task = data.tasks.find(
    (t) => t.id === unplaced.find((w) => w.id === selected)?.task_id,
  );
  const [customDuration, setDuration] = useState<number | null>(null);
  const duration =
    customDuration ??
    Math.max(15, Math.ceil((task?.estimate_minutes ?? 60) / 15) * 15);
  const durations = [...new Set([15, 30, 45, 60, 90, 120, duration])].sort(
    (a, b) => a - b,
  );
  const days = Array.from({ length: 7 }, (_, i) => addDays(week, i)).filter(
    (d) =>
      !task?.due_on ||
      task.due_on < today(data.profile.timezone) ||
      d <= task.due_on,
  );
  const slots =
    known && task ? suggestSlots(data, days, duration, holidays) : [];
  return (
    <Modal title="빈 시간 추천" onClose={onClose}>
      <p className="helper-text">
        가용 시간과 이미 배치된 일정을 반영했어요. 원하는 시간을 고른 뒤
        편집창에서 저장하세요.
      </p>
      {!unplaced.length ? (
        <p className="empty-note">
          배치하지 않은 미완료 할 일이 없어요. 할 일을 추가하면 시간을 추천해
          드려요.
        </p>
      ) : (
        <>
          {onApplyAll && (
            <AutoSchedule
              data={data}
              week={week}
              holidays={holidays}
              known={known}
              onRetry={onRetry}
              onApplyAll={onApplyAll}
            />
          )}
          {onApplyAll && <h3 className="auto-heading">하나씩 배치하기</h3>}
          <label>
            배치할 할 일
            <Select
              aria-label="배치할 할 일"
              value={selected}
              onChange={(e) => {
                setSelected(e.target.value);
                setDuration(null);
              }}
            >
              {unplaced.map((w) => (
                <option key={w.id} value={w.id}>
                  {data.tasks.find((t) => t.id === w.task_id)?.title}
                </option>
              ))}
            </Select>
          </label>
          <label>
            배치할 시간
            <Select
              aria-label="배치할 시간"
              value={duration}
              onChange={(e) => setDuration(Number(e.target.value))}
            >
              {durations.map((n) => (
                <option key={n} value={n}>
                  {n}분
                </option>
              ))}
            </Select>
          </label>
          {task?.due_on && task.due_on < today(data.profile.timezone) && (
            <p className="notice">
              기한이 지난 할 일이에요. 지금부터 가능한 시간을 추천해 드려요.
            </p>
          )}
          {notice && (
            <p role="status" className="notice">
              {notice}
            </p>
          )}
          {!known ? (
            <p className="notice">
              공휴일 정보를 확인한 뒤 추천할 수 있어요.{" "}
              <button type="button" onClick={onRetry}>
                다시 확인
              </button>
            </p>
          ) : !slots.length ? (
            <p className="empty-note">
              기한 안에 연속 {duration}분의 빈 시간이 없어요. 길이를 줄이거나
              직접 배치해 주세요.
            </p>
          ) : (
            <div className="suggestion-list">
              {slots.map((slot) => (
                <button
                  className="suggestion-slot"
                  key={`${slot.date}-${slot.start}`}
                  onClick={() => {
                    const fresh = suggestSlots(data, days, duration, holidays);
                    if (
                      !fresh.some(
                        (current) =>
                          current.date === slot.date &&
                          current.start === slot.start,
                      )
                    ) {
                      setNotice(
                        "가능한 시간이 바뀌었어요. 새 추천 시간에서 다시 선택해 주세요.",
                      );
                      refresh((value) => value + 1);
                      return;
                    }
                    onPlace(
                      selected,
                      slot.date,
                      slot.start,
                      slot.end - slot.start,
                    );
                  }}
                >
                  <strong>
                    {format(parseISO(slot.date), "M월 d일")} ·{" "}
                    {timeLabel(slot.start)}–{timeLabel(slot.end)}
                  </strong>
                  <span>{slot.end - slot.start}분 · 빈 시간에 배치 →</span>
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </Modal>
  );
}

const WEEKDAYS = ["월", "화", "수", "목", "금", "토", "일"];
const keyOf = (p: Placement) => `${p.weekTaskId}:${p.part}`;
function AutoSchedule({
  data,
  week,
  holidays,
  known,
  onRetry,
  onApplyAll,
}: {
  data: Dataset;
  week: string;
  holidays: ReadonlySet<string>;
  known: boolean;
  onRetry: () => void;
  onApplyAll: (changes: Change[]) => void | Promise<void>;
}) {
  const id = useId();
  const [draft, setDraft] = useState<AutoScheduleResult | null>(null);
  const [excluded, setExcluded] = useState<ReadonlySet<string>>(new Set());
  const [buffer, setBuffer] = useState(15);
  const [cap, setCap] = useState(0);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const titleOf = (weekTaskId: string) =>
    data.tasks.find(
      (t) => t.id === data.week_tasks.find((w) => w.id === weekTaskId)?.task_id,
    )?.title ?? "할 일";
  const draw = (nextBuffer = buffer, nextCap = cap) => {
    setDraft(
      autoSchedule(data, week, holidays, {
        bufferMinutes: nextBuffer,
        maxFocusMinutesPerDay: nextCap || undefined,
        holidaysKnown: known,
      }),
    );
    setExcluded(new Set());
  };
  const chosen = draft?.placements.filter((p) => !excluded.has(keyOf(p))) ?? [];
  async function apply() {
    if (!chosen.length || busy) return;
    if (!placementsStillFit(data, chosen, holidays)) {
      draw();
      setNotice(
        "가능한 시간이 바뀌어서 초안을 다시 만들었어요. 확인 후 배치해 주세요.",
      );
      return;
    }
    setBusy(true);
    try {
      await onApplyAll(placementChanges(data, chosen, uuid));
      setDraft(null);
      setNotice(
        `${chosen.length}개를 배치했어요. 실행 취소 한 번으로 모두 되돌릴 수 있어요.`,
      );
    } catch {
      setNotice("배치하지 못했어요. 잠시 후 다시 시도해 주세요.");
    } finally {
      setBusy(false);
    }
  }
  const days = Array.from({ length: 7 }, (_, i) => addDays(week, i));
  return (
    <section className="auto-schedule" aria-labelledby={`${id}-title`}>
      <h3 id={`${id}-title`}>이번 주 자동 배치</h3>
      <p className="helper-text">
        기한이 가까운 순, 긴 할 일 순으로 집중 가능 시간의 빈 곳에 한 번에
        배치해요. 2시간보다 긴 할 일은 90분 이하로 나눠요.
      </p>
      {!known ? (
        <p className="notice">
          공휴일 정보를 확인한 뒤 자동 배치할 수 있어요.{" "}
          <button type="button" onClick={onRetry}>
            다시 확인
          </button>
        </p>
      ) : (
        <>
          <div className="auto-options">
            <label>
              일정 사이 여유
              <Select
                aria-label="일정 사이 여유"
                value={buffer}
                onChange={(e) => {
                  const next = Number(e.target.value);
                  setBuffer(next);
                  if (draft) draw(next, cap);
                }}
              >
                <option value={0}>없음</option>
                <option value={15}>15분</option>
                <option value={30}>30분</option>
              </Select>
            </label>
            <label>
              하루 최대 집중
              <Select
                aria-label="하루 최대 집중"
                value={cap}
                onChange={(e) => {
                  const next = Number(e.target.value);
                  setCap(next);
                  if (draft) draw(buffer, next);
                }}
              >
                <option value={0}>제한 없음</option>
                <option value={120}>2시간</option>
                <option value={240}>4시간</option>
                <option value={360}>6시간</option>
              </Select>
            </label>
          </div>
          <button
            type="button"
            className="primary auto-draft"
            onClick={() => {
              setNotice("");
              draw();
            }}
          >
            {draft ? "초안 다시 만들기" : "이번 주 자동 배치 초안 만들기"}
          </button>
        </>
      )}
      {notice && (
        <p role="status" className="notice">
          {notice}
        </p>
      )}
      {draft && known && (
        <>
          {draft.placements.length > 0 ? (
            <fieldset className="auto-draft-list">
              <legend>배치 초안 · 뺄 항목은 선택을 해제하세요</legend>
              {days
                .map((date, i) => ({
                  date,
                  label: `${format(parseISO(date), "M월 d일")} (${WEEKDAYS[i]})`,
                  items: draft.placements
                    .filter((p) => p.date === date)
                    .sort((a, b) => a.start - b.start),
                }))
                .filter((day) => day.items.length)
                .map((day) => (
                  <div className="auto-day" key={day.date}>
                    <h4 id={`${id}-${day.date}`}>{day.label}</h4>
                    <ul aria-labelledby={`${id}-${day.date}`}>
                      {day.items.map((p) => (
                        <li key={keyOf(p)}>
                          <label className="auto-item">
                            <input
                              type="checkbox"
                              checked={!excluded.has(keyOf(p))}
                              onChange={(e) => {
                                const next = new Set(excluded);
                                if (e.target.checked) next.delete(keyOf(p));
                                else next.add(keyOf(p));
                                setExcluded(next);
                              }}
                            />
                            <span className="auto-item-text">
                              <strong>{titleOf(p.weekTaskId)}</strong>
                              <span>
                                {timeLabel(p.start)}–
                                {timeLabel(p.start + p.duration)} · {p.duration}
                                분
                                {p.parts > 1 && ` · 분할 ${p.part}/${p.parts}`}
                                {p.afterDue && " · 기한 이후"}
                              </span>
                            </span>
                          </label>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
            </fieldset>
          ) : (
            <p className="empty-note">배치할 수 있는 빈 시간이 없어요.</p>
          )}
          {draft.unplaced.length > 0 && (
            <div className="auto-unplaced">
              <h4 id={`${id}-unplaced`}>배치하지 못한 할 일</h4>
              <ul aria-labelledby={`${id}-unplaced`}>
                {draft.unplaced.map((u) => (
                  <li key={u.weekTaskId}>
                    <strong>{titleOf(u.weekTaskId)}</strong>
                    <span>{u.reason}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {draft.placements.length > 0 && (
            <div className="auto-actions">
              <button
                type="button"
                className="primary"
                disabled={!chosen.length || busy}
                onClick={() => void apply()}
              >
                선택한 {chosen.length}개 배치
              </button>
              <button type="button" onClick={() => setDraft(null)}>
                초안 닫기
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
