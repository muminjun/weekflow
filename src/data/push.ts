import { supabase } from "./supabase";
import { FunctionsHttpError } from "@supabase/supabase-js";

async function pushFailure(error: unknown): Promise<never> {
  let status = 0;
  let code = "";
  if (error instanceof FunctionsHttpError) {
    const response = error.context as Response;
    status = response.status;
    try {
      const body = await response.clone().json();
      code = typeof body.error === "string" ? body.error : "";
    } catch {
      // Gateways may return non-JSON responses; never expose their raw body.
    }
  }
  const messages: Record<string, string> = {
    DEVICE_LIMIT:
      "등록할 수 있는 기기는 최대 10개입니다. 사용하지 않는 기기의 구독을 해제해 주세요.",
    RATE_LIMIT:
      "테스트 알림은 1분에 한 번 보낼 수 있습니다. 잠시 후 다시 시도해 주세요.",
    NO_SUBSCRIPTION: "먼저 ‘이 기기 알림 켜기’로 이 기기를 등록해 주세요.",
    UNAUTHENTICATED: "로그인이 만료되었습니다. 다시 로그인해 주세요.",
    PUSH_DELIVERY_FAILED:
      "알림을 전송하지 못했습니다. 기기 구독과 네트워크를 확인한 뒤 다시 시도해 주세요.",
  };
  if (status === 401) code = "UNAUTHENTICATED";
  if (status === 429 && !messages[code]) code = "RATE_LIMIT";
  throw Error(
    messages[code] ??
      "알림 요청을 처리하지 못했습니다. 연결을 확인하고 잠시 후 다시 시도해 주세요.",
  );
}
function publicKey(value: string) {
  const b = atob(value.replaceAll("-", "+").replaceAll("_", "/"));
  return Uint8Array.from(b, (c) => c.charCodeAt(0));
}
export async function pushAction(action: "subscribe" | "unsubscribe" | "test") {
  if (!supabase) throw Error("로그인이 필요합니다.");
  if (
    !("serviceWorker" in navigator) ||
    !("PushManager" in window) ||
    !("Notification" in window)
  )
    throw Error(
      "이 브라우저는 Web Push를 지원하지 않습니다. iOS에서는 홈 화면에 설치한 PWA를 사용하세요.",
    );
  // Permission prompts must originate in the user gesture, before any await.
  const permissionRequest =
    action === "subscribe" ? Notification.requestPermission() : null;
  if (permissionRequest && (await permissionRequest) !== "granted")
    throw Error(
      "알림 권한이 허용되지 않았습니다. 브라우저의 사이트 설정에서 허용해 주세요.",
    );
  const registration = await navigator.serviceWorker.getRegistration(
    import.meta.env.BASE_URL,
  );
  if (!registration)
    throw Error(
      "Service Worker가 등록되지 않았습니다. 배포된 HTTPS 페이지에서 새로고침 후 다시 시도하세요.",
    );
  if (action === "test") {
    const subscription = await registration.pushManager?.getSubscription();
    if (!subscription || Notification.permission !== "granted")
      throw Error("먼저 ‘이 기기 알림 켜기’로 이 기기를 등록해 주세요.");
    const { error } = await supabase.functions.invoke("push-subscription", {
      body: { action: "test", endpoint: subscription.endpoint },
    });
    if (error) await pushFailure(error);
    return;
  }
  if (action === "unsubscribe") {
    const subscription = await registration.pushManager.getSubscription();
    const { error } = await supabase.functions.invoke("push-subscription", {
      body: { action, endpoint: subscription?.endpoint },
    });
    if (error) await pushFailure(error);
    await subscription?.unsubscribe();
    window.dispatchEvent(new Event("weekflow:push-status"));
    return;
  }
  const key = import.meta.env.VITE_VAPID_PUBLIC_KEY;
  if (!key) throw Error("서버의 VAPID 공개키가 아직 설정되지 않았습니다.");
  const existing = await registration.pushManager.getSubscription();
  const subscription =
    existing ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: publicKey(key),
    }));
  const { error } = await supabase.functions.invoke("push-subscription", {
    body: { action, subscription: subscription.toJSON() },
  });
  if (error) {
    if (!existing) await subscription.unsubscribe();
    await pushFailure(error);
  }
}
