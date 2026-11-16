import { test, expect } from "@playwright/test";
test("appearance changes preserve editor values and week, survive reload and recover invalid preferences", async ({
  page,
}) => {
  await page.goto("");
  await page.getByRole("button", { name: /저장 없이 플래너/ }).click();
  await page.getByRole("button", { name: "다음 주", exact: true }).click();
  const week = page.url();
  await page.getByRole("button", { name: "빠른 추가", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByLabel("할 일", { exact: true })
    .fill("테마를 바꿔도 유지되는 초안");
  await dialog.getByLabel("외관 바꾸기", { exact: true }).click();
  await dialog.getByRole("button", { name: "다크", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(dialog.getByLabel("할 일", { exact: true })).toHaveValue(
    "테마를 바꿔도 유지되는 초안",
  );
  expect(page.url()).toBe(week);
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.evaluate(() =>
    localStorage.setItem("weekflow.appearance.v1", "{broken"),
  );
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "blue");
});
