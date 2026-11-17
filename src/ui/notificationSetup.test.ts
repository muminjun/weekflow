import { it, expect, vi } from "vitest";
import { emptyData, uuid } from "../data/demo";
import { enablePlannerNotifications } from "./notificationSetup";
it("permission rejection does not enable notifications or complete setup", async () => {
  const commit = vi.fn();
  await expect(
    enablePlannerNotifications(
      emptyData(uuid()),
      commit,
      async () => {
        throw Error("권한 거부");
      },
      true,
    ),
  ).rejects.toThrow("권한 거부");
  expect(commit).not.toHaveBeenCalled();
});
it("registered device enables preferences and finishes setup with version checks", async () => {
  const data = emptyData(uuid()),
    commit = vi.fn().mockResolvedValue(undefined),
    register = vi.fn().mockResolvedValue(undefined);
  await enablePlannerNotifications(data, commit, register, true);
  expect(register).toHaveBeenCalledOnce();
  expect(commit).toHaveBeenCalledWith([
    {
      table: "notification_preferences",
      action: "update",
      row: { user_id: data.profile.id, enabled: true },
      expected_version: data.notification_preferences.version,
    },
    {
      table: "profiles",
      action: "update",
      row: { id: data.profile.id, onboarding_completed: true },
      expected_version: data.profile.version,
    },
  ]);
});
