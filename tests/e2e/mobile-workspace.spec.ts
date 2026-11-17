import { test, expect } from "./fixtures";
test("mobile workspace gives time to the calendar and tap creates at the exact quarter hour", async ({
  page,
}, info) => {
  test.skip(info.project.name !== "mobile", "Touch workflow");
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("");
  await page.getByRole("button", { name: /저장 없이 플래너/ }).click();
  await expect(page.locator(".holiday-notice")).toHaveCount(0);
  await expect
    .poll(
      async () =>
        (await page.locator(".timeline-grid").boundingBox())?.height ?? 0,
    )
    .toBeGreaterThanOrEqual(450);
  for (const name of [
    "이전 주",
    "다음 주",
    "날짜로 주 이동",
    "외관 / 테마",
    "설정 열기",
  ]) {
    const box = await page
      .getByRole("button", { name, exact: true })
      .boundingBox();
    expect(box?.width).toBeGreaterThanOrEqual(44);
    expect(box?.height).toBeGreaterThanOrEqual(44);
  }
  await page
    .locator(".mobile-toolbar")
    .getByRole("button", { name: "일정", exact: true })
    .click();
  const compact = page.getByRole("dialog", {
    name: "새로운 고정 일정",
    exact: true,
  });
  const field = compact.locator('[name="title"]');
  expect((await field.boundingBox())!.height).toBeLessThanOrEqual(46);
  await page.screenshot({ path: "docs/screenshots/mobile-compact-editor.png" });
  expect(
    await field.evaluate((e) => parseFloat(getComputedStyle(e).fontSize)),
  ).toBeGreaterThanOrEqual(16);
  await compact.getByRole("button", { name: "닫기", exact: true }).click();
  // Saturday is empty in the preview, so touch a deterministic visible slot.
  await page
    .getByRole("navigation", { name: "날짜 선택" })
    .getByRole("button")
    .nth(5)
    .click();
  const column = page.locator(".day-column:visible");
  const box = (await column.boundingBox())!;
  // 09:00–18:00, one third down is precisely 12:00.
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 3);
  const editor = page.getByRole("dialog", { name: /새로운 고정 일정/ });
  await expect(editor).toBeVisible();
  await expect(editor.locator('[name="start"]')).toHaveValue("12:00");
  await editor.getByRole("button", { name: "닫기", exact: true }).click();
  await page.getByRole("button", { name: /할 일.*열기/ }).click();
  await expect(
    page.getByRole("dialog", { name: "이번 주 계획", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
test("mobile editor stays above a keyboard-sized visual viewport", async ({
  page,
}, info) => {
  test.skip(
    info.project.name !== "mobile",
    "Visual viewport keyboard workflow",
  );
  await page.goto("");
  await page.getByRole("button", { name: /저장 없이 플래너/ }).click();
  // Use the bottom add action; the header no longer duplicates mobile creation.
  await page
    .locator(".mobile-toolbar")
    .getByRole("button", { name: "일정", exact: true })
    .click();
  const editor = page.getByRole("dialog", {
    name: "새로운 고정 일정",
    exact: true,
  });
  await expect(editor).toBeVisible();
  await page.evaluate(() => {
    const viewport = new EventTarget();
    Object.assign(viewport, { height: 440, offsetTop: 0 });
    Object.defineProperty(window, "visualViewport", {
      configurable: true,
      value: viewport,
    });
    window.dispatchEvent(new Event("resize"));
    viewport.dispatchEvent(new Event("resize"));
  });
  await expect
    .poll(
      async () =>
        (await editor.boundingBox())!.y + (await editor.boundingBox())!.height,
    )
    .toBeLessThanOrEqual(440);
  await editor.locator('[name="title"]').fill("모바일 키보드 검증");
  const save = editor
    .getByRole("button", { name: /저장/, exact: false })
    .last();
  await save.scrollIntoViewIfNeeded();
  const saveBox = (await save.boundingBox())!;
  expect(saveBox.y + saveBox.height).toBeLessThanOrEqual(440);
  await save.click();
  await expect(editor).toHaveCount(0);
});
test("desktop hover previews one hour and one click presets exact start and end", async ({
  page,
}, info) => {
  test.skip(info.project.name !== "desktop", "Mouse hover workflow");
  await page.goto("");
  await page.getByRole("button", { name: /저장 없이 플래너/ }).click();
  await expect(page.locator(".holiday-notice")).toHaveCount(0);
  const column = page.locator(".day-column").nth(5);
  const box = (await column.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 3);
  const ghost = page.getByRole("button", { name: /12:00.*1시간 일정 추가/ });
  await expect(ghost).toBeVisible();
  await page.screenshot({ path: "docs/screenshots/desktop-hover-create.png" });
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 3);
  const editor = page.getByRole("dialog", {
    name: "새로운 고정 일정",
    exact: true,
  });
  await expect(editor.locator('[name="start"]')).toHaveValue("12:00");
  await expect(editor.locator('[name="end"]')).toHaveValue("13:00");
  await editor.getByRole("button", { name: "닫기", exact: true }).click();
  // Nearest-quarter rounding puts the silhouette below the pointer at 12:08.
  const pointerY = box.y + box.height * (188 / 540);
  await page.mouse.move(box.x + box.width / 2, pointerY);
  await expect(
    page.getByRole("button", { name: /12:15.*1시간 일정 추가/ }),
  ).toBeVisible();
  await page.mouse.click(box.x + box.width / 2, pointerY);
  await expect(editor.locator('[name="start"]')).toHaveValue("12:15");
  await expect(editor.locator('[name="end"]')).toHaveValue("13:15");
});
