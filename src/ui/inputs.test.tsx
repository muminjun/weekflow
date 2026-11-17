import { afterEach, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Select } from "./Select";
afterEach(cleanup);
it("custom selection serializes native values, empty options, disabled and reset", async () => {
  const user = userEvent.setup();
  let saved: FormData | undefined;
  render(
    <form
      onSubmit={(e) => {
        e.preventDefault();
        saved = new FormData(e.currentTarget);
      }}
    >
      <label>
        카테고리
        <Select name="category" defaultValue="work">
          <option value="">선택 안 함</option>
          <option value="work">업무</option>
          <option value="home">개인</option>
        </Select>
      </label>
      <Select name="disabled" disabled defaultValue="x" aria-label="비활성">
        <option value="x">제외</option>
      </Select>
      <button>저장</button>
      <button type="reset">초기화</button>
    </form>,
  );
  await user.click(screen.getByRole("combobox", { name: "카테고리" }));
  await user.click(screen.getByRole("option", { name: "개인" }));
  await user.click(screen.getByRole("button", { name: "저장" }));
  expect(saved?.get("category")).toBe("home");
  expect(saved?.has("disabled")).toBe(false);
  await user.click(screen.getByRole("button", { name: "초기화" }));
  await user.click(screen.getByRole("button", { name: "저장" }));
  expect(saved?.get("category")).toBe("work");
});
import { Input } from "./Input";
it("date/time controls preserve form values and enforce bounds and quarter hours", async () => {
  const user = userEvent.setup();
  let result: FormData | undefined;
  render(
    <form
      onSubmit={(e) => {
        e.preventDefault();
        result = new FormData(e.currentTarget);
      }}
    >
      <label>
        날짜
        <Input
          name="date"
          type="date"
          defaultValue="2026-02-28"
          min="2026-02-15"
          max="2026-03-10"
          required
        />
      </label>
      <label>
        시간
        <Input
          name="time"
          type="time"
          defaultValue="09:00"
          step={900}
          required
        />
      </label>
      <button>저장</button>
    </form>,
  );
  await user.clear(screen.getByLabelText("시간", { exact: true }));
  await user.type(screen.getByLabelText("시간", { exact: true }), "09:07");
  expect(screen.getByLabelText("시간", { exact: true })).toBeInvalid();
  await user.click(screen.getByRole("button", { name: "저장" }));
  expect(result).toBeUndefined();
  await user.clear(screen.getByLabelText("시간", { exact: true }));
  await user.type(screen.getByLabelText("시간", { exact: true }), "09:15");
  await user.click(screen.getByRole("button", { name: "날짜 선택" }));
  expect(screen.getByRole("button", { name: "2026년 2월 1일" })).toBeDisabled();
  await user.click(screen.getByRole("button", { name: "2026년 3월 1일" }));
  await user.click(screen.getByRole("button", { name: "저장" }));
  expect(result?.get("date")).toBe("2026-03-01");
  expect(result?.get("time")).toBe("09:15");
});
it("loads PostgreSQL quiet times and minute-first selection uses a valid fallback hour", async () => {
  const user = userEvent.setup();
  render(
    <label>
      방해금지
      <Input name="quiet" type="time" defaultValue="22:30:00" />
    </label>,
  );
  expect(screen.getByLabelText("방해금지")).toHaveValue("22:30");
  expect(screen.getByLabelText("방해금지")).toBeValid();
  cleanup();
  render(
    <label>
      빈 시간
      <Input name="quiet" type="time" />
    </label>,
  );
  await user.click(screen.getByRole("button", { name: "시간 선택" }));
  await user.click(screen.getByRole("button", { name: "30" }));
  await user.click(screen.getByRole("button", { name: "적용" }));
  expect(screen.getByLabelText("빈 시간")).toHaveValue("09:30");
  expect(screen.getByLabelText("빈 시간")).toBeValid();
});
