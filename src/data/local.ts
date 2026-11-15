import { openDB } from "idb";
import type { Command, Dataset, Change } from "../domain/types";
const database = () =>
  openDB("weekflow-private-v1", 1, {
    upgrade(db) {
      db.createObjectStore("cache");
      db.createObjectStore("queue", { keyPath: "mutationId" });
    },
  });
export const readCache = async (user: string): Promise<Dataset | undefined> =>
  (await database()).get("cache", user);
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
export function applyLocal(data: Dataset, changes: Change[]): Dataset {
  const d = structuredClone(data);
  for (const c of changes) {
    const key = c.table === "profiles" ? "profile" : c.table;
    const collection = d[key];
    if (!Array.isArray(collection)) {
      Object.assign(collection, c.row, { version: collection.version + 1 });
      continue;
    }
    const rows = collection as unknown as Record<string, unknown>[];
    const matches = (r: Record<string, unknown>) =>
      c.table === "goal_week_tasks"
        ? r.goal_id === c.row.goal_id && r.week_task_id === c.row.week_task_id
        : r.id === c.row.id;
    const i = rows.findIndex(matches);
    if (c.action === "delete") {
      if (i >= 0) rows.splice(i, 1);
      if (c.table === "tasks") {
        const weeks = d.week_tasks
          .filter((w) => w.task_id === c.row.id)
          .map((w) => w.id);
        d.week_tasks = d.week_tasks.filter((w) => w.task_id !== c.row.id);
        d.time_blocks = d.time_blocks.filter(
          (b) => !weeks.includes(b.week_task_id ?? ""),
        );
        d.week_task_day_marks = d.week_task_day_marks.filter(
          (m) => !weeks.includes(m.week_task_id),
        );
        d.goal_week_tasks = d.goal_week_tasks.filter(
          (g) => !weeks.includes(g.week_task_id),
        );
      }
      if (c.table === "goals")
        d.goal_week_tasks = d.goal_week_tasks.filter(
          (g) => g.goal_id !== c.row.id,
        );
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
  let next = server;
  for (const command of queued) next = applyLocal(next, command.changes);
  await tx.objectStore("cache").put(next, user);
  await tx.done;
  return next;
}
