import { useEffect, useState } from "react";
import { Copy, Link2Off, RefreshCw } from "lucide-react";
import { rpc } from "../data/supabase";
import { confirmAction } from "../ui/Confirmations";
import { userMessage } from "../ui/errors";

type Status = {
  enabled: boolean;
  created_at: string | null;
  last_used_at: string | null;
};
const feedUrl = (token: string) =>
  `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/calendar-feed?token=${encodeURIComponent(token)}`;
const when = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("ko-KR") : "아직 없음";

/**
 * Read-only subscription link for Google/Apple/Outlook calendars. The token is
 * shown once after issuing; the server keeps only its hash.
 */
export function CalendarFeed({ preview }: { preview: boolean }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [token, setToken] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (preview) return;
    let live = true;
    rpc<Status>("calendar_feed_status").then(
      (s) => live && setStatus(s),
      (e) => live && setMessage(userMessage(e)),
    );
    return () => {
      live = false;
    };
  }, [preview]);
  async function run(task: () => Promise<void>) {
    setBusy(true);
    setMessage("");
    try {
      await task();
    } catch (e) {
      setMessage(userMessage(e));
    } finally {
      setBusy(false);
    }
  }
  if (preview)
    return (
      <p className="small muted">
        캘린더 구독은 로그인한 계정에서 사용할 수 있어요.
      </p>
    );
  const url = token ? feedUrl(token) : "";
  const webcal = url.replace(/^https:/, "webcal:");
  return (
    <section className="calendar-feed">
      <h3>캘린더 구독 링크</h3>
      <p className="small muted">
        Google·Apple·Outlook 캘린더에 이 주의 일정과 작업 블록을 읽기 전용으로
        보여줘요(지난 30일~앞으로 90일). 구독한 앱이 몇 시간마다 새로 가져오므로
        바로 반영되지 않을 수 있어요. 링크를 아는 사람은 일정을 볼 수 있으니
        공유하지 마세요.
      </p>
      {status && (
        <p className="small">
          {status.enabled
            ? `사용 중 · 발급 ${when(status.created_at)} · 마지막 조회 ${when(status.last_used_at)}`
            : "아직 발급하지 않았어요."}
        </p>
      )}
      {url && (
        <div className="feed-link">
          <label>
            구독 주소 · 지금만 보여요
            <input readOnly value={url} onFocus={(e) => e.target.select()} />
          </label>
          <div className="secondary-actions">
            <button
              type="button"
              onClick={() =>
                void navigator.clipboard
                  .writeText(url)
                  .then(() => setMessage("주소를 복사했어요."))
              }
            >
              <Copy size={15} /> 주소 복사
            </button>
            <a
              className="button"
              href={`https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcal)}`}
              target="_blank"
              rel="noreferrer noopener"
            >
              Google 캘린더에 추가
            </a>
            <a className="button" href={webcal}>
              Apple·Outlook에서 열기
            </a>
          </div>
        </div>
      )}
      <div className="secondary-actions">
        <button
          type="button"
          disabled={busy}
          onClick={() =>
            void run(async () => {
              if (
                status?.enabled &&
                !(await confirmAction(
                  "새 링크를 만들면 지금 쓰는 구독 링크는 바로 끊겨요. 계속할까요?",
                ))
              )
                return;
              setToken(await rpc<string>("rotate_calendar_feed"));
              setStatus(await rpc<Status>("calendar_feed_status"));
            })
          }
        >
          <RefreshCw size={15} />
          {status?.enabled ? "새 링크로 바꾸기" : "구독 링크 만들기"}
        </button>
        {status?.enabled && (
          <button
            type="button"
            className="danger"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                if (
                  !(await confirmAction(
                    "구독 링크를 끊을까요? 구독한 캘린더에 더 이상 반영되지 않아요.",
                  ))
                )
                  return;
                await rpc("revoke_calendar_feed");
                setToken("");
                setStatus(await rpc<Status>("calendar_feed_status"));
              })
            }
          >
            <Link2Off size={15} /> 링크 끊기
          </button>
        )}
      </div>
      {message && (
        <p className="small" role="status">
          {message}
        </p>
      )}
    </section>
  );
}
