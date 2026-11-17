import { useEffect, useState } from "react";
import { Bell, BellOff, CheckCircle2 } from "lucide-react";
import type { Dataset } from "../domain/types";
import type { Commit } from "./Editors";
import { pushAction } from "../data/push";
import { enablePlannerNotifications } from "../ui/notificationSetup";
import { userMessage } from "../ui/errors";
import { Modal } from "./Modal";
export function NotificationSetup({
  data,
  commit,
  preview,
  onComplete,
  onEnabled,
}: {
  data: Dataset;
  commit: Commit;
  preview: boolean;
  onComplete?: () => void;
  onEnabled?: () => void;
}) {
  const [status, setStatus] = useState("기기 상태 확인 중…");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    (async () => {
      if (preview) return "체험에서는 기기에 알림을 등록하지 않아요.";
      if (
        !("Notification" in window) ||
        !("serviceWorker" in navigator) ||
        !("PushManager" in window)
      )
        return "이 브라우저에서는 앱 내부 알림을 사용할 수 있어요.";
      const permission = Notification.permission;
      if (permission === "denied")
        return "브라우저에서 알림이 차단되어 있어요. 사이트 설정에서 허용해 주세요.";
      const registration = await navigator.serviceWorker.getRegistration(
        import.meta.env.BASE_URL,
      );
      const subscription = await registration?.pushManager.getSubscription();
      return subscription && permission === "granted"
        ? data.notification_preferences.enabled
          ? "이 기기 등록 완료 · 일정 알림 사용 중"
          : "이 기기 등록 완료 · 일정 알림 사용 설정이 필요해요."
        : "알림을 켜면 이 기기에 시작 시간과 마감 알림을 보내드려요.";
    })()
      .then((value) => {
        if (active) setStatus(value);
      })
      .catch(() => {
        if (active)
          setStatus(
            "기기 등록 상태를 확인하지 못했어요. 연결 후 다시 시도해 주세요.",
          );
      });
    return () => {
      active = false;
    };
  }, [preview, data.notification_preferences.enabled, revision]);
  async function enable() {
    setBusy(true);
    setMessage("기기 알림을 연결하고 있어요…");
    try {
      await enablePlannerNotifications(
        data,
        commit,
        () => pushAction("subscribe"),
        !!onComplete,
      );
      onEnabled?.();
      setRevision((v) => v + 1);
      setMessage("기기를 등록하고 일정 알림을 켰어요.");
      onComplete?.();
    } catch (e) {
      setMessage(userMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="notification-setup">
      <div className="notification-setup-icon">
        <Bell size={26} />
      </div>
      <div>
        <h3>
          {onComplete ? "한 주의 시작, 놓치지 않게" : "이 기기에서 알림 받기"}
        </h3>
        <p>{status}</p>
        <p className="helper-text">
          브라우저 권한과 이 기기 등록이 필요해요. 앱 내부 알림은 항상 확인할 수
          있어요.
        </p>
      </div>
      <button
        className="primary"
        type="button"
        disabled={preview || busy}
        onClick={() => void enable()}
      >
        <Bell size={18} />
        {busy
          ? "연결 중…"
          : onComplete
            ? "알림 켜고 시작"
            : "이 기기 알림 켜기"}
      </button>
      {message && (
        <p className="helper-text" role="status">
          {message}
        </p>
      )}
    </section>
  );
}
export function FirstWeekSetup({
  data,
  commit,
  preview,
  onSettings,
}: {
  data: Dataset;
  commit: Commit;
  preview: boolean;
  onSettings: () => void;
}) {
  const [closed, setClosed] = useState(false);
  const [message, setMessage] = useState("");
  if (closed || data.profile.onboarding_completed) return null;
  async function finish() {
    try {
      await commit([
        {
          table: "profiles",
          action: "update",
          row: { id: data.profile.id, onboarding_completed: true },
          expected_version: data.profile.version,
        },
      ]);
      setClosed(true);
    } catch (e) {
      setMessage(userMessage(e));
    }
  }
  return (
    <Modal title="WEEKFLOW 시작하기" onClose={() => void finish()}>
      <p className="welcome-copy">할 일을 적고, 나의 빈 시간에 배치하세요.</p>
      <div className="setup-summary">
        <CheckCircle2 size={20} />
        <span>
          {data.profile.timezone === "Asia/Seoul"
            ? "서울 시간"
            : data.profile.timezone}{" "}
          · 월요일 시작
          <br />
          시간표와 가용 시간은 설정에서 바꿀 수 있어요.
        </span>
      </div>
      <NotificationSetup
        data={data}
        commit={commit}
        preview={preview}
        onComplete={() => setClosed(true)}
      />
      <div className="secondary-actions">
        <button type="button" onClick={() => void finish()}>
          <BellOff size={17} />
          알림은 나중에 설정
        </button>
        <button
          type="button"
          onClick={() => {
            setClosed(true);
            onSettings();
          }}
        >
          기본 설정 살펴보기
        </button>
      </div>
      {message && (
        <p role="alert" className="error">
          {message}
        </p>
      )}
    </Modal>
  );
}
