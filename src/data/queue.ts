import type { Change, Command, Dataset } from "../domain/types";
import { applyLocal } from "./local";

/** Identity of the row a change targets (table + primary key). */
export function rowKey(change: Change): string {
  if (
    change.table === "profiles" ||
    change.table === "notification_preferences"
  )
    return change.table;
  if (change.table === "goal_week_tasks")
    return `${change.table}:${String(change.row.goal_id)}:${String(change.row.week_task_id)}`;
  return `${change.table}:${String(change.row.id)}`;
}

function currentRow(state: Dataset, change: Change) {
  const key = change.table === "profiles" ? "profile" : change.table;
  const rows = state[key];
  return Array.isArray(rows)
    ? (rows as unknown as Record<string, unknown>[]).find((r) =>
        change.table === "goal_week_tasks"
          ? r.goal_id === change.row.goal_id &&
            r.week_task_id === change.row.week_task_id
          : r.id === change.row.id,
      )
    : (rows as unknown as Record<string, unknown> | undefined);
}

/**
 * Rebase a queue after the user chose "keep mine" for `queue[resolvedIndex]`.
 *
 * Only rows touched by the resolved command are re-stamped with the server's
 * current version (and the local chain of later edits to those same rows is
 * re-stamped on top of it). Every other change keeps its original
 * expected_version so an unrelated edit made on another device still surfaces
 * as its own conflict instead of being silently overwritten.
 */
export function rebaseQueue<T extends Command>(
  server: Dataset,
  queue: T[],
  resolvedIndex = 0,
): T[] {
  const resolved = queue[resolvedIndex];
  const touched = new Set(resolved ? resolved.changes.map(rowKey) : []);
  let state = server;
  return queue.map((command, index) => {
    const changes = command.changes.map((change) => {
      if (index < resolvedIndex || !touched.has(rowKey(change))) {
        state = applyLocal(state, [change]);
        return change;
      }
      const current = currentRow(state, change);
      const next: Change = {
        ...change,
        action:
          current && change.action === "insert" ? "update" : change.action,
        expected_version: current?.version
          ? Number(current.version)
          : undefined,
      };
      state = applyLocal(state, [next]);
      return next;
    });
    return { ...command, changes };
  });
}

/**
 * Drop the head command (the rejected one) and only the later commands that
 * cannot succeed without it: those referencing a row the discarded work
 * *inserted* (that row will never exist on the server). Transitive: inserts in
 * a dropped dependent are also treated as missing. Discarded updates/deletes
 * never cascade — later edits stand on their own and will conflict
 * individually if they no longer apply.
 */
export function discardChain<T extends Command>(queue: T[]): T[] {
  if (!queue.length) return [];
  const missing = new Set<string>();
  const collect = (command: T) =>
    command.changes.forEach((c) => {
      if (c.action === "insert" && typeof c.row.id === "string")
        missing.add(c.row.id);
    });
  collect(queue[0]);
  return queue.slice(1).filter((command) => {
    const depends = command.changes.some((c) =>
      Object.entries(c.row).some(
        ([k, v]) => k !== "user_id" && typeof v === "string" && missing.has(v),
      ),
    );
    if (depends) collect(command);
    return !depends;
  });
}
