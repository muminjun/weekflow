import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
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
export interface Conflict {
  command: Command;
  server: Dataset;
  message: string;
}
export function usePlanner(user: string | null, preview: Dataset | null) {
  const query = useQueryClient();
  const [data, setData] = useState<Dataset | null>(preview);
  const ref = useRef(data);
  const [status, setStatus] = useState("불러오는 중");
  const [error, setError] = useState("");
  const [conflict, setConflict] = useState<Conflict | null>(null);
  const [undoChanges, setUndo] = useState<Change[] | null>(null);
  const busy = useRef(false);
  const suspended = useRef(false);
  const commitLock = useRef<Promise<void>>(Promise.resolve());
  const active = useRef(user);
  useEffect(() => {
    active.current = user;
    suspended.current = false;
  }, [user]);
  const put = useCallback((next: Dataset | null) => {
    ref.current = next;
    setData(next);
  }, []);
  const load = useCallback(async () => {
    if (!user) return;
    const uid = user;
    await rpc("ensure_profile");
    const server = await query.fetchQuery({
      queryKey: ["dataset", uid],
      queryFn: () => rpc<Dataset>("read_dataset"),
      staleTime: 0,
    });
    if (active.current !== uid) return;
    const next = await reconcileCache(uid, server);
    if (active.current !== uid) {
      await clearPrivate(uid);
      return;
    }
    put(next);
    return server;
  }, [user, put, query]);
  const flush = useCallback(async () => {
    if (!user || busy.current || suspended.current || !navigator.onLine) return;
    busy.current = true;
    const uid = user;
    try {
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
            processed++;
          } catch (e) {
            const message = String(e);
            if (
              /fetch|network|timeout|connection|AbortError|Load failed/i.test(
                message,
              )
            )
              throw e;
            const server = await rpc<Dataset>("read_dataset");
            suspended.current = true;
            setConflict({ command: cmd, server, message });
            setStatus(
              /VERSION_CONFLICT|TIME_CONFLICT/.test(message)
                ? "변경 충돌 · 선택 필요"
                : "저장 거절 · 변경 확인 필요",
            );
            return;
          }
        }
      }
      await load();
      const remaining = await pending(uid);
      setStatus(
        remaining.length
          ? "동기화 대기"
          : `저장됨 · ${new Date().toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}`,
      );
    } catch (e) {
      setStatus("동기화 대기 · 다시 시도");
      setError(String(e));
    } finally {
      busy.current = false;
    }
  }, [user, load]);
  useEffect(() => {
    let valid = true;
    if (preview) {
      void Promise.resolve().then(() => {
        if (valid) {
          put(preview);
          setStatus("체험 · 메모리에서만 변경");
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
          if (!navigator.onLine) setStatus("오프라인 · 동기화 대기");
        }
      })
      .then(() => flush())
      .catch((e) => setError(String(e)));
    const online = () => void flush(),
      offline = () => setStatus("오프라인 · 기기에 임시 저장");
    window.addEventListener("online", online);
    window.addEventListener("offline", offline);
    const interval = window.setInterval(() => {
      if (!document.hidden) void flush();
    }, 30000);
    return () => {
      valid = false;
      window.removeEventListener("online", online);
      window.removeEventListener("offline", offline);
      clearInterval(interval);
    };
  }, [user, preview, put, flush]);
  const commit = useCallback(
    (changes: Change[], ack = false, recordUndo = true): Promise<void> => {
      setStatus(preview ? "체험 · 변경 중" : "기기에 임시 저장 중");
      const task = commitLock.current
        .catch(() => {})
        .then(async () => {
          const before = ref.current;
          if (!before) return;
          setError("");
          const next = applyLocal(before, changes);
          if (recordUndo) {
            const inverse: Change[] = [];
            for (const table of [
              "categories",
              "tasks",
              "week_tasks",
              "goals",
              "goal_week_tasks",
              "time_blocks",
              "week_task_day_marks",
              "availability_rules",
              "availability_overrides",
              "recurrence_rules",
              "recurrence_occurrences",
              "week_reviews",
            ] as const) {
              const old = before[table] as unknown as Record<string, unknown>[],
                now = next[table] as unknown as Record<string, unknown>[];
              const key = (r: Record<string, unknown>) =>
                String(r.id ?? `${r.goal_id}:${r.week_task_id}`);
              for (const r of old) {
                const n = now.find((x) => key(x) === key(r));
                if (!n) inverse.push({ table, action: "insert", row: r });
                else if (JSON.stringify(n) !== JSON.stringify(r))
                  inverse.push({
                    table,
                    action: "update",
                    row: r,
                    expected_version: Number(n.version),
                  });
              }
              for (const n of now)
                if (!old.some((r) => key(r) === key(n)))
                  inverse.push({
                    table,
                    action: "delete",
                    row: n,
                    expected_version: Number(n.version),
                  });
            }
            setUndo([
              ...inverse.filter((c) => c.action !== "delete"),
              ...inverse.filter((c) => c.action === "delete").reverse(),
            ]);
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
          setStatus(
            navigator.onLine ? "서버 저장 중" : "오프라인 · 동기화 대기",
          );
          void flush();
        });
      commitLock.current = task;
      return task;
    },
    [preview, user, put, flush],
  );
  async function resolve(keepMine: boolean) {
    if (!conflict || !user) return;
    await commitLock.current;
    const queue = await pending(user);
    const index = queue.findIndex(
      (c) => c.mutationId === conflict.command.mutationId,
    );
    if (index < 0) return;
    const remaining = keepMine
      ? queue.map((c, i) =>
          i === index
            ? {
                ...c,
                acknowledgeConflict:
                  c.acknowledgeConflict ||
                  conflict.message.includes("TIME_CONFLICT"),
              }
            : c,
        )
      : [...queue.slice(0, index), ...discardChain(queue.slice(index))];
    const rebased = rebaseQueue(conflict.server, remaining);
    let next = conflict.server;
    for (const command of rebased) next = applyLocal(next, command.changes);
    await replacePending(user, rebased, next);
    put(next);
    setConflict(null);
    setUndo(null);
    suspended.current = false;
    setError("");
    void flush();
  }
  return {
    data,
    status,
    error,
    setError,
    commit,
    reload: load,
    flush,
    conflict,
    resolve,
    undo: undoChanges
      ? async () => {
          const changes = undoChanges;
          setUndo(null);
          await commit(changes, true, false);
        }
      : null,
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
