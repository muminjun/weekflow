import { describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { demoData, uuid } from "./demo";
import { applyLocal } from "./local";
import { inverseOf, restamp } from "./history";
import { usePlanner } from "./usePlanner";
import type { Change } from "../domain/types";

const week = "2026-11-16";
const rename = (id: string, version: number, title: string): Change => ({
  table: "tasks",
  action: "update",
  row: { id, title },
  expected_version: version,
});

describe("inverseOf / restamp", () => {
  it("restores an edit, removes an insert and brings back a delete", () => {
    const before = demoData(week);
    const task = before.tasks[0];
    const block = before.time_blocks[0];
    const added = uuid();
    const next = applyLocal(before, [
      rename(task.id, task.version, "바뀐 제목"),
      {
        table: "time_blocks",
        action: "delete",
        row: { id: block.id },
        expected_version: block.version,
      },
      {
        table: "goals",
        action: "insert",
        row: {
          id: added,
          title: "새 목표",
          note: "",
          week_start: week,
          sort_order: 9,
        },
      },
    ]);
    const restored = applyLocal(next, inverseOf(before, next));
    expect(restored.tasks.find((t) => t.id === task.id)?.title).toBe(
      task.title,
    );
    expect(restored.time_blocks.some((b) => b.id === block.id)).toBe(true);
    expect(restored.goals.some((g) => g.id === added)).toBe(false);
  });
  it("uses current versions and drops edits to rows deleted meanwhile", () => {
    const before = demoData(week);
    const [a, b] = before.tasks;
    const next = applyLocal(before, [
      rename(a.id, a.version, "A2"),
      rename(b.id, b.version, "B2"),
    ]);
    const inverse = inverseOf(before, next);
    // Sync moved A on, and B was removed on another device.
    const later = {
      ...next,
      tasks: next.tasks
        .filter((t) => t.id !== b.id)
        .map((t) => (t.id === a.id ? { ...t, version: t.version + 5 } : t)),
    };
    const out = restamp(inverse, later)!;
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ expected_version: a.version + 6 });
  });
});

describe("usePlanner history", () => {
  it("undoes several steps and redoes them in order", async () => {
    const preview = demoData(week);
    const task = preview.tasks[0];
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={new QueryClient()}>
        {children}
      </QueryClientProvider>
    );
    const { result } = renderHook(() => usePlanner(null, preview), { wrapper });
    await act(async () => {});
    const title = () =>
      result.current.data!.tasks.find((t) => t.id === task.id)!.title;
    const version = () =>
      result.current.data!.tasks.find((t) => t.id === task.id)!.version;
    await act(() =>
      result.current.commit([rename(task.id, version(), "하나")]),
    );
    await act(() => result.current.commit([rename(task.id, version(), "둘")]));
    expect(title()).toBe("둘");
    await act(() => result.current.undo!());
    expect(title()).toBe("하나");
    await act(() => result.current.undo!());
    expect(title()).toBe(task.title);
    expect(result.current.undo).toBeNull();
    await act(() => result.current.redo!());
    await act(() => result.current.redo!());
    expect(title()).toBe("둘");
    expect(result.current.redo).toBeNull();
    // A new change after undo discards the redo branch.
    await act(() => result.current.undo!());
    await act(() => result.current.commit([rename(task.id, version(), "셋")]));
    expect(result.current.redo).toBeNull();
    expect(result.current.lastHistory).toBe("change");
  });
});
