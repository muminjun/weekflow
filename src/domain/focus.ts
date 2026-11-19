import type { BlockSession, Change, Dataset } from "./types";

/** The server rejects sessions longer than a day (`ended_at - started_at`). */
export const MAX_SESSION_MS = 24 * 60 * 60 * 1000;
export const MAX_NOTE = 1000;

const iso = (ms: number) => new Date(ms).toISOString();

/**
 * When the session stops (or `now` while it runs), never before its start and
 * never more than a day after it. Elapsed time is always derived from the
 * stored timestamps, so throttled background tabs and reloads cannot drift.
 */
export function sessionEndMs(s: BlockSession, now: number) {
  const start = Date.parse(s.started_at);
  const end = s.ended_at === null ? now : Date.parse(s.ended_at);
  return Math.min(Math.max(end, start), start + MAX_SESSION_MS);
}
export const elapsedMs = (s: BlockSession, now: number) =>
  sessionEndMs(s, now) - Date.parse(s.started_at);

/** "MM:SS" under an hour, "H:MM:SS" after. */
export function formatElapsed(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000)),
    h = Math.floor(total / 3600),
    m = Math.floor((total % 3600) / 60),
    s = total % 60;
  const two = (n: number) => String(n).padStart(2, "0");
  return h ? `${h}:${two(m)}:${two(s)}` : `${two(m)}:${two(s)}`;
}

/** The person's running session, if any (the server allows only one). */
export const openSession = (data: Dataset) =>
  (data.block_sessions ?? [])
    .filter((s) => s.ended_at === null)
    .sort((a, b) => b.started_at.localeCompare(a.started_at))[0];

/** A block's sessions, newest first. */
export const sessionsOf = (data: Dataset, blockId: string) =>
  (data.block_sessions ?? [])
    .filter((s) => s.block_id === blockId)
    .sort((a, b) => b.started_at.localeCompare(a.started_at));

/** Minutes measured inside [from, to); a running session counts up to `now`. */
export function measuredMinutes(
  sessions: BlockSession[],
  from: string,
  to: string,
  now: number,
) {
  const lo = Date.parse(from),
    hi = Date.parse(to);
  let ms = 0;
  for (const s of sessions) {
    const start = Math.max(Date.parse(s.started_at), lo),
      end = Math.min(sessionEndMs(s, now), hi);
    if (end > start) ms += end - start;
  }
  return Math.floor(ms / 60000);
}

export function stopChange(
  s: BlockSession,
  now: number,
  note = s.note,
): Change {
  return {
    table: "block_sessions",
    action: "update",
    expected_version: s.version,
    row: {
      id: s.id,
      block_id: s.block_id,
      started_at: s.started_at,
      ended_at: iso(sessionEndMs(s, now)),
      note: note.slice(0, MAX_NOTE),
    },
  };
}

/**
 * Starts a session on `blockId`. Every other open session is stopped first in
 * the same batch, so the one-open-session-per-person rule holds on the server.
 * Returns [] when this block is already running.
 */
export function startChanges(
  data: Dataset,
  blockId: string,
  now: number,
  id: string,
): Change[] {
  const open = (data.block_sessions ?? []).filter((s) => s.ended_at === null);
  if (open.some((s) => s.block_id === blockId)) return [];
  return [
    ...open.map((s) => stopChange(s, now)),
    {
      table: "block_sessions",
      action: "insert",
      row: {
        id,
        block_id: blockId,
        started_at: iso(now),
        ended_at: null,
        note: "",
      },
    },
  ];
}
