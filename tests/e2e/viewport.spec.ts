import { test, expect } from "./fixtures";
const sizes = [
  { width: 1366, height: 768 },
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 },
  { width: 1024, height: 768 },
  { width: 390, height: 844 },
  { width: 360, height: 800 },
];
for (const size of sizes)
  test(`workspace fits ${size.width}x${size.height}`, async ({ page }) => {
    await page.setViewportSize(size);
    await page.goto("");
    await page.getByRole("button", { name: /저장 없이 플래너/ }).click();
    await expect(page.locator(".timeline-grid")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "주간 회고 열기" }),
    ).toBeVisible();
    const bounds = await page.evaluate(() => {
      const root = document.documentElement;
      const selectors = [
        ".app-header",
        ".planner-heading",
        ".calendar",
        ".timeline-grid",
        ...(innerWidth >= 768 ? [".panel-wrapper"] : [".mobile-toolbar"]),
      ];
      return {
        overflowX: root.scrollWidth > innerWidth,
        overflowY: root.scrollHeight > innerHeight + 1,
        boxes: selectors.map((s) => {
          const el = document.querySelector(s)!;
          const b = el.getBoundingClientRect();
          return {
            s,
            top: b.top,
            bottom: b.bottom,
            left: b.left,
            right: b.right,
            height: b.height,
          };
        }),
        font: parseFloat(
          getComputedStyle(document.querySelector(".block-title")!).fontSize,
        ),
      };
    });
    expect(bounds.overflowX).toBe(false);
    expect(bounds.overflowY).toBe(false);
    for (const b of bounds.boxes) {
      expect(b.top, b.s).toBeGreaterThanOrEqual(0);
      expect(b.bottom, b.s).toBeLessThanOrEqual(size.height + 1);
      expect(b.height, b.s).toBeGreaterThan(30);
    }
    expect(bounds.font).toBeGreaterThanOrEqual(14);
    await page.screenshot({
      path: `docs/screenshots/ui-${size.width}x${size.height}.png`,
    });
  });
