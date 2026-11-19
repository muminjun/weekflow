import { useState } from "react";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, it, expect } from "vitest";
import { SidePanel } from "./SidePanel";
import { Modal } from "./Modal";
import { emptyData, uuid } from "../data/demo";
import { applyLocal } from "../data/local";
import type { Change, Dataset } from "../domain/types";
afterEach(cleanup);
it("Enter rejects blank titles and creates one source Todo, one weekly relation and seven marks", async () => {
  let latest = emptyData(uuid());
  function Harness() {
    const [data, setData] = useState(latest);
    return (
      <SidePanel
        data={data}
        week="2026-11-09"
        commit={async (c: Change[]) => {
          latest = applyLocal(latest, c);
          setData(latest);
        }}
        onTask={() => {}}
      />
    );
  }
  render(<Harness />);
  const user = userEvent.setup();
  const input = screen.getByRole("textbox", { name: "새 할 일" });
  await user.type(input, "   {Enter}");
  expect(latest.tasks).toHaveLength(0);
  await user.clear(input);
  await user.type(input, "기획서 작성{Enter}");
  expect(
    await screen.findByRole("button", { name: "기획서 작성" }),
  ).toBeVisible();
  expect(latest.tasks).toHaveLength(1);
  expect(latest.week_tasks).toHaveLength(1);
  expect(screen.getAllByRole("button", { name: /누르면 .*기록/ })).toHaveLength(
    7,
  );
});
it("manual day marks do not invent performed time blocks", async () => {
  const d = emptyData(uuid());
  const taskId = uuid(),
    weekTaskId = uuid();
  d.tasks.push({
    id: taskId,
    user_id: d.profile.id,
    version: 1,
    title: "one task",
    description: "",
    category_id: null,
    due_on: null,
    estimate_minutes: 60,
    state: "open",
    completed_at: null,
  });
  d.week_tasks.push({
    id: weekTaskId,
    user_id: d.profile.id,
    version: 1,
    task_id: taskId,
    week_start: "2026-11-09",
    state: "open",
    completed_at: null,
    sort_order: 0,
  });
  let latest: Dataset = d;
  function Harness() {
    const [data, setData] = useState(latest);
    return (
      <SidePanel
        data={data}
        week="2026-11-09"
        commit={async (c) => {
          latest = applyLocal(latest, c);
          setData(latest);
        }}
        onTask={() => {}}
      />
    );
  }
  render(<Harness />);
  const user = userEvent.setup();
  await user.click(
    screen.getByRole("button", { name: /11월 9일\(월\): 기록 없음/ }),
  );
  await user.click(
    screen.getByRole("button", { name: /11월 9일\(월\): 계획/ }),
  );
  expect(
    screen.getByRole("button", { name: /11월 9일\(월\): 완료/ }),
  ).toBeVisible();
  expect(latest.tasks[0].state).toBe("open");
  expect(latest.time_blocks).toHaveLength(0);
  await user.click(
    screen.getByRole("button", { name: /11월 9일\(월\): 완료/ }),
  );
  expect(latest.week_task_day_marks).toHaveLength(0);
});
it("Escape closes a dialog and restores the opening control focus", async () => {
  function Harness() {
    const [open, setOpen] = useState(false);
    return (
      <>
        <button onClick={() => setOpen(true)}>편집 열기</button>
        {open && (
          <Modal title="편집" onClose={() => setOpen(false)}>
            <label>
              제목
              <input autoFocus />
            </label>
          </Modal>
        )}
      </>
    );
  }
  render(<Harness />);
  const user = userEvent.setup();
  const opener = screen.getByRole("button", { name: "편집 열기" });
  await user.click(opener);
  expect(screen.getByRole("dialog")).toBeVisible();
  await user.keyboard("{Escape}");
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  await waitFor(() => expect(opener).toHaveFocus());
});
it("clears submitted text immediately and never erases the next input after persistence", async () => {
  let release!: () => void;
  render(
    <SidePanel
      data={emptyData(uuid())}
      week="2026-11-09"
      commit={() =>
        new Promise<void>((resolve) => {
          release = resolve;
        })
      }
      onTask={() => {}}
    />,
  );
  const user = userEvent.setup(),
    input = screen.getByRole("textbox", { name: "새 할 일" });
  await user.type(input, "first{Enter}");
  expect(input).toHaveValue("");
  await user.type(input, "second");
  release();
  await waitFor(() => expect(input).toHaveValue("second"));
});
