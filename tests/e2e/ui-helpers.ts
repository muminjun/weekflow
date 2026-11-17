import type { Page } from "@playwright/test";
export async function acceptConfirmations(page: Page) {
  await page.addLocatorHandler(
    page.getByRole("dialog", { name: "변경 확인", exact: true }),
    async (dialog) => {
      await dialog
        .getByRole("button", { name: /^(계속|겹쳐서 배치)$/ })
        .click();
    },
    { noWaitAfter: true },
  );
  await page.addLocatorHandler(
    page.getByRole("dialog", { name: "안내", exact: true }),
    async (dialog) => {
      await dialog.getByRole("button", { name: "확인", exact: true }).click();
    },
    { noWaitAfter: true },
  );
}
export async function chooseView(page: Page, label: string) {
  await page
    .getByRole("combobox", { name: "시간표 보기", exact: true })
    .click();
  await page.getByRole("option", { name: label, exact: true }).click();
}
