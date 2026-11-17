import { afterEach, it, expect } from "vitest";
import { cleanup, render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Coachmarks } from "./Coachmarks";
afterEach(() => {
  cleanup();
  localStorage.removeItem("weekflow.coach.v1");
});
it("explicit replay is available even before onboarding completion", async () => {
  render(
    <>
      <button aria-label="빠른 추가">추가</button>
      <Coachmarks enabled autoStart={false} />
    </>,
  );
  expect(screen.queryByRole("dialog")).toBeNull();
  act(() => {
    window.dispatchEvent(new Event("weekflow:show-coach"));
  });
  expect(
    await screen.findByRole("dialog", { name: "WEEKFLOW 사용법" }),
  ).toBeVisible();
  await userEvent.setup().keyboard("{Escape}");
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(localStorage.getItem("weekflow.coach.v1")).toBe("done");
});
