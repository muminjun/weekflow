import { it, expect, vi, afterEach } from "vitest";
import { render, fireEvent, screen, cleanup } from "@testing-library/react";
import { Recommendations } from "./Recommendations";
import { emptyData, uuid } from "../data/demo";
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
it("revalidates a rendered recommendation after its time has passed", () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-17T00:01:00Z"));
  const data = emptyData(uuid()),
    id = uuid(),
    task = uuid();
  data.tasks.push({
    id: task,
    user_id: data.profile.id,
    version: 1,
    title: "추천 검증",
    description: "",
    category_id: null,
    due_on: null,
    estimate_minutes: 15,
    state: "open",
    completed_at: null,
  });
  data.week_tasks.push({
    id,
    user_id: data.profile.id,
    version: 1,
    task_id: task,
    week_start: "2026-11-16",
    state: "open",
    completed_at: null,
    sort_order: 0,
  });
  const onPlace = vi.fn();
  render(
    <Recommendations
      data={data}
      week="2026-11-16"
      known
      holidays={new Set()}
      onClose={() => {}}
      onPlace={onPlace}
    />,
  );
  vi.setSystemTime(new Date("2026-11-17T01:00:00Z"));
  fireEvent.click(document.querySelector(".suggestion-slot")!);
  expect(onPlace).not.toHaveBeenCalled();
  expect(
    screen.getByText(
      "가능한 시간이 바뀌었어요. 새 추천 시간에서 다시 선택해 주세요.",
    ),
  ).toHaveAttribute("role", "status");
  fireEvent.click(document.querySelector(".suggestion-slot")!);
  expect(onPlace).toHaveBeenCalledWith(id, "2026-11-17", 615, 15);
});
