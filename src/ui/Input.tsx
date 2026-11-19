import * as Popover from "@radix-ui/react-popover";
import {
  useState,
  useRef,
  useEffect,
  type InputHTMLAttributes,
  type ChangeEvent,
} from "react";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Check,
  Palette,
  Minus,
  Plus,
  Upload,
} from "lucide-react";
import {
  addDays,
  addMonths,
  format,
  isValid,
  parseISO,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { Select } from "./Select";
type Props = InputHTMLAttributes<HTMLInputElement> & { compact?: boolean };
const normalizeTime = (value: unknown) =>
  String(value ?? "").replace(/^(\d{2}:\d{2}):00(?:\.0+)?$/, "$1");
const palette = [
  "#F1C9B9",
  "#DBE8BD",
  "#CBDDEA",
  "#E5D7EB",
  "#EADFBD",
  "#DFE0DC",
  "#3182F6",
  "#087D68",
  "#EF6B73",
  "#9768D1",
  "#F0A644",
  "#465368",
];
function dateValid(value: string) {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    isValid(parseISO(value)) &&
    format(parseISO(value), "yyyy-MM-dd") === value
  );
}
export function Input({ type = "text", compact = false, ...props }: Props) {
  if (["date", "time", "color"].includes(type))
    return <PickerInput type={type} compact={compact} {...props} />;
  if (type === "number") return <NumberInput {...props} />;
  if (type === "file") return <FileInput {...props} />;
  return <input {...props} type={type} />;
}
function FileInput(props: InputHTMLAttributes<HTMLInputElement>) {
  const ref = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState("파일을 선택해 주세요");
  return (
    <span className="file-control">
      <input
        {...props}
        type="file"
        ref={ref}
        className="file-native"
        onChange={(e) => {
          setFile(e.target.files?.[0]?.name ?? "파일을 선택해 주세요");
          props.onChange?.(e);
        }}
      />
      <button type="button" onClick={() => ref.current?.click()}>
        <Upload size={18} />
        파일 선택
      </button>
      <span>{file}</span>
    </span>
  );
}
function NumberInput(props: InputHTMLAttributes<HTMLInputElement>) {
  const ref = useRef<HTMLInputElement>(null);
  const [internal, setInternal] = useState(String(props.defaultValue ?? ""));
  const current = String(props.value ?? internal);
  useEffect(() => {
    const form = ref.current?.form;
    const reset = () =>
      queueMicrotask(() => setInternal(ref.current?.value ?? ""));
    form?.addEventListener("reset", reset);
    return () => form?.removeEventListener("reset", reset);
  }, []);
  const step = (up: boolean) => {
    const el = ref.current!;
    if (up) el.stepUp();
    else el.stepDown();
    setInternal(el.value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    props.onChange?.({
      target: el,
      currentTarget: el,
    } as ChangeEvent<HTMLInputElement>);
  };
  return (
    <span className="number-field">
      <input
        {...props}
        type="number"
        ref={ref}
        onChange={(e) => {
          setInternal(e.target.value);
          props.onChange?.(e);
        }}
      />
      <span className="number-actions">
        <button
          type="button"
          aria-label="값 줄이기"
          disabled={
            props.disabled ||
            props.readOnly ||
            (props.min !== undefined &&
              current !== "" &&
              Number(current) <= Number(props.min))
          }
          onClick={() => step(false)}
        >
          <Minus size={16} />
        </button>
        <button
          type="button"
          aria-label="값 늘리기"
          disabled={
            props.disabled ||
            props.readOnly ||
            (props.max !== undefined &&
              current !== "" &&
              Number(current) >= Number(props.max))
          }
          onClick={() => step(true)}
        >
          <Plus size={16} />
        </button>
      </span>
    </span>
  );
}
function PickerInput({ type, compact, ...props }: Props) {
  const ref = useRef<HTMLInputElement>(null);
  const [internal, setInternal] = useState(
    type === "time"
      ? normalizeTime(props.defaultValue)
      : String(props.defaultValue ?? ""),
  );
  const current =
    props.value === undefined
      ? internal
      : type === "time"
        ? normalizeTime(props.value)
        : String(props.value ?? "");
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(() =>
    dateValid(current)
      ? startOfMonth(parseISO(current))
      : startOfMonth(new Date()),
  );
  const check = (value: string) => {
    if (!value) return "";
    if (type === "date")
      return !dateValid(value)
        ? "YYYY-MM-DD 형식의 올바른 날짜를 입력해 주세요."
        : props.min && value < String(props.min)
          ? `${props.min} 이후 날짜를 선택해 주세요.`
          : props.max && value > String(props.max)
            ? `${props.max} 이전 날짜를 선택해 주세요.`
            : "";
    if (type === "time") {
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value))
        return "HH:mm 형식의 시간을 입력해 주세요.";
      const [h, m] = value.split(":").map(Number);
      return props.step &&
        props.step !== "any" &&
        (h * 3600 + m * 60) % Number(props.step)
        ? `${Number(props.step) / 60}분 단위로 입력해 주세요.`
        : props.min && value < String(props.min)
          ? `${props.min} 이후 시간을 선택해 주세요.`
          : props.max && value > String(props.max)
            ? `${props.max} 이전 시간을 선택해 주세요.`
            : "";
    }
    return /^#[\da-f]{6}$/i.test(value)
      ? ""
      : "#RRGGBB 형식의 색상을 입력해 주세요.";
  };
  useEffect(() => {
    ref.current?.setCustomValidity(check(current));
  });
  useEffect(() => {
    const form = ref.current?.form;
    const reset = () =>
      queueMicrotask(() => {
        const value =
          type === "time"
            ? normalizeTime(props.defaultValue)
            : String(props.defaultValue ?? "");
        setInternal(value);
        if (ref.current) ref.current.value = value;
      });
    form?.addEventListener("reset", reset);
    return () => form?.removeEventListener("reset", reset);
  }, [props.defaultValue, type]);
  function update(value: string) {
    const el = ref.current!;
    // Go through the native setter and a real input event so React's onChange,
    // form feedback listeners and dirty-form guards all see picker choices.
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )!.set!.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }
  const label =
    type === "date" ? "날짜 선택" : type === "time" ? "시간 선택" : "색상 선택";
  const dateStart = startOfWeek(startOfMonth(month), { weekStartsOn: 1 });
  const [rawHour, rawMinute] = current.split(":");
  const hour = rawHour || "09",
    minute = rawMinute || "00";
  const minutes = [0, 15, 30, 45];
  return (
    <Popover.Root
      open={open}
      onOpenChange={(value) => {
        setOpen(value);
        if (value && type === "date")
          setMonth(
            startOfMonth(dateValid(current) ? parseISO(current) : new Date()),
          );
      }}
    >
      <span
        className={`picker-input ${type}-field ${compact ? "date-picker picker-compact" : ""}`}
      >
        <input
          {...props}
          ref={ref}
          type="text"
          inputMode={type === "time" ? "numeric" : undefined}
          value={current}
          defaultValue={undefined}
          className={compact ? "sr-only" : props.className}
          aria-hidden={compact || undefined}
          tabIndex={compact ? -1 : props.tabIndex}
          placeholder={
            props.placeholder ??
            (type === "date"
              ? "YYYY-MM-DD"
              : type === "time"
                ? "HH:mm"
                : "#RRGGBB")
          }
          onChange={(e) => {
            setInternal(e.target.value);
            e.target.setCustomValidity(check(e.target.value));
            props.onChange?.(e);
          }}
          onBlur={(e) => {
            // The numeric keypad has no ":", so "930" or "0930" means 09:30.
            const digits = /^(\d{1,2})(\d{2})$/.exec(e.target.value.trim());
            if (type === "time" && digits)
              update(`${digits[1].padStart(2, "0")}:${digits[2]}`);
            props.onBlur?.(e);
          }}
        />
        <Popover.Trigger asChild>
          <button
            type="button"
            className="picker-trigger"
            disabled={props.disabled || props.readOnly}
            aria-label={compact ? props["aria-label"] : label}
            data-tooltip={label}
          >
            {type === "date" ? (
              <CalendarDays size={19} />
            ) : type === "time" ? (
              <Clock3 size={19} />
            ) : (
              <span
                className="color-preview"
                style={{ background: current || palette[0] }}
              >
                <Palette size={16} />
              </span>
            )}
          </button>
        </Popover.Trigger>
      </span>
      {open && (
        <Popover.Portal>
          <Popover.Content
            className={`control-popover ${type}-popover`}
            sideOffset={8}
            collisionPadding={6}
            aria-label={label}
            onOpenAutoFocus={(e) => {
              if (type === "date") {
                e.preventDefault();
                requestAnimationFrame(() =>
                  document
                    .querySelector<HTMLButtonElement>(
                      '.calendar-days [data-selected="true"]:not(:disabled),.calendar-days button:not(:disabled)',
                    )
                    ?.focus(),
                );
              }
            }}
          >
            {type === "date" ? (
              <>
                <div className="calendar-month">
                  <Select
                    aria-label="연도 선택"
                    value={month.getFullYear()}
                    onChange={(e) =>
                      setMonth(
                        new Date(Number(e.target.value), month.getMonth(), 1),
                      )
                    }
                  >
                    {Array.from({ length: 201 }, (_, i) => 1970 + i).map(
                      (y) => (
                        <option key={y} value={y}>
                          {y}년
                        </option>
                      ),
                    )}
                  </Select>
                  <Select
                    aria-label="월 선택"
                    value={month.getMonth()}
                    onChange={(e) =>
                      setMonth(
                        new Date(
                          month.getFullYear(),
                          Number(e.target.value),
                          1,
                        ),
                      )
                    }
                  >
                    {Array.from({ length: 12 }, (_, i) => (
                      <option key={i} value={i}>
                        {i + 1}월
                      </option>
                    ))}
                  </Select>
                  <button
                    type="button"
                    className="icon-button"
                    aria-label="이전 달"
                    onClick={() => setMonth(addMonths(month, -1))}
                  >
                    <ChevronLeft size={19} />
                  </button>
                  <button
                    type="button"
                    className="icon-button"
                    aria-label="다음 달"
                    onClick={() => setMonth(addMonths(month, 1))}
                  >
                    <ChevronRight size={19} />
                  </button>
                </div>
                <div className="calendar-weekdays" aria-hidden="true">
                  {["월", "화", "수", "목", "금", "토", "일"].map((d) => (
                    <span key={d}>{d}</span>
                  ))}
                </div>
                <div
                  className="calendar-days"
                  role="group"
                  aria-label={format(month, "yyyy년 M월")}
                >
                  {Array.from({ length: 42 }, (_, i) => {
                    const date = addDays(dateStart, i),
                      value = format(date, "yyyy-MM-dd");
                    const disabled = !!(
                      (props.min && value < String(props.min)) ||
                      (props.max && value > String(props.max))
                    );
                    return (
                      <button
                        key={value}
                        type="button"
                        disabled={disabled}
                        aria-label={format(date, "yyyy년 M월 d일")}
                        aria-pressed={value === current}
                        data-selected={value === current}
                        data-other={date.getMonth() !== month.getMonth()}
                        data-today={value === format(new Date(), "yyyy-MM-dd")}
                        onKeyDown={(e) => {
                          const delta = {
                            ArrowLeft: -1,
                            ArrowRight: 1,
                            ArrowUp: -7,
                            ArrowDown: 7,
                            Home: -((date.getDay() + 6) % 7),
                            End: 6 - ((date.getDay() + 6) % 7),
                          }[e.key];
                          if (delta !== undefined) {
                            e.preventDefault();
                            const next = addDays(date, delta);
                            setMonth(startOfMonth(next));
                            requestAnimationFrame(() =>
                              document
                                .querySelector<HTMLButtonElement>(
                                  `.calendar-days button[aria-label="${format(next, "yyyy년 M월 d일")}"]`,
                                )
                                ?.focus(),
                            );
                          }
                          if (e.key === "PageUp" || e.key === "PageDown") {
                            e.preventDefault();
                            setMonth(
                              addMonths(month, e.key === "PageUp" ? -1 : 1),
                            );
                          }
                        }}
                        onClick={() => {
                          update(value);
                          setOpen(false);
                        }}
                      >
                        {date.getDate()}
                      </button>
                    );
                  })}
                </div>
                <div className="picker-footer">
                  {!props.required && !compact && (
                    <button
                      type="button"
                      onClick={() => {
                        update("");
                        setOpen(false);
                      }}
                    >
                      날짜 지우기
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      const today = format(new Date(), "yyyy-MM-dd");
                      update(today);
                      setMonth(startOfMonth(new Date()));
                      setOpen(false);
                    }}
                    disabled={
                      !!(
                        (props.min &&
                          format(new Date(), "yyyy-MM-dd") <
                            String(props.min)) ||
                        (props.max &&
                          format(new Date(), "yyyy-MM-dd") > String(props.max))
                      )
                    }
                  >
                    오늘
                  </button>
                </div>
              </>
            ) : type === "time" ? (
              <>
                <div className="picker-title">
                  <b>시간 선택</b>
                  <strong>{current || "09:00"}</strong>
                </div>
                <p className="field-label">시</p>
                <div className="hour-options">
                  {Array.from({ length: 24 }, (_, i) =>
                    String(i).padStart(2, "0"),
                  ).map((h) => (
                    <button
                      type="button"
                      key={h}
                      aria-pressed={h === hour}
                      onClick={() => update(`${h}:${minute}`)}
                    >
                      {h}
                    </button>
                  ))}
                </div>
                <p className="field-label">분</p>
                <div className="minute-options">
                  {minutes
                    .map((m) => String(m).padStart(2, "0"))
                    .map((m) => (
                      <button
                        type="button"
                        key={m}
                        aria-pressed={m === minute}
                        onClick={() => update(`${hour}:${m}`)}
                      >
                        {m}
                      </button>
                    ))}
                </div>
                <div className="picker-footer">
                  {!props.required && (
                    <button
                      type="button"
                      onClick={() => {
                        update("");
                        setOpen(false);
                      }}
                    >
                      시간 지우기
                    </button>
                  )}
                  <button
                    type="button"
                    className="primary"
                    onClick={() => {
                      if (!current) update("09:00");
                      setOpen(false);
                    }}
                  >
                    적용
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="picker-title">
                  <b>카테고리 색상</b>
                  <strong>{current}</strong>
                </div>
                <div className="color-options">
                  {palette.map((c) => (
                    <button
                      key={c}
                      type="button"
                      aria-label={c}
                      aria-pressed={current.toLowerCase() === c.toLowerCase()}
                      style={{ background: c, color: "#182230" }}
                      onClick={() => {
                        update(c);
                        setOpen(false);
                      }}
                    >
                      {current.toLowerCase() === c.toLowerCase() && (
                        <Check size={20} />
                      )}
                    </button>
                  ))}
                </div>
                <p className="helper-text">
                  직접 입력하면 원하는 HEX 색상도 사용할 수 있어요.
                </p>
              </>
            )}
          </Popover.Content>
        </Popover.Portal>
      )}
    </Popover.Root>
  );
}
