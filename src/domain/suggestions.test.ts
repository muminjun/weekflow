import { it, expect } from "vitest";
import { emptyData, uuid } from "../data/demo";
import { toUTC } from "./planner";
import { suggestSlots } from "./suggestions";
it("uses real free intervals, rounds past time up, respects holidays and manual overrides", () => {
  const data = emptyData(uuid());
  const base = { id: uuid(), user_id: data.profile.id, version: 1 };
  data.time_blocks.push({
    ...base,
    kind: "event",
    week_task_id: null,
    event_title: "busy",
    event_note: "",
    category_id: null,
    start_at: toUTC("2026-11-17", 570, "Asia/Seoul"),
    end_at: toUTC("2026-11-17", 660, "Asia/Seoul"),
    local_date: "2026-11-17",
    state: "planned",
    completed_at: null,
  });
  data.availability_overrides.push({
    ...base,
    id: uuid(),
    local_date: "2026-11-18",
    mode: "replace",
    windows: [{ startMinute: 600, endMinute: 660 }],
  });
  const result = suggestSlots(
    data,
    ["2026-11-16", "2026-11-17", "2026-11-18", "2026-11-19"],
    60,
    new Set(["2026-11-18", "2026-11-19"]),
    toUTC("2026-11-17", 608, "Asia/Seoul"),
  );
  expect(result[0]).toEqual({ date: "2026-11-17", start: 660, end: 720 });
  expect(result).toContainEqual({ date: "2026-11-18", start: 600, end: 660 });
  expect(
    result.some((x) => x.date === "2026-11-16" || x.date === "2026-11-19"),
  ).toBe(false);
});
it("never suggests over occupied Todo blocks and keeps exact quarter-hour durations", () => {
  const data = emptyData(uuid());
  data.time_blocks.push({
    id: uuid(),
    user_id: data.profile.id,
    version: 1,
    kind: "task",
    week_task_id: uuid(),
    event_title: null,
    event_note: "",
    category_id: null,
    start_at: toUTC("2026-11-17", 540, "Asia/Seoul"),
    end_at: toUTC("2026-11-17", 615, "Asia/Seoul"),
    local_date: "2026-11-17",
    state: "done",
    completed_at: toUTC("2026-11-17", 615, "Asia/Seoul"),
  });
  expect(
    suggestSlots(
      data,
      ["2026-11-17"],
      45,
      new Set(),
      toUTC("2026-11-17", 550, "Asia/Seoul"),
    )[0],
  ).toEqual({ date: "2026-11-17", start: 615, end: 660 });
});
