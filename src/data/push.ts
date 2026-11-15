import { supabase } from "./supabase";
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
  const registration = await navigator.serviceWorker.getRegistration(
    import.meta.env.BASE_URL,
  );
  if (!registration)
    throw Error(
      "Service Worker가 등록되지 않았습니다. 배포된 HTTPS 페이지에서 새로고침 후 다시 시도하세요.",
    );
  if (action === "test") {
    const { error } = await supabase.functions.invoke("push-subscription", {
      body: { action: "test" },
    });
    if (error) throw error;
    return;
  }
  if (action === "unsubscribe") {
    const subscription = await registration.pushManager.getSubscription();
    const { error } = await supabase.functions.invoke("push-subscription", {
      body: { action, endpoint: subscription?.endpoint },
    });
    if (error) throw error;
    await subscription?.unsubscribe();
    return;
  }
  const key = import.meta.env.VITE_VAPID_PUBLIC_KEY;
  if (!key) throw Error("서버의 VAPID 공개키가 아직 설정되지 않았습니다.");
  const permission = await Notification.requestPermission();
  if (permission !== "granted")
    throw Error(
      "알림 권한이 허용되지 않았습니다. 앱 내부 알림은 계속 사용할 수 있습니다.",
    );
  const subscription =
    (await registration.pushManager.getSubscription()) ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: publicKey(key),
    }));
  const { error } = await supabase.functions.invoke("push-subscription", {
    body: { action, subscription: subscription.toJSON() },
  });
  if (error) {
    await subscription.unsubscribe();
    throw error;
  }
}
