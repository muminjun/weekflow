import { it, expect } from "vitest";
import { userMessage } from "./errors";
it("preserves useful Korean validation while hiding SDK and SQL details", () => {
  expect(userMessage(new Error("제목을 입력해 주세요."))).toBe(
    "제목을 입력해 주세요.",
  );
  expect(userMessage(new Error("FunctionsHttpError: non-2xx"))).not.toContain(
    "FunctionsHttpError",
  );
  expect(userMessage("VERSION_CONFLICT")).toContain("변경");
  expect(userMessage(new TypeError("Failed to fetch"))).toContain("연결");
});
