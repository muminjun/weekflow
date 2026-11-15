import { test, expect } from "@playwright/test";
import { createServer } from "node:http";
import { readFileSync } from "node:fs";

test("PWA updates a warm HTTP cache and reloads the new shell offline", async ({
  page,
  context,
}) => {
  let version = "a";
  const template = readFileSync("public/sw.js", "utf8");
  const server = createServer((req, res) => {
    const path = new URL(req.url!, "http://localhost").pathname;
    if (path === "/weekflow/sw.js") {
      res.setHeader("Content-Type", "application/javascript");
      res.setHeader("Cache-Control", "no-cache");
      res.end(
        template
          .replace("__CACHE_NAME__", `weekflow-shell-/weekflow/${version}`)
          .replace(
            "__ASSETS__",
            JSON.stringify(["./", "index.html", `assets/${version}.js`]),
          ),
      );
    } else if (path.endsWith(".js")) {
      res.setHeader("Content-Type", "application/javascript");
      res.setHeader("Cache-Control", "public, max-age=3600");
      res.end(
        `document.body.dataset.version='${path.includes("/b.js") ? "b" : "a"}';`,
      );
    } else {
      res.setHeader("Content-Type", "text/html");
      res.setHeader("Cache-Control", "public, max-age=3600");
      res.end(
        `<!doctype html><title>PWA version ${version}</title><body><main>Planner</main><script src="./assets/${version}.js"></script><script>navigator.serviceWorker.register('./sw.js')</script></body>`,
      );
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string")
    throw Error("Missing test server");
  const url = `http://127.0.0.1:${address.port}/weekflow/`;
  try {
    await page.goto(url);
    await page.evaluate(() => navigator.serviceWorker.ready);
    await expect(page.locator("body")).toHaveAttribute("data-version", "a");
    version = "b";
    await page.evaluate(async () => {
      const reg = await navigator.serviceWorker.ready;
      await reg.update();
    });
    await expect
      .poll(() =>
        page.evaluate(
          async () => !!(await navigator.serviceWorker.ready).waiting,
        ),
      )
      .toBe(true);
    await page.evaluate(async () => {
      const reg = await navigator.serviceWorker.ready;
      await new Promise<void>((resolve) => {
        navigator.serviceWorker.addEventListener(
          "controllerchange",
          () => resolve(),
          { once: true },
        );
        reg.waiting!.postMessage("ACTIVATE_UPDATE");
      });
    });
    await context.setOffline(true);
    await page.reload();
    await expect(page.locator("body")).toHaveAttribute("data-version", "b");
    await expect(page).toHaveTitle("PWA version b");
  } finally {
    await context.setOffline(false);
    await new Promise<void>((resolve, reject) =>
      server.close((e) => (e ? reject(e) : resolve())),
    );
  }
});
