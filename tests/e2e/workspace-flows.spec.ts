import { acceptConfirmations, chooseView } from "./ui-helpers";
import { test, expect, type Page } from "./fixtures";
import AxeBuilder from "@axe-core/playwright";
import { readFile } from "node:fs/promises";
async function preview(page: Page) {
  await acceptConfirmations(page);
  await page.goto("");
  await page.getByRole("button", { name: /저장 없이 플래너/ }).click();
}
async function backup(page: Page) {
  await page.getByRole("button", { name: "설정 열기" }).click();
  await page.getByRole("button", { name: "백업", exact: true }).click();
  const downloaded = page.waitForEvent("download");
  await page.getByRole("button", { name: "전체 JSON", exact: true }).click();
  const file = await downloaded;
  const data = JSON.parse(await readFile((await file.path())!, "utf8"));
  await page.getByRole("button", { name: "닫기", exact: true }).click();
  return data.data;
}
async function event(
  page: Page,
  title: string,
  start: string,
  end: string,
  nextDay = false,
) {
  const add = page.locator(".grid-access:visible").first();
  await add.focus();
  await add.press("Enter");
  const d = page.getByRole("dialog", { name: "새로운 고정 일정" });
  await d.getByLabel("일정 이름").fill(title);
  await d.getByLabel("시작", { exact: true }).fill(start);
  await d.getByLabel("종료", { exact: true }).fill(end);
  if (nextDay) {
    const date = await d.getByLabel("시작 날짜").inputValue();
    const next = new Date(date + "T12:00:00Z");
    next.setUTCDate(next.getUTCDate() + 1);
    await d.getByLabel("종료 날짜").fill(next.toISOString().slice(0, 10));
  }
  await d.getByRole("button", { name: "저장", exact: true }).click();
  await expect(d).toHaveCount(0);
}
test("all four themes, large type, portal contrast and category preservation", async ({
  page,
}, info) => {
  test.setTimeout(60000);
  await preview(page);
  const before = await backup(page);
  for (const [id, name] of [
    ["blue", "클린 블루"],
    ["lime", "페이퍼 라임"],
    ["mint", "소프트 민트"],
    ["dark", "다크"],
  ]) {
    await page.getByRole("button", { name: "외관 / 테마" }).click();
    const d = page.getByRole("dialog", { name: "외관", exact: true });
    await d.getByRole("button", { name, exact: true }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", id);
    const colors = await d.evaluate((el) => ({
      dialog: getComputedStyle(el).backgroundColor,
      root: getComputedStyle(document.documentElement)
        .getPropertyValue("--raised")
        .trim(),
    }));
    expect(colors.dialog).not.toBe("rgba(0, 0, 0, 0)");
    await page.screenshot({
      path: `docs/screenshots/${info.project.name}-${id}-appearance.png`,
    });
    await d.getByRole("button", { name: "닫기", exact: true }).click();
    const scan = await new AxeBuilder({ page }).analyze();
    expect(
      scan.violations
        .filter((v) => ["serious", "critical"].includes(v.impact ?? ""))
        .map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target) })),
    ).toEqual([]);
    await page.screenshot({
      path: `docs/screenshots/${info.project.name}-${id}-workspace.png`,
    });
  }
  await page.getByRole("button", { name: "외관 / 테마" }).click();
  await page.getByRole("button", { name: "크게", exact: true }).click();
  await page.getByRole("button", { name: "닫기", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-text", "large");
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollHeight <= innerHeight + 1 &&
        document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "빠른 추가" }).click();
  expect(
    await page
      .getByRole("dialog")
      .locator('input[name="title"]')
      .evaluate((el) => parseFloat(getComputedStyle(el).fontSize)),
  ).toBeGreaterThanOrEqual(18);
  await page
    .getByRole("dialog")
    .locator('input[name="title"]')
    .fill("큰 글자에서도 저장");
  await page.getByRole("button", { name: "저장", exact: true }).click();
  const after = await backup(page);
  expect(after.categories).toEqual(before.categories);
  expect(after.profile).toEqual(before.profile);
  expect(
    after.tasks.some(
      (t: { title: string }) => t.title === "큰 글자에서도 저장",
    ),
  ).toBe(true);
  await page.screenshot({
    path: `docs/screenshots/${info.project.name}-large-type.png`,
  });
});
test("outside events, compact quarter-hour geometry, midnight and full-day detail", async ({
  page,
}, info) => {
  await preview(page);
  await event(page, "늦은 15분 일정", "23:30", "23:45");
  await expect(
    page.getByRole("button", { name: /범위 밖 일정 1개/ }),
  ).toBeEnabled();
  await page.getByRole("button", { name: /범위 밖 일정 1개/ }).click();
  await expect(page.getByRole("dialog")).toContainText("늦은 15분 일정");
  await page.getByRole("button", { name: "이 시간 보기", exact: true }).click();
  await expect(page.locator(".visible-range")).toHaveText("15:00–24:00");
  const block = page
    .locator(".time-block:visible")
    .filter({ hasText: "늦은 15분 일정" });
  const scale = Number(
    await page.locator(".timeline-grid").getAttribute("data-scale"),
  );
  const box = (await block.boundingBox())!;
  expect(box.height).toBeCloseTo(scale / 4, 0);
  const button = block.getByRole("button");
  await button.focus();
  await button.press("Enter");
  await expect(
    page.getByRole("dialog", { name: "시간 블록 편집" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "닫기", exact: true }).click();
  await event(page, "자정 경계 일정", "23:45", "00:15", true);
  await chooseView(page, "전체 24시간 · 상세");
  await expect(page.locator(".visible-range")).toHaveText("00:00–24:00");
  if (info.project.name === "desktop")
    expect(
      await page
        .locator(".time-block")
        .filter({ hasText: "자정 경계 일정" })
        .count(),
    ).toBe(2);
  expect(
    await page
      .locator(".timeline-scroll")
      .evaluate((el) => el.scrollHeight > el.clientHeight),
  ).toBe(true);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollHeight <= innerHeight + 1,
    ),
  ).toBe(true);
  await chooseView(page, "내 설정 범위 · 상세");
  await expect(page.locator(".visible-range")).toHaveText("04:00–24:00");
});
test("goals, deadlines, review and native settings serialize correctly", async ({
  page,
}, info) => {
  await preview(page);
  if (info.project.name === "mobile")
    await page.getByRole("button", { name: /^할 일.*열기/ }).click();
  await page.getByRole("button", { name: /^목표 \d/ }).click();
  await page.getByRole("button", { name: "목표 추가", exact: true }).click();
  let d = page.getByRole("dialog", { name: "이번 주 목표 추가" });
  await d.getByLabel("목표", { exact: true }).fill("검증용 주간 목표");
  await d.getByRole("button", { name: "저장", exact: true }).click();
  await expect(
    page.getByRole("button", { name: /검증용 주간 목표/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: /^마감 \d/ }).click();
  await expect(
    page.getByRole("heading", { name: "다가오는 마감" }),
  ).toBeVisible();
  if (info.project.name === "mobile")
    await page
      .getByRole("dialog", { name: "이번 주 계획" })
      .getByRole("button", { name: "닫기", exact: true })
      .click();
  await page.getByRole("button", { name: "주간 회고 열기" }).click();
  d = page.getByRole("dialog", { name: "주간 회고", exact: true });
  await d
    .getByLabel("이번 주 잘한 점", { exact: true })
    .fill("새 화면에서 기록");
  await d.getByRole("button", { name: "회고 확정", exact: true }).click();
  await d.getByRole("button", { name: "닫기", exact: true }).click();
  await page.getByRole("button", { name: "설정 열기" }).click();
  await page.getByRole("button", { name: "알림", exact: true }).click();
  await page.getByLabel("알림 사용", { exact: true }).check();
  await page.getByLabel("마감 하루 전", { exact: true }).uncheck();
  await page.getByLabel("일정 시작 몇 분 전").fill("30");
  await page.getByRole("button", { name: "알림 설정 저장" }).click();
  await expect(page.getByText("알림 설정을 저장했습니다.")).toBeVisible();
  await page.getByRole("button", { name: "닫기", exact: true }).click();
  const data = await backup(page);
  expect(data.notification_preferences.enabled).toBe(true);
  expect(data.notification_preferences.due_d1).toBe(false);
  expect(data.notification_preferences.event_reminder_minutes).toBe(30);
  expect(
    data.goals.some((g: { title: string }) => g.title === "검증용 주간 목표"),
  ).toBe(true);
  expect(data.week_reviews[0].did_well).toBe("새 화면에서 기록");
  expect(data.week_reviews[0].finalized_at).toBeTruthy();
});
test("agenda is a reachable alternative for short blocks and closes with Escape", async ({
  page,
}) => {
  await preview(page);
  await page.getByRole("button", { name: /^일정 목록/ }).click();
  await expect(page.getByRole("dialog", { name: "일정 목록" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^일정 목록/ })).toBeFocused();
});
test("moving a midnight block to another day retains its start time and duration", async ({
  page,
}, info) => {
  test.skip(
    info.project.name !== "desktop",
    "Touch uses explicit start/end selectors",
  );
  await preview(page);
  await event(page, "자정 이동 검증", "23:45", "00:15", true);
  const before = await backup(page);
  const original = before.time_blocks.find(
    (b: { event_title: string }) => b.event_title === "자정 이동 검증",
  );
  await chooseView(page, "전체 24시간 · 상세");
  const block = page
    .locator(".time-block")
    .filter({ hasText: "자정 이동 검증" })
    .first();
  await block.scrollIntoViewIfNeeded();
  const rect = (await block.boundingBox())!;
  const target = (await page.locator(".day-column").nth(2).boundingBox())!;
  await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2);
  await page.mouse.down();
  await page.mouse.move(target.x + target.width / 2, rect.y + rect.height / 2, {
    steps: 10,
  });
  await page.mouse.up();
  const after = await backup(page);
  const moved = after.time_blocks.find(
    (b: { id: string }) => b.id === original.id,
  );
  expect(moved.start_at.slice(11, 16)).toBe(original.start_at.slice(11, 16));
  expect(Date.parse(moved.start_at) - Date.parse(original.start_at)).toBe(
    2 * 86400000,
  );
  expect(Date.parse(moved.end_at) - Date.parse(moved.start_at)).toBe(
    30 * 60000,
  );
});
test("previous-week midnight continuation jumps to the visible week and compact click edits", async ({
  page,
}) => {
  await preview(page);
  // This scenario must cross the week boundary, regardless of today's weekday.
  await expect(
    page.getByRole("heading", { name: "이번 주, 나의 흐름" }),
  ).toBeVisible();
  const dayPicker = page.getByRole("navigation", { name: "날짜 선택" });
  if (await dayPicker.isVisible())
    await dayPicker.getByRole("button").first().click();
  const add = page.locator(".grid-access:visible").first();
  await add.focus();
  await add.press("Enter");
  const d = page.getByRole("dialog", { name: "새로운 고정 일정" });
  const current = await d.getByLabel("시작 날짜").inputValue();
  const previous = new Date(current + "T12:00:00Z");
  previous.setUTCDate(previous.getUTCDate() - 1);
  await d.getByLabel("일정 이름").fill("지난주에서 이어진 일정");
  await d.getByLabel("시작 날짜").fill(previous.toISOString().slice(0, 10));
  await d.getByLabel("종료 날짜").fill(current);
  await d.getByLabel("시작", { exact: true }).fill("23:45");
  await d.getByLabel("종료", { exact: true }).fill("00:15");
  await d.getByRole("button", { name: "저장", exact: true }).click();
  await page.getByRole("button", { name: /범위 밖 일정 1개/ }).click();
  await page.getByRole("button", { name: "이 시간 보기", exact: true }).click();
  await expect(page.locator(".visible-range")).toHaveText("00:00–09:00");
  const block = page
    .locator(".time-block:visible")
    .filter({ hasText: "지난주에서 이어진 일정" });
  await expect(block).toBeVisible();
  const box = (await block.boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(
    page.getByRole("dialog", { name: "시간 블록 편집" }),
  ).toBeVisible();
});
test("keyboard quick add works from a non-Todo tab and save is reachable in a reduced-height viewport", async ({
  page,
}, info) => {
  await preview(page);
  if (info.project.name === "mobile")
    await page.getByRole("button", { name: /^할 일.*열기/ }).click();
  await page.getByRole("button", { name: /^목표 \d/ }).click();
  if (info.project.name === "mobile")
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "닫기", exact: true })
      .click();
  await page.keyboard.press("n");
  await expect(
    page.getByRole("dialog", { name: "새로운 할 일" }),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 500 });
  const d = page.getByRole("dialog");
  await d.getByLabel("할 일", { exact: true }).fill("낮은 화면에서도 저장");
  await d
    .locator(".modal-body")
    .evaluate((el) => (el.scrollTop = el.scrollHeight));
  const save = d.getByRole("button", { name: "저장", exact: true });
  const box = (await save.boundingBox())!;
  expect(box.y + box.height).toBeLessThanOrEqual(500);
  await save.click();
  await expect(d).toHaveCount(0);
});
