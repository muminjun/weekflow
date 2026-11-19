import { formatInTimeZone } from "date-fns-tz";
import { addDays, localMinute, toUTC } from "./planner";
import type {
  Block,
  Change,
  Dataset,
  TemplateBlock,
  WeekTemplate,
} from "./types";

/** Server limit per user (migration 015). */
export const TEMPLATE_LIMIT = 30;
export const TEMPLATE_BLOCK_LIMIT = 200;
export const TEMPLATE_GOAL_LIMIT = 20;

const floor15 = (n: number) => Math.floor(n / 15) * 15;
const ceil15 = (n: number) => Math.ceil(n / 15) * 15;
const clamp = (n: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, n));
const same = (a: string, b: string) =>
  a.trim().toLocaleLowerCase() === b.trim().toLocaleLowerCase();

/** Wall-clock length of a block in minutes (DST-safe: local minutes, not ms). */
function lengthOf(b: Pick<Block, "start_at" | "end_at">) {
  return Math.round((Date.parse(b.end_at) - Date.parse(b.start_at)) / 60000);
}

const liveCategory = (data: Dataset, id: string | null | undefined) =>
  id && data.categories.some((c) => c.id === id && !c.archived_at) ? id : null;

/**
 * A reusable template from the blocks and goals of `week`. Skipped blocks are
 * left out; times are aligned to the 15-minute grid the server requires.
 */
export function templateFromWeek(
  data: Dataset,
  week: string,
  name: string,
  newId: () => string = () => crypto.randomUUID(),
): Pick<WeekTemplate, "id" | "name" | "blocks" | "goals"> {
  const zone = data.profile.timezone;
  const end = addDays(week, 7);
  const blocks: TemplateBlock[] = [];
  for (const b of [...data.time_blocks].sort((x, y) =>
    x.start_at.localeCompare(y.start_at),
  )) {
    if (b.state === "skipped") continue;
    const date = formatInTimeZone(b.start_at, zone, "yyyy-MM-dd");
    if (date < week || date >= end) continue;
    const weekday =
      Math.round((Date.parse(date) - Date.parse(week)) / 86400000) + 1;
    const start_minute = clamp(floor15(localMinute(b.start_at, zone)), 0, 1425);
    const duration = clamp(ceil15(lengthOf(b)), 15, 1440);
    let title: string;
    let category_id: string | null;
    if (b.kind === "event") {
      title = b.event_title?.trim() || "일정";
      category_id = b.category_id;
    } else {
      const w = data.week_tasks.find((w) => w.id === b.week_task_id);
      const t = data.tasks.find((t) => t.id === w?.task_id);
      if (!t) continue;
      title = t.title.trim();
      category_id = t.category_id;
    }
    if (!title) continue;
    blocks.push({
      weekday,
      start_minute,
      duration,
      kind: b.kind,
      title: title.slice(0, 240),
      category_id: liveCategory(data, category_id),
      note: (b.event_note ?? "").slice(0, 1000),
    });
    if (blocks.length >= TEMPLATE_BLOCK_LIMIT) break;
  }
  const goals: string[] = [];
  for (const g of data.goals
    .filter((g) => g.week_start === week)
    .sort((a, b) => a.sort_order - b.sort_order)) {
    const title = g.title.trim().slice(0, 240);
    if (title && !goals.some((x) => same(x, title))) goals.push(title);
  }
  return {
    id: newId(),
    name: name.trim().slice(0, 80),
    blocks,
    goals: goals.slice(0, TEMPLATE_GOAL_LIMIT),
  };
}

export interface TemplatePlacement {
  block: TemplateBlock;
  date: string;
  start: number;
  end: number;
  /** Existing (non-skipped) blocks this placement would overlap. */
  overlaps: { id: string; title: string }[];
  /** A task block linked to an existing open Todo of that week. */
  reused: boolean;
}

/**
 * Every row applying `template` to `week` creates, in one batch so a single
 * undo reverts it. Overlaps with existing blocks are reported, never dropped.
 */
