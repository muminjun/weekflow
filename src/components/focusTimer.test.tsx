import { useState } from "react";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, it, expect, vi } from "vitest";
import { FocusTimer } from "./FocusTimer";
import { emptyData, uuid } from "../data/demo";
import { applyLocal } from "../data/local";
import type { Block, Change } from "../domain/types";
afterEach(cleanup);
it("starts, stops with a note and offers to mark the block done", async () => {
  let latest = emptyData(uuid());
  const block: Block = {
    id: uuid(),
    user_id: latest.profile.id,
    version: 1,
    kind: "event",
    week_task_id: null,
    event_title: "집중",
    event_note: "",
    category_id: null,
    start_at: "2026-11-16T00:00:00.000Z",
    end_at: "2026-11-16T01:00:00.000Z",
    local_date: "2026-11-16",
    state: "planned",
    completed_at: null,
  };
  latest.time_blocks.push(block);
  const done = vi.fn();
  function Harness() {
    const [data, setData] = useState(latest);
    return (
      <FocusTimer
        data={data}
        block={block}
        onMarkedDone={done}
        commit={async (c: Change[]) => {
          latest = applyLocal(latest, c);
          setData(latest);
        }}
      />
    );
  }
  render(<Harness />);
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "시작" }));
  expect(latest.block_sessions).toHaveLength(1);
  expect(latest.block_sessions[0].ended_at).toBeNull();
  await user.type(screen.getByLabelText("메모 (선택)"), "초안");
  await user.click(screen.getByRole("button", { name: "종료" }));
  expect(latest.block_sessions[0]).toMatchObject({ note: "초안" });
  expect(latest.block_sessions[0].ended_at).not.toBeNull();
  await user.click(screen.getByRole("button", { name: "블록 완료로 표시" }));
  expect(latest.time_blocks[0].state).toBe("done");
  expect(done).toHaveBeenCalled();
});
