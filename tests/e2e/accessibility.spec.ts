import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
test("paper planner and keyboard editor have no serious accessibility violations", async ({
  page,
}, info) => {
  await page.goto("");
  await page.getByRole("button", { name: /저장 없이 플래너/ }).click();
  await page.getByRole("heading", { name: "이번 주, 나의 흐름" }).waitFor();
  const scan = await new AxeBuilder({ page }).analyze();
  expect(
    scan.violations
      .filter((v) => ["serious", "critical"].includes(v.impact ?? ""))
      .map((v) => ({
        id: v.id,
        nodes: v.nodes.map((n) => ({
          target: n.target,
          summary: n.failureSummary,
        })),
      })),
  ).toEqual([]);
  if (info.project.name === "mobile")
    await page.getByRole("button", { name: /TO-DO/ }).click();
  await page.getByRole("button", { name: "할 일 상세 추가" }).click();
  const modal = await new AxeBuilder({ page })
    .include('[role="dialog"]')
    .analyze();
  expect(
    modal.violations
      .filter((v) => ["serious", "critical"].includes(v.impact ?? ""))
      .map((v) => ({
        id: v.id,
        nodes: v.nodes.map((n) => ({
          target: n.target,
          summary: n.failureSummary,
        })),
      })),
  ).toEqual([]);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
