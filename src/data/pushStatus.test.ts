import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { getPushStatus } from "./pushStatus";
const { lookup } = vi.hoisted(() => ({ lookup: vi.fn() }));
vi.mock("./supabase", () => ({
  supabase: {
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: lookup }) }) }),
  },
}));
beforeEach(() =>
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({ matches: false })),
  ),
);
afterEach(() => vi.unstubAllGlobals());
it("distinguishes browser subscription from missing server registration", async () => {
  vi.stubGlobal("Notification", { permission: "granted" });
  vi.stubGlobal("PushManager", {});
  vi.stubGlobal("navigator", {
    userAgent: "Chrome",
    serviceWorker: {
      getRegistration: async () => ({
        pushManager: {
          getSubscription: async () => ({
            endpoint: "https://example.test/device",
          }),
        },
      }),
    },
  });
  lookup.mockResolvedValue({ data: null, error: null });
  expect((await getPushStatus()).state).toBe("unregistered");
  lookup.mockResolvedValue({ data: { is_active: true }, error: null });
  expect((await getPushStatus()).state).toBe("ready");
});
it("shows home-screen installation guidance for iPhone browser tabs", async () => {
  vi.stubGlobal("navigator", { userAgent: "iPhone", standalone: false });
  expect((await getPushStatus()).state).toBe("install");
});
it("does not equate showNotification acceptance with browser receipt", async () => {
  const showNotification = vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal("Notification", { permission: "granted" });
  vi.stubGlobal("navigator", {
    serviceWorker: {
      getRegistration: async () => ({
        showNotification,
        getNotifications: async () => [],
      }),
    },
  });
  const { localNotificationTest } = await import("./pushStatus");
  expect(await localNotificationTest()).toBe(false);
  expect(showNotification).toHaveBeenCalledOnce();
});
it("confirms worker Push receipt separately from OS notification display", async () => {
  const worker = new EventTarget();
  vi.stubGlobal("navigator", { serviceWorker: worker });
  const { watchTestPush } = await import("./pushStatus");
  const observation = watchTestPush();
  worker.dispatchEvent(
    new MessageEvent("message", {
      data: { type: "WEEKFLOW_PUSH_RECEIVED", tag: "weekflow-push-test" },
    }),
  );
  expect(await observation.result).toBe(true);
  observation.stop();
});
