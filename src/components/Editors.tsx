import { useState } from "react";
import { formatInTimeZone } from "date-fns-tz";
import { Modal } from "./Modal";
import type { Block, Change, Dataset, Task, WeekTask } from "../domain/types";
import { uuid } from "../data/demo";
import {
  addDays,
  localMinute,
  timeLabel,
  toUTC,
  today,
} from "../domain/planner";
import { availability, titleOf } from "../domain/selectors";
export type Commit = (c: Change[], ack?: boolean) => Promise<void>;
const val = (f: FormData, k: string) => String(f.get(k) ?? "");
export function CategorySelect({
  data,
  value,
}: {
  data: Dataset;
  value?: string | null;
}) {
  return (
    <label>
      카테고리
      <select
        name="category_id"
        defaultValue={
          value ?? data.categories.find((c) => !c.archived_at)?.id ?? ""
        }
      >
        <option value="">선택 안 함</option>
        {data.categories
          .filter((c) => !c.archived_at || c.id === value)
          .map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
      </select>
    </label>
  );
}
function RepeatFields({ date }: { date: string }) {
  const [freq, setFreq] = useState("none");
  return (
    <fieldset className="repeat-fields">
      <legend>반복</legend>
      <select
        aria-label="반복 주기"
        name="repeat"
        value={freq}
        onChange={(e) => setFreq(e.target.value)}
      >
        <option value="none">반복 안 함</option>
        <option value="daily">매일</option>
        <option value="weekdays">평일</option>
        <option value="weekly">선택 요일</option>
      </select>
      {freq === "weekly" && (
        <div className="weekday-checks">
          {["월", "화", "수", "목", "금", "토", "일"].map((d, i) => (
            <label key={d}>
              <input type="checkbox" name="weekdays" value={i + 1} />
              {d}
            </label>
          ))}
        </div>
      )}
      {freq !== "none" && (
        <>
          <label>
            반복 시작일
            <input
              name="repeat_start"
              type="date"
              required
              defaultValue={addDays(date, 1)}
            />
          </label>
          <label>
            반복 종료일 (비워두면 계속)
            <input name="repeat_end" type="date" min={date} />
          </label>
          <label className="check-label">
            <input type="checkbox" name="skip_holidays" />
            공휴일 제외 · 공식 데이터가 없으면 생성 보류
          </label>
        </>
      )}
    </fieldset>
  );
}
function ruleChange(
  f: FormData,
  date: string,
  kind: "task" | "event",
  template: Record<string, unknown>,
  zone: string,
): Change | null {
  const freq = val(f, "repeat");
  if (!freq || freq === "none") return null;
  const weekdays =
    freq === "daily"
      ? [1, 2, 3, 4, 5, 6, 7]
      : freq === "weekdays"
        ? [1, 2, 3, 4, 5]
        : f.getAll("weekdays").map(Number);
  if (!weekdays.length) throw Error("반복 요일을 하나 이상 선택해 주세요.");
  if (val(f, "repeat_end") && val(f, "repeat_end") < val(f, "repeat_start"))
    throw Error("반복 종료일은 시작일 이후여야 합니다.");
  return {
    table: "recurrence_rules",
    action: "insert",
    row: {
      id: uuid(),
      kind,
      frequency: freq === "daily" ? "daily" : "weekly",
      weekdays,
      starts_on: val(f, "repeat_start") || addDays(date, 1),
      ends_on: val(f, "repeat_end") || null,
      skip_public_holidays: f.has("skip_holidays"),
      timezone: zone,
      template,
      is_active: true,
    },
  };
}
export function TaskEditor({
  data,
  task,
  weekTask,
  week,
  commit,
  onClose,
  onPlace,
}: {
  data: Dataset;
  task?: Task;
  weekTask?: WeekTask;
  week: string;
  commit: Commit;
  onClose: () => void;
  onPlace: (id: string) => void;
}) {
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const wt =
    weekTask ??
    data.week_tasks.find(
      (w) => w.task_id === task?.id && w.week_start === week,
    );
  const currentGoal =
    data.goal_week_tasks.find((l) => l.week_task_id === wt?.id)?.goal_id ?? "";
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    try {
      const f = new FormData(e.currentTarget),
        id = task?.id ?? uuid(),
        wid = wt?.id ?? uuid();
      const title = val(f, "title").trim();
      if (!title) throw Error("제목을 입력해 주세요.");
      const changes: Change[] = [
        {
          table: "tasks",
          action: task ? "update" : "insert",
          expected_version: task?.version,
          row: {
            id,
            title,
            description: val(f, "description"),
            category_id: val(f, "category_id") || null,
            due_on: val(f, "due_on") || null,
            estimate_minutes: Number(val(f, "estimate_minutes")) || null,
            state: task?.state ?? "open",
            completed_at: task?.completed_at ?? null,
          },
        },
      ];
      if (!wt)
        changes.push({
          table: "week_tasks",
          action: "insert",
          row: {
            id: wid,
            task_id: id,
            week_start: week,
            state: "open",
            completed_at: null,
            sort_order: data.week_tasks.length,
          },
        });
      const goal = val(f, "goal");
      if (goal !== currentGoal) {
        if (currentGoal)
          changes.push({
            table: "goal_week_tasks",
            action: "delete",
            row: { goal_id: currentGoal, week_task_id: wid },
          });
        if (goal)
          changes.push({
            table: "goal_week_tasks",
            action: "insert",
            row: { goal_id: goal, week_task_id: wid },
          });
      }
      const occurrence = data.recurrence_occurrences.find(
        (o) => o.task_id === task?.id,
      );
      if (occurrence)
        changes.push({
          table: "recurrence_occurrences",
          action: "update",
          row: {
            id: occurrence.id,
            state: "exception",
            overrides: { title, due_on: val(f, "due_on") || null },
          },
          expected_version: occurrence.version,
        });
      const repeat = ruleChange(
        f,
        week,
        "task",
        {
          title,
          description: val(f, "description"),
          category_id: val(f, "category_id") || null,
          estimate_minutes: Number(val(f, "estimate_minutes")) || 60,
        },
        data.profile.timezone,
      );
      if (repeat) {
        changes.push(repeat);
        const first = String(repeat.row.starts_on);
        const dow = ((new Date(first + "T12:00:00").getDay() + 6) % 7) + 1;
        if (
          first >= week &&
          first <= addDays(week, 6) &&
          (repeat.row.weekdays as number[]).includes(dow)
        ) {
          changes.push({
            table: "recurrence_occurrences",
            action: "insert",
            row: {
              id: uuid(),
              rule_id: repeat.row.id,
              local_date: first,
              state: "exception",
              task_id: id,
              time_block_id: null,
              overrides: { manualInitial: true },
            },
          });
        }
      }
      await commit(changes);
      onClose();
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  }
  async function complete() {
    if (!task || !wt) return;
    const done = wt.state !== "done";
    const future = data.time_blocks.filter(
      (b) =>
        b.week_task_id === wt.id &&
        b.state === "planned" &&
        b.start_at > new Date().toISOString(),
    );
    const skip =
      done && future.length
        ? window.confirm(
            "앞으로 예정된 미완료 블록을 건너뜀으로 처리할까요?\n확인: 건너뜀 / 취소: 블록 유지",
          )
        : false;
    const timestamp = done ? new Date().toISOString() : null;
    const changes: Change[] = [
      {
        table: "tasks",
        action: "update",
        row: {
          id: task.id,
          state: done ? "done" : "open",
          completed_at: timestamp,
        },
        expected_version: task.version,
      },
      {
        table: "week_tasks",
        action: "update",
        row: {
          id: wt.id,
          state: done ? "done" : "open",
          completed_at: timestamp,
        },
        expected_version: wt.version,
      },
      ...future
        .filter(() => skip)
        .map((b) => ({
          table: "time_blocks" as const,
          action: "update" as const,
          row: { id: b.id, state: "skipped" },
          expected_version: b.version,
        })),
    ];
    await commit(changes);
    onClose();
  }
  return (
    <Modal title={task ? "할 일 편집" : "새로운 할 일"} onClose={onClose}>
      <form onSubmit={(e) => void submit(e)}>
        <label>
          할 일
          <input
            name="title"
            autoFocus
            required
            maxLength={240}
            defaultValue={task?.title}
            placeholder="이번 주, 어떤 일을 해볼까요?"
          />
        </label>
        <label>
          메모
          <textarea name="description" defaultValue={task?.description} />
        </label>
        <div className="form-pair">
          <CategorySelect data={data} value={task?.category_id} />
          <label>
            예상 소요 (분)
            <input
              name="estimate_minutes"
              type="number"
              min={15}
              max={10080}
              step={15}
              defaultValue={task?.estimate_minutes ?? 60}
            />
          </label>
        </div>
        <div className="form-pair">
          <label>
            마감일
            <input
              type="date"
              name="due_on"
              defaultValue={task?.due_on ?? ""}
            />
          </label>
          <label>
            연결할 목표
            <select name="goal" defaultValue={currentGoal}>
              <option value="">연결 안 함</option>
              {data.goals
                .filter((g) => g.week_start === week)
                .map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.title}
                  </option>
                ))}
            </select>
          </label>
        </div>
        {data.recurrence_occurrences.some((o) => o.task_id === task?.id) ? (
          <p className="small muted">
            이번 회차만 편집합니다. 이후 회차는 설정 → 반복에서 변경하세요.
          </p>
        ) : (
          <RepeatFields
            date={[week, today(data.profile.timezone)].sort().at(-1)!}
          />
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="form-actions">
          {task && (
            <button
              type="button"
              className="danger text-button"
              onClick={() => {
                const blocks = data.time_blocks.filter((b) =>
                  data.week_tasks.some(
                    (w) => w.task_id === task.id && w.id === b.week_task_id,
                  ),
                );
                if (
                  window.confirm(
                    `이 할 일과 연결된 시간 블록 ${blocks.length}개, 주간 기록을 삭제할까요?`,
                  )
                )
                  void commit([
                    {
                      table: "tasks",
                      action: "delete",
                      row: { id: task.id },
                      expected_version: task.version,
                    },
                  ]).then(onClose);
              }}
            >
              삭제
            </button>
          )}
          <button className="primary" disabled={saving}>
            {saving ? "처리 중" : "저장"}
          </button>
        </div>
        {wt && (
          <div className="secondary-actions">
            <button type="button" onClick={() => onPlace(wt.id)}>
              시간표에 배치
            </button>
            <button type="button" onClick={() => void complete()}>
              {wt.state === "done" ? "완료 해제" : "Todo 전체 완료"}
            </button>
          </div>
        )}
      </form>
    </Modal>
  );
}
export function BlockEditor({
  data,
  block,
  date,
  minute,
  weekTaskId,
  commit,
  onClose,
  holiday,
}: {
  data: Dataset;
  block?: Block;
  date: string;
  minute: number;
  weekTaskId?: string;
  commit: Commit;
  onClose: () => void;
  holiday: boolean;
}) {
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const zone = data.profile.timezone;
  const kind = block?.kind ?? (weekTaskId ? "task" : "event");
  const start = block ? localMinute(block.start_at, zone) : minute;
  const end = block ? localMinute(block.end_at, zone) : minute + 60;
  const endDate = block
    ? formatInTimeZone(block.end_at, zone, "yyyy-MM-dd")
    : addDays(date, Math.floor(end / 1440));
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setSaving(true);
    try {
      const date = val(f, "date"),
        startMinute = val(f, "start")
          .split(":")
          .reduce((a, x, i) => a + Number(x) * (i === 0 ? 60 : 1), 0),
        endMinute = val(f, "end")
          .split(":")
          .reduce((a, x, i) => a + Number(x) * (i === 0 ? 60 : 1), 0);
      if (startMinute % 15 || endMinute % 15)
        throw Error("15분 단위로 입력해 주세요.");
      const start_at = toUTC(date, startMinute, zone),
        end_at = toUTC(val(f, "endDate"), endMinute, zone);
      if (end_at <= start_at) throw Error("종료는 시작보다 늦어야 합니다.");
      const title = val(f, "title").trim();
      const overlaps = data.time_blocks.filter(
        (b) =>
          b.id !== block?.id &&
          b.state !== "skipped" &&
          b.start_at < end_at &&
          b.end_at > start_at,
      );
      if (
        overlaps.length &&
        !window.confirm(
          `일정 중복: ${overlaps.map((b) => `${titleOf(data, b)} ${formatInTimeZone(b.start_at, zone, "HH:mm")}–${formatInTimeZone(b.end_at, zone, "HH:mm")}`).join(", ")}\n겹쳐서 배치할까요?`,
        )
      )
        return;
      if (
        !availability(data, date, holiday).focus.some(
          ([s, e]) => startMinute >= s && endMinute <= e,
        ) &&
        !window.confirm("집중 가능 시간 밖에 배치합니다. 계속할까요?")
      )
        return;
      const changes: Change[] = [
        {
          table: "time_blocks",
          action: block ? "update" : "insert",
          expected_version: block?.version,
          row: {
            id: block?.id ?? uuid(),
            kind,
            week_task_id:
              kind === "task" ? (block?.week_task_id ?? weekTaskId) : null,
            event_title: kind === "event" ? title : null,
            event_note: val(f, "note"),
            category_id:
              kind === "event" ? val(f, "category_id") || null : null,
            start_at,
            end_at,
            local_date: date,
            state: val(f, "state"),
            completed_at:
              val(f, "state") === "done"
                ? (block?.completed_at ?? new Date().toISOString())
                : null,
          },
        },
      ];
      if (kind === "event") {
        const repeat = ruleChange(
          f,
          date,
          "event",
          {
            title,
            category_id: val(f, "category_id") || null,
            startMinute,
            duration: (Date.parse(end_at) - Date.parse(start_at)) / 60000,
          },
          zone,
        );
        if (repeat) {
          changes.push(repeat);
          const dow = ((new Date(date + "T12:00:00").getDay() + 6) % 7) + 1;
          if (
            date >= String(repeat.row.starts_on) &&
            (!repeat.row.ends_on || date <= String(repeat.row.ends_on)) &&
            (repeat.row.weekdays as number[]).includes(dow)
          ) {
            changes.push({
              table: "recurrence_occurrences",
              action: "insert",
              row: {
                id: uuid(),
                rule_id: repeat.row.id,
                local_date: date,
                state: "exception",
                task_id: null,
                time_block_id: changes[0].row.id,
                overrides: { manualInitial: true },
              },
            });
          }
        }
      }
      const occurrence = data.recurrence_occurrences.find(
        (o) => o.time_block_id === block?.id,
      );
      if (occurrence)
        changes.push({
          table: "recurrence_occurrences",
          action: "update",
          row: {
            id: occurrence.id,
            state: "exception",
            overrides: { start_at, end_at },
          },
          expected_version: occurrence.version,
        });
      await commit(changes, !!overlaps.length);
      onClose();
      if (kind === "task" && val(f, "state") === "done") {
        const other = data.time_blocks.filter(
          (b) =>
            b.week_task_id === (block?.week_task_id ?? weekTaskId) &&
            b.id !== block?.id &&
            b.state === "planned",
        );
        if (!other.length)
          window.setTimeout(
            () =>
              window.alert(
                "연결된 계획 블록을 모두 완료했습니다. 할 일 상세에서 Todo 전체 완료를 확정할 수 있습니다.",
              ),
            100,
          );
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  }
  return (
    <Modal
      title={
        block
          ? "시간 블록 편집"
          : kind === "task"
            ? "할 일을 시간표에 배치"
            : "새로운 고정 일정"
      }
      onClose={onClose}
    >
      <form onSubmit={(e) => void submit(e)}>
        <label>
          {kind === "task" ? "연결된 할 일" : "일정 이름"}
          <input
            name="title"
            autoFocus
            required={kind === "event"}
            maxLength={240}
            defaultValue={
              block
                ? titleOf(data, block)
                : data.tasks.find(
                    (t) =>
                      t.id ===
                      data.week_tasks.find((w) => w.id === weekTaskId)?.task_id,
                  )?.title
            }
            readOnly={kind === "task"}
          />
        </label>
        <div className="form-pair">
          <label>
            시작 날짜
            <input type="date" name="date" required defaultValue={date} />
          </label>
          <label>
            종료 날짜
            <input type="date" name="endDate" required defaultValue={endDate} />
          </label>
        </div>
        <div className="form-pair">
          <label>
            시작
            <input
              type="time"
              step={900}
              name="start"
              required
              defaultValue={timeLabel(start)}
            />
          </label>
          <label>
            종료
            <input
              type="time"
              step={900}
              name="end"
              required
              defaultValue={timeLabel(end % 1440)}
            />
          </label>
        </div>
        {kind === "event" && (
          <CategorySelect data={data} value={block?.category_id} />
        )}
        <label>
          메모
          <textarea name="note" defaultValue={block?.event_note} />
        </label>
        <label>
          블록 상태
          <select name="state" defaultValue={block?.state ?? "planned"}>
            <option value="planned">계획</option>
            <option value="done">완료</option>
            <option value="skipped">건너뜀</option>
          </select>
        </label>
        {kind === "event" &&
          (data.recurrence_occurrences.some(
            (o) => o.time_block_id === block?.id,
          ) ? (
            <p className="small muted">
              이번 회차만 편집합니다. 이후 회차는 설정 → 반복에서 변경하세요.
            </p>
          ) : (
            <RepeatFields date={date} />
          ))}
        <p className="muted small">
          블록 완료와 Todo 전체 완료는 별도로 기록됩니다.
        </p>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <div className="form-actions">
          {block && (
            <button
              className="danger text-button"
              type="button"
              onClick={() => {
                if (
                  window.confirm(
                    "이 블록을 삭제할까요? 연결된 Todo는 유지됩니다.",
                  )
                )
                  void commit([
                    {
                      table: "time_blocks",
                      action: "delete",
                      row: { id: block.id },
                      expected_version: block.version,
                    },
                  ]).then(onClose);
              }}
            >
              블록 삭제
            </button>
          )}
          <button className="primary" disabled={saving}>
            {saving ? "처리 중" : "저장"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
export function AvailabilityEditor({
  data,
  date,
  commit,
  onClose,
}: {
  data: Dataset;
  date: string;
  commit: Commit;
  onClose: () => void;
}) {
  const old = data.availability_overrides.find((x) => x.local_date === date);
  const [error, setError] = useState("");
  return (
    <Modal title={`${date} 사용 가능 시간`} onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          try {
            const f = new FormData(e.currentTarget),
              mode = val(f, "mode");
            const windows = val(f, "windows")
              .split(",")
              .filter((s) => s.trim())
              .map((s) => {
                const [start, end] = s.trim().split("-");
                const n = (t: string) =>
                  t
                    .split(":")
                    .reduce((a, x, i) => a + Number(x) * (i === 0 ? 60 : 1), 0);
                const startMinute = n(start),
                  endMinute = n(end);
                if (
                  !Number.isFinite(startMinute) ||
                  !Number.isFinite(endMinute) ||
                  startMinute < 0 ||
                  endMinute > 1440 ||
                  startMinute >= endMinute
                )
                  throw Error("09:00-12:00,13:00-18:00 형식으로 입력하세요.");
                return { startMinute, endMinute };
              });
            if (mode === "default") {
              if (old)
                void commit([
                  {
                    table: "availability_overrides",
                    action: "delete",
                    row: { id: old.id },
                    expected_version: old.version,
                  },
                ]).then(onClose);
              else onClose();
            } else
              void commit([
                {
                  table: "availability_overrides",
                  action: old ? "update" : "insert",
                  row: {
                    id: old?.id ?? uuid(),
                    local_date: date,
                    mode,
                    windows: mode === "closed" ? [] : windows,
                  },
                  expected_version: old?.version,
                },
              ]).then(onClose);
          } catch (e) {
            setError(String(e));
          }
        }}
      >
        <label>
          적용 방식
          <select name="mode" defaultValue={old?.mode ?? "default"}>
            <option value="default">기본 규칙 적용</option>
            <option value="replace">이 날짜에 직접 지정</option>
            <option value="closed">하루 휴무</option>
          </select>
        </label>
        <label>
          사용 가능 구간
          <input
            name="windows"
            placeholder="09:00-12:00,13:00-18:00"
            defaultValue={
              old?.windows
                .map(
                  (w) =>
                    `${timeLabel(w.startMinute)}-${timeLabel(w.endMinute)}`,
                )
                .join(",") ?? "09:00-18:00"
            }
          />
        </label>
        <p className="small muted">
          직접 지정한 값은 주말·공휴일 기본값보다 우선합니다. 고정 일정은
          자동으로 제외합니다.
        </p>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="form-actions">
          <button className="primary">적용</button>
        </div>
      </form>
    </Modal>
  );
}
