import { test as base } from "@playwright/test";
export { expect, type Page } from "@playwright/test";
export const test = base.extend<{ coachmarks: boolean }>({
  coachmarks: [false, { option: true }],
  page: async ({ page, coachmarks }, providePage) => {
    if (!coachmarks)
      await page.addInitScript(() => {
        try {
          localStorage.setItem("weekflow.coach.v1", "done");
        } catch {
          /* isolated test origins */
        }
      });
    await providePage(page);
  },
});
