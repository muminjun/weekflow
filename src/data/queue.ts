import type { Command, Dataset } from "../domain/types";
import { applyLocal } from "./local";
export function rebaseQueue<T extends Command>(
  server: Dataset,
  queue: T[],
): T[] {
  let state = server;
  return queue.map((command) => {
    const changes = command.changes.map((change) => {
      const key = change.table === "profiles" ? "profile" : change.table;
      const rows = state[key];
      const current = Array.isArray(rows)
        ? (rows as unknown as Record<string, unknown>[]).find((r) =>
            change.table === "goal_week_tasks"
              ? r.goal_id === change.row.goal_id &&
                r.week_task_id === change.row.week_task_id
              : r.id === change.row.id,
          )
        : (rows as unknown as Record<string, unknown>);
      const next = {
        ...change,
        action:
          current && change.action === "insert"
            ? ("update" as const)
            : change.action,
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
export function discardChain<T extends Command>(queue: T[]): T[] {
  if (!queue.length) return [];
  const affected = new Set<string>();
  const collect = (command: T) =>
    command.changes.forEach((c) => {
      for (const key of ["id", "goal_id", "week_task_id"])
        if (typeof c.row[key] === "string") affected.add(c.row[key] as string);
    });
  collect(queue[0]);
  return queue.slice(1).filter((command) => {
    const depends = command.changes.some((c) =>
      Object.entries(c.row).some(
        ([k, v]) => k !== "user_id" && typeof v === "string" && affected.has(v),
      ),
    );
    if (depends) collect(command);
    return !depends;
  });
}
