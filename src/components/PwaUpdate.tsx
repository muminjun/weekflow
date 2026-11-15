import { useEffect, useRef, useState } from "react";
export function PwaUpdate() {
  const [update, setUpdate] = useState<ServiceWorkerRegistration | null>(null);
  const [error, setError] = useState(false);
  const refresh = useRef(false);
  useEffect(() => {
    if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return;
    const changed = () => {
      if (refresh.current) location.reload();
    };
    navigator.serviceWorker.addEventListener("controllerchange", changed);
    navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`, {
        scope: import.meta.env.BASE_URL,
      })
      .then((reg) => {
        if (reg.waiting) setUpdate(reg);
        reg.addEventListener("updatefound", () => {
          const installing = reg.installing;
          installing?.addEventListener("statechange", () => {
            if (
              installing.state === "installed" &&
              navigator.serviceWorker.controller
            )
              setUpdate(reg);
          });
        });
      })
      .catch(() => setError(true));
    return () =>
      navigator.serviceWorker.removeEventListener("controllerchange", changed);
  }, []);
  return update ? (
    <div className="pwa-update" role="status">
      새 버전이 준비됐습니다. 미전송 변경이 있으면 먼저 동기화하세요.
      <button
        onClick={() => {
          refresh.current = true;
          update.waiting?.postMessage("ACTIVATE_UPDATE");
        }}
      >
        새 버전 열기
      </button>
    </div>
  ) : error ? (
    <div className="pwa-update" role="status">
      오프라인 준비에 실패했습니다. 연결을 확인한 뒤 새로고침해 주세요.
    </div>
  ) : null;
}
