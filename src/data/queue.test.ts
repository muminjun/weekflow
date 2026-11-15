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
