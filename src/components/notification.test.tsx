import { useState } from "react";
import { it, expect, vi, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Settings } from "./Settings";
import { emptyData, uuid } from "../data/demo";
import { applyLocal } from "../data/local";
import type { Change } from "../domain/types";
vi.mock("../data/push", () => ({
  pushAction: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../data/pushStatus", () => ({
  getPushStatus: vi
    .fn()
    .mockResolvedValue({ state: "ready", message: "등록 확인" }),
}));
afterEach(cleanup);
it("enabling a registered device updates the notification switch without discarding the quiet-hours draft", async () => {
  let latest = emptyData(uuid());
  latest.notification_preferences.quiet_start = "22:30:00";
  const changes: Change[][] = [];
  function Harness() {
    const [data, setData] = useState(latest);
    return (
      <Settings
        data={data}
        preview={false}
        onClose={() => {}}
        onLogout={async () => true}
        onReload={async () => {}}
        commit={async (rows) => {
          changes.push(rows);
          latest = applyLocal(latest, rows);
          setData(latest);
        }}
      />
    );
  }
  render(<Harness />);
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "알림" }));
  expect(screen.getByLabelText("방해금지 시작")).toHaveValue("22:30");
  await user.clear(screen.getByLabelText("방해금지 시작"));
  await user.type(screen.getByLabelText("방해금지 시작"), "23:15");
  await user.click(screen.getByRole("button", { name: "이 기기 알림 켜기" }));
  expect(screen.getByRole("switch", { name: "알림 사용" })).toBeChecked();
  expect(screen.getByLabelText("방해금지 시작")).toHaveValue("23:15");
  await user.click(screen.getByRole("button", { name: "알림 설정 저장" }));
  expect(changes.at(-1)?.[0].row.enabled).toBe(true);
  expect(changes.at(-1)?.[0].row.quiet_start).toBe("23:15");
}, 15000);
it("failed device refresh clears prior ready status and disables test delivery", async () => {
  const { NotificationSetup } = await import("./NotificationSetup");
  const { getPushStatus } = await import("../data/pushStatus");
  vi.mocked(getPushStatus)
    .mockResolvedValueOnce({ state: "ready", message: "등록 확인" })
    .mockRejectedValueOnce(Error("offline"));
  render(
    <NotificationSetup
      data={emptyData(uuid())}
      commit={async () => {}}
      preview={false}
    />,
  );
  await screen.findByText("확인됨");
  await userEvent.click(screen.getByRole("button", { name: "상태 다시 확인" }));
  await screen.findByText(
    "기기 등록 상태를 확인하지 못했어요. 연결 후 다시 시도해 주세요.",
  );
  expect(
    screen.getByRole("button", { name: "이 기기 테스트 Push" }),
  ).toBeDisabled();
});
