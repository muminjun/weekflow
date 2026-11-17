/* global document, innerWidth, innerHeight, getComputedStyle */
// Isolated browser contexts, explicit memory preview only. Never touches user data.
import { chromium, expect } from "@playwright/test";
const url = process.argv[2] || "http://127.0.0.1:4173/weekflow/";
const prefix = process.argv[3] || "production";
const browser = await chromium.launch();
try {
  for (const [name, viewport] of [
    ["desktop", { width: 1366, height: 768 }],
    ["mobile", { width: 390, height: 844 }],
  ]) {
    const context = await browser.newContext({
      viewport,
      isMobile: name === "mobile",
      hasTouch: name === "mobile",
    });
    const page = await context.newPage();
    await page.addInitScript(() =>
      localStorage.setItem("weekflow.coach.v1", "done"),
    );
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(url);
    await expect(page.locator("html")).toHaveAttribute("data-theme", "blue");
    await page.getByRole("button", { name: /저장 없이 플래너/ }).click();
    await expect(page.locator(".visible-range")).toHaveText("09:00–18:00");
    await page.evaluate(() => navigator.serviceWorker.ready);
    await expect
      .poll(() => page.evaluate(() => !!navigator.serviceWorker.controller))
      .toBe(true);
    await page.getByRole("button", { name: "외관 / 테마" }).click();
    await page.getByRole("button", { name: "다크", exact: true }).click();
    await page.getByRole("button", { name: "닫기", exact: true }).click();
    const layout = await page.evaluate(() => ({
      width: innerWidth,
      height: innerHeight,
      scrollX: document.documentElement.scrollWidth > innerWidth,
      scrollY: document.documentElement.scrollHeight > innerHeight + 1,
      bodyFont: getComputedStyle(document.body).fontSize,
      eventFont: getComputedStyle(document.querySelector(".block-title"))
        .fontSize,
    }));
    expect(layout.scrollX).toBe(false);
    expect(layout.scrollY).toBe(false);
    expect(parseFloat(layout.eventFont)).toBeGreaterThanOrEqual(14);
    const shell = await page.evaluate(async () => {
      const keys = (await caches.keys()).filter((k) =>
        k.startsWith("weekflow-shell-"),
      );
      const cache = await caches.open(keys.at(-1));
      const requests = await cache.keys();
      return {
        name: keys.at(-1),
        appearanceCached: requests.some((r) =>
          new URL(r.url).pathname.endsWith("/appearance.js"),
        ),
      };
    });
    expect(shell.appearanceCached).toBe(true);
    await page.screenshot({ path: `docs/screenshots/${prefix}-${name}.png` });
    await context.setOffline(true);
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await page.getByRole("button", { name: /저장 없이 플래너/ }).click();
    await expect(page.locator(".visible-range")).toHaveText("09:00–18:00");
    await page.screenshot({
      path: `docs/screenshots/${prefix}-${name}-offline.png`,
    });
    expect(errors).toEqual([]);
    console.log(
      JSON.stringify({
        name,
        url,
        layout,
        shell,
        offline: "new UI and persisted dark theme passed",
      }),
    );
    await context.close();
  }
} finally {
  await browser.close();
}
