import { afterEach, it, expect } from "vitest";
import { render, screen, cleanup, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ConfirmationHost, confirmAction, promptAction } from "./Confirmations";
afterEach(cleanup);
it("custom confirmation preserves cancel, approval, entered text and Escape", async () => {
  render(<ConfirmationHost />);
  const user = userEvent.setup();
  let decision!: Promise<boolean>;
  act(() => {
    decision = confirmAction("다른 일정과 겹칩니다. 계속할까요?");
  });
  await user.click(screen.getByRole("button", { name: "취소" }));
  await expect(decision).resolves.toBe(false);
  act(() => {
    decision = confirmAction("겹쳐서 배치할까요?");
  });
  await user.click(screen.getByRole("button", { name: "겹쳐서 배치" }));
  await expect(decision).resolves.toBe(true);
  let text!: Promise<string | null>;
  act(() => {
    text = promptAction("삭제 문구를 입력하세요.");
  });
  await user.type(
    screen.getByRole("textbox", { name: "확인 내용" }),
    "WEEKFLOW 삭제",
  );
  await user.click(
    screen.getByRole("button", { name: "입력한 내용으로 진행" }),
  );
  await expect(text).resolves.toBe("WEEKFLOW 삭제");
  act(() => {
    text = promptAction("취소 검증");
  });
  await user.keyboard("{Escape}");
  await expect(text).resolves.toBeNull();
});
