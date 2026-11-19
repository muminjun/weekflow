import { test, expect } from "./fixtures";
import { acceptConfirmations } from "./ui-helpers";

async function preview(page: import("@playwright/test").Page) {
  await page.goto("");
  await page.getByRole("button", { name: /저장 없이 플래너/ }).click();
  await expect(
    page.getByRole("heading", { name: "이번 주, 나의 흐름", exact: true }),
  ).toBeVisible();
}

const desktopOnly = () =>
  test.skip(
    test.info().project.name !== "desktop",
    "Pointer drag is desktop-only",
  );

test("Alt+drag copies a block and leaves the original", async ({ page }) => {
  desktopOnly();
  await acceptConfirmations(page);
  await preview(page);
  const blocks = page
    .locator(".time-block")
    .filter({ hasText: "주간 팀 미팅" });
  await expect(blocks).toHaveCount(1);
  const original = blocks.first();
  await original.evaluate((el) => el.scrollIntoView({ block: "center" }));
  const source = (await original.boundingBox())!;
  const target = (await page.locator(".day-column").nth(2).boundingBox())!;
  const scale = Number(
    await page.locator(".timeline-grid").getAttribute("data-scale"),
  );
  const grabY = Math.min(20, source.height / 2);
  await page.mouse.move(source.x + 20, source.y + grabY);
  await page.keyboard.down("Alt");
  await page.mouse.down();
  await page.mouse.move(target.x + 35, source.y + grabY + scale / 2, {
    steps: 15,
  });
  await expect(page.locator(".drag-preview.drag-copy")).toContainText("복사");
  await page.mouse.up();
  await page.keyboard.up("Alt");
  await expect(blocks).toHaveCount(2);
  // The original keeps its Monday 10:00 slot; the copy lands on Wednesday.
  await expect(
    page
      .locator(".day-column")
      .nth(0)
      .locator(".time-block", { hasText: "주간 팀 미팅" })
      .locator(".block-time"),
  ).toHaveText("10:00");
  await expect(
    page
      .locator(".day-column")
      .nth(2)
      .locator(".time-block", { hasText: "주간 팀 미팅" })
      .locator(".block-time"),
  ).toHaveText("10:30");
  await page.getByRole("button", { name: "실행 취소", exact: true }).click();
  await expect(blocks).toHaveCount(1);
});

test("dragging a deadline onto the timeline links and places it at once", async ({
  page,
}) => {
  desktopOnly();
  await acceptConfirmations(page);
  await preview(page);
  // Next week: the demo deadlines are overdue there and not linked yet.
  await page.getByRole("button", { name: "다음 주", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "할 일 0", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: /^마감 \d+$/ }).click();
  const row = page
    .locator(".deadline-item")
    .filter({ hasText: "브랜드 리뉴얼 기획안" });
  await expect(row).toHaveAttribute("draggable", "true");
  await row.dragTo(page.locator(".day-column").nth(1));
  const placed = page
    .locator(".day-column")
    .nth(1)
    .locator(".time-block", { hasText: "브랜드 리뉴얼 기획안" });
  await expect(placed).toHaveCount(1);
  await expect(
    page.getByRole("button", { name: "할 일 1", exact: true }),
  ).toBeVisible();
  // One commit: a single undo removes both the week link and the block.
  await page.getByRole("button", { name: "실행 취소", exact: true }).click();
  await expect(placed).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "할 일 0", exact: true }),
  ).toBeVisible();
});
