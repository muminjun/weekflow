import { supabase } from "./supabase";
export type PushStatus = {
  state:
    | "install"
    | "unsupported"
    | "permission"
    | "blocked"
    | "unregistered"
    | "ready";
  message: string;
};
export async function getPushStatus(): Promise<PushStatus> {
  const ios =
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const standalone =
    (navigator as Navigator & { standalone?: boolean }).standalone ||
    window.matchMedia("(display-mode: standalone)").matches;
  if (ios && !standalone)
    return {
      state: "install",
      message:
        "아이폰은 Safari 공유 → 홈 화면에 추가한 뒤, 홈 화면의 WEEKFLOW에서 알림을 켜주세요.",
    };
  if (
    !("serviceWorker" in navigator) ||
    !("PushManager" in window) ||
    !("Notification" in window)
  )
    return {
      state: "unsupported",
      message:
        "이 브라우저에서는 기기 Push를 지원하지 않아요. 지원하는 브라우저나 설치 앱을 이용해 주세요.",
    };
  if (Notification.permission === "denied")
    return {
      state: "blocked",
      message:
        "사이트 알림이 차단돼 있어요. 브라우저의 사이트 설정에서 알림을 허용해 주세요.",
    };
  if (Notification.permission !== "granted")
    return {
      state: "permission",
      message: "아래 버튼을 눌러 이 기기의 알림 권한을 허용해 주세요.",
    };
  const registration = await navigator.serviceWorker.getRegistration(
    import.meta.env.BASE_URL,
  );
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription)
    return {
      state: "unregistered",
      message:
        "이 브라우저의 기기 등록이 필요해요. 아래에서 다시 연결해 주세요.",
    };
  if (!supabase) throw Error("로그인이 필요합니다.");
  const { data, error } = await supabase
    .from("push_subscriptions")
    .select("is_active")
    .eq("endpoint", subscription.endpoint)
    .maybeSingle();
  if (error)
    throw Error(
      "서버의 기기 등록을 확인하지 못했어요. 연결 후 다시 확인해 주세요.",
    );
  return data?.is_active
    ? {
        state: "ready",
        message: "브라우저 권한과 서버의 이 기기 등록을 확인했어요.",
      }
    : {
        state: "unregistered",
        message:
          "브라우저 구독은 있지만 서버 등록이 없어요. ‘이 기기 알림 켜기’로 다시 연결해 주세요.",
      };
}
/** Gateway acceptance and browser notification presence are separate observations. */
export async function localNotificationTest(): Promise<boolean> {
  if (!("Notification" in window) || Notification.permission !== "granted")
    throw Error("먼저 이 기기의 알림 권한을 허용해 주세요.");
  const registration = await navigator.serviceWorker.getRegistration(
    import.meta.env.BASE_URL,
  );
  if (!registration) throw Error("기기 등록을 먼저 완료해 주세요.");
  const tag = "weekflow-device-test";
  await registration.showNotification("WEEKFLOW 기기 알림 확인", {
    body: "기기 알림 표시 경로를 확인하고 있어요.",
    tag,
  });
  return (await registration.getNotifications({ tag })).length > 0;
}
export function watchTestPush() {
  let finish: (received: boolean) => void = () => {};
  let timer: ReturnType<typeof setTimeout>;
  const handler = (event: MessageEvent) => {
    if (
      event.data?.type === "WEEKFLOW_PUSH_RECEIVED" &&
      event.data.tag === "weekflow-push-test"
    )
      finish(true);
  };
  const result = new Promise<boolean>((resolve) => {
    finish = (received) => {
      clearTimeout(timer);
      navigator.serviceWorker.removeEventListener("message", handler);
      resolve(received);
    };
    navigator.serviceWorker.addEventListener("message", handler);
  });
  return {
    result,
    accepted: () => {
      timer = setTimeout(() => finish(false), 8000);
    },
    stop: () => finish(false),
  };
}
export async function clearTestPush() {
  const registration = await navigator.serviceWorker.getRegistration(
    import.meta.env.BASE_URL,
  );
  for (const notification of (await registration?.getNotifications({
    tag: "weekflow-push-test",
  })) ?? [])
    notification.close();
}
