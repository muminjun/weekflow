import { alertAction, confirmAction } from "../ui/Confirmations";
import { Input } from "../ui/Input";
import { userMessage } from "../ui/errors";
import { useState } from "react";
import { Plus, ArrowUpRight, GripVertical } from "lucide-react";
import { differenceInCalendarDays, parseISO } from "date-fns";
import type { Dataset, Task, WeekTask, Change } from "../domain/types";
import { addDays, today } from "../domain/planner";
import { previewQuickAdd, quickAddChanges } from "../domain/quickAdd";
import { uuid } from "../data/demo";
import { Tracker } from "./Tracker";
import { Modal } from "./Modal";
import { SegmentedControl, TextField } from "../ui/Controls";
import type { Commit } from "./Editors";
export function SidePanel({
  data,
  week,
  commit,
  onTask,
  onSuggest,
  onPlaceTask,
}: {
  data: Dataset;
  week: string;
  commit: Commit;
  onTask: (t?: Task, w?: WeekTask) => void;
  onSuggest?: () => void;
  /** Places a DEADLINE task on the timeline without dragging (mobile/keyboard). */
  onPlaceTask?: (taskId: string) => void;
}) {
  const [tab, setTab] = useState<"todo" | "goals" | "deadlines">("todo");
  const [goalEdit, setGoalEdit] = useState<string | null>(null);
  const [copyGoals, setCopyGoals] = useState(false);
  const [quickTitle, setQuickTitle] = useState("");
  const [error, setError] = useState("");
  const [announcement, setAnnouncement] = useState("");
  const wt = data.week_tasks
    .filter((w) => w.week_start === week)
    .sort((a, b) => a.sort_order - b.sort_order);
  const goals = data.goals.filter((g) => g.week_start === week);
  // How many earlier weeks each Todo was carried out of.
  const carriedWeeks = new Map<string, number>();
  for (const w of data.week_tasks)
    if (w.state === "carried" && w.week_start < week)
      carriedWeeks.set(w.task_id, (carriedWeeks.get(w.task_id) ?? 0) + 1);
  const deadlines = data.tasks
    .filter(
      (t) =>
        t.due_on &&
        ((t.due_on >= week && t.due_on < addDays(week, 7)) ||
          (t.due_on < week && t.state === "open")) &&
        t.state !== "archived",
    )
    .sort((a, b) => a.due_on!.localeCompare(b.due_on!));
  const parsed = previewQuickAdd(quickTitle, data, week);
  function addTask(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const raw = quickTitle.trim();
    if (!raw) return;
    const {
      changes,
      title,
      chips,
      week: target,
    } = quickAddChanges(raw, data, week, uuid);
    setQuickTitle("");
    void commit(changes).then(
      () =>
        setAnnouncement(
          `‘${title}’을 추가했어요${chips.length ? ` · ${chips.join(" · ")}` : ""}.${target !== week ? " 다른 주에 추가했어요." : ""}`,
        ),
      (e) => {
        setError(userMessage(e));
        setQuickTitle((current) => current || raw);
      },
    );
  }
  return (
    <aside className="side-panel">
      <p className="sr-only" role="status" aria-live="polite">
        {announcement}
      </p>
      <SegmentedControl
        label="이번 주 작업"
        value={tab}
        onChange={setTab}
        options={[
          { value: "todo", label: `할 일 ${wt.length}` },
          { value: "goals", label: `목표 ${goals.length}` },
          { value: "deadlines", label: `마감 ${deadlines.length}` },
        ]}
      />
      <div className="panel-content">
        <section
          hidden={tab !== "goals"}
          className="paper-section goals-section"
        >
          <div className="section-heading">
            <h2>이번 주 목표</h2>
            <span className="hairline" />
            <button
              className="small-add"
              aria-label="목표 추가"
              onClick={() => setGoalEdit("new")}
            >
              <Plus size={15} />
            </button>
          </div>
          <p className="section-caption">이번 주에 닿고 싶은 곳</p>
          {goals.map((g) => {
            const ids = data.goal_week_tasks
              .filter((l) => l.goal_id === g.id)
              .map((l) => l.week_task_id);
            const linked = wt.filter((w) => ids.includes(w.id));
            const done = linked.filter((w) => w.state === "done").length;
            return (
              <button
                className="goal-row"
                key={g.id}
                onClick={() => setGoalEdit(g.id)}
              >
                <div>
                  <span className="goal-square">
                    {linked.length && done === linked.length ? "✓" : ""}
                  </span>
                  <span>{g.title}</span>
                </div>
                <div className="goal-progress">
                  <span
                    style={{
                      width: linked.length
                        ? `${(done / linked.length) * 100}%`
                        : "0",
                    }}
                  />
                </div>
                <small>
                  {linked.length
                    ? `${done} / ${linked.length} 완료`
                    : "진행 데이터 없음"}
                </small>
              </button>
            );
          })}
          {!goals.length && (
            <button className="empty-line" onClick={() => setGoalEdit("new")}>
              이번 주 목표를 적어보세요 <Plus size={13} />
            </button>
          )}
          {data.goals.some((g) => g.week_start === addDays(week, -7)) && (
            <button className="text-button" onClick={() => setCopyGoals(true)}>
              지난주 목표 선택해서 가져오기
            </button>
          )}
        </section>
        <section
          hidden={tab !== "deadlines"}
          className="paper-section deadline-section"
        >
          <div className="section-heading">
            <h2>다가오는 마감</h2>
            <span className="hairline" />
          </div>
          <div className="deadline-table-head">
            <span>DATE</span>
            <span>TASK</span>
          </div>
          {deadlines.map((t) => {
            const n = differenceInCalendarDays(
              parseISO(t.due_on!),
              parseISO(today(data.profile.timezone)),
            );
            return (
              <div
                className="deadline-item"
                key={t.id}
                draggable={t.state === "open"}
                onDragStart={(e) => {
                  e.dataTransfer.setData("text/weekflow-deadline", t.id);
                  e.dataTransfer.effectAllowed = "copy";
                }}
              >
                <button
                  className="deadline-row"
                  onClick={() =>
                    onTask(
                      t,
                      data.week_tasks.find(
                        (w) => w.task_id === t.id && w.week_start === week,
                      ),
                    )
                  }
                >
                  <span className={n <= 0 ? "due-urgent" : ""}>
                    {t.due_on!.slice(5).replace("-", ".")}
                    <small>
                      {n < 0 ? "OVERDUE" : n === 0 ? "D-DAY" : `D-${n}`}
                    </small>
                  </span>
                  <span className={t.state === "done" ? "struck" : ""}>
                    {t.title}
                    <ArrowUpRight size={12} />
                  </span>
                </button>
                {onPlaceTask && t.state === "open" && (
                  <button
                    type="button"
                    className="deadline-place"
                    aria-label={`${t.title} 시간표에 배치`}
                    onClick={() => onPlaceTask(t.id)}
                  >
                    배치
                  </button>
                )}
              </div>
            );
          })}
          {deadlines.length > 0 && (
            <p className="panel-note">
              마감을 시간표로 끌어 이번 주에 배치할 수 있어요.
            </p>
          )}
          {!deadlines.length && (
            <p className="empty-state">
              이번 주 마감이 없어요.
              <br />할 일에서 마감일을 설정할 수 있어요.
            </p>
          )}
        </section>
        <section hidden={tab !== "todo"} className="paper-section todo-section">
          <div className="section-heading">
            <h2>이번 주 할 일</h2>
            <span className="section-count">
              {wt.filter((w) => w.state === "done").length} / {wt.length}
            </span>
            <span className="hairline" />
            <button
              className="small-add"
              aria-label="할 일 상세 추가"
              onClick={() => onTask()}
            >
              <Plus size={15} />
            </button>
          </div>
          <form className="inline-task" onSubmit={addTask}>
            <Plus size={18} />
            <TextField
              id="quick-task"
              value={quickTitle}
              onChange={(e) => setQuickTitle(e.target.value)}
              name="title"
              aria-label="새 할 일"
              placeholder="할 일 추가 후 Enter"
              aria-describedby="quick-task-hint"
              maxLength={240}
              autoComplete="off"
            />
            <button type="submit" aria-label="할 일 추가">
              <ArrowUpRight size={18} />
            </button>
          </form>
          <p id="quick-task-hint" className="quick-parse" aria-live="polite">
            {parsed.chips.length ? (
              parsed.chips.map((chip) => <span key={chip}>{chip}</span>)
            ) : (
              <span className="muted">예: 내일 3시 회의 1시간 #업무</span>
            )}
          </p>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <p className="panel-note">
            할 일을 끌어 배치하거나 눌러 시간을 선택하세요.
          </p>
          {onSuggest && (
            <button className="suggestion-entry" onClick={onSuggest}>
              빈 시간 추천 <ArrowUpRight size={16} />
            </button>
          )}
          <div className="todo-list">
            {wt.map((w) => {
              const t = data.tasks.find((t) => t.id === w.task_id);
              if (!t) return null;
              const category = data.categories.find(
                (c) => c.id === t.category_id,
              );
              return (
                <div
                  className={`todo-row ${w.state === "done" ? "todo-done" : ""}`}
                  key={w.id}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData("text/weekflow-task", w.id);
                    e.dataTransfer.effectAllowed = "copy";
                  }}
                >
                  <button className="todo-title" onClick={() => onTask(t, w)}>
                    <span
                      className="category-dot"
                      style={{ backgroundColor: category?.color ?? "#DFE0DC" }}
                    />
                    <span>{t.title}</span>
                    {(carriedWeeks.get(t.id) ?? 0) >= 2 && (
                      <span
                        className="carry-badge"
                        data-tooltip="여러 주째 이월 중이에요. 쪼개거나 마감을 정해 보세요."
                      >
                        {carriedWeeks.get(t.id)! + 1}주째
                      </span>
                    )}
                    <GripVertical className="drag-icon" size={12} />
                  </button>
                  <Tracker data={data} weekTask={w} commit={commit} />
                </div>
              );
            })}
            {!wt.length && (
              <div className="empty-state">
                <b>이번 주를 가볍게 시작해요</b>
                <p>첫 할 일을 추가하고 빈 시간에 배치해 보세요.</p>
              </div>
            )}
          </div>
          <div className="tracker-legend">
            <span>● 계획</span>
            <span>◐ 일부 완료</span>
            <span>× 완료</span>
            <span>─ 완료 이후</span>
          </div>
        </section>
      </div>
      {copyGoals && (
        <Modal title="지난주 목표 가져오기" onClose={() => setCopyGoals(false)}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const ids = new FormData(e.currentTarget)
                .getAll("goals")
                .map(String);
              void commit(
                data.goals
                  .filter(
                    (g) =>
                      ids.includes(g.id) && g.week_start === addDays(week, -7),
                  )
                  .map((g, i) => ({
                    table: "goals" as const,
                    action: "insert" as const,
                    row: {
                      id: uuid(),
                      title: g.title,
                      note: g.note,
                      week_start: week,
                      sort_order: goals.length + i,
                    },
                  })),
              ).then(
                () => setCopyGoals(false),
                (e) => void alertAction(userMessage(e)),
              );
            }}
          >
            <p className="small muted">
              목표만 새로 복사하며 지난주의 할 일 연결과 완료율은 유지합니다.
            </p>
            {data.goals
              .filter((g) => g.week_start === addDays(week, -7))
              .map((g) => (
                <label className="check-label" key={g.id}>
                  <Input type="checkbox" name="goals" value={g.id} />
                  {g.title}
                </label>
              ))}
            <div className="form-actions">
              <button className="primary">선택한 목표 가져오기</button>
            </div>
          </form>
        </Modal>
      )}
      {goalEdit && (
        <Modal
          title={goalEdit === "new" ? "이번 주 목표 추가" : "목표 편집"}
          onClose={() => setGoalEdit(null)}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget),
                g = goals.find((g) => g.id === goalEdit);
              const id = g?.id ?? uuid();
              const changes: Change[] = [
                {
                  table: "goals",
                  action: g ? "update" : "insert",
                  row: {
                    id,
                    week_start: week,
                    title: String(f.get("title")).trim(),
                    note: String(f.get("note") ?? ""),
                    sort_order: g?.sort_order ?? goals.length,
                  },
                  expected_version: g?.version,
                },
              ];
              const selected = f.getAll("tasks").map(String);
              for (const w of wt) {
                const exists = data.goal_week_tasks.some(
                  (l) => l.goal_id === id && l.week_task_id === w.id,
                );
                if (exists && !selected.includes(w.id))
                  changes.push({
                    table: "goal_week_tasks",
                    action: "delete",
                    row: { goal_id: id, week_task_id: w.id },
                  });
                if (!exists && selected.includes(w.id))
                  changes.push({
                    table: "goal_week_tasks",
                    action: "insert",
                    row: { goal_id: id, week_task_id: w.id },
                  });
              }
              void commit(changes).then(
                () => setGoalEdit(null),
                (e) => void alertAction(userMessage(e)),
              );
            }}
          >
            <label>
              목표
              <Input
                autoFocus
                required
                maxLength={240}
                name="title"
                defaultValue={goals.find((g) => g.id === goalEdit)?.title}
              />
            </label>
            <label>
              메모
              <textarea
                name="note"
                defaultValue={goals.find((g) => g.id === goalEdit)?.note}
              />
            </label>
            <fieldset>
              <legend>연결할 이번 주 할 일</legend>
              {wt.map((w) => (
                <label className="check-label" key={w.id}>
                  <Input
                    type="checkbox"
                    name="tasks"
                    value={w.id}
                    defaultChecked={data.goal_week_tasks.some(
                      (l) => l.goal_id === goalEdit && l.week_task_id === w.id,
                    )}
                  />
                  {data.tasks.find((t) => t.id === w.task_id)?.title}
                </label>
              ))}
            </fieldset>
            <div className="form-actions">
              {goalEdit !== "new" && (
                <button
                  type="button"
                  className="danger text-button"
                  onClick={async () => {
                    const g = goals.find((g) => g.id === goalEdit)!;
                    if (
                      await confirmAction(
                        "이 목표와 연결만 삭제할까요? 할 일은 그대로 남아요.",
                      )
                    )
                      void commit([
                        {
                          table: "goals",
                          action: "delete",
                          row: { id: g.id },
                          expected_version: g.version,
                        },
                      ]).then(
                        () => setGoalEdit(null),
                        (e) => void alertAction(userMessage(e)),
                      );
                  }}
                >
                  삭제
                </button>
              )}
              <button className="primary">저장</button>
            </div>
          </form>
        </Modal>
      )}
    </aside>
  );
}
