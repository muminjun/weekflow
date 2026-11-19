import "fake-indexeddb/auto";
import { describe, it, expect } from "vitest";
import { emptyData, uuid } from "./demo";
import {
  ReloadPolicy,
  deepEqual,
  normalizeDataset,
  FALLBACK_RELOAD_MS,
  FOCUS_THROTTLE_MS,
} from "./sync";
import { blockSlice } from "../domain/selectors";
import { cache, readCache, reconcileCache, clearPrivate } from "./local";
import { holidayStatus } from "./holidays";
import type { Block, Dataset } from "../domain/types";

function seoulBlock(user: string): Block {
  return {
    id: uuid(),
    user_id: user,
    version: 1,
    kind: "event",
    week_task_id: null,
    event_title: "late",
    event_note: "",
    category_id: null,
    // Mon 2026-11-16 23:00–24:00 Asia/Seoul, in PostgREST's serialisation.
    start_at: "2026-11-16T14:00:00+00:00",
    end_at: "2026-11-16T15:00:00+00:00",
    local_date: "2026-11-16",
    state: "planned",
    completed_at: null,
    created_at: "2026-11-01T00:00:00.123456+00:00",
  };
}

describe("timestamp normalisation at the data boundary", () => {
  it("raw +00:00 strings misplace a block ending at local midnight", () => {
    const b = seoulBlock(uuid());
    // Documents the bug: "+" sorts before "." so end_at < toUTC(..., 1440).
    expect(blockSlice(b, "2026-11-16", "Asia/Seoul")).not.toEqual([1380, 1440]);
  });
  it("normalised rows give blockSlice [1380,1440] for Mon 23:00–24:00 Seoul", () => {
    const user = uuid();
    const d = emptyData(user);
    d.time_blocks.push(seoulBlock(user));
    const n = normalizeDataset(d);
    const b = n.time_blocks[0];
    expect(b.start_at).toBe("2026-11-16T14:00:00.000Z");
    expect(b.end_at).toBe("2026-11-16T15:00:00.000Z");
    expect(b.created_at).toBe("2026-11-01T00:00:00.123Z");
    expect(b.completed_at).toBeNull();
    expect(b.local_date).toBe("2026-11-16"); // non-*_at fields untouched
    expect(blockSlice(b, "2026-11-16", "Asia/Seoul")).toEqual([1380, 1440]);
    expect(blockSlice(b, "2026-11-17", "Asia/Seoul")).toBeNull();
  });
  it("normalises singleton rows and leaves unparsable values alone", () => {
    const d = emptyData(uuid());
    (d.profile as unknown as Record<string, unknown>).updated_at =
      "2026-11-16T00:00:00+09:00";
    (
      d.notification_preferences as unknown as Record<string, unknown>
    ).weird_at = "not a date";
    const n = normalizeDataset(d);
    expect((n.profile as unknown as Record<string, unknown>).updated_at).toBe(
      "2026-11-15T15:00:00.000Z",
    );
    expect(
      (n.notification_preferences as unknown as Record<string, unknown>)
        .weird_at,
    ).toBe("not a date");
  });
  it("reconcileCache and readCache return normalised rows", async () => {
    const user = uuid();
    const d = emptyData(user);
    d.time_blocks.push(seoulBlock(user));
    const reconciled = await reconcileCache(user, d);
    expect(reconciled.time_blocks[0].end_at).toBe("2026-11-16T15:00:00.000Z");
    // A cache written by an older build still holds raw server strings.
    await cache(user, d);
    expect((await readCache(user))?.time_blocks[0].end_at).toBe(
      "2026-11-16T15:00:00.000Z",
    );
    await clearPrivate(user);
  });
});

