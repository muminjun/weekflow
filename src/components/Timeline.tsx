import { useRef, useState } from "react";
import { Check, GripHorizontal } from "lucide-react";
import { formatInTimeZone } from "date-fns-tz";
import type { Block, Change, Dataset } from "../domain/types";
import {
  localMinute,
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
interface Props {
  data: Dataset;
  days: string[];
  mobileDay: number;
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
}
export function Timeline({
  data,
  days,
  mobileDay,
  holidayNames,
  holidayKnown,
  onEdit,
  onCreate,
  commit,
}: Props) {
  const dragRef = useRef<Drag | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const {
    timezone: zone,
    pixels_per_hour: scale,
    display_start_minute: from,
    display_end_minute: to,
  } = data.profile;
  const height = ((to - from) * scale) / 60;
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
      !window.confirm(
        `다음 일정과 겹칩니다:\n${overlaps.map((b) => `${titleOf(data, b)} · ${formatInTimeZone(b.start_at, zone, "MM.dd HH:mm")}–${formatInTimeZone(b.end_at, zone, "HH:mm")}`).join("\n")}\n겹쳐서 배치할까요?`,
      )
    )
      return;
    const focus = availability(data, d.date, holidayNames.has(d.date)).focus;
    if (
      !focus.some(([s, e]) => d.start >= s && d.end <= e) &&
      !window.confirm("집중 가능 시간 밖입니다. 그래도 배치할까요?")
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
      date = el?.dataset.day ?? d.date;
      start = Math.max(from, Math.min(to - duration, snap(start + delta)));
      end = start + duration;
    } else if (d.mode === "start")
      start = Math.max(from, Math.min(end - 15, snap(start + delta)));
    else end = Math.max(start + 15, Math.min(to, snap(end + delta)));
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
    <div className="calendar">
      <div className="day-headers">
        <div className="axis-label">TIME</div>
        {days.map((date, i) => {
          const a = availability(data, date, holidayNames.has(date));
          return (
            <div
              key={date}
              className={`day-header day-${i} ${i === mobileDay ? "mobile-selected" : ""} ${date === today(zone) ? "is-today" : ""} ${holidayNames.has(date) || i === 6 ? "holiday" : i === 5 ? "saturday" : ""}`}
            >
              <span className="day-name">
                {["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"][i]}
              </span>
              <div className="date-line">
                <strong>{date.slice(-2)}</strong>
                {date === today(zone) && (
                  <span className="today-label">TODAY</span>
                )}
              </div>
              <button
                className="available-tag"
                title={`집중 가능 ${a.focusMinutes / 60}시간 / 아직 빈 시간 ${a.freeMinutes / 60}시간`}
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
      <div
        className="timeline-grid"
        style={{ height, "--hour-height": `${scale}px` } as React.CSSProperties}
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
              {timeLabel(from + i * 60).slice(0, 2)}
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
                onCreate(date, snap(from + (y * 60) / scale));
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
              {a.focus.map(([s, e], n) => (
                <div
                  key={n}
                  className="focus-window"
                  style={{
                    top: ((Math.max(s, from) - from) * scale) / 60,
                    height:
                      ((Math.min(e, to) - Math.max(s, from)) * scale) / 60,
                  }}
                />
              ))}
              {slices.map(({ b, interval }) => {
                const [s, e] = interval!;
                const lane = lanes.get(b.id)!;
                if (e <= from || s >= to) return null;
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
                    className={`time-block ${b.kind} ${b.state === "done" ? "block-done" : ""} ${collision ? "has-overlap" : ""} ${drag?.block.id === b.id && drag.moved ? "drag-source" : ""}`}
                    style={{
                      top: ((Math.max(s, from) - from) * scale) / 60 + 2,
                      height: Math.max(
                        14,
                        ((Math.min(e, to) - Math.max(s, from)) * scale) / 60 -
                          4,
                      ),
                      backgroundColor: colorOf(data, b),
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
                      onKeyDown={(ev) => {
                        if (ev.key === "Enter") onEdit(b);
                      }}
                      aria-description={`${timeLabel(s)} ${b.state === "done" ? "✓ " : ""}${titleOf(data, b)} · ${timeLabel(s)}–${timeLabel(e)} ${b.state === "done" ? "완료" : ""} ${collision ? "일정 겹침" : ""}`}
                    >
                      <span className="block-time">
                        {timeLabel(s)}
                        {b.state === "done" && <Check size={11} />}
                      </span>
                      <span className="block-title">
                        {b.state === "done" ? "✓ " : ""}
                        {titleOf(data, b)}
                      </span>
                      {collision && <span className="overlap-label">겹침</span>}
                    </button>
                    <span
                      className="resize-handle top"
                      onPointerDown={(ev) => begin(ev, b, "start")}
                      title="시작 시간 조절"
                    />
                    <span
                      className="resize-handle bottom"
                      onPointerDown={(ev) => begin(ev, b, "end")}
                      title="종료 시간 조절"
                    >
                      <GripHorizontal size={13} />
                    </span>
                  </div>
                );
              })}
              {drag?.moved && drag.date === date && (
                <div
                  className="drag-preview"
                  style={{
                    top: ((drag.start - from) * scale) / 60,
                    height: ((drag.end - drag.start) * scale) / 60,
                  }}
                >
                  {timeLabel(drag.start)}–{timeLabel(drag.end)}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className="calendar-hint">
        <span className="hint-dash" />
        점선은 집중 가능한 시간 · 빈 칸을 두 번 눌러 일정 추가
        <span>15 MIN SNAP</span>
      </div>
    </div>
  );
}
