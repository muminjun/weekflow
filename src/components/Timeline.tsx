import { confirmAction } from "../ui/Confirmations";
import { Select } from "../ui/Select";
import { useRef, useState, useLayoutEffect } from "react";
import {
  Check,
  GripHorizontal,
  ChevronLeft,
  ChevronRight,
  Clock3,
} from "lucide-react";
import { formatInTimeZone } from "date-fns-tz";
import type { Block, Change, Dataset } from "../domain/types";
import {
  localMinute,
  addDays,
  overlapLanes,
  snap,
  timeLabel,
  toUTC,
  today,
} from "../domain/planner";
import {
  availability,
  blockSlice,
  colorOf,
  titleOf,
} from "../domain/selectors";
import {
  fitScale,
  clippedGeometry,
  rangeAround,
  categoryText,
} from "../domain/view";
import { Modal } from "./Modal";
import { IconButton, SegmentedControl } from "../ui/Controls";
interface Props {
  data: Dataset;
  days: string[];
  mobileDay: number;
  onDayChange: (day: number) => void;
  holidayNames: Map<string, string[]>;
  holidayKnown: boolean;
  onEdit: (b: Block) => void;
  onCreate: (date: string, minute: number, weekTaskId?: string) => void;
  commit: (c: Change[], ack?: boolean) => Promise<void>;
}
interface Drag {
  block: Block;
  mode: "move" | "start" | "end";
  x: number;
  y: number;
  date: string;
  start: number;
  end: number;
  moved: boolean;
  sliceOffset: number;
}
export function Timeline({
  data,
  days,
  mobileDay,
  onDayChange,
  holidayNames,
  holidayKnown,
  onEdit,
  onCreate,
  commit,
}: Props) {
  const dragRef = useRef<Drag | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [mode, setMode] = useState<"fit" | "saved" | "full">("fit");
  const [range, setRange] = useState<[number, number]>([540, 1080]);
  const [outsideOpen, setOutsideOpen] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  const [dayView, setDayView] = useState<"week" | "day">("week");
  const viewport = useRef<HTMLDivElement>(null);
  const [availableHeight, setAvailableHeight] = useState(450);
  const zone = data.profile.timezone;
  const [from, to] =
    mode === "fit"
      ? range
      : mode === "full"
        ? [0, 1440]
        : [data.profile.display_start_minute, data.profile.display_end_minute];
  useLayoutEffect(() => {
    if (!viewport.current) return;
    const observer = new ResizeObserver((entries) => {
      if (entries[0].contentRect.height > 0)
        setAvailableHeight(entries[0].contentRect.height);
    });
    observer.observe(viewport.current);
    return () => observer.disconnect();
  }, []);
  const scale =
    mode === "fit"
      ? fitScale(availableHeight, from, to)
      : data.profile.pixels_per_hour;
  const height = ((to - from) * scale) / 60;
  const weekBlocks = data.time_blocks
    .filter((b) => days.some((date) => blockSlice(b, date, zone)))
    .sort((a, b) => a.start_at.localeCompare(b.start_at));
  const outside = data.time_blocks.filter(
    (b) =>
      b.state !== "skipped" &&
      days.some((date) => {
        const slice = blockSlice(b, date, zone);
        return slice && (slice[0] < from || slice[1] > to);
      }),
  );
  function shiftRange(delta: number) {
    const start = Math.max(0, Math.min(900, from + delta));
    setRange([start, start + 540]);
    setMode("fit");
  }
  async function savePlacement(d: Drag) {
    const start_at = toUTC(d.date, d.start, zone),
      end_at = toUTC(d.date, d.end, zone);
    const overlaps = data.time_blocks.filter(
      (b) =>
        b.id !== d.block.id &&
        b.state !== "skipped" &&
        b.start_at < end_at &&
        b.end_at > start_at,
    );
    if (
      overlaps.length &&
      !(await confirmAction(
        `다음 일정과 겹칩니다:\n${overlaps.map((b) => `${titleOf(data, b)} · ${formatInTimeZone(b.start_at, zone, "MM.dd HH:mm")}–${formatInTimeZone(b.end_at, zone, "HH:mm")}`).join("\n")}\n겹쳐서 배치할까요?`,
      ))
    )
      return;
    const focus = availability(data, d.date, holidayNames.has(d.date)).focus;
    if (
      !focus.some(([s, e]) => d.start >= s && d.end <= e) &&
      !(await confirmAction("집중 가능 시간 밖입니다. 그래도 배치할까요?"))
    )
      return;
    await commit(
      [
        {
          table: "time_blocks",
          action: "update",
          row: { id: d.block.id, start_at, end_at, local_date: d.date },
          expected_version: d.block.version,
        },
      ],
      !!overlaps.length,
    );
  }
  function move(e: React.PointerEvent) {
    const d = dragRef.current;
    if (!d) return;
    const el = document
      .elementFromPoint(e.clientX, e.clientY)
      ?.closest<HTMLElement>("[data-day]");
    const rect = el?.getBoundingClientRect();
    const delta =
      snap((Math.abs(e.clientY - d.y) * 60) / scale) *
      Math.sign(e.clientY - d.y);
    let start = localMinute(d.block.start_at, zone),
      end =
        start +
        (Date.parse(d.block.end_at) - Date.parse(d.block.start_at)) / 60000,
      date = formatInTimeZone(d.block.start_at, zone, "yyyy-MM-dd");
    if (d.mode === "move") {
      const duration = end - start;
      date = el?.dataset.day ? addDays(el.dataset.day, -d.sliceOffset) : d.date;
      start = Math.max(0, Math.min(1425, snap(start + delta)));
      end = start + duration;
    } else if (d.mode === "start")
      start = Math.max(0, Math.min(end - 15, snap(start + delta)));
    else end = Math.max(start + 15, Math.min(start + 10080, snap(end + delta)));
    if (!rect && d.mode === "move") date = d.date;
    const next = {
      ...d,
      date,
      start,
      end,
      moved:
        d.moved || Math.abs(e.clientX - d.x) + Math.abs(e.clientY - d.y) > 5,
    };
    dragRef.current = next;
    setDrag(next);
  }
  function begin(e: React.PointerEvent, b: Block, mode: Drag["mode"]) {
    if (e.button !== 0 || e.pointerType === "touch") return;
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    const start = localMinute(b.start_at, zone);
    const d: Drag = {
      block: b,
      mode,
      x: e.clientX,
      y: e.clientY,
      date: formatInTimeZone(b.start_at, zone, "yyyy-MM-dd"),
      start,
      end: start + (Date.parse(b.end_at) - Date.parse(b.start_at)) / 60000,
      moved: false,
      sliceOffset: Math.round(
        (Date.parse(
          (e.currentTarget.closest<HTMLElement>("[data-day]")?.dataset.day ??
            formatInTimeZone(b.start_at, zone, "yyyy-MM-dd")) + "T00:00:00Z",
        ) -
          Date.parse(
            formatInTimeZone(b.start_at, zone, "yyyy-MM-dd") + "T00:00:00Z",
          )) /
          86400000,
      ),
    };
    dragRef.current = d;
    setDrag(d);
  }
  function end(e: React.PointerEvent) {
    const d = dragRef.current;
    if (!d) return;
    dragRef.current = null;
    setDrag(null);
    e.preventDefault();
    e.stopPropagation();
    if (d.moved) void savePlacement(d);
    else if (d.mode === "move") onEdit(d.block);
  }
  return (
    <div
      className={`calendar ${mode !== "fit" ? "calendar-detail" : ""} ${dayView === "day" ? "single-day" : ""}`}
    >
      <div className="calendar-toolbar">
        <div className="range-navigation">
          <IconButton
            label="이른 시간 보기"
            disabled={mode !== "fit" || from === 0}
            onClick={() => shiftRange(-180)}
          >
            <ChevronLeft size={18} />
          </IconButton>
          <b className="visible-range">
            {timeLabel(from)}–{timeLabel(to)}
          </b>
          <IconButton
            label="늦은 시간 보기"
            disabled={mode !== "fit" || to === 1440}
            onClick={() => shiftRange(180)}
          >
            <ChevronRight size={18} />
          </IconButton>
        </div>
        <label className="range-select">
          <span className="sr-only">시간표 보기</span>
          <Select
            aria-label="시간표 보기"
            value={mode}
            onChange={(e) => setMode(e.target.value as typeof mode)}
          >
            <option value="fit">화면 맞춤</option>
            <option value="full">전체 24시간 · 상세</option>
            <option value="saved">내 설정 범위 · 상세</option>
          </Select>
        </label>
        <div className="desktop-view-switch">
          <SegmentedControl
            label="주간 또는 하루"
            value={dayView}
            options={[
              { value: "week", label: "주간" },
              { value: "day", label: "하루" },
            ]}
            onChange={setDayView}
          />
        </div>
        <div className="calendar-range-actions">
          {" "}
          <button className="agenda-button" onClick={() => setListOpen(true)}>
            일정 목록 {weekBlocks.length}
          </button>
          <button
            className="outside-button"
            disabled={!outside.length}
            onClick={() => setOutsideOpen(true)}
          >
            범위 밖 일정 {outside.length}개{outside.length > 0 && " ↗"}
          </button>
        </div>
      </div>
      {dayView === "day" && (
        <div className="desktop-day-tabs">
          {days.map((date, i) => (
            <button
              key={date}
              aria-pressed={i === mobileDay}
              onClick={() => onDayChange(i)}
            >
              {["월", "화", "수", "목", "금", "토", "일"][i]} {date.slice(-2)}
            </button>
          ))}
        </div>
      )}
      <div className="day-headers">
        <div className="axis-label">
          <Clock3 size={16} />
        </div>
        {days.map((date, i) => {
          const a = availability(data, date, holidayNames.has(date));
          return (
            <div
              key={date}
              className={`day-header day-${i} ${i === mobileDay ? "mobile-selected" : ""} ${date === today(zone) ? "is-today" : ""} ${holidayNames.has(date) || i === 6 ? "holiday" : i === 5 ? "saturday" : ""}`}
            >
              <span className="day-name">
                {["월", "화", "수", "목", "금", "토", "일"][i]}
              </span>
              <div className="date-line">
                <strong>{date.slice(-2)}</strong>
                {date === today(zone) && (
                  <span className="today-label">오늘</span>
                )}
              </div>
              <button
                className="available-tag"
                data-tooltip={`집중 가능 ${a.focusMinutes / 60}시간 / 아직 빈 시간 ${a.freeMinutes / 60}시간`}
                onClick={() => onCreate(date, -1)}
              >
                <b>{Math.round((a.focusMinutes / 60) * 10) / 10}h</b> 집중 가능
              </button>
              <small>
                {holidayNames.get(date)?.join(" · ") ??
                  (!holidayKnown && i < 5
                    ? "공휴일 미확인"
                    : `빈 시간 ${Math.round((a.freeMinutes / 60) * 10) / 10}h`)}
              </small>
            </div>
          );
        })}
      </div>
      <div className="timeline-scroll" ref={viewport}>
        <div
          className="timeline-grid"
          style={
            { height, "--hour-height": `${scale}px` } as React.CSSProperties
          }
          data-scale={scale}
          data-from={from}
          data-to={to}
          onPointerMove={move}
          onPointerUp={end}
          onPointerCancel={() => {
            dragRef.current = null;
            setDrag(null);
          }}
        >
          <div className="time-axis">
            {Array.from({ length: Math.ceil((to - from) / 60) + 1 }, (_, i) => (
              <span key={i} style={{ top: i * scale }}>
                {timeLabel(from + i * 60)}
              </span>
            ))}
          </div>
          {days.map((date, i) => {
            const a = availability(data, date, holidayNames.has(date));
            const slices = data.time_blocks
              .filter((b) => b.state !== "skipped")
              .map((b) => ({ b, interval: blockSlice(b, date, zone) }))
              .filter((x) => x.interval);
            const lanes = overlapLanes(
              slices.map((x) => ({
                id: x.b.id,
                start: x.interval![0],
                end: x.interval![1],
              })),
            );
            return (
              <div
                key={date}
                data-day={date}
                className={`day-column day-${i} ${i === mobileDay ? "mobile-selected" : ""} ${i > 4 ? "weekend" : ""}`}
                onDoubleClick={(e) => {
                  if ((e.target as HTMLElement).closest(".time-block")) return;
                  const y =
                    e.clientY - e.currentTarget.getBoundingClientRect().top;
                  onCreate(
                    date,
                    Math.max(
                      from,
                      Math.min(to - 15, snap(from + (y * 60) / scale)),
                    ),
                  );
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "copy";
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  const wt = e.dataTransfer.getData("text/weekflow-task");
                  if (wt)
                    onCreate(
                      date,
                      Math.min(
                        to - 60,
                        snap(
                          from +
                            ((e.clientY -
                              e.currentTarget.getBoundingClientRect().top) *
                              60) /
                              scale,
                        ),
                      ),
                      wt,
                    );
                }}
              >
                <button
                  className="grid-access"
                  onClick={() => onCreate(date, 540)}
                  aria-label={`${date} 일정 추가`}
                >
                  + 일정 추가
                </button>
                {a.focus.map(([s, e], n) => {
                  const geometry = clippedGeometry(s, e, from, to, scale);
                  return (
                    geometry && (
                      <div key={n} className="focus-window" style={geometry} />
                    )
                  );
                })}
                {slices.map(({ b, interval }) => {
                  const [s, e] = interval!;
                  const lane = lanes.get(b.id)!;
                  const geometry = clippedGeometry(s, e, from, to, scale);
                  if (!geometry) return null;
                  const collision = slices.some(
                    (x) =>
                      x.b.id !== b.id &&
                      x.interval &&
                      s < x.interval[1] &&
                      e > x.interval[0],
                  );
                  return (
                    <div
                      key={b.id}
                      className={`time-block ${geometry.height < 20 ? "compact-block" : geometry.height < 54 ? "short-block" : ""} ${b.kind} ${b.state === "done" ? "block-done" : ""} ${collision ? "has-overlap" : ""} ${drag?.block.id === b.id && drag.moved ? "drag-source" : ""}`}
                      style={{
                        ...geometry,
                        backgroundColor: colorOf(data, b),
                        color: categoryText(colorOf(data, b)),
                        left:
                          lane.count > 1
                            ? `calc(${(lane.lane / lane.count) * 100}% + 4px)`
                            : undefined,
                        right: lane.count > 1 ? "auto" : undefined,
                        width:
                          lane.count > 1
                            ? `calc(${100 / lane.count}% - 8px)`
                            : undefined,
                      }}
                      onPointerDown={(ev) => begin(ev, b, "move")}
                      onClick={(ev) => {
                        if (
                          (ev as unknown as { pointerType?: string })
                            .pointerType === "touch" ||
                          window.matchMedia("(max-width:767px)").matches
                        )
                          onEdit(b);
                      }}
                    >
                      <button
                        className="block-content"
                        onClick={(ev) => {
                          if (ev.detail === 0) onEdit(b);
                        }}
                        data-tooltip={`${titleOf(data, b)} · ${timeLabel(s)}–${timeLabel(e)}${collision ? " · 일정 겹침" : ""}`}
                        aria-labelledby={`${geometry.height >= 54 ? `time-${date}-${b.id} ` : ""}title-${date}-${b.id}${collision ? ` overlap-${date}-${b.id}` : ""}`}
                        aria-description={`${timeLabel(s)} ${b.state === "done" ? "✓ " : ""}${titleOf(data, b)} · ${timeLabel(s)}–${timeLabel(e)} ${b.state === "done" ? "완료" : ""} ${collision ? "일정 겹침" : ""}`}
                      >
                        <span className="compact-marker" aria-hidden="true">
                          {b.state === "done" ? "✓" : "•"}
                        </span>
                        <span
                          className="block-time"
                          id={`time-${date}-${b.id}`}
                        >
                          {timeLabel(s)}
                          {b.state === "done" && <Check size={11} />}
                        </span>{" "}
                        <span
                          className="block-title"
                          id={`title-${date}-${b.id}`}
                        >
                          {b.state === "done" ? "✓ " : ""}
                          {titleOf(data, b)}
                        </span>
                        {collision && (
                          <span
                            className="overlap-label"
                            id={`overlap-${date}-${b.id}`}
                          >
                            겹침
                          </span>
                        )}
                      </button>
                      <span
                        className="resize-handle top"
                        onPointerDown={(ev) => begin(ev, b, "start")}
                        data-tooltip="시작 시간 조절"
                      />
                      <span
                        className="resize-handle bottom"
                        onPointerDown={(ev) => begin(ev, b, "end")}
                        data-tooltip="종료 시간 조절"
                      >
                        <GripHorizontal size={13} />
                      </span>
                    </div>
                  );
                })}
                {drag?.moved &&
                  (() => {
                    const slice = blockSlice(
                      {
                        ...drag.block,
                        start_at: toUTC(drag.date, drag.start, zone),
                        end_at: toUTC(drag.date, drag.end, zone),
                      },
                      date,
                      zone,
                    );
                    const geometry =
                      slice &&
                      clippedGeometry(slice[0], slice[1], from, to, scale);
                    return (
                      geometry && (
                        <div className="drag-preview" style={geometry}>
                          {timeLabel(drag.start)}–{timeLabel(drag.end)}
                        </div>
                      )
                    );
                  })()}
              </div>
            );
          })}
        </div>
      </div>
      <div className="calendar-hint">
        <span>
          <i className="hint-dash" /> 집중 가능 시간
        </span>
        <span>15분 단위 · 빈 시간을 두 번 눌러 추가</span>
      </div>
      {(outsideOpen || listOpen) && (
        <Modal
          title={listOpen ? "이번 주 일정 목록" : "표시 범위 밖 일정"}
          onClose={() => {
            setOutsideOpen(false);
            setListOpen(false);
          }}
        >
          <p className="helper-text">
            {listOpen
              ? "짧은 일정도 목록에서 편하게 확인하세요."
              : `현재 ${timeLabel(from)}–${timeLabel(to)} 밖에 걸친 일정이에요.`}{" "}
            시간을 이동하거나 상세 내용을 열 수 있어요.
          </p>
          {(listOpen ? weekBlocks : outside).map((b) => (
            <div key={b.id} className="outside-row">
              <div>
                <b>{titleOf(data, b)}</b>{" "}
                <small>
                  {b.state === "done"
                    ? "완료"
                    : b.state === "skipped"
                      ? "건너뜀"
                      : "계획"}
                </small>
                <p>
                  {formatInTimeZone(b.start_at, zone, "M/d HH:mm")}–
                  {formatInTimeZone(b.end_at, zone, "M/d HH:mm")}
                </p>
              </div>
              <button
                onClick={async () => {
                  const date = days.find((date) => blockSlice(b, date, zone))!;
                  setRange(rangeAround(blockSlice(b, date, zone)![0]));
                  setMode("fit");
                  onDayChange(days.indexOf(date));
                  setOutsideOpen(false);
                  setListOpen(false);
                }}
              >
                이 시간 보기
              </button>
              <button
                onClick={async () => {
                  setOutsideOpen(false);
                  setListOpen(false);
                  onEdit(b);
                }}
              >
                편집
              </button>
            </div>
          ))}
        </Modal>
      )}
    </div>
  );
}
