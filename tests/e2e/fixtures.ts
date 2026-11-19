import { test as base } from "@playwright/test";
export { expect, type Page } from "@playwright/test";
export const test = base.extend<{
  coachmarks: boolean;
  calendarPrompt: boolean;
}>({
  calendarPrompt: [false, { option: true }],
  coachmarks: [false, { option: true }],
  page: async ({ page, coachmarks, calendarPrompt }, providePage) => {
    if (process.env.WEEKFLOW_SHOW_POINTER === "1")
      await page.addInitScript(() => {
        const setup = () => {
          const cursor = document.createElement("div");
          cursor.dataset.uxPointer = "true";
          cursor.setAttribute("aria-hidden", "true");
          Object.assign(cursor.style, {
            position: "fixed",
            top: "-8px",
            left: "-8px",
            width: "16px",
            height: "16px",
            borderRadius: "50%",
            border: "2px solid #3182f6",
            background: "#ffffffb3",
            boxShadow: "0 0 0 4px #3182f633",
            pointerEvents: "none",
            zIndex: "2147483647",
            transition: "transform 100ms linear",
            display: "none",
          });
          document.body.append(cursor);
          for (const kind of ["pointermove", "pointerdown", "pointerup"])
            document.addEventListener(
              kind,
              (event) => {
                const pointer = event as PointerEvent;
                cursor.style.display = "block";
                cursor.style.transform = `translate(${pointer.clientX}px,${pointer.clientY}px)`;
                cursor.style.background =
                  kind === "pointerdown" ? "#3182f6" : "#ffffffb3";
              },
              true,
            );
        };
        if (document.body) setup();
        else
          document.addEventListener("DOMContentLoaded", setup, { once: true });
      });
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
