import { z } from "zod";
import type { Dataset } from "./types";
import { csvCell } from "./planner";
const id = z.uuid(),
  date = z.iso.date(),
  timestamp = z.iso.datetime({ offset: true });
const base = z.object({
  id,
  user_id: id,
  version: z.number().int().positive(),
});
const title = z.string().trim().min(1).max(240);
const backupSchema = z
  .object({
    schemaVersion: z.literal(1),
    app: z.literal("WEEKFLOW"),
    exportedAt: timestamp,
    timezone: z.string().refine((t) => {
      try {
        new Intl.DateTimeFormat("ko", { timeZone: t });
        return true;
      } catch {
        return false;
      }
    }),
    data: z
      .object({
        profile: z
          .object({
            id,
            timezone: z.string(),
            pixels_per_hour: z.number().min(32).max(160),
            display_start_minute: z.number().min(0).max(1439),
            display_end_minute: z.number().min(1).max(1440),
            onboarding_completed: z.boolean(),
            version: z.number().positive(),
          })
          .passthrough(),
        categories: z.array(
          base
            .extend({
              name: z.string().min(1).max(60),
              color: z.string().regex(/^#[0-9a-f]{6}$/i),
              sort_order: z.number(),
            })
            .passthrough(),
        ),
        tasks: z.array(
          base
            .extend({
              title,
              description: z.string(),
              category_id: id.nullable(),
              due_on: date.nullable(),
              estimate_minutes: z
                .number()
                .int()
                .multipleOf(15)
                .min(15)
                .max(10080)
                .nullable(),
              state: z.enum(["open", "done", "archived"]),
              completed_at: timestamp.nullable(),
            })
            .passthrough(),
        ),
        week_tasks: z.array(
          base
            .extend({
              task_id: id,
              week_start: date,
              state: z.enum(["open", "done", "carried", "skipped"]),
              completed_at: timestamp.nullable(),
              sort_order: z.number(),
            })
            .passthrough(),
        ),
        week_task_day_marks: z.array(
          base
            .extend({
              week_task_id: id,
              local_date: date,
              mark: z.enum(["planned", "done"]),
            })
            .passthrough(),
        ),
        goals: z.array(
          base
            .extend({
              week_start: date,
              title,
              note: z.string(),
              sort_order: z.number(),
            })
            .passthrough(),
        ),
        goal_week_tasks: z.array(
          z
            .object({ user_id: id, goal_id: id, week_task_id: id })
            .passthrough(),
        ),
        time_blocks: z.array(
          base
            .extend({
              kind: z.enum(["task", "event"]),
              week_task_id: id.nullable(),
              event_title: z.string().nullable(),
              start_at: timestamp,
              end_at: timestamp,
              local_date: date,
              state: z.enum(["planned", "done", "skipped"]),
            })
            .passthrough(),
        ),
        availability_rules: z.array(
          base
            .extend({
              weekday: z.number().int().min(1).max(7),
              start_minute: z.number().min(0).max(1439),
              end_minute: z.number().min(1).max(1440),
            })
            .passthrough(),
        ),
        availability_overrides: z.array(
          base
            .extend({
              local_date: date,
              mode: z.enum(["closed", "replace"]),
              windows: z.array(
                z.object({
                  startMinute: z.number().min(0).max(1439),
                  endMinute: z.number().min(1).max(1440),
                }),
              ),
            })
            .passthrough(),
        ),
        recurrence_rules: z.array(
          base
            .extend({
              kind: z.enum(["event", "task"]),
              frequency: z.enum(["daily", "weekly"]),
              starts_on: date,
              ends_on: date.nullable(),
              weekdays: z.array(z.number().int().min(1).max(7)),
              template: z.record(z.string(), z.unknown()),
              timezone: z.string(),
              skip_public_holidays: z.boolean(),
              is_active: z.boolean(),
            })
            .passthrough(),
        ),
        recurrence_occurrences: z.array(
          base
            .extend({
              rule_id: id,
              local_date: date,
              state: z.enum(["generated", "exception", "cancelled"]),
              task_id: id.nullable(),
              time_block_id: id.nullable(),
              overrides: z.record(z.string(), z.unknown()),
            })
            .passthrough(),
        ),
        week_reviews: z.array(
          base
            .extend({
              week_start: date,
              did_well: z.string(),
              could_improve: z.string(),
              next_week_action: z.string(),
              finalized_at: timestamp.nullable(),
              stats_snapshot: z.unknown().nullable(),
            })
            .passthrough(),
        ),
        // Added with migration 015; older backups omit both keys.
        block_sessions: z
          .array(
            base
              .extend({
                block_id: id,
                started_at: timestamp,
                ended_at: timestamp.nullable(),
                note: z.string().max(1000),
              })
              .passthrough(),
          )
          .default([]),
        week_templates: z
          .array(
            base
              .extend({
                name: z.string().trim().min(1).max(80),
                blocks: z
                  .array(
                    z
                      .object({
                        weekday: z.number().int().min(1).max(7),
                        start_minute: z
                          .number()
                          .int()
                          .min(0)
                          .max(1425)
                          .multipleOf(15),
                        duration: z
                          .number()
                          .int()
                          .min(15)
                          .max(1440)
                          .multipleOf(15),
                        kind: z.enum(["event", "task"]),
                        title,
                        category_id: id.nullable(),
                        note: z.string().max(1000),
                      })
                      .strict(),
                  )
                  .max(200),
                goals: z.array(z.string().max(240)).max(20),
              })
              .passthrough(),
          )
          .max(30)
          .default([]),
        notification_preferences: z
          .object({
            user_id: id,
            enabled: z.boolean(),
            event_reminder_minutes: z.number().int().min(0).max(1440),
            version: z.number().positive(),
          })
          .passthrough(),
      })
      .strict(),
  })
  .strict();
export type Backup = z.infer<typeof backupSchema>;
export function exportBackup(d: Dataset) {
  const { in_app_notifications: excluded, ...data } = d;
  void excluded;
  return JSON.stringify(
    {
      schemaVersion: 1,
      app: "WEEKFLOW",
      exportedAt: new Date().toISOString(),
      timezone: d.profile.timezone,
      data,
    },
    null,
    2,
  );
}
export function parseBackup(text: string): Backup {
  if (new Blob([text]).size > 10 * 1024 * 1024)
    throw Error("파일은 최대 10MB입니다.");
  const b = backupSchema.parse(JSON.parse(text));
  const d = b.data;
  const ids = new Map<unknown, Set<string>>();
  const has = (rows: { id: string }[], id: string | null) => {
    if (id === null) return true;
    let set = ids.get(rows);
    if (!set) ids.set(rows, (set = new Set(rows.map((r) => r.id))));
    return set.has(id);
  };
  for (const t of d.tasks)
    if (!has(d.categories, t.category_id)) throw Error("잘못된 카테고리 연결");
  for (const w of d.week_tasks)
    if (!has(d.tasks, w.task_id)) throw Error("잘못된 Todo 연결");
  for (const x of d.time_blocks)
    if (!has(d.week_tasks, x.week_task_id) || x.end_at <= x.start_at)
      throw Error("잘못된 시간 블록");
  const DAY = 24 * 60 * 60 * 1000;
  let open = 0;
  for (const x of d.block_sessions) {
    if (!has(d.time_blocks, x.block_id)) throw Error("잘못된 집중 기록 연결");
    if (x.ended_at === null) open++;
    else {
      const ms = Date.parse(x.ended_at) - Date.parse(x.started_at);
      if (ms < 0 || ms > DAY) throw Error("잘못된 집중 기록 시간");
    }
  }
  if (open > 1) throw Error("진행 중인 집중 기록이 여러 개예요.");
  for (const g of d.goal_week_tasks)
    if (!has(d.goals, g.goal_id) || !has(d.week_tasks, g.week_task_id))
      throw Error("잘못된 목표 연결");
  return b;
}
export function download(
  name: string,
  text: string,
  type = "application/json",
) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function exportCSV(d: Dataset, bom = true) {
  const rows = [
    ["제목", "상태", "카테고리", "마감일", "주간 연결", "완료일"],
    ...d.tasks.map((t) => [
      t.title,
      t.state,
      d.categories.find((c) => c.id === t.category_id)?.name,
      t.due_on,
      d.week_tasks
        .filter((w) => w.task_id === t.id)
        .map((w) => w.week_start)
        .join(";"),
      t.completed_at,
    ]),
  ];
  return (
    (bom ? "\uFEFF" : "") +
    rows.map((r) => r.map(csvCell).join(",")).join("\r\n")
  );
}
