import { test as base } from "@playwright/test";
export { expect, type Page } from "@playwright/test";
export const test = base.extend<{
  coachmarks: boolean;
  calendarPrompt: boolean;
}>({
  calendarPrompt: [false, { option: true }],
  coachmarks: [false, { option: true }],
  page: async ({ page, coachmarks, calendarPrompt }, providePage) => {
    if (!calendarPrompt)
      await page.addInitScript(() =>
        localStorage.setItem("weekflow.calendar.ask", "off"),
      );
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
