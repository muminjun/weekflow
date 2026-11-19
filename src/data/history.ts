import type { Change, Dataset } from "../domain/types";

/** Tables whose rows the person edits directly and can take back. */
const tables = [
  "categories",
  "tasks",
  "week_tasks",
  "goals",
  "goal_week_tasks",
  "time_blocks",
  "block_sessions",
  "week_task_day_marks",
  "availability_rules",
  "availability_overrides",
  "recurrence_rules",
  "recurrence_occurrences",
  "week_reviews",
  "week_templates",
] as const;
type Row = Record<string, unknown>;
const key = (r: Row) => String(r.id ?? `${r.goal_id}:${r.week_task_id}`);

/**
 * Changes that turn `next` back into `before`. Inserts run first (parents
 * before children, in table order) and deletes last in reverse, so links stay
 * valid while the inverse is applied.
 */
export function inverseOf(before: Dataset, next: Dataset): Change[] {
  const inverse: Change[] = [];
  for (const table of tables) {
    // Tables added later may be missing from an older snapshot.
    const old = (before[table] ?? []) as unknown as Row[],
      now = (next[table] ?? []) as unknown as Row[];
    const nowByKey = new Map(now.map((r) => [key(r), r]));
    const oldKeys = new Set(old.map(key));
    for (const r of old) {
      const n = nowByKey.get(key(r));
      if (!n) inverse.push({ table, action: "insert", row: r });
      else if (JSON.stringify(n) !== JSON.stringify(r))
        inverse.push({
          table,
          action: "update",
          row: r,
          expected_version: Number(n.version),
        });
    }
    for (const n of now)
      if (!oldKeys.has(key(n)))
        inverse.push({
          table,
          action: "delete",
          row: n,
          expected_version: Number(n.version),
        });
  }
  return [
    ...inverse.filter((c) => c.action !== "delete"),
    ...inverse.filter((c) => c.action === "delete").reverse(),
  ];
}

/**
 * Prepares a stored inverse for the data as it is now: versions may have moved
 * on through sync, and rows deleted elsewhere can no longer be restored to an
 * edited state. Returns null when nothing applicable is left.
 */
export function restamp(changes: Change[], current: Dataset): Change[] | null {
  const out: Change[] = [];
  for (const change of changes) {
    const rows = current[change.table as keyof Dataset];
    const existing = Array.isArray(rows)
      ? (rows as unknown as Row[]).find(
          (r) => key(r) === key(change.row as Row),
        )
      : undefined;
    if (change.action === "insert") {
      if (!existing) out.push(change);
      continue;
    }
    if (!existing) continue;
    out.push({ ...change, expected_version: Number(existing.version) });
  }
  return out.length ? out : null;
}

export const HISTORY_LIMIT = 50;
