import { useState } from "react";
import type { Change, Dataset, Rule } from "../domain/types";
import { addDays, timeLabel, today } from "../domain/planner";
import { uuid } from "../data/demo";
import { CategorySelect, type Commit } from "./Editors";
export function RepeatRuleEditor({
  data,
  rule,
  commit,
  onClose,
}: {
  data: Dataset;
  rule: Rule;
  commit: Commit;
  onClose: () => void;
}) {
  const [error, setError] = useState("");
  const fromDate = [today(data.profile.timezone), rule.starts_on]
    .sort()
    .at(-1)!;
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        try {
          const f = new FormData(e.currentTarget),
            from = String(f.get("from")),
            id = uuid(),
            weekdays = f.getAll("days").map(Number),
            ends = String(f.get("ends")) || null;
          if (!weekdays.length || from < fromDate || (ends && ends < from))
            throw Error("시작일·종료일·반복 요일을 확인하세요.");
          const time = String(f.get("start") ?? "09:00")
              .split(":")
              .map(Number),
            startMinute = time[0] * 60 + time[1],
            duration = Number(f.get("duration") ?? 60);
          if (
            startMinute % 15 ||
            duration % 15 ||
            duration < 15 ||
            duration > 10080
          )
            throw Error("시간은 15분 단위로 입력하세요.");
          const template = {
            ...rule.template,
            title: String(f.get("title")).trim(),
            description: String(f.get("description") ?? ""),
            category_id: String(f.get("category_id")) || null,
            ...(rule.kind === "event"
              ? { startMinute, duration }
              : { estimate_minutes: duration }),
          };
          const changes: Change[] = [
            {
              table: "recurrence_rules",
              action: "update",
              row: {
                id: rule.id,
                ...(from <= rule.starts_on
                  ? { is_active: false }
                  : { ends_on: addDays(from, -1) }),
              },
              expected_version: rule.version,
            },
            {
              table: "recurrence_rules",
              action: "insert",
              row: {
                id,
                parent_rule_id: rule.id,
                kind: rule.kind,
                frequency: "weekly",
                starts_on: from,
                ends_on: ends,
                template,
                weekdays,
                skip_public_holidays: f.has("skip"),
                timezone: rule.timezone,
                is_active: true,
              },
            },
          ];
          for (const o of data.recurrence_occurrences.filter(
            (o) =>
              o.rule_id === rule.id &&
              o.local_date >= from &&
              o.state === "generated",
          )) {
            const task = data.tasks.find((t) => t.id === o.task_id),
              block = data.time_blocks.find((b) => b.id === o.time_block_id);
            const weeks = data.week_tasks
              .filter((w) => w.task_id === task?.id)
              .map((w) => w.id);
            const performed = data.time_blocks.some(
              (b) => weeks.includes(b.week_task_id ?? "") && b.state === "done",
            );
            if (
              (task?.state === "open" && !performed) ||
              block?.state === "planned"
            ) {
              changes.push({
                table: "recurrence_occurrences",
                action: "update",
                row: {
                  id: o.id,
                  overrides: { ...o.overrides, superseded: true },
                },
                expected_version: o.version,
              });
              if (task)
                changes.push({
                  table: "tasks",
                  action: "delete",
                  row: { id: task.id },
                  expected_version: task.version,
                });
              if (block)
                changes.push({
                  table: "time_blocks",
                  action: "delete",
                  row: { id: block.id },
                  expected_version: block.version,
                });
            }
          }
          void commit(changes, true)
            .then(onClose)
            .catch((e) => setError(String(e)));
        } catch (e) {
          setError(String(e));
        }
      }}
    >
      <h3>이 날짜 이후 모두 수정</h3>
      <p className="small muted">
        완료·수동 예외·취소된 날짜는 유지하고, 아직 수행하지 않은 회차에 새
        규칙을 적용합니다.
      </p>
      <div className="form-pair">
        <label>
          변경 시작일
          <input
            name="from"
            type="date"
            min={fromDate}
            defaultValue={fromDate}
            required
          />
        </label>
        <label>
          반복 종료일
          <input name="ends" type="date" defaultValue={rule.ends_on ?? ""} />
        </label>
      </div>
      <label>
        제목
        <input
          name="title"
          maxLength={240}
          defaultValue={String(rule.template.title)}
          required
        />
      </label>
      <label>
        메모
        <textarea
          name="description"
          defaultValue={String(rule.template.description ?? "")}
        />
      </label>
      <CategorySelect
        data={data}
        value={
          typeof rule.template.category_id === "string"
            ? rule.template.category_id
            : null
        }
      />
      <div className="form-pair">
        {rule.kind === "event" && (
          <label>
            시작 시간
            <input
              name="start"
              type="time"
              step={900}
              defaultValue={timeLabel(Number(rule.template.startMinute ?? 540))}
            />
          </label>
        )}
        <label>
          {rule.kind === "event" ? "블록 길이" : "예상 소요"} (분)
          <input
            name="duration"
            type="number"
            min={15}
            max={10080}
            step={15}
            defaultValue={Number(
              rule.template.duration ?? rule.template.estimate_minutes ?? 60,
            )}
          />
        </label>
      </div>
      <div className="weekday-checks">
        {["월", "화", "수", "목", "금", "토", "일"].map((d, i) => (
          <label key={d}>
            <input
              name="days"
              type="checkbox"
              value={i + 1}
              defaultChecked={rule.weekdays.includes(i + 1)}
            />
            {d}
          </label>
        ))}
      </div>
      <label className="check-label">
        <input
          type="checkbox"
          name="skip"
          defaultChecked={rule.skip_public_holidays}
        />
        공휴일 제외
      </label>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <div className="form-actions">
        <button type="button" onClick={onClose}>
          취소
        </button>
        <button className="primary">이후 회차에 적용</button>
      </div>
    </form>
  );
}
