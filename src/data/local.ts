import { openDB } from "idb";
import type { Command, Dataset, Change } from "../domain/types";
import { deepEqual, normalizeDataset } from "./sync";
const database = () =>
  openDB("weekflow-private-v1", 1, {
    upgrade(db) {
      db.createObjectStore("cache");
      db.createObjectStore("queue", { keyPath: "mutationId" });
    },
  });
export const readCache = async (user: string): Promise<Dataset | undefined> =>
  normalizeDataset(
    (await (await database()).get("cache", user)) as Dataset | undefined,
  );
export const cache = async (user: string, data: Dataset) => {
  await (await database()).put("cache", data, user);
};
export const enqueue = async (user: string, command: Command) => {
  await (
    await database()
  ).put("queue", {
    ...command,
    user,
    at: performance.timeOrigin + performance.now(),
  });
};
export const pending = async (
  user: string,
): Promise<(Command & { user: string; at: number })[]> =>
  (await (await database()).getAll("queue"))
    .filter((x) => x.user === user)
    .sort((a, b) => a.at - b.at);
export const dequeue = async (id: string) => {
  await (await database()).delete("queue", id);
};
export async function clearPrivate(user: string) {
  const db = await database();
  await db.delete("cache", user);
  for (const item of await pending(user))
    await db.delete("queue", item.mutationId);
}
type Row = Record<string, unknown>;

/**
 * Mirrors the side effects `apply_changes` has on the server when a row is
 * deleted, so the optimistic copy keeps the same versions and later offline
 * edits do not run into a spurious VERSION_CONFLICT:
 * - deleting a task or time block first turns its recurrence occurrences into
 *   cancelled tombstones (one update, so version + 1);
 * - FK cascades remove a week task's blocks, day marks and goal links, a
 *   block's focus sessions, a goal's links and a rule's occurrences;
 * - `on delete set null` on occurrences.time_block_id is an update too and
 *   bumps the version of the occurrence that still pointed at the block.
 */
function cascadeDelete(d: Dataset, table: string, id: unknown) {
  const bump = (o: Row, patch: Row) =>
    Object.assign(o, patch, { version: Number(o.version ?? 0) + 1 });
  const removeBlocks = (ids: Set<unknown>) => {
    if (!ids.size) return;
    d.time_blocks = d.time_blocks.filter((b) => !ids.has(b.id));
    d.block_sessions = (d.block_sessions ?? []).filter(
      (s) => !ids.has(s.block_id),
    );
    for (const o of d.recurrence_occurrences)
      if (o.time_block_id && ids.has(o.time_block_id))
        bump(o as unknown as Row, { time_block_id: null });
  };
  const removeWeekTasks = (ids: Set<unknown>) => {
    if (!ids.size) return;
    d.week_tasks = d.week_tasks.filter((w) => !ids.has(w.id));
    d.week_task_day_marks = d.week_task_day_marks.filter(
      (m) => !ids.has(m.week_task_id),
    );
    d.goal_week_tasks = d.goal_week_tasks.filter(
      (g) => !ids.has(g.week_task_id),
    );
    removeBlocks(
      new Set(
        d.time_blocks
          .filter((b) => b.week_task_id && ids.has(b.week_task_id))
          .map((b) => b.id),
      ),
    );
  };
  if (table === "tasks" || table === "time_blocks")
    for (const o of d.recurrence_occurrences)
      if ((table === "tasks" ? o.task_id : o.time_block_id) === id)
        bump(o as unknown as Row, {
          state: "cancelled",
          task_id: null,
          time_block_id: null,
        });
  if (table === "tasks")
    removeWeekTasks(
      new Set(d.week_tasks.filter((w) => w.task_id === id).map((w) => w.id)),
    );
  else if (table === "week_tasks") removeWeekTasks(new Set([id]));
  else if (table === "time_blocks") removeBlocks(new Set([id]));
  else if (table === "goals")
    d.goal_week_tasks = d.goal_week_tasks.filter((g) => g.goal_id !== id);
  else if (table === "recurrence_rules")
    d.recurrence_occurrences = d.recurrence_occurrences.filter(
      (o) => o.rule_id !== id,
    );
}

export function applyLocal(data: Dataset, changes: Change[]): Dataset {
  const d = structuredClone(data);
  for (const c of changes) {
    const key = (c.table === "profiles" ? "profile" : c.table) as keyof Dataset;
    // An older cache may predate a table; treat it as empty.
    (d as unknown as Row)[key] ??= [];
    const collection = d[key];
    if (!Array.isArray(collection)) {
      Object.assign(collection, c.row, { version: collection.version + 1 });
      continue;
    }
    const rows = collection as unknown as Row[];
    const matches = (r: Row) =>
      c.table === "goal_week_tasks"
        ? r.goal_id === c.row.goal_id && r.week_task_id === c.row.week_task_id
        : r.id === c.row.id;
    const i = rows.findIndex(matches);
    if (c.action === "delete") {
      if (i >= 0) rows.splice(i, 1);
      if (c.table !== "goal_week_tasks") cascadeDelete(d, c.table, c.row.id);
    } else if (i >= 0)
      rows[i] = {
        ...rows[i],
        ...c.row,
        version: Number(rows[i].version ?? 0) + 1,
      };
    else rows.push({ ...c.row, user_id: d.profile.id, version: 1 });
  }
  return d;
}

export async function persistCommand(
  user: string,
  command: Command,
  data: Dataset,
) {
  const db = await database();
  const tx = db.transaction(["cache", "queue"], "readwrite");
  await tx
    .objectStore("queue")
    .put({ ...command, user, at: performance.timeOrigin + performance.now() });
  await tx.objectStore("cache").put(data, user);
  await tx.done;
}
export async function replacePending(
  user: string,
  commands: (Command & { user: string; at: number })[],
  data: Dataset,
) {
  const db = await database();
  const tx = db.transaction(["cache", "queue"], "readwrite");
  for (const old of await tx.objectStore("queue").getAll())
    if (old.user === user) await tx.objectStore("queue").delete(old.mutationId);
  for (const command of commands) await tx.objectStore("queue").put(command);
  await tx.objectStore("cache").put(data, user);
  await tx.done;
}

export async function reconcileCache(user: string, server: Dataset) {
  const db = await database();
  const tx = db.transaction(["cache", "queue"], "readwrite");
  const queued = (await tx.objectStore("queue").getAll())
    .filter((command) => command.user === user)
    .sort((a, b) => a.at - b.at);
  let next = normalizeDataset(server);
  for (const command of queued) next = applyLocal(next, command.changes);
  // Skip the IndexedDB rewrite when nothing changed (periodic reloads).
  const previous = await tx.objectStore("cache").get(user);
  if (!previous || !deepEqual(normalizeDataset(previous as Dataset), next))
    await tx.objectStore("cache").put(next, user);
  await tx.done;
  return next;
}
