import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { pushAction } from "./push";

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("./supabase", () => ({ supabase: { functions: { invoke } } }));
beforeEach(() => {
  vi.stubGlobal("Notification", { permission: "granted" });
  vi.stubGlobal("PushManager", {});
  vi.stubGlobal("navigator", {
    serviceWorker: {
      getRegistration: vi
        .fn()
        .mockResolvedValue({
          pushManager: {
            getSubscription: vi
              .fn()
              .mockResolvedValue({
                endpoint: "https://fcm.googleapis.com/test-device",
              }),
          },
        }),
    },
  });
});
afterEach(() => vi.unstubAllGlobals());

it.each([
  [
    429,
    "DEVICE_LIMIT",
    "등록할 수 있는 기기는 최대 10개입니다. 사용하지 않는 기기의 구독을 해제해 주세요.",
  ],
  [
    429,
    "RATE_LIMIT",
    "테스트 알림은 1분에 한 번 보낼 수 있습니다. 잠시 후 다시 시도해 주세요.",
  ],
  [
    400,
    "NO_SUBSCRIPTION",
    "먼저 ‘이 기기 알림 켜기’로 이 기기를 등록해 주세요.",
  ],
  [401, "UNAUTHENTICATED", "로그인이 만료되었습니다. 다시 로그인해 주세요."],
  [
    502,
    "PUSH_DELIVERY_FAILED",
    "알림을 전송하지 못했습니다. 기기 구독과 네트워크를 확인한 뒤 다시 시도해 주세요.",
  ],
])(
  "explains Push HTTP %i (%s) without exposing SDK errors",
  async (status, code, message) => {
    invoke.mockResolvedValue({
      error: new FunctionsHttpError(
        new Response(JSON.stringify({ error: code }), { status }),
      ),
    });
    await expect(pushAction("test")).rejects.toThrow(message);
  },
);

it("requests permission during the click before awaiting service worker lookup", async () => {
  const order: string[] = [];
  vi.stubEnv("VITE_VAPID_PUBLIC_KEY", "AQID");
  vi.stubGlobal("Notification", {
    requestPermission: vi.fn(async () => {
      order.push("permission");
      return "denied";
    }),
  });
  navigator.serviceWorker.getRegistration = vi.fn(async () => {
    order.push("registration");
    return {} as ServiceWorkerRegistration;
  });
  await expect(pushAction("subscribe")).rejects.toThrow("알림 권한");
  expect(order[0]).toBe("permission");
});
it("targets test Push to this registered device instead of every device", async () => {
  const registration = {
    pushManager: {
      getSubscription: vi
        .fn()
        .mockResolvedValue({
          endpoint: "https://fcm.googleapis.com/test-device",
        }),
    },
  };
  navigator.serviceWorker.getRegistration = vi
    .fn()
    .mockResolvedValue(registration);
  vi.stubGlobal("Notification", { permission: "granted" });
  invoke.mockResolvedValue({ data: { accepted: 1 }, error: null });
  await pushAction("test");
  expect(invoke).toHaveBeenCalledWith("push-subscription", {
    body: {
      action: "test",
      endpoint: "https://fcm.googleapis.com/test-device",
    },
  });
});
it("does not unregister an existing device when server registration temporarily fails", async () => {
  const unsubscribe = vi.fn();
  const subscription = {
    toJSON: () => ({ endpoint: "https://fcm.googleapis.com/existing" }),
    unsubscribe,
  };
  navigator.serviceWorker.getRegistration = vi
    .fn()
    .mockResolvedValue({
      pushManager: { getSubscription: vi.fn().mockResolvedValue(subscription) },
    });
  vi.stubEnv("VITE_VAPID_PUBLIC_KEY", "AQID");
  vi.stubGlobal("Notification", {
    requestPermission: vi.fn().mockResolvedValue("granted"),
  });
  invoke.mockResolvedValue({ error: new Error("network") });
  await expect(pushAction("subscribe")).rejects.toThrow("알림 요청");
  expect(unsubscribe).not.toHaveBeenCalled();
});
