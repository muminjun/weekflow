import { useEffect, useRef, useState } from "react";
import {
  Bell,
  ChevronLeft,
  ChevronRight,
  Settings2,
  PanelRightClose,
  PanelRightOpen,
  Plus,
  ArrowRight,
  Undo2,
  RefreshCw,
  CalendarDays,
  X,
  Check,
} from "lucide-react";
import { getISOWeek, parseISO, format } from "date-fns";
import { useSearchParams } from "react-router-dom";
import type { Block, Change, Dataset, Task, WeekTask } from "../domain/types";
import { addDays, today, weekOf } from "../domain/planner";
import { Timeline } from "./Timeline";
import { SidePanel } from "./SidePanel";
import { Review } from "./Review";
import { Settings } from "./Settings";
import { TaskEditor, BlockEditor, AvailabilityEditor } from "./Editors";
import { Modal } from "./Modal";
import { useHolidays } from "../data/holidays";
import type { PlannerStore } from "../data/usePlanner";
import { rpc } from "../data/supabase";
import { uuid } from "../data/demo";
type Editor =
  | { type: "task"; task?: Task; wt?: WeekTask }
  | { type: "block"; block?: Block; date: string; minute: number; wt?: string }
  | { type: "availability"; date: string }
  | { type: "settings" }
  | { type: "carry" }
  | { type: "notifications" }
  | null;
