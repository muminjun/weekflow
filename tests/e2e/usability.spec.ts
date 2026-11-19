import { test, expect } from "./fixtures";
async function preview(page: import("@playwright/test").Page) {
  await page.goto("");
  await page.getByRole("button", { name: /저장 없이 플래너/ }).click();
  await expect(
    page.getByRole("heading", { name: "이번 주, 나의 흐름", exact: true }),
  ).toBeVisible();
}
test("settings retain drafts when visiting another tab", async ({ page }) => {
  await preview(page);
  await page.getByRole("button", { name: "설정 열기" }).click();
  await page.getByLabel("시간대", { exact: true }).fill("Asia/Tokyo");
  await page.getByRole("button", { name: "알림", exact: true }).click();
  await page.getByLabel("방해금지 시작").fill("22:15");
  await page.getByRole("button", { name: "기본", exact: true }).click();
  await expect(page.getByLabel("시간대", { exact: true })).toHaveValue(
    "Asia/Tokyo",
  );
  await page.getByRole("button", { name: "알림", exact: true }).click();
  await expect(page.getByLabel("방해금지 시작")).toHaveValue("22:15");
});
test("saving and placing a Todo retains its edited title", async ({
  page,
}, info) => {
  await preview(page);
  if (info.project.name === "mobile")
    await page.getByRole("button", { name: /할 일.*열기/ }).click();
  await page.locator(".todo-title").first().click();
  const editor = page.getByRole("dialog", { name: "할 일 편집", exact: true });
  await editor
    .getByLabel("할 일", { exact: true })
    .fill("수정한 제목을 배치까지 유지");
  await editor
    .getByRole("button", { name: /시간표에 배치|저장하고 배치/, exact: false })
    .click();
  const block = page.getByRole("dialog", {
    name: "할 일을 시간표에 배치",
    exact: true,
  });
  await expect(block.getByLabel("연결된 할 일", { exact: true })).toHaveValue(
    "수정한 제목을 배치까지 유지",
  );
});
test("dirty editor asks before Escape and preserves values when continuing", async ({
  page,
}) => {
  await preview(page);
  await page.getByRole("button", { name: "빠른 추가", exact: true }).click();
  const editor = page.getByRole("dialog", {
    name: "새로운 할 일",
    exact: true,
  });
  await editor.getByLabel("할 일", { exact: true }).fill("작성 중인 내용 보존");
  await page.keyboard.press("Escape");
  const confirm = page.getByRole("dialog", {
    name: "작성 중인 내용이 있어요",
    exact: true,
  });
  await expect(confirm).toBeVisible();
  await confirm.getByRole("button", { name: "계속 작성", exact: true }).click();
  await expect(editor.getByLabel("할 일", { exact: true })).toHaveValue(
    "작성 중인 내용 보존",
  );
  await page.keyboard.press("Escape");
  await confirm
    .getByRole("button", { name: "저장하지 않고 닫기", exact: true })
    .click();
  await expect(editor).toHaveCount(0);
});
test("numeric steppers have usable touch targets and clear limits", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await preview(page);
  await page.getByRole("button", { name: "빠른 추가", exact: true }).click();
  const editor = page.getByRole("dialog", {
    name: "새로운 할 일",
    exact: true,
  });
  const estimate = editor.getByLabel("예상 소요 (분)", { exact: true });
  await estimate.fill("15");
  const minus = editor.getByRole("button", { name: "값 줄이기", exact: true });
  const plus = editor.getByRole("button", { name: "값 늘리기", exact: true });
  await expect(minus).toBeDisabled();
  for (const button of [minus, plus]) {
    const box = (await button.boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
  }
  await plus.click();
  await expect(estimate).toHaveValue("30");
  await estimate.fill("10080");
  await expect(plus).toBeDisabled();
});
test("keyboard moves and resizes a timeline block", async ({ page }, info) => {
  test.skip(info.project.name === "mobile", "desktop keyboard workflow");
  await preview(page);
  const block = page.locator(".time-block .block-content").first();
  const id = await page
    .locator(".time-block")
    .first()
    .getAttribute("data-block-id");
  const time = () =>
    page.locator(`[data-block-id="${id}"] .block-time`).first().innerText();
  const before = await time();
  await block.focus();
  await page.keyboard.press("Alt+ArrowDown");
  for (const name of ["겹쳐서 배치", "계속"]) {
    const button = page.getByRole("button", { name, exact: true });
    if (await button.isVisible().catch(() => false)) await button.click();
  }
  await expect.poll(time).not.toBe(before);
  await expect(page.getByRole("status").filter({ hasText: "–" })).toHaveCount(
    1,
  );
});
test("N opens a new Todo even with the Korean keyboard layout", async ({
  page,
}, info) => {
  test.skip(info.project.name === "mobile", "hardware keyboard");
  await preview(page);
  await page.locator("body").click({ position: { x: 5, y: 5 } });
  await page.keyboard.down("KeyN");
  await page.keyboard.up("KeyN");
  await expect(
    page.getByRole("dialog", { name: "새로운 할 일", exact: true }),
  ).toBeVisible();
});
test("quick add understands Korean dates and times, and Cmd+Z / Shift+Cmd+Z step through history", async ({
  page,
}, info) => {
  test.skip(info.project.name === "mobile", "hardware keyboard");
  await preview(page);
  const input = page.getByPlaceholder("할 일 추가 후 Enter");
  await input.fill("내일 3시 자연어 회의 30분");
  await expect(page.locator(".quick-parse")).toContainText("15:00–15:30");
  await input.press("Enter");
  const block = page.locator(".time-block", { hasText: "자연어 회의" });
  await expect(block).toHaveCount(1);
  await expect(block.locator(".block-time")).toContainText("15:00");
  await page.locator("body").click({ position: { x: 5, y: 5 } });
  await page.keyboard.press("ControlOrMeta+z");
  await expect(block).toHaveCount(0);
  await expect(page.getByText("되돌렸어요")).toBeVisible();
  await page.keyboard.press("ControlOrMeta+Shift+z");
  await expect(block).toHaveCount(1);
});
test("command palette runs actions, finds by initial consonants and creates from Korean text", async ({
  page,
}, info) => {
  test.skip(info.project.name === "mobile", "hardware keyboard");
  await preview(page);
  await page.keyboard.press("ControlOrMeta+k");
  const palette = page.getByRole("dialog", { name: "무엇을 할까요?" });
  const input = palette.getByRole("combobox");
  await expect(input).toBeFocused();
  await input.fill("ㅈㄱㅎㄱ");
  await expect(palette.getByRole("option").first()).toContainText("주간 회고");
  await input.press("Enter");
  await expect(page.getByRole("dialog", { name: "주간 회고" })).toBeVisible();
  await page.keyboard.press("Escape");
  await page.keyboard.press("ControlOrMeta+k");
  await page
    .getByRole("dialog", { name: "무엇을 할까요?" })
    .getByRole("combobox")
    .fill("내일 10시 팔레트 회의");
  await expect(page.getByRole("option", { selected: true })).toContainText(
    "10:00–11:00",
  );
  await page.keyboard.press("Enter");
  await expect(
    page.locator(".time-block", { hasText: "팔레트 회의" }),
  ).toHaveCount(1);
});
test("auto-schedule drafts the week, applies once and one undo reverts all", async ({
  page,
}, info) => {
  test.skip(info.project.name === "mobile", "hardware keyboard");
  await preview(page);
  for (const title of ["자동 배치 하나", "자동 배치 둘"]) {
    await page.getByPlaceholder("할 일 추가 후 Enter").fill(title);
    await page.getByPlaceholder("할 일 추가 후 Enter").press("Enter");
  }
  const before = await page.locator(".time-block").count();
  await page.getByRole("button", { name: "빈 시간 추천", exact: true }).click();
  const dialog = page.getByRole("dialog", {
    name: "빈 시간 추천",
    exact: true,
  });
  await dialog
    .getByRole("button", { name: /이번 주 자동 배치 초안 만들기/ })
    .click();
  const apply = dialog.getByRole("button", { name: /선택한 \d+개 배치/ });
  await expect(apply).toBeEnabled();
  const count = Number((await apply.innerText()).match(/\d+/)![0]);
  expect(count).toBeGreaterThanOrEqual(2);
  await apply.click();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(page.locator(".time-block")).not.toHaveCount(before);
  await page.locator("body").click({ position: { x: 5, y: 5 } });
  await page.keyboard.press("ControlOrMeta+z");
  await expect(page.locator(".time-block")).toHaveCount(before);
});
