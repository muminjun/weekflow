// Receives short-lived TEST sessions on stdin; never writes credentials to disk.
import { chromium } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
const chunks = [];
for await (const chunk of process.stdin) chunks.push(chunk);
const input = JSON.parse(Buffer.concat(chunks).toString());
const client = createClient(input.url, input.key, {
  global: {
    headers: { Authorization: "Bearer " + input.session.access_token },
  },
  auth: { persistSession: false, autoRefreshToken: false },
});
const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
});
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("dialog", (d) => d.accept());
try {
  await page.goto("http://127.0.0.1:4173/weekflow/");
  const ref = new URL(input.url).hostname.split(".")[0];
  await page.evaluate(
    ({ ref, session }) =>
      localStorage.setItem(
        "sb-" + ref + "-auth-token",
        JSON.stringify(session),
      ),
    { ref, session: input.session },
  );
  await page.reload();
  await page.getByRole("heading", { name: "이번 주, 나의 흐름" }).waitFor();
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  await page.reload();
  const quick = page.getByRole("textbox", { name: "새 할 일" });
  await quick.fill("실서버 온라인 작업");
  await quick.press("Enter");
  await page.getByText(/저장됨 ·/).waitFor();
  console.log("PASS real browser Auth session + server save");
  await context.setOffline(true);
  await quick.fill("오프라인 큐 검증");
  await quick.press("Enter");
  await page
    .getByRole("button", { name: "오프라인 큐 검증", exact: true })
    .waitFor();
  await page.getByText("오프라인 · 동기화 대기", { exact: true }).waitFor();
  await page.reload();
  await page
    .getByRole("button", { name: "오프라인 큐 검증", exact: true })
    .waitFor();
  console.log("PASS offline Service Worker reload + IndexedDB queued edit");
  await context.setOffline(false);
  await page.getByRole("button", { name: "동기화 다시 시도" }).click();
  await page.getByText(/저장됨 ·/).waitFor();
  const { data: tasks, error } = await client
    .from("tasks")
    .select("*")
    .eq("title", "오프라인 큐 검증");
  if (error || tasks.length !== 1)
    throw Error("Offline queue did not persist exactly once");
  console.log("PASS reconnect FIFO queue persisted exactly once");
  await context.setOffline(true);
  await page
    .getByRole("button", { name: "오프라인 큐 검증", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "할 일", exact: true })
    .fill("내 오프라인 변경");
  await page.getByRole("button", { name: "저장", exact: true }).click();
  const { error: updateError } = await client.rpc("apply_changes", {
    p_mutation_id: randomUUID(),
    p_changes: [
      {
        table: "tasks",
        action: "update",
        expected_version: tasks[0].version,
        row: { id: tasks[0].id, title: "서버의 다른 기기 변경" },
      },
    ],
    p_acknowledge: false,
  });
  if (updateError) throw updateError;
  await context.setOffline(false);
  await page.getByRole("button", { name: "동기화 다시 시도" }).click();
  await page
    .getByRole("heading", { name: "다른 기기의 변경과 충돌했습니다" })
    .waitFor();
  await page
    .getByRole("button", { name: "서버 변경 사용", exact: true })
    .click();
  await page
    .getByRole("button", { name: "서버의 다른 기기 변경", exact: true })
    .waitFor();
  console.log("PASS version conflict comparison + explicit server selection");
  await quick.fill("실행 취소 검증");
  await quick.press("Enter");
  await page.getByText(/저장됨 ·/).waitFor();
  await page.getByRole("button", { name: "실행 취소", exact: true }).click();
  await page.getByText(/저장됨 ·/).waitFor();
  const { data: undone } = await client
    .from("tasks")
    .select("*")
    .eq("title", "실행 취소 검증");
  if (undone.length) throw Error("Undo failed on server");
  console.log("PASS transactional undo of linked task creation");
  await page.getByRole("button", { name: "설정 열기" }).click();
  await page.getByRole("button", { name: "카테고리", exact: true }).click();
  await page.getByRole("textbox", { name: "새 카테고리 이름" }).fill("WORK");
  await page.getByRole("button", { name: "추가", exact: true }).click();
  await page
    .getByRole("heading", { name: "저장할 수 없는 변경이 있습니다" })
    .waitFor();
  await page
    .getByRole("button", { name: "서버 변경 사용", exact: true })
    .click();
  await page.getByRole("button", { name: "닫기", exact: true }).click();
  await quick.fill("Recovered after rejection");
  await quick.press("Enter");
  await page.getByText(/저장됨 ·/).waitFor();
  const { data: recovered } = await client
    .from("tasks")
    .select("id")
    .eq("title", "Recovered after rejection");
  if (recovered.length !== 1)
    throw Error("Rejected command blocked later work");
  console.log("PASS rejected command recovery preserves unrelated work");
  const { data: current } = await client
    .from("tasks")
    .select("*")
    .eq("id", tasks[0].id)
    .single();
  await context.setOffline(true);
  for (const [oldName, newName] of [
    ["서버의 다른 기기 변경", "Earlier edit A"],
    ["Earlier edit A", "Latest edit B"],
  ]) {
    await page.getByRole("button", { name: oldName, exact: true }).click();
    await page
      .getByRole("textbox", { name: "할 일", exact: true })
      .fill(newName);
    await page.getByRole("button", { name: "저장", exact: true }).click();
    await page.getByRole("button", { name: newName, exact: true }).waitFor();
  }
  const external = await client.rpc("apply_changes", {
    p_mutation_id: randomUUID(),
    p_changes: [
      {
        table: "tasks",
        action: "update",
        expected_version: current.version,
        row: { id: current.id, title: "Other device v3" },
      },
    ],
    p_acknowledge: false,
  });
  if (external.error) throw external.error;
  await context.setOffline(false);
  await page.getByRole("button", { name: "동기화 다시 시도" }).click();
  await page
    .getByRole("heading", { name: "다른 기기의 변경과 충돌했습니다" })
    .waitFor();
  await page
    .getByRole("button", { name: "내 변경으로 다시 시도", exact: true })
    .click();
  await page.getByText(/저장됨 ·/).waitFor();
  const { data: latest } = await client
    .from("tasks")
    .select("title")
    .eq("id", current.id)
    .single();
  if (latest.title !== "Latest edit B")
    throw Error("Conflict resolution reordered edits");
  console.log("PASS conflicting dependent edits retain FIFO order");
  await page.screenshot({
    path: "docs/screenshots/authenticated-desktop.png",
    fullPage: true,
  });
  if (errors.length) throw Error("Browser runtime error: " + errors[0]);
} catch (e) {
  await page.screenshot({
    path: "docs/screenshots/live-failure.png",
    fullPage: true,
  });
  console.error("Runtime errors:", errors);
  console.error(
    "Cache keys:",
    await page.evaluate(async () => {
      const names = await caches.keys();
      return Promise.all(
        names.map(async (name) => ({
          name,
          urls: (await (await caches.open(name)).keys()).map((r) => r.url),
        })),
      );
    }),
  );
  console.error(
    "Visible failure state:",
    (await page.locator("body").innerText()).slice(0, 1600),
  );
  throw e;
} finally {
  await context.close();
  await browser.close();
}