describe("deepEqual", () => {
  it("ignores key order but not values", () => {
    expect(
      deepEqual({ a: 1, b: [1, { c: 2 }] }, { b: [1, { c: 2 }], a: 1 }),
    ).toBe(true);
    expect(deepEqual({ a: 1 }, { a: 1, b: undefined })).toBe(false);
    expect(deepEqual([1, 2], [2, 1])).toBe(false);
    const d: Dataset = emptyData(uuid());
    expect(deepEqual(d, structuredClone(d))).toBe(true);
  });
});

describe("ReloadPolicy", () => {
  const clock = () => {
    let t = 1_000_000;
    return { now: () => t, advance: (ms: number) => (t += ms) };
  };
  it("periodic check reloads only when the dataset_version token changes", async () => {
    const c = clock();
    let token: unknown = { v: 1 };
    let calls = 0;
    const p = new ReloadPolicy(async () => {
      calls++;
      return token;
    }, c.now);
    await p.beforeLoad();
    p.markLoaded();
    c.advance(30_000);
    expect(await p.shouldReload("periodic")).toBe(false);
    token = { v: 2 };
    c.advance(30_000);
    expect(await p.shouldReload("periodic")).toBe(true);
    expect(calls).toBe(3);
  });
  it("falls back to a 5-minute full reload when the RPC does not exist", async () => {
    const c = clock();
    let calls = 0;
    const p = new ReloadPolicy(async () => {
      calls++;
      throw Error(
        "Could not find the function public.dataset_version without parameters in the schema cache",
      );
    }, c.now);
    await p.beforeLoad();
    p.markLoaded();
    expect(p.isSupported()).toBe(false);
    c.advance(30_000);
    expect(await p.shouldReload("periodic")).toBe(false);
    c.advance(FALLBACK_RELOAD_MS);
    expect(await p.shouldReload("periodic")).toBe(true);
    expect(calls).toBe(1); // never probed again once known missing
  });
  it("does not reload on a transient (network) probe error", async () => {
    const c = clock();
    const p = new ReloadPolicy(async () => {
      throw Error("TypeError: Failed to fetch");
    }, c.now);
    p.markLoaded();
    c.advance(FALLBACK_RELOAD_MS * 2);
    expect(await p.shouldReload("periodic")).toBe(false);
    expect(p.isSupported()).toBeUndefined();
  });
  it("throttles focus checks to >=60s since the last load", async () => {
    const c = clock();
    const p = new ReloadPolicy(async () => {
      throw Error("function public.dataset_version() does not exist");
    }, c.now);
    await p.beforeLoad();
    p.markLoaded();
    c.advance(FOCUS_THROTTLE_MS - 1);
    expect(await p.shouldReload("focus")).toBe(false);
    c.advance(1);
    expect(await p.shouldReload("focus")).toBe(true);
  });
});

describe("holidayStatus", () => {
  it("distinguishes loading from unknown", () => {
    expect(holidayStatus(undefined, true)).toBe("loading");
    expect(holidayStatus(undefined, false)).toBe("unknown");
    expect(holidayStatus({ known: false }, false)).toBe("unknown");
    expect(holidayStatus({ known: true }, false)).toBe("known");
  });
});
import { parseHolidayYear } from "./holidays";
describe("parseHolidayYear", () => {
  const good = {
    schemaVersion: 1,
    year: 2026,
    source: "KASI-SpcdeInfoService",
    fetchedAt: "2026-11-01T00:00:00.000Z",
    complete: true,
    items: [{ date: "2026-12-25", names: ["기독탄신일"], isHoliday: true }],
  };
  it("accepts the published file and rejects altered ones", () => {
    expect(parseHolidayYear(good).items).toHaveLength(1);
    for (const bad of [
      { ...good, source: "other" },
      { ...good, year: "2026" },
      { ...good, items: [{ date: "2026-13-45", names: [], isHoliday: true }] },
      { ...good, items: [{ date: "2026-12-25", names: [1], isHoliday: true }] },
      null,
    ])
      expect(() => parseHolidayYear(bad)).toThrow();
  });
});
