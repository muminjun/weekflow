import { useState } from "react";
import { Plus, ArrowUpRight, GripVertical } from "lucide-react";
import { differenceInCalendarDays, parseISO } from "date-fns";
import type { Dataset, Task, WeekTask, Change } from "../domain/types";
import { addDays, today } from "../domain/planner";
import { uuid } from "../data/demo";
import { Tracker } from "./Tracker";
import { Modal } from "./Modal";
import type { Commit } from "./Editors";
export function SidePanel({
  data,
  week,
  commit,
  onTask,
}: {
  data: Dataset;
  week: string;
  commit: Commit;
  onTask: (t?: Task, w?: WeekTask) => void;
}) {
  const [goalEdit, setGoalEdit] = useState<string | null>(null);
  const [copyGoals, setCopyGoals] = useState(false);
  const [quickTitle, setQuickTitle] = useState("");
  const [error, setError] = useState("");
  const wt = data.week_tasks
    .filter((w) => w.week_start === week)
    .sort((a, b) => a.sort_order - b.sort_order);
  const goals = data.goals.filter((g) => g.week_start === week);
  const deadlines = data.tasks
    .filter(
      (t) =>
        t.due_on &&
        ((t.due_on >= week && t.due_on < addDays(week, 7)) ||
          (t.due_on < week && t.state === "open")) &&
        t.state !== "archived",
    )
    .sort((a, b) => a.due_on!.localeCompare(b.due_on!));
  function addTask(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget,
      f = new FormData(form),
      title = String(f.get("title") ?? "").trim();
    if (!title) return;
    const taskId = uuid();
    setQuickTitle("");
    void commit([
      {
        table: "tasks",
        action: "insert",
        row: {
          id: taskId,
          title,
          description: "",
          state: "open",
          category_id: data.categories[0]?.id ?? null,
          estimate_minutes: 60,
          due_on: null,
          completed_at: null,
        },
      },
      {
        table: "week_tasks",
        action: "insert",
        row: {
          id: uuid(),
          task_id: taskId,
          week_start: week,
          state: "open",
          sort_order: wt.length,
          completed_at: null,
        },
      },
    ]).catch((e) => {
      setError(String(e));
      setQuickTitle((current) => current || title);
    });
  }
  return (
    <aside className="side-panel">
      <section className="paper-section goals-section">
        <div className="section-heading">
          <h2>GOALS</h2>
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
      <section className="paper-section deadline-section">
        <div className="section-heading">
          <h2>DEADLINE</h2>
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
            <button
              className="deadline-row"
              key={t.id}
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
          );
        })}
        {Array.from({ length: Math.max(0, 3 - deadlines.length) }, (_, i) => (
          <div className="deadline-row empty" key={i}>
            <span />
            <span />
          </div>
        ))}
      </section>
      <section className="paper-section todo-section">
        <div className="section-heading">
          <h2>TO-DO</h2>
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
        <div className="todo-table-head">
          <div>
            {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
              <span key={i}>{d}</span>
            ))}
          </div>
          <span>TASK</span>
        </div>
        {wt.map((w) => {
          const t = data.tasks.find((t) => t.id === w.task_id);
          if (!t) return null;
          const category = data.categories.find((c) => c.id === t.category_id);
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
              <Tracker data={data} weekTask={w} commit={commit} />
              <button className="todo-title" onClick={() => onTask(t, w)}>
                <span
                  className="category-dot"
                  style={{ backgroundColor: category?.color ?? "#DFE0DC" }}
                />
                <span>{t.title}</span>
                <GripVertical className="drag-icon" size={12} />
              </button>
            </div>
          );
        })}
        <form className="inline-task" onSubmit={addTask}>
          <Plus size={15} />
          <input
            id="quick-task"
            value={quickTitle}
            onChange={(e) => setQuickTitle(e.target.value)}
            name="title"
            aria-label="새 할 일"
            placeholder="할 일 추가 후 Enter"
            maxLength={240}
            autoComplete="off"
          />
        </form>
        {error && <p className="error">{error}</p>}
        {Array.from({ length: Math.max(3, 13 - wt.length) }, (_, i) => (
          <div className="todo-row empty" key={i}>
            <div className="tracker">
              {Array.from({ length: 7 }, (_, n) => (
                <span className="tracker-cell" key={n} />
              ))}
            </div>
            <div className="empty-task-line" />
          </div>
        ))}
        <div className="tracker-legend">
          <span>● 계획</span>
          <span>◐ 일부 완료</span>
          <span>× 완료</span>
          <span>─ 완료 이후</span>
        </div>
        <p className="panel-note">
          할 일을 시간표로 끌어 놓으세요.
          <br />한 할 일을 여러 번 나누어 배치할 수 있어요.
        </p>
      </section>
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
              ).then(() => setCopyGoals(false));
            }}
          >
            <p className="small muted">
              목표만 새로 복사하며 지난주의 Todo 연결과 완료율은 유지합니다.
            </p>
            {data.goals
              .filter((g) => g.week_start === addDays(week, -7))
              .map((g) => (
                <label className="check-label" key={g.id}>
                  <input type="checkbox" name="goals" value={g.id} />
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
              void commit(changes).then(() => setGoalEdit(null));
            }}
          >
            <label>
              목표
              <input
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
                  <input
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
                  onClick={() => {
                    const g = goals.find((g) => g.id === goalEdit)!;
                    if (
                      window.confirm(
                        "이 목표와 연결만 삭제할까요? Todo는 유지됩니다.",
                      )
                    )
                      void commit([
                        {
                          table: "goals",
                          action: "delete",
                          row: { id: g.id },
                          expected_version: g.version,
                        },
                      ]).then(() => setGoalEdit(null));
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
