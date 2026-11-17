import { useState, useEffect } from "react";
import { format, parseISO } from "date-fns";
import type { Dataset } from "../domain/types";
import { addDays, timeLabel, today } from "../domain/planner";
import { suggestSlots } from "../domain/suggestions";
import { Select } from "../ui/Select";
import { Modal } from "./Modal";
export function Recommendations({
  data,
  week,
  holidays,
  known,
  onClose,
  onPlace,
}: {
  data: Dataset;
  week: string;
  holidays: ReadonlySet<string>;
  known: boolean;
  onClose: () => void;
  onPlace: (id: string, date: string, start: number, duration: number) => void;
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
  const unplaced = data.week_tasks.filter(
    (w) =>
      w.week_start === week &&
      w.state === "open" &&
      data.tasks.some(
        (task) => task.id === w.task_id && task.state === "open",
      ) &&
      !data.time_blocks.some(
        (b) => b.week_task_id === w.id && b.state !== "skipped",
      ),
  );
  const [selected, setSelected] = useState(unplaced[0]?.id ?? "");
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
              공휴일 정보를 확인한 뒤 추천할 수 있어요. 잠시 후 다시 열어
              주세요.
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
