import type { Dataset } from "../domain/types";

/**
 * Canonicalise one timestamp. The server serialises timestamptz as
 * "2026-11-16T15:00:00+00:00" while toUTC() produces "...15:00:00.000Z";
 * domain selectors compare timestamps as strings, so every `*_at` value must
 * use the same ISO form before it reaches them.
 */
function canonical(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? value : new Date(ms).toISOString();
}

function normalizeRow<T>(row: T): T {
  if (!row || typeof row !== "object" || Array.isArray(row)) return row;
  let out: Record<string, unknown> | null = null;
  for (const [key, value] of Object.entries(row)) {
    if (!key.endsWith("_at")) continue;
    const next = canonical(value);
    if (next !== value) {
      out ??= { ...(row as Record<string, unknown>) };
      out[key] = next;
    }
  }
  return (out ?? row) as T;
}

const OPTIONAL_TABLES = () => ({ block_sessions: [], week_templates: [] });

/** Normalise every `*_at` field of every row (and singleton row) of a dataset. */
export function normalizeDataset(data: Dataset): Dataset;
export function normalizeDataset(
  data: Dataset | undefined,
): Dataset | undefined;
export function normalizeDataset(data: Dataset | undefined) {
  if (!data) return data;
  // Tables added after the first release: a server without the migration (or
  // an older cache) omits them, and every reader expects an array.
  const out: Record<string, unknown> = { ...OPTIONAL_TABLES() };
  for (const [key, value] of Object.entries(data))
    if (value === undefined || value === null) {
      if (!(key in out)) out[key] = value;
    } else
      out[key] = Array.isArray(value)
        ? value.map((row) => normalizeRow(row))
        : normalizeRow(value);
  return out as unknown as Dataset;
}

/** Structural equality that ignores object key order. */
export function deepEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== "object" || typeof b !== "object" || !a || !b) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    const bb = b as unknown[];
    return a.length === bb.length && a.every((x, i) => deepEqual(x, bb[i]));
  }
  const ka = Object.keys(a),
    kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  const rb = b as Record<string, unknown>,
    ra = a as Record<string, unknown>;
  return ka.every(
    (k) =>
      Object.prototype.hasOwnProperty.call(rb, k) && deepEqual(ra[k], rb[k]),
  );
}

export type SyncState = "saving" | "saved" | "offline" | "error" | "preview";

/** True when an RPC error means the function is not deployed (PostgREST / Postgres). */
export const isMissingFunction = (e: unknown) =>
  /PGRST202|42883|Could not find the function|function .* does not exist/i.test(
    String(e instanceof Error ? e.message : e),
  );

export const isNetworkError = (e: unknown) =>
  /fetch|network|timeout|connection|AbortError|Load failed/i.test(String(e));

export const FOCUS_THROTTLE_MS = 60_000;
export const FALLBACK_RELOAD_MS = 5 * 60_000;

/**
 * Decides when a full dataset reload is worth its egress. Uses the optional
 * `dataset_version()` RPC as a cheap change token; when that RPC is not
 * deployed it falls back to a full reload at most every 5 minutes.
 */
export class ReloadPolicy {
  private supported: boolean | undefined;
  private token: string | undefined;
  private lastLoad = Number.NEGATIVE_INFINITY;
  private lastCheck = Number.NEGATIVE_INFINITY;
  constructor(
    private readonly fetchVersion: () => Promise<unknown>,
    private readonly now: () => number = () => Date.now(),
  ) {}

  /** undefined until the first probe; false once `dataset_version` is known to be missing. */
  isSupported() {
    return this.supported;
  }

  /** Probe the version token. Returns undefined when unavailable. */
  private async probe(): Promise<string | undefined> {
    if (this.supported === false) return undefined;
    try {
      const value = await this.fetchVersion();
      this.supported = true;
      return JSON.stringify(value ?? null);
    } catch (e) {
      if (isMissingFunction(e)) this.supported = false;
      return undefined;
    }
  }

  /** Call right before reading the dataset so the stored token never runs ahead of the data. */
  async beforeLoad() {
    const token = await this.probe();
    if (token !== undefined) this.token = token;
  }

  markLoaded() {
    this.lastLoad = this.lastCheck = this.now();
  }

  /**
   * periodic: every interval tick (cheap token check, or 5-minute fallback).
   * focus: focus / online / visible — throttled to >=60s since the last load or check.
   */
  async shouldReload(reason: "periodic" | "focus"): Promise<boolean> {
    const now = this.now();
    if (reason === "focus" && now - this.lastCheck < FOCUS_THROTTLE_MS)
      return false;
    if (this.supported !== false) {
      const token = await this.probe();
      this.lastCheck = this.now();
      if (token !== undefined) return token !== this.token;
      if (this.isSupported() !== false) return false; // transient error: try later
    }
    return reason === "focus"
      ? now - this.lastLoad >= FOCUS_THROTTLE_MS
      : now - this.lastLoad >= FALLBACK_RELOAD_MS;
  }
}
