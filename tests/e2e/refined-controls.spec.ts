import { test, expect } from "./fixtures";
test("custom calendar and choice menu replace browser-native popups", async ({
  page,
}) => {
  await page.goto("");
  await page.getByRole("button", { name: /저장 없이 플래너/ }).click();
  await page
    .getByRole("button", { name: "날짜로 주 이동", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "날짜 선택", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await page
    .getByRole("combobox", { name: "시간표 보기", exact: true })
    .click();
  await expect(
    page.getByRole("option", { name: "전체 24시간 · 상세", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("option", { name: "전체 24시간 · 상세", exact: true })
    .click();
  await expect(page.locator(".visible-range")).toHaveText("00:00–24:00");
});
test("date/time/category popovers keep values and focus inside the editor", async ({
  page,
}) => {
  await page.goto("");
  await page.getByRole("button", { name: /저장 없이 플래너/ }).click();
  await page.getByRole("button", { name: "빠른 추가", exact: true }).click();
  const editor = page.getByRole("dialog", {
    name: "새로운 할 일",
    exact: true,
  });
  await editor.getByLabel("할 일", { exact: true }).fill("세부 컨트롤 검증");
  await editor.getByRole("combobox", { name: "카테고리", exact: true }).click();
  await page.getByRole("option", { name: "PERSONAL", exact: true }).click();
  const dateButton = editor
    .getByRole("button", { name: "날짜 선택", exact: true })
    .first();
  await dateButton.click();
  const calendar = page.getByRole("dialog", { name: "날짜 선택", exact: true });
  await expect(calendar.locator(".calendar-weekdays")).toHaveText(
    "월화수목금토일",
  );
  await calendar.getByRole("button", { name: "다음 달", exact: true }).click();
  await page.keyboard.press("Escape");
  await expect(editor).toBeVisible();
  await expect(dateButton).toBeFocused();
  await dateButton.click();
  await page
    .getByRole("dialog", { name: "날짜 선택", exact: true })
    .getByRole("button", { name: "오늘", exact: true })
    .click();
  await expect(editor.getByLabel("할 일", { exact: true })).toHaveValue(
    "세부 컨트롤 검증",
  );
  await editor.getByRole("button", { name: "저장", exact: true }).click();
  await expect(editor).toHaveCount(0);
  await page.getByRole("button", { name: "설정 열기" }).click();
  await page.getByRole("button", { name: "알림", exact: true }).click();
  const enabled = page.getByRole("switch", { name: "알림 사용", exact: true });
  await enabled.check();
  expect(await enabled.evaluate((el) => getComputedStyle(el).appearance)).toBe(
    "none",
  );
  const timeButton = page
    .getByRole("button", { name: "시간 선택", exact: true })
    .first();
  await timeButton.click();
  const time = page.getByRole("dialog", { name: "시간 선택", exact: true });
  await time.getByRole("button", { name: "22", exact: true }).click();
  await time.getByRole("button", { name: "30", exact: true }).click();
  await time.getByRole("button", { name: "적용", exact: true }).click();
  await expect(page.getByLabel("방해금지 시작", { exact: true })).toHaveValue(
    "22:30",
  );
  await page.getByRole("button", { name: "알림 설정 저장" }).click();
  await expect(page.getByText("알림 설정을 저장했습니다.")).toBeVisible();
  expect(
    await page
      .locator(
        'input[type="date"],input[type="time"],input[type="color"],select:not([hidden]):not([aria-hidden="true"])',
      )
      .count(),
  ).toBe(0);
});
test("calendar adopts all themes and keyboard can move a day before selection", async ({
  page,
}, info) => {
  test.setTimeout(60000);
  await page.goto("");
  await page.getByRole("button", { name: /저장 없이 플래너/ }).click();
  for (const [id, name] of [
    ["blue", "클린 블루"],
    ["lime", "페이퍼 라임"],
    ["mint", "소프트 민트"],
    ["dark", "다크"],
  ]) {
    await page.getByRole("button", { name: "외관 / 테마" }).click();
    await page.getByRole("button", { name, exact: true }).click();
    await page.getByRole("button", { name: "닫기", exact: true }).click();
    await page
      .getByRole("button", { name: "날짜로 주 이동", exact: true })
      .click();
    const calendar = page.getByRole("dialog", {
      name: "날짜 선택",
      exact: true,
    });
    await expect(calendar).toBeVisible();
    await page.screenshot({
      path: `docs/screenshots/refined-${info.project.name}-${id}-calendar.png`,
    });
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("Enter");
    await expect(calendar).toHaveCount(0);
  }
});
test("calendar receives more usable area and expands without losing the week", async ({
  page,
}, info) => {
  test.skip(
    info.project.name !== "desktop",
    "Desktop workspace area regression",
  );
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto("");
  await page.getByRole("button", { name: /저장 없이 플래너/ }).click();
  // Holiday loading and ResizeObserver settle the fitted time scale asynchronously.
  await expect(page.locator(".holiday-notice")).toHaveCount(0);
  await expect
    .poll(
      async () =>
        (await page.locator(".timeline-grid").boundingBox())?.height ?? 0,
    )
    .toBeGreaterThanOrEqual(420);
  const before = (await page.locator(".timeline-grid").boundingBox())!;
  const week = page.url();
  await page
    .getByRole("button", { name: "일정 넓게 보기", exact: true })
    .click();
  const expanded = (await page.locator(".timeline-grid").boundingBox())!;
  expect(expanded.width).toBeGreaterThan(before.width + 250);
  expect(page.url()).toBe(week);
  await expect(
    page.getByRole("button", { name: "작업 패널 펼치기", exact: true }),
  ).toBeVisible();
});
