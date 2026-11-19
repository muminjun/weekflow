import { test, expect } from "./fixtures";
test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-11-17T00:05:00Z"));
});
test("desktop blank drag presets ninety minutes without changing existing blocks", async ({
  page,
}, info) => {
  test.skip(info.project.name !== "desktop", "Mouse duration selection");
  await page.goto("");
  await page.getByRole("button", { name: /저장 없이 플래너/ }).click();
  await expect(page.locator(".holiday-notice")).toHaveCount(0);
  const column = page.locator(".day-column").nth(5),
    box = (await column.boundingBox())!;
  const x = box.x + box.width / 2,
    y = box.y + box.height / 3;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, y + box.height / 6, { steps: 8 });
  await page.mouse.up();
  const editor = page.getByRole("dialog", {
    name: "새로운 고정 일정",
    exact: true,
  });
  await expect(editor.locator('[name="start"]')).toHaveValue("12:00");
  await expect(editor.locator('[name="end"]')).toHaveValue("13:30");
});
test("schedule list searches saved titles and exposes today filter", async ({
  page,
}) => {
  await page.goto("");
  await page.getByRole("button", { name: /저장 없이 플래너/ }).click();
  await expect(
    page.getByRole("heading", { name: "이번 주, 나의 흐름", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("/");
  const list = page.getByRole("dialog", {
    name: "일정 목록",
    exact: true,
  });
  await expect(
    list.getByRole("searchbox", { name: "일정 검색" }),
  ).toBeFocused();
  await list.getByRole("searchbox", { name: "일정 검색" }).fill("외부 미팅");
  await expect(list.locator(".outside-row")).toHaveCount(1);
  await list.getByRole("button", { name: "오늘 일정", exact: true }).click();
  await expect(
    list.getByRole("button", { name: "오늘 일정", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await list.getByRole("searchbox", { name: "일정 검색" }).fill("");
  await list
    .locator(".outside-row")
    .first()
    .getByRole("button", { name: "이 시간 보기", exact: true })
    .click();
  await expect(list).toHaveCount(0);
});
test("unplaced Todo recommendations open a real linked block editor", async ({
  page,
}, info) => {
  await page.goto("");
  await page.getByRole("button", { name: /저장 없이 플래너/ }).click();
  if (info.project.name === "mobile") {
    await page.getByRole("button", { name: /할 일.*열기/ }).click();
    await page.keyboard.press("/");
    await expect(
      page.getByRole("dialog", { name: "일정 목록", exact: true }),
    ).toHaveCount(0);
  }
  await page.getByPlaceholder("할 일 추가 후 Enter").fill("빈 시간 추천 검증");
  await page.getByPlaceholder("할 일 추가 후 Enter").press("Enter");
  await page.getByRole("button", { name: "빈 시간 추천", exact: true }).click();
  const recommendations = page.getByRole("dialog", {
    name: "빈 시간 추천",
    exact: true,
  });
  await recommendations.getByRole("combobox", { name: "배치할 할 일" }).click();
  await page
    .getByRole("option", { name: "빈 시간 추천 검증", exact: true })
    .click();
  await page.screenshot({
    path: `docs/screenshots/tools-${info.project.name}-suggestions.png`,
  });
  await recommendations.locator(".suggestion-slot").first().click();
  const editor = page.getByRole("dialog", {
    name: "할 일을 시간표에 배치",
    exact: true,
  });
  await expect(editor.getByLabel("연결된 할 일", { exact: true })).toHaveValue(
    "빈 시간 추천 검증",
  );
  await editor.getByRole("button", { name: "저장", exact: true }).click();
  await expect(editor).toHaveCount(0);
});
