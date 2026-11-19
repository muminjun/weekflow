import { it, expect } from "vitest";
import { emptyData, uuid } from "./demo";
import { rebaseQueue, discardChain } from "./queue";
import type { Command, Dataset } from "../domain/types";
function fixture() {
  const d = emptyData(uuid());
  const id = uuid();
  d.tasks.push({
    id,
    user_id: d.profile.id,
    version: 2,
    title: "server v2",
    description: "",
    category_id: null,
    due_on: null,
    estimate_minutes: 60,
    state: "open",
    completed_at: null,
  });
  const command = (title: string, version: number): Command => ({
    mutationId: uuid(),
    changes: [
      {
        table: "tasks",
        action: "update",
        row: { id, title },
        expected_version: version,
      },
    ],
  });
  return { d, id, a: command("older A", 1), b: command("newer B", 2) };
}
it("resolves a conflicting head in place, preserving later edits and rebasing their versions", () => {
  const { d, a, b } = fixture();
  const next = rebaseQueue(d, [a, b]);
  expect(next.map((c) => c.mutationId)).toEqual([a.mutationId, b.mutationId]);
  expect(next.map((c) => c.changes[0].expected_version)).toEqual([2, 3]);
  expect(next[1].changes[0].row.title).toBe("newer B");
});
it("discarding a rejected insertion drops dependents but keeps unrelated work", () => {
  const d = emptyData(uuid());
  const category = uuid(),
    task = uuid();
  const a: Command = {
    mutationId: uuid(),
    changes: [
      {
        table: "categories",
        action: "insert",
        row: { id: category, name: "WORK", color: "#ffffff" },
      },
    ],
  };
  const b: Command = {
    mutationId: uuid(),
    changes: [
      {
        table: "tasks",
        action: "insert",
        row: { id: task, title: "dependent", category_id: category },
      },
    ],
  };
  const c: Command = {
    mutationId: uuid(),
    changes: [
      {
        table: "goals",
        action: "insert",
        row: { id: uuid(), title: "independent", week_start: "2026-11-09" },
      },
    ],
  };
  const remaining = discardChain([a, b, c]);
  expect(remaining.map((x) => x.mutationId)).toEqual([c.mutationId]);
  expect(rebaseQueue(d as Dataset, remaining)).toHaveLength(1);
});
it("keep-mine re-stamps only rows touched by the resolved command", () => {
  const { d, id, a } = fixture();
  // Another device bumped an unrelated task to v5 on the server.
  const other = uuid();
  d.tasks.push({ ...d.tasks[0], id: other, version: 5, title: "remote v5" });
  const unrelated: Command = {
    mutationId: uuid(),
    changes: [
      {
        table: "tasks",
        action: "update",
        row: { id: other, title: "my stale edit" },
        expected_version: 3,
      },
    ],
  };
  const later: Command = {
    mutationId: uuid(),
    changes: [
      {
        table: "tasks",
        action: "update",
        row: { id, title: "C" },
        expected_version: 2,
      },
    ],
  };
  const next = rebaseQueue(d, [a, unrelated, later], 0);
  expect(next[0].changes[0].expected_version).toBe(2); // resolved row -> server version
  expect(next[1].changes[0].expected_version).toBe(3); // untouched: must still conflict
  expect(next[2].changes[0].expected_version).toBe(3); // chained on resolved row
});
it("keep-mine leaves commands before the resolved index alone", () => {
  const { d, a, b } = fixture();
  const next = rebaseQueue(d, [a, b], 1);
  expect(next[0].changes[0].expected_version).toBe(1);
  expect(next[1].changes[0].expected_version).toBe(3);
});
it("discarding an update or delete does not drop later commands mentioning the row", () => {
  const { id, a } = fixture();
  const laterEdit: Command = {
    mutationId: uuid(),
    changes: [
      {
        table: "tasks",
        action: "update",
        row: { id, title: "later" },
        expected_version: 2,
      },
    ],
  };
  const referencing: Command = {
    mutationId: uuid(),
    changes: [
      {
        table: "time_blocks",
        action: "insert",
        row: { id: uuid(), week_task_id: id, kind: "task" },
      },
    ],
  };
  expect(
    discardChain([a, laterEdit, referencing]).map((c) => c.mutationId),
  ).toEqual([laterEdit.mutationId, referencing.mutationId]);
  const del: Command = {
    mutationId: uuid(),
    changes: [
      { table: "tasks", action: "delete", row: { id }, expected_version: 1 },
    ],
  };
  expect(discardChain([del, referencing])).toHaveLength(1);
});
it("discarding an insert cascades transitively through inserted ids only", () => {
  const category = uuid(),
    task = uuid(),
    week = uuid(),
    existing = uuid();
  const mk = (
    table: Command["changes"][number]["table"],
    row: Record<string, unknown>,
    action: "insert" | "update" = "insert",
  ): Command => ({ mutationId: uuid(), changes: [{ table, action, row }] });
  const a = mk("categories", { id: category, name: "X" });
  const b = mk("tasks", { id: task, category_id: category });
  const c = mk("week_tasks", { id: week, task_id: task }); // transitive dependent
  const e = mk(
    "tasks",
    { id: existing, title: "edit", category_id: null },
    "update",
  );
  const remaining = discardChain([a, b, c, e]);
  expect(remaining.map((x) => x.mutationId)).toEqual([e.mutationId]);
});