export function applyTemplate(
  data: Dataset,
  template: Pick<WeekTemplate, "blocks" | "goals">,
  week: string,
  newId: () => string,
) {
  const zone = data.profile.timezone;
  const changes: Change[] = [];
  const placements: TemplatePlacement[] = [];
  const weekTasks = data.week_tasks.filter((w) => w.week_start === week);
  const existing = data.time_blocks.filter((b) => b.state !== "skipped");
  const titleOfBlock = (b: Block) =>
    b.kind === "event"
      ? (b.event_title ?? "일정")
      : (data.tasks.find(
          (t) =>
            t.id ===
            data.week_tasks.find((w) => w.id === b.week_task_id)?.task_id,
        )?.title ?? "연결된 작업");
  // One Todo per distinct task title, shared by all its template blocks.
  const linked = new Map<string, { weekTaskId: string; reused: boolean }>();
  let sortOrder = weekTasks.length;
  const sorted = [...template.blocks].sort(
    (a, b) => a.weekday - b.weekday || a.start_minute - b.start_minute,
  );
  for (const block of sorted) {
    const weekday = clamp(Math.round(block.weekday), 1, 7);
    const date = addDays(week, weekday - 1);
    const start = clamp(floor15(block.start_minute), 0, 1425);
    const end = start + clamp(ceil15(block.duration), 15, 1440);
    const start_at = toUTC(date, start, zone),
      end_at = toUTC(date, end, zone);
    const title = block.title.trim().slice(0, 240) || "일정";
    let weekTaskId: string | null = null;
    let reused = false;
    if (block.kind === "task") {
      const key = title.toLocaleLowerCase();
      let link = linked.get(key);
      if (!link) {
        const open = weekTasks.find(
          (w) =>
            w.state === "open" &&
            data.tasks.some(
              (t) =>
                t.id === w.task_id &&
                t.state === "open" &&
                same(t.title, title),
            ),
        );
        if (open) link = { weekTaskId: open.id, reused: true };
        else {
          const taskId = newId();
          link = { weekTaskId: newId(), reused: false };
          const estimate = sorted
            .filter((b) => b.kind === "task" && same(b.title, title))
            .reduce((n, b) => n + clamp(ceil15(b.duration), 15, 1440), 0);
          changes.push(
            {
              table: "tasks",
              action: "insert",
              row: {
                id: taskId,
                title,
                description: "",
                state: "open",
                category_id: liveCategory(data, block.category_id),
                estimate_minutes: Math.min(estimate, 10080),
                due_on: null,
                completed_at: null,
              },
            },
            {
              table: "week_tasks",
              action: "insert",
              row: {
                id: link.weekTaskId,
                task_id: taskId,
                week_start: week,
                state: "open",
                sort_order: sortOrder++,
                completed_at: null,
              },
            },
          );
        }
        linked.set(key, link);
      }
      weekTaskId = link.weekTaskId;
      reused = link.reused;
    }
    changes.push({
      table: "time_blocks",
      action: "insert",
      row: {
        id: newId(),
        kind: block.kind,
        week_task_id: weekTaskId,
        event_title: block.kind === "event" ? title : null,
        event_note: (block.note ?? "").slice(0, 1000),
        category_id:
          block.kind === "event" ? liveCategory(data, block.category_id) : null,
        start_at,
        end_at,
        local_date: date,
        state: "planned",
        completed_at: null,
      },
    });
    placements.push({
      block: { ...block, title },
      date,
      start,
      end,
      reused,
      overlaps: existing
        .filter((b) => b.start_at < end_at && b.end_at > start_at)
        .map((b) => ({ id: b.id, title: titleOfBlock(b) })),
    });
  }
  const goals = data.goals.filter((g) => g.week_start === week);
  const added: string[] = [];
  for (const raw of template.goals.slice(0, TEMPLATE_GOAL_LIMIT)) {
    const title = raw.trim().slice(0, 240);
    if (
      !title ||
      goals.some((g) => same(g.title, title)) ||
      added.some((t) => same(t, title))
    )
      continue;
    changes.push({
      table: "goals",
      action: "insert",
      row: {
        id: newId(),
        week_start: week,
        title,
        note: "",
        sort_order: goals.length + added.length,
      },
    });
    added.push(title);
  }
  return {
    changes,
    placements,
    conflicts: placements.filter((p) => p.overlaps.length),
    goals: added,
  };
}

/**
 * A copy of `block` starting at `start` on `date`, same length and fields,
 * planned again. Used by Alt+drag and the editor's `복제`.
 */
export function duplicateBlock(
  block: Block,
  date: string,
  start: number,
  newId: () => string,
  zone: string,
): Change {
  const begin = clamp(floor15(start), 0, 1425);
  const length = Math.max(15, ceil15(lengthOf(block)));
  return {
    table: "time_blocks",
    action: "insert",
    row: {
      id: newId(),
      kind: block.kind,
      week_task_id: block.week_task_id,
      event_title: block.event_title,
      event_note: block.event_note,
      category_id: block.category_id,
      start_at: toUTC(date, begin, zone),
      end_at: toUTC(date, begin + length, zone),
      local_date: date,
      state: "planned",
      completed_at: null,
    },
  };
}

/**
 * Rows placing a Todo (e.g. a DEADLINE row) on `date` at `start`: links it to
 * `week` first when it is not on that week yet, so both land in one commit.
 * Returns the week_task id the block uses.
 */
export function placeTaskChanges(
  data: Dataset,
  taskId: string,
  week: string,
  date: string,
  start: number,
  newId: () => string,
) {
  const zone = data.profile.timezone;
  const task = data.tasks.find((t) => t.id === taskId);
  const changes: Change[] = [];
  let weekTaskId = data.week_tasks.find(
    (w) => w.task_id === taskId && w.week_start === week,
  )?.id;
  const linked = !!weekTaskId;
  if (!weekTaskId) {
    weekTaskId = newId();
    changes.push({
      table: "week_tasks",
      action: "insert",
      row: {
        id: weekTaskId,
        task_id: taskId,
        week_start: week,
        state: "open",
        sort_order: data.week_tasks.filter((w) => w.week_start === week).length,
        completed_at: null,
      },
    });
  }
  const begin = clamp(floor15(start), 0, 1425);
  const length = Math.min(
    1440 - begin,
    clamp(ceil15(task?.estimate_minutes ?? 60), 15, 240),
  );
  changes.push({
    table: "time_blocks",
    action: "insert",
    row: {
      id: newId(),
      kind: "task",
      week_task_id: weekTaskId,
      event_title: null,
      event_note: "",
      category_id: null,
      start_at: toUTC(date, begin, zone),
      end_at: toUTC(date, begin + length, zone),
      local_date: date,
      state: "planned",
      completed_at: null,
    },
  });
  return { changes, weekTaskId, linked, start: begin, end: begin + length };
}
