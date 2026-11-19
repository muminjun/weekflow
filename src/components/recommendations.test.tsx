import { it, expect, vi, afterEach } from "vitest";
import {
  render,
  fireEvent,
  screen,
  cleanup,
  within,
} from "@testing-library/react";
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
      onRetry={() => {}}
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
function weekWithTodos(...todos: [string, number | null][]) {
  const data = emptyData(uuid());
  const ids = todos.map(([title, estimate], i) => {
    const id = uuid(),
      task = uuid();
    data.tasks.push({
      id: task,
      user_id: data.profile.id,
      version: 1,
      title,
      description: "",
      category_id: null,
      due_on: null,
      estimate_minutes: estimate,
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
      sort_order: i,
    });
    return id;
  });
  return { data, ids };
}
const renderAuto = (
  data: ReturnType<typeof emptyData>,
  extra: Partial<Parameters<typeof Recommendations>[0]> = {},
) =>
  render(
    <Recommendations
      data={data}
      week="2026-11-16"
      known
      onRetry={() => {}}
      holidays={new Set()}
      onClose={() => {}}
      onPlace={() => {}}
      {...extra}
    />,
  );
it("hides weekly auto placement when no apply handler is given", () => {
  const { data } = weekWithTodos(["하나", 30]);
  renderAuto(data);
  expect(screen.queryByText("이번 주 자동 배치")).toBeNull();
});
it("drafts the whole week, lets proposals be excluded, and applies them in one call", () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-15T15:00:00Z")); // Mon 00:00 KST
  const { data, ids } = weekWithTodos(["긴 보고서", 240], ["메일 정리", 30]);
  const onApplyAll = vi.fn();
  renderAuto(data, { onApplyAll });
  fireEvent.click(
    screen.getByRole("button", { name: "이번 주 자동 배치 초안 만들기" }),
  );
  expect(screen.getByRole("group", { name: /배치 초안/ })).toBeInTheDocument();
  expect(screen.getByText("11월 16일 (월)")).toBeInTheDocument();
  expect(screen.getByText(/분할 1\/3/)).toBeInTheDocument();
  const boxes = screen.getAllByRole("checkbox");
  expect(boxes).toHaveLength(4);
  const mail = screen.getByRole("checkbox", { name: /메일 정리/ });
  fireEvent.click(mail);
  expect(mail).not.toBeChecked();
  fireEvent.click(screen.getByRole("button", { name: "선택한 3개 배치" }));
  expect(onApplyAll).toHaveBeenCalledTimes(1);
  const changes = onApplyAll.mock.calls[0][0];
  expect(changes).toHaveLength(3);
  for (const change of changes) {
    expect(change).toMatchObject({
      table: "time_blocks",
      action: "insert",
      row: { kind: "task", week_task_id: ids[0], state: "planned" },
    });
  }
  expect(changes[0].row).toMatchObject({
    local_date: "2026-11-16",
    start_at: "2026-11-16T00:00:00.000Z",
    end_at: "2026-11-16T01:30:00.000Z",
  });
});
it("lists what did not fit with a reason", () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-15T15:00:00Z"));
  const { data } = weekWithTodos(["너무 긴 일", 15 * 60 * 7]);
  data.availability_rules = [];
  renderAuto(data, { onApplyAll: vi.fn() });
  fireEvent.click(
    screen.getByRole("button", { name: "이번 주 자동 배치 초안 만들기" }),
  );
  const list = screen.getByRole("list", { name: "배치하지 못한 할 일" });
  expect(within(list).getByText("너무 긴 일")).toBeInTheDocument();
  expect(within(list).getByText(/빈 시간이 없어요/)).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /선택한/ })).toBeNull();
});
it("refuses auto placement until holidays are confirmed", () => {
  const { data } = weekWithTodos(["하나", 30]);
  const onRetry = vi.fn();
  renderAuto(data, { onApplyAll: vi.fn(), known: false, onRetry });
  expect(
    screen.getByText(/공휴일 정보를 확인한 뒤 자동 배치할 수 있어요/),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: /자동 배치 초안 만들기/ }),
  ).toBeNull();
});
