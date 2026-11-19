import { describe, it, expect } from "vitest";
import { emptyData, uuid } from "../data/demo";
import type { BlockSession } from "./types";
import {
  MAX_SESSION_MS,
  elapsedMs,
  formatElapsed,
  measuredMinutes,
  openSession,
  sessionsOf,
  startChanges,
  stopChange,
} from "./focus";

const T0 = Date.parse("2026-11-16T00:00:00.000Z");
const MIN = 60_000;
const session = (extra: Partial<BlockSession> = {}): BlockSession => ({
  id: uuid(),
  user_id: uuid(),
  version: 1,
  block_id: uuid(),
  started_at: new Date(T0).toISOString(),
  ended_at: null,
  note: "",
  ...extra,
});

describe("elapsed time", () => {
  it("comes from timestamps, so a late tick or reload still reads right", () => {
    const s = session();
    expect(elapsedMs(s, T0 + 25 * MIN + 3000)).toBe(25 * MIN + 3000);
    expect(
      elapsedMs(
        { ...s, ended_at: new Date(T0 + 40 * MIN).toISOString() },
        T0 + 9e9,
      ),
    ).toBe(40 * MIN);
  });
  it("never goes negative and stops counting after a day", () => {
    expect(elapsedMs(session(), T0 - 5000)).toBe(0);
    expect(elapsedMs(session(), T0 + 3 * MAX_SESSION_MS)).toBe(MAX_SESSION_MS);
  });
  it("formats minutes and hours", () => {
    expect(formatElapsed(0)).toBe("00:00");
    expect(formatElapsed(65_000)).toBe("01:05");
    expect(formatElapsed(3_725_000)).toBe("1:02:05");
  });
});

describe("measuredMinutes", () => {
  it("clips to the range and counts a running session up to now", () => {
    const done = session({ ended_at: new Date(T0 + 90 * MIN).toISOString() });
    const running = session({
      started_at: new Date(T0 + 120 * MIN).toISOString(),
    });
    const from = new Date(T0 + 30 * MIN).toISOString(),
      to = new Date(T0 + 24 * 60 * MIN).toISOString();
    expect(measuredMinutes([done, running], from, to, T0 + 150 * MIN)).toBe(
      60 + 30,
    );
  });
});

describe("one open session per person", () => {
  it("stops the running session before starting another, in one batch", () => {
    const d = emptyData(uuid());
    const running = session({ version: 2 });
    d.block_sessions.push(running);
    const target = uuid();
    const changes = startChanges(d, target, T0 + 10 * MIN, "new-id");
    expect(changes).toHaveLength(2);
    expect(changes[0]).toMatchObject({
      table: "block_sessions",
      action: "update",
      expected_version: 2,
      row: { id: running.id, ended_at: new Date(T0 + 10 * MIN).toISOString() },
    });
    expect(changes[1]).toMatchObject({
      table: "block_sessions",
      action: "insert",
      row: { id: "new-id", block_id: target, ended_at: null },
    });
  });
  it("does nothing when the block is already running", () => {
    const d = emptyData(uuid());
    const running = session();
    d.block_sessions.push(running);
    expect(startChanges(d, running.block_id, T0 + MIN, uuid())).toEqual([]);
  });
  it("starts plainly when nothing runs", () => {
    const d = emptyData(uuid());
    d.block_sessions.push(
      session({ ended_at: new Date(T0 + MIN).toISOString() }),
    );
    expect(startChanges(d, uuid(), T0, uuid())).toHaveLength(1);
  });
  it("stop clamps a forgotten timer to a day and trims the note", () => {
    const s = session();
    const c = stopChange(s, T0 + 2 * MAX_SESSION_MS, "x".repeat(1200));
    expect(c.row.ended_at).toBe(new Date(T0 + MAX_SESSION_MS).toISOString());
    expect(String(c.row.note)).toHaveLength(1000);
  });
  it("finds the open session and a block's history newest first", () => {
    const d = emptyData(uuid());
    const block = uuid();
    const a = session({
      block_id: block,
      ended_at: new Date(T0 + MIN).toISOString(),
    });
    const b = session({
      block_id: block,
      started_at: new Date(T0 + 5 * MIN).toISOString(),
    });
    d.block_sessions.push(a, b, session());
    expect(openSession(d)?.id).toBe(b.id);
    expect(sessionsOf(d, block).map((s) => s.id)).toEqual([b.id, a.id]);
  });
});
