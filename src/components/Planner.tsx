import type { CalendarEvent } from "../domain/calendar";
import { shouldAskCalendar } from "../ui/calendarPreference";
import { Coachmarks } from "./Coachmarks";
import { ConflictSummary } from "./ConflictSummary";
import { CommandPalette } from "./CommandPalette";
import { WeekTemplates } from "./WeekTemplates";
import { placeTaskChanges } from "../domain/templates";
import { quickAddChanges } from "../domain/quickAdd";
import { FirstWeekSetup } from "./NotificationSetup";
import { alertAction, confirmAction } from "../ui/Confirmations";
import { Input } from "../ui/Input";
import { userMessage } from "../ui/errors";
import {
  lazy,
  Suspense,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
// Dialogs opened on demand load separately to keep the first paint small.
const Settings = lazy(() =>
  import("./Settings").then((m) => ({ default: m.Settings })),
);
const Review = lazy(() =>
  import("./Review").then((m) => ({ default: m.Review })),
);
const Recommendations = lazy(() =>
  import("./Recommendations").then((m) => ({ default: m.Recommendations })),
);
const CalendarExport = lazy(() =>
  import("./CalendarExport").then((m) => ({ default: m.CalendarExport })),
);
import {
  Bell,
  ChevronLeft,
  ChevronRight,
  Settings2,
  PanelRightClose,
  PanelRightOpen,
  Plus,
  ArrowRight,
  Palette,
  NotebookPen,
  Undo2,
  Command,
  Redo2,
  RefreshCw,
  X,
  Check,
} from "lucide-react";
import { parseISO, format } from "date-fns";
import { useSearchParams } from "react-router-dom";
import type { Block, Change, Dataset, Task, WeekTask } from "../domain/types";
import { blockSlice } from "../domain/selectors";
import { addDays, today, weekOf } from "../domain/planner";
import { Timeline } from "./Timeline";
import { SidePanel } from "./SidePanel";
import { TaskEditor, BlockEditor, AvailabilityEditor } from "./Editors";
import { Modal } from "./Modal";
import { useHolidays } from "../data/holidays";
import type { PlannerStore } from "../data/usePlanner";
import { rpc } from "../data/supabase";
import { pending } from "../data/local";
import { uuid } from "../data/demo";
import { ThemeControls } from "../ui/ThemeControls";
import { IconButton, Button } from "../ui/Controls";
const mobileQuery = () => window.matchMedia("(max-width: 767px)");
const subscribeMobile = (cb: () => void) => {
  const q = mobileQuery();
  q.addEventListener("change", cb);
  return () => q.removeEventListener("change", cb);
};
type Editor =
  | { type: "task"; task?: Task; wt?: WeekTask }
  | {
      type: "block";
      block?: Block;
      date: string;
      minute: number;
      wt?: string;
      duration?: number;
    }
  | { type: "availability"; date: string }
  | { type: "settings" }
  | { type: "review" }
  | { type: "appearance" }
  | { type: "carry" }
  | { type: "templates" }
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
  onLogout: (ask?: boolean) => Promise<boolean>;
}) {
  const [params, setParams] = useSearchParams();
  const validWeek = params.get("week");
  const week =
    validWeek && /^\d{4}-\d{2}-\d{2}$/.test(validWeek)
      ? weekOf(validWeek)
      : weekOf(today(data.profile.timezone));
  const [mobileDay, setMobileDay] = useState(() => {
    const requested = Number(params.get("day"));
    return Number.isInteger(requested) && params.get("day") !== null
      ? Math.min(6, Math.max(0, requested))
      : (new Date().getDay() + 6) % 7;
  });
  const [calendarEvent, setCalendarEvent] = useState<CalendarEvent | null>(
    null,
  );
  const [editor, setEditor] = useState<Editor>(null);
  // Each change produces a new dataset; the toast fades 8s after the last one.
  const [undoHiddenFor, setUndoHiddenFor] = useState<Dataset | null>(null);
  const undoHidden = undoHiddenFor === data;
  const canUndo = !!(store.undo || store.redo);
  useEffect(() => {
    if (!canUndo) return;
    const timer = window.setTimeout(() => setUndoHiddenFor(data), 8000);
    return () => window.clearTimeout(timer);
  }, [canUndo, data]);
  const mobile = useSyncExternalStore(
    subscribeMobile,
    () => mobileQuery().matches,
  );
  const [sheet, setSheet] = useState(false);
  const [recommendOpen, setRecommendOpen] = useState(false);
  const [agendaOpen, setAgendaOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    const replay = () => {
      setCollapsed(false);
      setSheet(false);
      setEditor(null);
    };
    window.addEventListener("weekflow:show-coach", replay);
    return () => window.removeEventListener("weekflow:show-coach", replay);
  }, []);
  const [carryDismissed, setCarryDismissed] = useState<string[]>([]);
  const days = Array.from({ length: 7 }, (_, i) => addDays(week, i));
  const years = [...new Set(days.map((d) => Number(d.slice(0, 4))))];
  const holidays = useHolidays(years);
  const holidayNames = new Map(
    holidays.data?.items
      .filter((h) => h.isHoliday)
      .map((h) => [h.date, h.names]) ?? [],
  );

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
  const nav = (date: string, focusDay = false) => {
    const day = focusDay
      ? (new Date(date + "T12:00:00").getDay() + 6) % 7
      : mobileDay;
    setMobileDay(day);
    setParams({ week: weekOf(date), day: String(day) });
    setEditor(null);
  };
  const openTask = (task?: Task, wt?: WeekTask) =>
    setEditor({ type: "task", task, wt });
  const create = (date: string, minute: number, wt?: string, duration = 60) =>
    setEditor(
      minute < 0
        ? { type: "availability", date }
        : { type: "block", date, minute, wt, duration },
    );
  useEffect(() => {
    function key(e: KeyboardEvent) {
      if (
        editor ||
        sheet ||
        agendaOpen ||
        recommendOpen ||
        calendarEvent ||
        paletteOpen
      )
        return;
      // Coachmarks, first-run setup and confirmations live outside this
      // component's state, so an open dialog anywhere also blocks shortcuts.
      if (e.isComposing || document.querySelector("[role=dialog]")) return;
      // The palette opens from anywhere, including while typing.
      if ((e.metaKey || e.ctrlKey) && !e.altKey && e.code === "KeyK") {
        e.preventDefault();
        setPaletteOpen(true);
        return;
      }
      if (
        (e.target as HTMLElement).closest(
          "input,textarea,select,[contenteditable]",
        )
      )
        return;
      if ((e.metaKey || e.ctrlKey) && !e.altKey && e.code === "KeyZ") {
        e.preventDefault();
        void (e.shiftKey ? store.redo?.() : store.undo?.());
        return;
      }
      if (e.ctrlKey && !e.metaKey && e.code === "KeyY") {
        e.preventDefault();
        void store.redo?.();
        return;
      }
      if (e.key === "/") {
        e.preventDefault();
        setAgendaOpen(true);
        return;
      }
      // e.code keeps N working while the Korean IME turns the key into ㅜ.
      if (
        e.code === "KeyN" &&
        !e.metaKey &&
        !e.ctrlKey &&
        !e.altKey &&
        !e.shiftKey
      ) {
        e.preventDefault();
        setEditor({ type: "task" });
      }
    }
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [
    editor,
    sheet,
    agendaOpen,
    recommendOpen,
    calendarEvent,
    paletteOpen,
    store,
  ]);
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
            : userMessage(e),
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
      !(await confirmAction(
        "반복 할 일의 이전 회차를 이월합니다. 다음 반복 회차와 별개로 남습니다. 계속할까요?",
      ))
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
      // roll_over runs on the server directly, so it must not race queued
      // offline edits to the same Todos: send those first.
      if (!navigator.onLine) {
        await alertAction(
          "이월은 연결된 상태에서만 할 수 있어요. 연결되면 다시 시도해 주세요.",
        );
        return;
      }
      await store.flush();
      if ((await pending(data.profile.id)).length) {
        await alertAction(
          "아직 전송되지 않은 변경이 있어요. 저장이 끝난 뒤 다시 이월해 주세요.",
        );
        return;
      }
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
        <span className="brand-tagline">한 주를 내 흐름대로</span>
        <div className="header-spacer" />
        <span
          className={`sync-status ${preview ? "preview-status" : ""}`}
          data-tooltip={store.status}
        >
          <span />
          <span className="sync-label">{store.status}</span>
        </span>
        {/* Only real transitions are announced, not each background check. */}
        <span className="sr-only" role="status">
          {
            {
              saving: "저장 중",
              saved: "저장됨",
              offline: "오프라인 · 기기에 임시 저장",
              error: "저장하지 못했어요",
              preview: "",
            }[store.syncState]
          }
        </span>
        <button
          className="icon-button"
          aria-label="동기화 다시 시도"
          onClick={() => void store.flush()}
        >
          <RefreshCw size={16} />
        </button>
        <IconButton
          label="외관 / 테마"
          onClick={() => setEditor({ type: "appearance" })}
        >
          <Palette size={20} />
        </IconButton>
        <Button
          className="primary header-add"
          aria-label="빠른 추가"
          onClick={() => openTask()}
        >
          <Plus size={18} />
          <span>빠른 추가</span>
        </Button>
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
          className="icon-button desktop-only"
          aria-label="명령 팔레트 열기"
          aria-keyshortcuts="Meta+K Control+K"
          data-tooltip="명령 · 검색 (⌘K)"
          onClick={() => setPaletteOpen(true)}
        >
          <Command size={18} />
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
          aria-label={preview ? "체험 종료" : "로그아웃"}
          data-tooltip={preview ? "체험 종료" : "로그아웃"}
          onClick={() => void onLogout()}
        >
          {preview ? "체험" : "나"}
        </button>
      </header>
      {preview && (
        <div className="preview-banner">
          <span>체험 중 · 변경은 저장되지 않아요.</span>
          <button onClick={() => void onLogout()}>
            체험 종료 <ArrowRight size={13} />
          </button>
        </div>
      )}
      <FirstWeekSetup
        data={data}
        commit={store.commit}
        preview={preview}
        onSettings={() => setEditor({ type: "settings" })}
      />
      <main className="planner-paper">
        <div className="planner-heading">
          <div className="week-caption">
            <h1 aria-label="이번 주, 나의 흐름">
              <span className="desktop-title">이번 주, 나의 흐름</span>
              <span className="mobile-title">이번 주</span>
            </h1>
            <span>
              <span className="desktop-title">
                {format(parseISO(week), "yyyy년 M월 d일")} –{" "}
                {format(parseISO(addDays(week, 6)), "M월 d일")}
              </span>
              <span className="mobile-title">
                {format(parseISO(week), "M월 d일")} –{" "}
                {format(parseISO(addDays(week, 6)), "M월 d일")}
              </span>
            </span>
          </div>
          <div className="workspace-actions">
            <div className="week-navigation">
              <IconButton
                label="이전 주"
                onClick={() => nav(addDays(week, -7))}
              >
                <ChevronLeft size={20} />
              </IconButton>
              <Button
                className="today-button"
                onClick={() => nav(today(data.profile.timezone), true)}
              >
                오늘
              </Button>
              <IconButton label="다음 주" onClick={() => nav(addDays(week, 7))}>
                <ChevronRight size={20} />
              </IconButton>
              <Input
                compact
                type="date"
                aria-label="날짜로 주 이동"
                value={week}
                onChange={(e) => {
                  if (/^\d{4}-\d{2}-\d{2}$/.test(e.target.value))
                    nav(e.target.value, true);
                }}
              />
            </div>
            <Button
              className="review-entry"
              aria-label="주간 회고 열기"
              onClick={() => setEditor({ type: "review" })}
            >
              <NotebookPen size={18} />
              <span>주간 회고</span>
              {data.week_reviews.some(
                (r) => r.week_start === week && r.finalized_at,
              ) && <Check size={16} />}
            </Button>
            <Button
              className="desktop-only workspace-expand"
              aria-label={collapsed ? "작업 패널 펼치기" : "일정 넓게 보기"}
              aria-pressed={collapsed}
              onClick={() => setCollapsed((v) => !v)}
            >
              {collapsed ? (
                <PanelRightOpen size={18} />
              ) : (
                <PanelRightClose size={18} />
              )}
              <span>{collapsed ? "작업 패널" : "일정 넓게"}</span>
            </Button>
          </div>
        </div>
        {(store.error || recurrenceStatus) && (
          <div className="notice" role={store.error ? "alert" : "status"}>
            {store.error ? userMessage(store.error) : recurrenceStatus}
            {store.error && (
              <button onClick={() => store.setError("")}>닫기</button>
            )}
          </div>
        )}
        {holidays.unknown && (
          <div className="holiday-notice" role="status">
            공휴일 미확인 · 가용 시간은 잠정값입니다.
            <button onClick={() => void holidays.refetch()}>다시 확인</button>
          </div>
        )}
        {nonRepeat.length > 0 && !carryDismissed.includes(week) && (
          <div className="carry-banner">
            <span>
              지난주에 남긴 할 일 <b>{nonRepeat.length}개</b>, 이번 주로
              가져올까요?
            </span>
            <button
              onClick={async () => {
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
              aria-pressed={mobileDay === i}
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
            listOpen={agendaOpen}
            setListOpen={setAgendaOpen}
            mobileDay={mobileDay}
            onDayChange={setMobileDay}
            onNavigate={(date) => nav(date, true)}
            holidayNames={holidayNames}
            holidayKnown={holidays.data?.known ?? holidays.isHolidayLoading}
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
          {!mobile && (
            <div className="panel-wrapper">
              <SidePanel
                data={data}
                week={week}
                commit={store.commit}
                onTask={openTask}
                onPlaceTask={(taskId) => {
                  const w = data.week_tasks.find(
                    (w) => w.task_id === taskId && w.week_start === week,
                  );
                  setSheet(false);
                  if (w) {
                    create(days[mobileDay], 540, w.id);
                    return;
                  }
                  // Link the deadline Todo to this week, then open the usual
                  // editor so overlap and focus-time checks still apply.
                  const placed = placeTaskChanges(
                    data,
                    taskId,
                    week,
                    days[mobileDay],
                    540,
                    uuid,
                  );
                  const link = placed.changes.filter(
                    (c) => c.table === "week_tasks",
                  );
                  void store
                    .commit(link)
                    .then(() =>
                      create(days[mobileDay], 540, placed.weekTaskId),
                    );
                }}
                onSuggest={() => {
                  setSheet(false);
                  setRecommendOpen(true);
                }}
              />
            </div>
          )}
        </div>
      </main>
      <div className="mobile-toolbar">
        <button onClick={() => create(days[mobileDay], 540)}>
          <Plus size={18} />
          일정
        </button>
        <button
          className="primary"
          aria-haspopup="dialog"
          onClick={() => setSheet(true)}
        >
          할 일{" "}
          <span>
            {
              data.week_tasks.filter(
                (w) => w.week_start === week && w.state === "open",
              ).length
            }
          </span>
          <span className="sr-only">열기</span>
        </button>
        <button className="mobile-agenda" onClick={() => setAgendaOpen(true)}>
          일정 목록{" "}
          {
            data.time_blocks.filter((b) =>
              days.some((date) => blockSlice(b, date, data.profile.timezone)),
            ).length
          }
        </button>
        <button
          aria-label="주간 회고 열기"
          onClick={() => setEditor({ type: "review" })}
        >
          회고
        </button>
      </div>
      {mobile && sheet && (
        <Modal title="이번 주 계획" onClose={() => setSheet(false)}>
          <SidePanel
            data={data}
            week={week}
            commit={store.commit}
            onTask={openTask}
            onPlaceTask={(taskId) => {
              const w = data.week_tasks.find(
                (w) => w.task_id === taskId && w.week_start === week,
              );
              setSheet(false);
              if (w) {
                create(days[mobileDay], 540, w.id);
                return;
              }
              // Link the deadline Todo to this week, then open the usual
              // editor so overlap and focus-time checks still apply.
              const placed = placeTaskChanges(
                data,
                taskId,
                week,
                days[mobileDay],
                540,
                uuid,
              );
              const link = placed.changes.filter(
                (c) => c.table === "week_tasks",
              );
              void store
                .commit(link)
                .then(() => create(days[mobileDay], 540, placed.weekTaskId));
            }}
            onSuggest={() => {
              setSheet(false);
              setRecommendOpen(true);
            }}
          />
        </Modal>
      )}
      {editor?.type === "review" && (
        <Modal title="주간 회고" wide onClose={() => setEditor(null)}>
          <Suspense fallback={null}>
            <Review data={data} week={week} commit={store.commit} />
          </Suspense>
        </Modal>
      )}
      {editor?.type === "templates" && (
        <Modal title="주 템플릿" wide onClose={() => setEditor(null)}>
          <WeekTemplates
            data={data}
            week={week}
            commit={store.commit}
            onClose={() => setEditor(null)}
          />
        </Modal>
      )}
      {editor?.type === "appearance" && (
        <Modal title="외관" onClose={() => setEditor(null)}>
          <ThemeControls />
        </Modal>
      )}
      {paletteOpen && (
        <CommandPalette
          data={data}
          week={week}
          onClose={() => setPaletteOpen(false)}
          commands={[
            {
              id: "new-task",
              label: "새 할 일",
              keys: "N",
              aliases: "추가 만들기 todo",
              run: () => setEditor({ type: "task" }),
            },
            {
              id: "today",
              label: "오늘로 이동",
              aliases: "이번 주",
              run: () => nav(today(data.profile.timezone), true),
            },
            {
              id: "prev-week",
              label: "이전 주",
              aliases: "지난주",
              run: () => nav(addDays(week, -7)),
            },
            {
              id: "next-week",
              label: "다음 주",
              run: () => nav(addDays(week, 7)),
            },
            {
              id: "agenda",
              label: "일정 목록 · 검색",
              keys: "/",
              run: () => setAgendaOpen(true),
            },
            {
              id: "recommend",
              label: "빈 시간 추천 · 자동 배치",
              aliases: "스케줄 배치",
              run: () => setRecommendOpen(true),
            },
            {
              id: "review",
              label: "주간 회고",
              aliases: "인사이트 통계",
              run: () => setEditor({ type: "review" }),
            },
            ...(nonRepeat.length
              ? [
                  {
                    id: "carry",
                    label: `지난주 미완료 ${nonRepeat.length}개 이월`,
                    run: () => {
                      setSelectedCarry(nonRepeat.map((w) => w.id));
                      setEditor({ type: "carry" });
                    },
                  },
                ]
              : []),
            ...(!mobile
              ? [
                  {
                    id: "wide",
                    label: collapsed ? "작업 패널 펼치기" : "일정 넓게 보기",
                    run: () => setCollapsed((v) => !v),
                  },
                ]
              : []),
            ...(store.undo
              ? [
                  {
                    id: "undo",
                    label: "실행 취소",
                    keys: "⌘Z",
                    run: () => void store.undo?.(),
                  },
                ]
              : []),
            ...(store.redo
              ? [
                  {
                    id: "redo",
                    label: "다시 실행",
                    keys: "⇧⌘Z",
                    run: () => void store.redo?.(),
                  },
                ]
              : []),
            {
              id: "templates",
              label: "주 템플릿",
              aliases: "템플릿 평상 주 시험 주 저장 적용",
              run: () => setEditor({ type: "templates" }),
            },
            {
              id: "appearance",
              label: "외관 · 테마",
              aliases: "다크 모드 글자 크기",
              run: () => setEditor({ type: "appearance" }),
            },
            {
              id: "settings",
              label: "설정",
              aliases: "반복 카테고리 알림 백업 계정",
              run: () => setEditor({ type: "settings" }),
            },
          ]}
          onCreate={(raw) => {
            const { changes } = quickAddChanges(raw, data, week, uuid);
            void store.commit(changes);
          }}
          onOpenBlock={(block) => {
            nav(block.local_date, true);
            requestAnimationFrame(() =>
              setEditor({
                type: "block",
                block,
                date: block.local_date,
                minute: 0,
              }),
            );
          }}
          onOpenTask={(task, wt) => openTask(task, wt)}
        />
      )}
      <Coachmarks
        enabled={
          !editor &&
          !sheet &&
          !agendaOpen &&
          !calendarEvent &&
          !recommendOpen &&
          !paletteOpen
        }
        autoStart={data.profile.onboarding_completed}
      />
      {(store.undo || store.redo) &&
        !undoHidden &&
        !editor &&
        !sheet &&
        !agendaOpen &&
        !recommendOpen &&
        !calendarEvent && (
          <div className="undo-toast" role="status">
            <span>
              {store.lastHistory === "undo"
                ? "되돌렸어요"
                : store.lastHistory === "redo"
                  ? "다시 적용했어요"
                  : "변경했어요"}
            </span>
            {store.undo && (
              <button
                onClick={() => void store.undo?.()}
                aria-keyshortcuts="Meta+Z Control+Z"
              >
                <Undo2 size={16} />
                실행 취소
              </button>
            )}
            {store.redo && store.lastHistory !== "change" && (
              <button
                onClick={() => void store.redo?.()}
                aria-keyshortcuts="Meta+Shift+Z Control+Y"
              >
                <Redo2 size={16} />
                다시 실행
              </button>
            )}
          </div>
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
      {recommendOpen && (
        <Suspense fallback={null}>
          <Recommendations
            data={data}
            week={week}
            holidays={new Set(holidayNames.keys())}
            known={holidays.data?.known ?? false}
            onRetry={() => void holidays.refetch()}
            onApplyAll={(changes) => store.commit(changes)}
            onClose={() => setRecommendOpen(false)}
            onPlace={(id, date, minute, duration) => {
              setRecommendOpen(false);
              nav(date, true);
              create(date, minute, id, duration);
            }}
          />
        </Suspense>
      )}
      {calendarEvent && (
        <Suspense fallback={null}>
          <CalendarExport
            event={calendarEvent}
            onClose={() => setCalendarEvent(null)}
          />
        </Suspense>
      )}
      {editor?.type === "block" && (
        <BlockEditor
          data={data}
          block={editor.block}
          date={editor.date}
          minute={editor.minute}
          duration={editor.duration}
          weekTaskId={editor.wt}
          commit={store.commit}
          onClose={() => setEditor(null)}
          onCreated={(event) => {
            if (mobile && shouldAskCalendar()) {
              setSheet(false);
              setCalendarEvent(event);
            }
          }}
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
        <Suspense fallback={null}>
          <Settings
            data={data}
            commit={store.commit}
            onClose={() => setEditor(null)}
            onLogout={onLogout}
            onReload={store.reload}
            preview={preview}
            onOpenTemplates={() => setEditor({ type: "templates" })}
          />
        </Suspense>
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
            일반 할 일 전체 선택
          </button>
          {prevOpen.map((w) => (
            <label className="check-label" key={w.id}>
              <Input
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
                void carry().catch((e) => store.setError(userMessage(e)))
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
                onClick={async () => {
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
          dismissible={false}
          wide
        >
          <p>
            내 변경과 서버 변경을 비교하고 선택하세요. 서버 변경을 사용하면 이
            항목과 연결된 후속 대기 변경도 취소합니다. 다른 항목의 변경은
            유지합니다.
          </p>
          <ConflictSummary
            changes={store.conflict.command.changes}
            server={store.conflict.server}
          />
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
