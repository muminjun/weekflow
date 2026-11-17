import { test, expect } from "./fixtures";
test.use({ calendarPrompt: true });
test("mobile saved schedule offers calendar copy with correct ICS and opt-out", async ({
  page,
}, info) => {
  test.skip(info.project.name !== "mobile", "Mobile calendar handoff");
  await page.goto("");
  await page.getByRole("button", { name: /저장 없이 플래너/ }).click();
  await page
    .getByRole("navigation", { name: "날짜 선택" })
    .getByRole("button")
    .nth(5)
    .click();
  await page
    .locator(".mobile-toolbar")
    .getByRole("button", { name: "일정", exact: true })
    .click();
  const editor = page.getByRole("dialog", {
    name: "새로운 고정 일정",
    exact: true,
  });
  await editor.locator('[name="title"]').fill("기기 달력 검증, 일정");
  const date = await editor.locator('[name="date"]').inputValue();
  await editor.getByRole("button", { name: "저장", exact: true }).click();
  await page
    .getByRole("dialog", { name: "변경 확인", exact: true })
    .getByRole("button", { name: "계속", exact: true })
    .click();
  const copy = page.getByRole("dialog", {
    name: "기기 달력에도 추가할까요?",
    exact: true,
  });
  await expect(copy).toBeVisible();
  await page.screenshot({ path: "docs/screenshots/mobile-calendar-copy.png" });
  await page.keyboard.press("/");
  await expect(
    page.getByRole("dialog", { name: "이번 주 일정 목록", exact: true }),
  ).toHaveCount(0);
  await expect(
    copy.getByText("기기 달력 검증, 일정", { exact: true }),
  ).toBeVisible();
  const downloadPromise = page.waitForEvent("download");
  await copy
    .getByRole("button", { name: "일정 파일 저장", exact: true })
    .click();
  const download = await downloadPromise;
  const stream = await download.createReadStream();
  let file = "";
  for await (const chunk of stream!) file += chunk.toString();
  expect(file).toContain("SUMMARY:기기 달력 검증\\, 일정");
  expect(file).toContain(`DTSTART:${date.replaceAll("-", "")}T000000Z`);
  expect(file).toContain(`DTEND:${date.replaceAll("-", "")}T010000Z`);
  await copy.getByRole("checkbox", { name: "다음부터 묻지 않기" }).check();
  await copy.getByRole("button", { name: "나중에", exact: true }).click();
  expect(
    await page.evaluate(() => localStorage.getItem("weekflow.calendar.ask")),
  ).toBe("off");
  await expect(
    page.locator(".time-block").filter({ hasText: "기기 달력 검증, 일정" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "설정 열기" }).click();
  await expect(
    page.getByRole("checkbox", {
      name: "모바일 일정 저장 후 기기 달력 추가 안내",
    }),
  ).not.toBeChecked();
});
