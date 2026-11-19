import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { HISTORY_LIMIT, inverseOf, restamp } from "./history";
import type { Change, Command, Dataset } from "../domain/types";
import {
  applyLocal,
  reconcileCache,
  clearPrivate,
  dequeue,
  persistCommand,
  pending,
  readCache,
  replacePending,
} from "./local";
import { rebaseQueue, discardChain } from "./queue";
import { rpc } from "./supabase";
import { uuid } from "./demo";
import {
  ReloadPolicy,
  deepEqual,
  isNetworkError,
  normalizeDataset,
  type SyncState,
} from "./sync";
export type { SyncState } from "./sync";
export interface Conflict {
  command: Command;
  server: Dataset;
  message: string;
}
/**
 * Why a flush runs. "initial"/"manual" always reload the dataset; "commit"
 * reloads only if something was sent; "periodic"/"focus" consult ReloadPolicy.
 */
export type FlushReason =
  "initial" | "manual" | "commit" | "periodic" | "focus";
const readDataset = async () =>
  normalizeDataset(await rpc<Dataset>("read_dataset"));
const savedLabel = () =>
  `저장됨 · ${new Date().toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}`;
export function usePlanner(user: string | null, preview: Dataset | null) {
  const query = useQueryClient();
  const [data, setData] = useState<Dataset | null>(preview);
  const ref = useRef(data);
  const [status, setStatus] = useState("불러오는 중");
  const [syncState, setSyncState] = useState<SyncState>(
    preview ? "preview" : "saving",
  );
  const syncRef = useRef<SyncState>(syncState);
  const [error, setError] = useState("");
  const [conflict, setConflict] = useState<Conflict | null>(null);
  // Undo/redo stacks of inverse changes. Refs are the source of truth inside
  // the commit chain; the state counter re-renders consumers.
  const past = useRef<Change[][]>([]);
  const future = useRef<Change[][]>([]);
  const [history, setHistory] = useState<{
    undo: number;
    redo: number;
    last: "change" | "undo" | "redo" | null;
  }>({ undo: 0, redo: 0, last: null });
  const syncHistory = useCallback(
    (last: "change" | "undo" | "redo" | null) =>
      setHistory({
        undo: past.current.length,
        redo: future.current.length,
        last,
      }),
    [],
  );
  const setUndo = useCallback(
    // Only ever cleared; kept as setUndo(null) to read like the old state.
    (value: null) => {
      void value;
      past.current = [];
      future.current = [];
      syncHistory(null);
    },
    [syncHistory],
  );
  const busy = useRef(false);
  const rerun = useRef(false);
  const suspended = useRef(false);
  const commitLock = useRef<Promise<void>>(Promise.resolve());
  const active = useRef(user);
  const ensured = useRef<string | null>(null);
  const loadSeq = useRef(0);
  const sentGen = useRef(0);
  const policy = useMemo(
    () =>
      user ? new ReloadPolicy(() => rpc<unknown>("dataset_version")) : null,
    [user],
  );
  useEffect(() => {
    active.current = user;
    suspended.current = false;
  }, [user]);
  const put = useCallback((next: Dataset | null) => {
    ref.current = next;
    setData(next);
  }, []);
  const setSync = useCallback((state: SyncState, text: string) => {
    syncRef.current = state;
    setSyncState(state);
    setStatus(text);
  }, []);
  /** Always reads fresh from the server (never deduped onto an older in-flight request). */
  const load = useCallback(async () => {
    if (!user) return;
    const uid = user;
    const seq = ++loadSeq.current;
    const gen = sentGen.current;
    if (ensured.current !== uid) {
      await rpc("ensure_profile");
      ensured.current = uid;
    }
    await policy?.beforeLoad();
    const server = await readDataset();
    policy?.markLoaded();
    query.setQueryData(["dataset", uid], server);
    if (active.current !== uid) return;
    // A newer load started, or a queued command was sent (and dequeued) while
    // this request was in flight: this snapshot may predate it. The newer
    // load / the post-send load will deliver fresh data instead.
    if (seq !== loadSeq.current || gen !== sentGen.current) return server;
    const next = await reconcileCache(uid, server);
    if (active.current !== uid) {
      await clearPrivate(uid);
      return;
    }
    if (seq !== loadSeq.current) return server;
    if (!deepEqual(ref.current, next)) put(next);
    return server;
  }, [user, put, query, policy]);
  /** One pass: send the queue, then reload only if worthwhile. */
  const flushOnce = useCallback(
    async (uid: string, reason: FlushReason): Promise<void> => {
      let processed = 0;
      while (processed < 500) {
        const queue = await pending(uid);
        if (!queue.length) break;
        for (const cmd of queue) {
          if (active.current !== uid) return;
          try {
            await rpc("apply_changes", {
              p_mutation_id: cmd.mutationId,
              p_changes: cmd.changes,
              p_acknowledge: cmd.acknowledgeConflict ?? false,
            });
            await dequeue(cmd.mutationId);
            sentGen.current++;
            processed++;
          } catch (e) {
            const message = String(e);
            if (isNetworkError(message)) throw e;
            const server = await readDataset();
            suspended.current = true;
            setConflict({ command: cmd, server, message });
            setSync(
              "error",
              /VERSION_CONFLICT|TIME_CONFLICT/.test(message)
                ? "변경 충돌 · 선택 필요"
                : "저장 거절 · 변경 확인 필요",
            );
            return;
          }
        }
      }
      const reload =
        processed > 0 ||
        reason === "initial" ||
        reason === "manual" ||
        (reason !== "commit" &&
          !!policy &&
          (await policy.shouldReload(reason)));
      if (reload) await load();
      if (active.current !== uid) return;
      const remaining = await pending(uid);
      if (remaining.length) setSync("saving", "동기화 대기");
      // Only rewrite the "저장됨 · HH:MM" label when something happened.
      else if (processed > 0 || reload || syncRef.current !== "saved")
        setSync("saved", savedLabel());
    },
    [load, policy, setSync],
  );
  const flush = useCallback(
    async (reason: FlushReason = "manual"): Promise<void> => {
      if (!user || suspended.current || !navigator.onLine) return;
      if (busy.current) {
        // A commit landed mid-flush: run another pass when this one ends.
        rerun.current = true;
        return;
      }
      busy.current = true;
      try {
        let next: FlushReason = reason;
        do {
          rerun.current = false;
          await flushOnce(user, next);
          next = "commit";
        } while (rerun.current && !suspended.current);
      } catch (e) {
        if (navigator.onLine) setSync("error", "동기화 대기 · 다시 시도");
        else setSync("offline", "오프라인 · 동기화 대기");
        setError(String(e));
      } finally {
        busy.current = false;
      }
    },
    [user, flushOnce, setSync],
  );
  useEffect(() => {
    let valid = true;
    if (preview) {
      void Promise.resolve().then(() => {
        if (valid) {
          put(preview);
          setSync("preview", "체험 · 메모리에서만 변경");
          setUndo(null);
          setConflict(null);
        }
      });
      return () => {
        valid = false;
      };
    }
    if (!user) {
      void Promise.resolve().then(() => {
        if (valid) {
          put(null);
          setUndo(null);
          setConflict(null);
        }
      });
      return () => {
        valid = false;
      };
    }
    readCache(user)
      .then((d) => {
        if (valid && d) {
          put(d);
          if (!navigator.onLine) setSync("offline", "오프라인 · 동기화 대기");
        }
      })
      .then(() => flush("initial"))
      .catch((e) => setError(String(e)));
    const wake = () => void flush("focus"),
      visible = () => {
        if (document.visibilityState === "visible") void flush("focus");
      },
      offline = () => setSync("offline", "오프라인 · 기기에 임시 저장");
    window.addEventListener("online", wake);
    window.addEventListener("focus", wake);
    document.addEventListener("visibilitychange", visible);
    window.addEventListener("offline", offline);
    const interval = window.setInterval(() => {
      if (!document.hidden) void flush("periodic");
    }, 30000);
    return () => {
      valid = false;
      window.removeEventListener("online", wake);
      window.removeEventListener("focus", wake);
      document.removeEventListener("visibilitychange", visible);
      window.removeEventListener("offline", offline);
      clearInterval(interval);
    };
  }, [user, preview, put, flush, setSync, setUndo]);
  const commit = useCallback(
    (
      changes: Change[],
      ack = false,
      record: "change" | "undo" | "redo" | "none" = "change",
    ): Promise<void> => {
      if (preview) setSync("preview", "체험 · 변경 중");
      else setSync("saving", "기기에 임시 저장 중");
      const task = commitLock.current
        .catch(() => {})
        .then(async () => {
          const before = ref.current;
          if (!before) return;
          setError("");
          const next = applyLocal(before, changes);
          if (record !== "none") {
            const inverse = inverseOf(before, next);
            if (inverse.length) {
              const target = record === "undo" ? future : past;
              target.current = [...target.current, inverse].slice(
                -HISTORY_LIMIT,
              );
              if (record === "change") future.current = [];
              syncHistory(record);
            }
          }
          if (preview) {
            put(next);
            return;
          }
          if (!user) return;
          const cmd = { mutationId: uuid(), changes, acknowledgeConflict: ack };
          try {
            await persistCommand(user, cmd, next);
          } catch (e) {
            setError(
              "기기에 임시 저장하지 못했습니다. 저장 공간을 확인하고 백업해 주세요.",
            );
            throw e;
          }
          if (active.current !== user) {
            await clearPrivate(user);
            return;
          }
          put(next);
          if (navigator.onLine) setSync("saving", "서버 저장 중");
          else setSync("offline", "오프라인 · 동기화 대기");
          void flush("commit");
        });
      commitLock.current = task;
      return task;
    },
    [preview, user, put, flush, setSync, syncHistory],
  );
  /**
   * Resolve the current conflict. Serialized on commitLock so a commit that
   * lands while the queue is being rewritten is never lost.
   */
  const resolve = useCallback(
    (keepMine: boolean): Promise<void> => {
      const current = conflict;
      if (!current || !user) return Promise.resolve();
      const task = commitLock.current
        .catch(() => {})
        .then(async () => {
          if (active.current !== user) return;
          const queue = await pending(user);
          const index = queue.findIndex(
            (c) => c.mutationId === current.command.mutationId,
          );
          if (index < 0) return;
          const rebased = keepMine
            ? rebaseQueue(
                current.server,
                queue.map((c, i) =>
                  i === index
                    ? {
                        ...c,
                        acknowledgeConflict:
                          c.acknowledgeConflict ||
                          current.message.includes("TIME_CONFLICT"),
                      }
                    : c,
                ),
                index,
              )
            : [...queue.slice(0, index), ...discardChain(queue.slice(index))];
          let next = current.server;
          for (const command of rebased)
            next = applyLocal(next, command.changes);
          await replacePending(user, rebased, next);
          put(next);
          setConflict(null);
          setUndo(null);
          suspended.current = false;
          setError("");
          void flush("commit");
        });
      commitLock.current = task;
      return task;
    },
    [conflict, user, put, flush, setUndo],
  );
  const manualFlush = useCallback(() => flush("manual"), [flush]);
  /** Undo pushes its own inverse onto redo and vice versa. */
  const step = useCallback(
    async (direction: "undo" | "redo") => {
      const stack = direction === "undo" ? past : future;
      const entry = stack.current.at(-1);
      if (!entry || !ref.current) return;
      stack.current = stack.current.slice(0, -1);
      const changes = restamp(entry, ref.current);
      if (!changes) {
        syncHistory(direction);
        return;
      }
      await commit(changes, true, direction === "undo" ? "undo" : "redo");
    },
    [commit, syncHistory],
  );
  return {
    data,
    status,
    /** Stable sync phase for live-region announcements (status also carries a clock time). */
    syncState,
    error,
    setError,
    commit,
    reload: load,
    flush: manualFlush,
    conflict,
    resolve,
    undo: history.undo ? () => step("undo") : null,
    redo: history.redo ? () => step("redo") : null,
    /** What the last history entry came from, for the toast wording. */
    lastHistory: history.last,
    clear: async () => {
      active.current = null;
      suspended.current = true;
      await commitLock.current.catch(() => {});
      if (user) await clearPrivate(user);
      query.clear();
      put(null);
    },
  };
}
export type PlannerStore = ReturnType<typeof usePlanner>;
