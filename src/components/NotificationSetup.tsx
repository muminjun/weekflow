import { useEffect, useState } from "react";
import { Bell, BellOff, CheckCircle2 } from "lucide-react";
import type { Dataset } from "../domain/types";
import type { Commit } from "./Editors";
import {
  getPushStatus,
  localNotificationTest,
  watchTestPush,
  clearTestPush,
  type PushStatus,
} from "../data/pushStatus";
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
  const [device, setDevice] = useState<PushStatus | null>(null);
  const [status, setStatus] = useState("기기 상태 확인 중…");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const refresh = () => {
      setDevice(null);
      setStatus("기기 상태 확인 중…");
      setRevision((v) => v + 1);
    };
    window.addEventListener("focus", refresh);
    window.addEventListener("weekflow:push-status", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      window.removeEventListener("weekflow:push-status", refresh);
    };
  }, []);
  useEffect(() => {
    let active = true;
    (async () => {
      if (preview) return "체험에서는 기기에 알림을 등록하지 않아요.";
      const next = await getPushStatus();
      if (active) setDevice(next);
      return next.message;
    })()
      .then((value) => {
        if (active) setStatus(value);
      })
      .catch(() => {
        if (active) {
          setDevice(null);
          setStatus(
            "기기 등록 상태를 확인하지 못했어요. 연결 후 다시 시도해 주세요.",
          );
        }
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
  async function testDelivery(local: boolean) {
    setBusy(true);
    setMessage(
      local
        ? "기기 표시 경로를 확인하고 있어요…"
        : "이 기기로 발송하고 수신을 확인하고 있어요…",
    );
    try {
      let received: boolean;
      if (local) received = await localNotificationTest();
      else {
        await clearTestPush();
        const observation = watchTestPush();
        try {
          await pushAction("test");
          observation.accepted();
          received = await observation.result;
        } finally {
          observation.stop();
        }
      }
      setMessage(
        received
          ? local
            ? "브라우저 알림 목록에서 표시 요청을 확인했어요. 실제 배너가 보이지 않으면 아래 OS 알림 설정을 확인해 주세요."
            : "이 브라우저에 Push가 도착해 알림 표시를 요청했어요. 배너가 보이지 않으면 OS 알림 허용과 집중 모드를 확인해 주세요."
          : local
            ? "브라우저가 표시 요청을 접수했지만 알림 목록에서는 확인되지 않았어요. OS 알림 허용과 집중 모드를 확인해 주세요."
            : "서버 발송은 접수됐지만 이 브라우저의 수신은 아직 확인되지 않았어요. 기기 표시 테스트와 OS 설정을 확인해 주세요.",
      );
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
          일정 알림은 브라우저 권한·기기 등록·알림 사용 설정이 모두 필요해요.
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
      {!onComplete && (
        <div className="push-diagnostics">
          <ul>
            <li>
              기기 연결{" "}
              <strong>
                {device?.state === "ready" ? "확인됨" : "확인 필요"}
              </strong>
            </li>
            <li>
              일정 알림{" "}
              <strong>
                {data.notification_preferences.enabled
                  ? "사용 중"
                  : "꺼져 있음 · 아래에서 켜고 저장"}
              </strong>
            </li>
          </ul>
          <p>
            일정 시작·마감 등 알림 대상이 있어야 자동 발송돼요. 5분마다
            확인하므로 최대 약 5분 늦을 수 있어요. 방해금지 시간에는 보류됩니다.
          </p>
          <div className="push-test-actions">
            <button
              type="button"
              disabled={preview || busy || device?.state !== "ready"}
              onClick={() => void testDelivery(false)}
            >
              이 기기 테스트 Push
            </button>
            <button
              type="button"
              disabled={
                preview ||
                busy ||
                !["ready", "unregistered"].includes(device?.state ?? "")
              }
              onClick={() => void testDelivery(true)}
            >
              기기 표시 테스트
            </button>
            <button
              type="button"
              disabled={busy || preview}
              onClick={() => {
                setDevice(null);
                setRevision((v) => v + 1);
              }}
            >
              상태 다시 확인
            </button>
          </div>
          <details>
            <summary>발송됐는데 배너가 보이지 않나요?</summary>
            <p>
              Mac: 시스템 설정 → 알림 → Google Chrome(또는 설치 앱)에서 알림
              허용과 배너를 확인하고 집중 모드도 확인해 주세요.
            </p>
            <p>
              아이폰: 홈 화면에 설치한 WEEKFLOW로 열고 설정 → 알림 → WEEKFLOW를
              확인하세요. Android는 설정 → 앱 → 브라우저/설치 앱 → 알림을 확인해
              주세요.
            </p>
            <p>
              웹에서는 OS 알림 허용·배너·집중 모드를 직접 확인하거나 변경할 수
              없어요. 브라우저 수신 확인도 실제 배너 표시와는 별개예요.
            </p>
          </details>
        </div>
      )}
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
