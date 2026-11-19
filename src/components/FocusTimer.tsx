import { useEffect, useState } from "react";
import { formatInTimeZone } from "date-fns-tz";
import { Pause, Play } from "lucide-react";
import type { Block, Dataset } from "../domain/types";
import {
  elapsedMs,
  formatElapsed,
  MAX_NOTE,
  openSession,
  sessionsOf,
  startChanges,
  stopChange,
} from "../domain/focus";
import { titleOf } from "../domain/selectors";
import { uuid } from "../data/demo";
import { userMessage } from "../ui/errors";
import type { Commit } from "./Editors";

type WakeLockSentinelLike = { release: () => Promise<void> };
type WakeLockLike = {
  request: (type: "screen") => Promise<WakeLockSentinelLike>;
};

/** Keeps the screen on while `active`, re-acquiring after the tab returns. */
function useWakeLock(active: boolean) {
  useEffect(() => {
    const wakeLock = (navigator as Navigator & { wakeLock?: WakeLockLike })
      .wakeLock;
    if (!active || !wakeLock) return;
    let sentinel: WakeLockSentinelLike | null = null,
      disposed = false;
    const release = () => {
      const s = sentinel;
      sentinel = null;
      void s?.release().catch(() => {});
    };
    const acquire = async () => {
      if (sentinel || document.visibilityState !== "visible") return;
      try {
        const s = await wakeLock.request("screen");
        if (disposed || document.visibilityState !== "visible")
          void s.release().catch(() => {});
        else sentinel = s;
      } catch {
        /* denied (battery saver, permissions policy): the timer still works */
      }
    };
    // Browsers drop the lock when the page is hidden; take it again on return.
    const onVisibility = () =>
      document.visibilityState === "visible" ? void acquire() : release();
    void acquire();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      disposed = true;
      document.removeEventListener("visibilitychange", onVisibility);
      release();
    };
  }, [active]);
}

/** Re-renders every second while running; time itself comes from timestamps. */
function useNow(active: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    const sync = () => setNow(Date.now());
    document.addEventListener("visibilitychange", sync);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", sync);
    };
  }, [active]);
  return now;
}

const minutes = (ms: number) => Math.floor(ms / 60000);
const duration = (m: number) =>
  m >= 60 ? `${Math.floor(m / 60)}시간 ${m % 60}분` : `${m}분`;

export function FocusTimer({
  data,
  block,
  commit,
  onMarkedDone,
}: {
  data: Dataset;
  block: Block;
  commit: Commit;
  /** Called after the block was marked done from the stop offer. */
  onMarkedDone?: () => void;
}) {
  const zone = data.profile.timezone;
  const open = openSession(data);
  const running = open?.block_id === block.id ? open : undefined;
  const elsewhere = open && !running ? open : undefined;
  const now = useNow(!!open);
  useWakeLock(!!running);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [offerDone, setOfferDone] = useState(false);
  const current = data.time_blocks.find((b) => b.id === block.id) ?? block;
  const past = sessionsOf(data, block.id).filter((s) => s.ended_at !== null);
  const total = past.reduce((n, s) => n + minutes(elapsedMs(s, now)), 0);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (e) {
      setError(userMessage(e));
    } finally {
      setBusy(false);
    }
  }
  const start = () =>
    run(async () => {
      setOfferDone(false);
      const changes = startChanges(data, block.id, Date.now(), uuid());
      if (changes.length) await commit(changes);
    });
  const stop = () =>
    run(async () => {
      if (!running) return;
      await commit([stopChange(running, Date.now(), note.trim())]);
      setNote("");
      setOfferDone(current.state !== "done");
    });
  const markDone = () =>
    run(async () => {
      await commit([
        {
          table: "time_blocks",
          action: "update",
          expected_version: current.version,
          row: {
            id: current.id,
            state: "done",
            completed_at: current.completed_at ?? new Date().toISOString(),
          },
        },
      ]);
      setOfferDone(false);
      onMarkedDone?.();
    });

  return (
    <section className="focus-timer" aria-labelledby={`focus-${block.id}`}>
      <div className="focus-timer-head">
        <h3 id={`focus-${block.id}`}>집중 타이머</h3>
        <span
          className="focus-timer-clock"
          role="timer"
          aria-live="off"
          aria-label={running ? "경과 시간" : "실측 합계"}
        >
          {running
            ? formatElapsed(elapsedMs(running, now))
            : past.length
              ? duration(total)
              : "00:00"}
        </span>
        {running ? (
          <button
            type="button"
            className="primary"
            disabled={busy}
            onClick={() => void stop()}
          >
            <Pause size={14} aria-hidden="true" />
            종료
          </button>
        ) : (
          <button type="button" disabled={busy} onClick={() => void start()}>
            <Play size={14} aria-hidden="true" />
            시작
          </button>
        )}
      </div>
      {elsewhere && (
        <p className="small muted">
          ‘
          {titleOf(
            data,
            data.time_blocks.find((b) => b.id === elsewhere.block_id) ?? block,
          )}
          ’ 타이머가 {formatElapsed(elapsedMs(elsewhere, now))}째 실행 중이에요.
          시작하면 그 타이머를 먼저 종료해요.
        </p>
      )}
      {running && (
        <label className="focus-timer-note">
          메모 (선택)
          <textarea
            value={note}
            maxLength={MAX_NOTE}
            placeholder="무엇에 집중했는지 짧게 남겨요."
            onChange={(e) => setNote(e.target.value)}
          />
        </label>
      )}
      {offerDone && (
        <div className="focus-timer-offer" role="status">
          <span>집중을 기록했어요. 이 블록도 끝났나요?</span>
          <button
            type="button"
            className="primary"
            disabled={busy}
            onClick={() => void markDone()}
          >
            블록 완료로 표시
          </button>
          <button
            type="button"
            className="text-button"
            onClick={() => setOfferDone(false)}
          >
            나중에
          </button>
        </div>
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {past.length > 0 && (
        <details className="focus-timer-history">
          <summary>
            지난 기록 {past.length}회 · 실측 {duration(total)}
          </summary>
          <ul>
            {past.map((s) => (
              <li key={s.id}>
                <span>{formatInTimeZone(s.started_at, zone, "M/d HH:mm")}</span>
                <b>{duration(minutes(elapsedMs(s, now)))}</b>
                {s.note && <span className="muted">{s.note}</span>}
              </li>
            ))}
          </ul>
        </details>
      )}
      <p className="small muted">
        실측 시간은 타이머로 잰 시간이에요. 계획한 블록 길이와 따로 기록돼요.
      </p>
    </section>
  );
}