export function Planner({
  store,
  data,
  preview,
  onLogout,
}: {
  store: PlannerStore;
  data: Dataset;
  preview: boolean;
  onLogout: () => Promise<void>;
}) {
  const [params, setParams] = useSearchParams();
  const validWeek = params.get("week");
  const week =
    validWeek && /^\d{4}-\d{2}-\d{2}$/.test(validWeek)
      ? weekOf(validWeek)
      : weekOf(today(data.profile.timezone));
  const [mobileDay, setMobileDay] = useState(
    Math.min(
      6,
      Math.max(0, Number(params.get("day") ?? (new Date().getDay() + 6) % 7)),
    ),
  );
  const [editor, setEditor] = useState<Editor>(null);
  const [openedAt] = useState(() => Date.now());
  const [sheet, setSheet] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [carryDismissed, setCarryDismissed] = useState<string[]>([]);
  const days = Array.from({ length: 7 }, (_, i) => addDays(week, i));
  const years = [...new Set(days.map((d) => Number(d.slice(0, 4))))];
  const holidays = useHolidays(years);
  const holidayNames = new Map(
    holidays.data?.items
      .filter((h) => h.isHoliday)
      .map((h) => [h.date, h.names]) ?? [],
  );
  const year = Number(week.slice(0, 4)),
    month = Number(week.slice(5, 7));
  const prevOpen = data.week_tasks.filter(
    (w) =>
      w.week_start === addDays(week, -7) &&
      w.state === "open" &&
      !data.week_tasks.some(
        (n) => n.week_start === week && n.task_id === w.task_id,
      ),
  );
  const nonRepeat = prevOpen.filter(
    (w) => !data.recurrence_occurrences.some((o) => o.task_id === w.task_id),
  );
  const [selectedCarry, setSelectedCarry] = useState<string[]>([]);
  const [recurrenceStatus, setRecurrenceStatus] = useState("");
  const generated = useRef("");
  const generating = useRef(false);
  const reload = store.reload;
  const syncStatus = store.status;
  const ruleKey = data.recurrence_rules
    .map((r) => r.id + ":" + r.version)
    .join();
  const nav = (date: string) => {
    setParams({ week: weekOf(date) });
    setEditor(null);
  };
  const openTask = (task?: Task, wt?: WeekTask) =>
    setEditor({ type: "task", task, wt });
  const create = (date: string, minute: number, wt?: string) =>
    setEditor(
      minute < 0
        ? { type: "availability", date }
        : { type: "block", date, minute, wt },
    );
  useEffect(() => {
    function key(e: KeyboardEvent) {
      if (
        e.key.toLowerCase() === "n" &&
        !editor &&
        !(e.target as HTMLElement).closest(
          "input,textarea,select,[contenteditable]",
        )
      ) {
        e.preventDefault();
        setSheet(true);
        requestAnimationFrame(() =>
          document.getElementById("quick-task")?.focus(),
        );
      }
    }
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [editor]);
  useEffect(() => {
    if (
      preview ||
      !ruleKey ||
      !navigator.onLine ||
      !syncStatus.startsWith("저장됨") ||
      generating.current
    )
      return;
    const key = week + ruleKey + String(holidays.data?.known);
    if (generated.current === key) return;
    generating.current = true;
    rpc<{ generated: number; paused: number }>("materialize_recurrences", {
      p_from: week,
      p_to: addDays(week, 6),
      p_holidays: holidays.data?.known
        ? holidays.data.items.filter((h) => h.isHoliday).map((h) => h.date)
        : null,
    })
      .then((r) => {
        generated.current = key;
        setRecurrenceStatus(
          r.paused
            ? "공휴일 미확인 · 휴일 제외 반복 생성 보류"
            : r.generated
              ? `반복 ${r.generated}회차 생성`
              : "",
        );
        return reload();
      })
      .catch((e) => {
        generated.current = "";
        setRecurrenceStatus(
          String(e).includes("HOLIDAY_DATA_UNKNOWN")
            ? "공휴일 미확인 · 휴일 제외 반복 생성 보류"
            : String(e),
        );
      })
      .finally(() => {
        generating.current = false;
      });
  }, [
    week,
    ruleKey,
    preview,
    holidays.data,
    reload,
    syncStatus,
    data.recurrence_rules,
  ]);
  async function carry() {
    if (!selectedCarry.length) return;
    if (
      selectedCarry.some((id) =>
        prevOpen.some((w) => w.id === id && !nonRepeat.includes(w)),
      ) &&
      !window.confirm(
        "반복 Todo의 이전 회차를 이월합니다. 다음 반복 회차와 별개로 남습니다. 계속할까요?",
      )
    )
      return;
    if (preview) {
      const changes: Change[] = [];
      for (const id of selectedCarry) {
        const w = prevOpen.find((w) => w.id === id)!;
        changes.push(
          {
            table: "week_tasks",
            action: "insert",
            row: {
              id: uuid(),
              task_id: w.task_id,
              week_start: week,
              state: "open",
              completed_at: null,
              sort_order: data.week_tasks.length,
            },
          },
          {
            table: "week_tasks",
            action: "update",
            row: { id: w.id, state: "carried", carried_to_week: week },
            expected_version: w.version,
          },
        );
      }
      await store.commit(changes);
    } else {
      await rpc("roll_over", { p_ids: selectedCarry, p_target: week });
      await store.reload();
    }
    setEditor(null);
    setCarryDismissed((v) => [...v, week]);
  }
  return (
    <div className="app-shell">
      <header className="app-header">
        <a className="wordmark" href="#/planner">
          WEEKFLOW<span className="logo-slash">/</span>
        </a>
        <span className="brand-tagline">작은 계획이 만드는, 나의 흐름.</span>
        <div className="header-spacer" />
        <span className={`sync-status ${preview ? "preview-status" : ""}`}>
          <span />
          {store.status}
        </span>
        <button
          className="icon-button"
          aria-label="동기화 다시 시도"
          onClick={() => void store.flush()}
        >
          <RefreshCw size={16} />
        </button>
        <button
          className="icon-button"
          aria-label="알림함"
          onClick={() => setEditor({ type: "notifications" })}
        >
          <Bell size={18} />
          {data.in_app_notifications.some((n) => !n.read_at) && (
            <i className="notification-dot" />
          )}
        </button>
        <button
          className="icon-button"
          aria-label="설정 열기"
          onClick={() => setEditor({ type: "settings" })}
        >
          <Settings2 size={19} />
        </button>
        <button
          className="account-button"
          title={preview ? "체험 종료" : "로그아웃"}
          onClick={() => void onLogout()}
        >
          {preview ? "체험" : "나"}
        </button>
      </header>
      {preview && (
        <div className="preview-banner">
          <span>
            플래너 체험 중 · 변경은 메모리에만 남고 종료하면 사라집니다.
          </span>
          <button onClick={() => void onLogout()}>
            체험 종료 <ArrowRight size={13} />
          </button>
        </div>
      )}
      {!data.profile.onboarding_completed && (
        <section className="onboarding">
          <b>나만의 첫 주를 준비해 보세요.</b>
          <span>서울 시간 · 월요일 시작 · 평일 09–18시 · 알림 꺼짐</span>
          <button onClick={() => setEditor({ type: "settings" })}>
            기본 설정 살펴보기
          </button>
          <button
            className="primary"
            onClick={() =>
              void store.commit([
                {
                  table: "profiles",
                  action: "update",
                  row: { id: data.profile.id, onboarding_completed: true },
                  expected_version: data.profile.version,
                },
              ])
            }
          >
            이 설정으로 시작
          </button>
        </section>
      )}
      <main className="planner-paper">
        <div className="planner-heading">
          <div className="month-number">{String(month).padStart(2, "0")}</div>
          <div className="week-caption">
            <span className="eyebrow">{year} WEEKLY PLANNER</span>
            <h1>이번 주, 나의 흐름</h1>
            <span>
              {format(parseISO(week), "MM.dd")} —{" "}
              {format(parseISO(addDays(week, 6)), "MM.dd")}
              <span className="week-badge">
                WEEK {getISOWeek(parseISO(week))}
              </span>
            </span>
          </div>
          <div className="planner-nav">
            <div className="week-navigation">
              <button
                className="icon-button"
                aria-label="이전 주"
                onClick={() => nav(addDays(week, -7))}
              >
                <ChevronLeft size={20} />
              </button>
              <button
                className="today-button"
                onClick={() => nav(today(data.profile.timezone))}
              >
                오늘
              </button>
              <button
                className="icon-button"
                aria-label="다음 주"
                onClick={() => nav(addDays(week, 7))}
              >
                <ChevronRight size={20} />
              </button>
              <label className="date-picker" title="날짜로 이동">
                <CalendarDays size={16} />
                <input
                  type="date"
                  aria-label="날짜로 주 이동"
                  value={week}
                  onChange={(e) => {
                    if (e.target.value) nav(e.target.value);
                  }}
                />
              </label>
              <button
                className="icon-button desktop-only"
                aria-label="사이드 패널 접기"
                onClick={() => setCollapsed((v) => !v)}
              >
                {collapsed ? (
                  <PanelRightOpen size={18} />
                ) : (
                  <PanelRightClose size={18} />
                )}
              </button>
            </div>
            <nav className="month-navigation" aria-label="월 이동">
              {[
                "JAN",
                "FEB",
                "MAR",
                "APR",
                "MAY",
                "JUN",
                "JUL",
                "AUG",
                "SEP",
                "OCT",
                "NOV",
                "DEC",
              ].map((m, i) => (
                <button
                  key={m}
                  className={i + 1 === month ? "active" : ""}
                  onClick={() =>
                    nav(`${year}-${String(i + 1).padStart(2, "0")}-01`)
                  }
                >
                  {m}
                </button>
              ))}
            </nav>
          </div>
        </div>
        <div className="planner-meta">
          <span>MAKE ROOM FOR WHAT MATTERS.</span>
          <div className="category-legend">
            {data.categories
              .filter((c) => !c.archived_at)
              .map((c) => (
                <span key={c.id}>
                  <i style={{ backgroundColor: c.color }} />
                  {c.name}
                </span>
              ))}
          </div>
        </div>
        {(store.error || recurrenceStatus) && (
          <div className="notice" role="status">
            {store.error || recurrenceStatus}
            {store.error && (
              <button onClick={() => store.setError("")}>닫기</button>
            )}
          </div>
        )}
        {
          <div className="holiday-notice">
            {holidays.data?.known
              ? `공휴일 확인됨 · ${holidays.data.fetchedAt?.slice(0, 10)} 갱신${holidays.data.fetchedAt && openedAt - Date.parse(holidays.data.fetchedAt) > 45 * 86400000 ? " · 오래된 자료이므로 갱신을 확인하세요." : ""}`
              : "공휴일 데이터 미확인 · 주말은 표시되며, 평일 가용 시간은 잠정값입니다."}
            <button onClick={() => void holidays.refetch()}>다시 확인</button>
          </div>
        }
        {nonRepeat.length > 0 && !carryDismissed.includes(week) && (
          <div className="carry-banner">
            <span>
              지난주에 남긴 할 일 <b>{nonRepeat.length}개</b>, 이번 주로
              가져올까요?
            </span>
            <button
              onClick={() => {
                setSelectedCarry(nonRepeat.map((w) => w.id));
                setEditor({ type: "carry" });
              }}
            >
              선택해서 이월 <ArrowRight size={14} />
            </button>
            <button
              className="icon-button"
              aria-label="이월 제안 닫기"
              onClick={() => setCarryDismissed((v) => [...v, week])}
            >
              <X size={14} />
            </button>
          </div>
        )}
        <nav className="mobile-day-tabs" aria-label="날짜 선택">
          {days.map((date, i) => (
            <button
              key={date}
              className={`${mobileDay === i ? "active" : ""} ${i === 6 || holidayNames.has(date) ? "holiday" : i === 5 ? "saturday" : ""}`}
              onClick={() => setMobileDay(i)}
            >
              <span>{["월", "화", "수", "목", "금", "토", "일"][i]}</span>
              <b>{date.slice(-2)}</b>
            </button>
          ))}
        </nav>
        <div className={`planner-body ${collapsed ? "panel-collapsed" : ""}`}>
          <Timeline
            data={data}
            days={days}
            mobileDay={mobileDay}
            holidayNames={holidayNames}
            holidayKnown={holidays.data?.known ?? false}
            onEdit={(block) =>
              setEditor({
                type: "block",
                block,
                date: block.local_date,
                minute: 0,
              })
            }
            onCreate={create}
            commit={store.commit}
          />
          <div className={`panel-wrapper ${sheet ? "sheet-open" : ""}`}>
            <div className="sheet-header">
              <b>이번 주 계획</b>
              <button
                className="icon-button"
                aria-label="할 일 패널 닫기"
                onClick={() => setSheet(false)}
              >
                <X size={20} />
              </button>
            </div>
            <SidePanel
              data={data}
              week={week}
              commit={store.commit}
              onTask={openTask}
            />
          </div>
          {sheet && (
            <button
              className="sheet-overlay"
              aria-label="할 일 패널 닫기"
              onClick={() => setSheet(false)}
            />
          )}
        </div>
        <Review data={data} week={week} commit={store.commit} />
        <footer className="paper-footer">
          <span>
            WEEKFLOW <b>/</b> ONE WEEK AT A TIME.
          </span>
          <span>
            {year} · {data.profile.timezone}
          </span>
        </footer>
      </main>
      <div className="mobile-toolbar">
        <button onClick={() => create(days[mobileDay], 540)}>
          <Plus size={18} />
          일정
        </button>
        <button className="primary" onClick={() => setSheet(true)}>
          TO-DO{" "}
          <span>
            {
              data.week_tasks.filter(
                (w) => w.week_start === week && w.state === "open",
              ).length
            }
          </span>
        </button>
        <button
          onClick={() =>
            document
              .querySelector(".weekly-review")
              ?.scrollIntoView({ behavior: "smooth" })
          }
        >
          회고
        </button>
      </div>
      {store.undo && (
        <button className="undo-toast" onClick={() => void store.undo?.()}>
          <Undo2 size={16} />
          실행 취소
        </button>
      )}
      {editor?.type === "task" && (
        <TaskEditor
          data={data}
          task={editor.task}
          weekTask={editor.wt}
          week={week}
          commit={store.commit}
          onClose={() => setEditor(null)}
          onPlace={(id) => create(days[mobileDay], 540, id)}
        />
      )}
      {editor?.type === "block" && (
        <BlockEditor
          data={data}
          block={editor.block}
          date={editor.date}
          minute={editor.minute}
          weekTaskId={editor.wt}
          commit={store.commit}
          onClose={() => setEditor(null)}
          holiday={holidayNames.has(editor.date)}
        />
      )}
      {editor?.type === "availability" && (
        <AvailabilityEditor
          data={data}
          date={editor.date}
          commit={store.commit}
          onClose={() => setEditor(null)}
        />
      )}
      {editor?.type === "settings" && (
        <Settings
          data={data}
          commit={store.commit}
          onClose={() => setEditor(null)}
          onLogout={onLogout}
          onReload={store.reload}
          preview={preview}
        />
      )}
      {editor?.type === "carry" && (
        <Modal
          title="미완료 할 일 이월"
          onClose={() => {
            setEditor(null);
            setCarryDismissed((v) => [...v, week]);
          }}
        >
          <p className="small muted">
            이전 주 기록과 마감일은 유지됩니다. 선택한 할 일만 이번 주에
            연결합니다.
          </p>
          <button
            className="text-button"
            onClick={() => setSelectedCarry(nonRepeat.map((w) => w.id))}
          >
            일반 Todo 전체 선택
          </button>
          {prevOpen.map((w) => (
            <label className="check-label" key={w.id}>
              <input
                type="checkbox"
                checked={selectedCarry.includes(w.id)}
                onChange={(e) =>
                  setSelectedCarry((v) =>
                    e.target.checked
                      ? [...v, w.id]
                      : v.filter((id) => id !== w.id),
                  )
                }
              />
              {data.tasks.find((t) => t.id === w.task_id)?.title}
              {!nonRepeat.includes(w) && <small>반복 회차 · 기본 제외</small>}
            </label>
          ))}
          <div className="form-actions">
            <button
              className="primary"
              disabled={!selectedCarry.length}
              onClick={() =>
                void carry().catch((e) => store.setError(String(e)))
              }
            >
              선택한 {selectedCarry.length}개 이월
            </button>
          </div>
        </Modal>
      )}
      {editor?.type === "notifications" && (
        <Modal title="알림함" onClose={() => setEditor(null)}>
          {data.in_app_notifications.length ? (
            data.in_app_notifications.map((n) => (
              <button
                className={`notification-row ${n.read_at ? "read" : ""}`}
                key={n.id}
                onClick={() => {
                  void store.commit([
                    {
                      table: "in_app_notifications",
                      action: "update",
                      row: { id: n.id, read_at: new Date().toISOString() },
                    },
                  ]);
                  if (n.target_ref) location.hash = n.target_ref;
                  setEditor(null);
                }}
              >
                <span>
                  {n.read_at ? <Check size={14} /> : <Bell size={14} />}
                </span>
                <span>
                  <b>{n.title}</b>
                  <small>{n.body}</small>
                </span>
              </button>
            ))
          ) : (
            <p className="muted">아직 도착한 알림이 없습니다.</p>
          )}
        </Modal>
      )}
      {store.conflict && (
        <Modal
          title={
            store.conflict.message.includes("TIME_CONFLICT")
              ? "다른 일정과 겹칩니다"
              : store.conflict.message.includes("VERSION_CONFLICT")
                ? "다른 기기의 변경과 충돌했습니다"
                : "저장할 수 없는 변경이 있습니다"
          }
          onClose={() => {}}
          wide
        >
          <p>
            내 변경과 서버 변경을 비교하고 선택하세요. 서버 변경을 사용하면 이
            항목과 연결된 후속 대기 변경도 취소합니다. 다른 항목의 변경은
            유지합니다.
          </p>
          <div className="conflict-compare">
            <section>
              <h3>내 변경</h3>
              <pre>
                {JSON.stringify(store.conflict.command.changes, null, 2)}
              </pre>
            </section>
            <section>
              <h3>서버 변경</h3>
              <pre>
                {JSON.stringify(
                  store.conflict.command.changes.map((c) => {
                    const key = c.table === "profiles" ? "profile" : c.table;
                    const rows = store.conflict!.server[key];
                    return Array.isArray(rows)
                      ? rows.find((r) => "id" in r && r.id === c.row.id)
                      : rows;
                  }),
                  null,
                  2,
                )}
              </pre>
            </section>
          </div>
          <div className="secondary-actions">
            <button onClick={() => void store.resolve(false)}>
              서버 변경 사용
            </button>
            <button
              className="primary"
              disabled={
                !/VERSION_CONFLICT|TIME_CONFLICT|DUPLICATE_ID/.test(
                  store.conflict.message,
                )
              }
              onClick={() => void store.resolve(true)}
            >
              {store.conflict.message.includes("TIME_CONFLICT")
                ? "겹쳐서 배치"
                : "내 변경으로 다시 시도"}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
