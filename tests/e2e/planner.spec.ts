import { acceptConfirmations } from "./ui-helpers";
import { test, expect } from "./fixtures";
test("login, paper preview, inline Todo, multi-block editor, settings, screenshot", async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await acceptConfirmations(page);
  await page.goto("");
  await expect(
    page.getByRole("button", { name: "Google로 시작하기" }),
  ).toBeVisible();
  await page.getByRole("button", { name: /저장 없이 플래너/ }).click();
  await expect(
    page.getByRole("heading", { name: "이번 주, 나의 흐름" }),
  ).toBeVisible();
  if (info.project.name === "mobile")
    await page.getByRole("button", { name: /^할 일.*열기/ }).click();
  const quick = page.getByRole("textbox", { name: "새 할 일" });
  await quick.fill("통합 테스트 작업");
  await quick.press("Enter");
  await expect(
    page.getByRole("button", { name: "통합 테스트 작업", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "통합 테스트 작업", exact: true })
    .click();
  await page
    .getByRole("button", { name: "저장하고 배치", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "할 일을 시간표에 배치" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "저장", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "할 일을 시간표에 배치" }),
  ).toHaveCount(0);
  if (info.project.name === "mobile")
    await page
      .getByRole("dialog", { name: "이번 주 계획" })
      .getByRole("button", { name: "닫기", exact: true })
      .click();
  await page.getByRole("button", { name: "설정 열기" }).click();
  await page.getByRole("button", { name: "백업", exact: true }).click();
  await expect(page.getByRole("button", { name: "전체 JSON" })).toBeVisible();
  await page.getByRole("button", { name: "닫기", exact: true }).click();
  await page.screenshot({
    path: `docs/screenshots/${info.project.name}-planner.png`,
    fullPage: true,
  });
  expect(errors).toEqual([]);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(overflow).toBe(false);
});
test("mobile day selection / desktop records remain separate", async ({
  page,
}, info) => {
  await page.goto("");
  await page.getByRole("button", { name: /저장 없이 플래너/ }).click();
  if (info.project.name === "mobile") {
    await page
      .getByRole("navigation", { name: "날짜 선택" })
      .getByRole("button")
      .first()
      .click();
    await expect(page.locator(".day-column.mobile-selected")).toHaveCount(1);
  } else {
    await expect(page.locator(".day-column")).toHaveCount(7);
    await expect(
      page.locator(".todo-row:not(.empty) .tracker-cell"),
    ).toHaveCount(42);
  }
  await page.screenshot({
    path: `docs/screenshots/${info.project.name}-empty-state.png`,
    fullPage: true,
  });
});
test("15-minute pointer move, resize, overlap approval and Undo", async ({
  page,
}, info) => {
  test.skip(
    info.project.name !== "desktop",
    "Touch has equivalent time selectors",
  );
  await acceptConfirmations(page);
  await page.goto("");
  await page.getByRole("button", { name: /저장 없이 플래너/ }).click();
  const block = page.locator(".time-block").filter({ hasText: "주간 팀 미팅" });
  await block.evaluate((el) => el.scrollIntoView({ block: "center" }));
  const source = (await block.boundingBox())!;
  const target = (await page.locator(".day-column").nth(2).boundingBox())!;
  const scale = Number(
    await page.locator(".timeline-grid").getAttribute("data-scale"),
  );
  const grabY = Math.min(20, source.height / 2);
  await page.mouse.move(source.x + 20, source.y + grabY);
  await page.mouse.down();
  await page.mouse.move(target.x + 35, source.y + grabY + scale / 4, {
    steps: 15,
  });
  await page.mouse.up();
  await expect(block.locator(".block-time")).toHaveText("10:15");
  const moved = (await block.boundingBox())!;
  await page.mouse.move(moved.x + moved.width / 2, moved.y + moved.height - 3);
  await page.mouse.down();
  await page.mouse.move(
    moved.x + moved.width / 2,
    moved.y + moved.height - 3 + scale / 4,
    { steps: 8 },
  );
  await page.mouse.up();
  await expect(block.locator(".block-content")).toHaveAttribute(
    "aria-description",
    /10:15–11:30/,
  );
  await page.getByRole("button", { name: "실행 취소", exact: true }).click();
  await expect(block.locator(".block-content")).toHaveAttribute(
    "aria-description",
    /10:15–11:15/,
  );
  const restored = (await block.boundingBox())!;
  await page.mouse.move(restored.x + restored.width / 2, restored.y + 2);
  await page.mouse.down();
  await page.mouse.move(
    restored.x + restored.width / 2,
    restored.y + 2 + scale / 4,
    { steps: 8 },
  );
  await page.mouse.up();
  await expect(block.locator(".block-content")).toHaveAttribute(
    "aria-description",
    /10:30–11:15/,
  );
  await page.getByRole("button", { name: "실행 취소", exact: true }).click();
  await expect(block.locator(".block-content")).toHaveAttribute(
    "aria-description",
    /10:15–11:15/,
  );
});
