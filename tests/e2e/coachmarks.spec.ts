import { test, expect } from "./fixtures";
test.use({ coachmarks: true });
test("first-visit coachmarks finish, persist and replay from help", async ({
  page,
}, info) => {
  await page.goto("");
  await page.getByRole("button", { name: /저장 없이 플래너/ }).click();
  const tour = page.getByRole("dialog", {
    name: "WEEKFLOW 사용법",
    exact: true,
  });
  await expect(tour).toBeVisible();
  await expect(page.locator(".holiday-notice")).toHaveCount(0);
  await expect
    .poll(async () => {
      const spot = (await page.locator(".coach-spotlight").boundingBox())!;
      const target = (await page
        .locator(
          info.project.name === "mobile"
            ? ".mobile-toolbar .primary"
            : ".inline-task",
        )
        .boundingBox())!;
      return Math.max(
        Math.abs(spot.y - target.y + 3),
        Math.abs(spot.x - target.x + 3),
      );
    })
    .toBeLessThan(2);
  const bounds = (await tour.boundingBox())!;
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.y).toBeGreaterThanOrEqual(0);
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(
    page.viewportSize()!.height,
  );
  await page.screenshot({
    path: `docs/screenshots/refined-${info.project.name}-coachmark.png`,
  });
  for (let i = 0; i < 4; i++)
    await tour.getByRole("button", { name: "다음", exact: true }).click();
  await tour.getByRole("button", { name: "시작하기", exact: true }).click();
  await expect(tour).toHaveCount(0);
  expect(
    await page.evaluate(() => localStorage.getItem("weekflow.coach.v1")),
  ).toBe("done");
  await page.reload();
  await page.getByRole("button", { name: /저장 없이 플래너/ }).click();
  await expect(tour).toHaveCount(0);
  if (info.project.name === "desktop")
    await page
      .getByRole("button", { name: "일정 넓게 보기", exact: true })
      .click();
  await page.getByRole("button", { name: "설정 열기" }).click();
  await page.getByRole("button", { name: "사용법", exact: true }).click();
  await page.getByRole("button", { name: "사용법 다시 보기" }).click();
  await expect(tour).toBeVisible();
  const spotlight = (await page.locator(".coach-spotlight").boundingBox())!;
  expect(spotlight.width).toBeGreaterThan(40);
  expect(spotlight.x).toBeGreaterThanOrEqual(0);
  await page.keyboard.press("Escape");
  await expect(tour).toHaveCount(0);
});
