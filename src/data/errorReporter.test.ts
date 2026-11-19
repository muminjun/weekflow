import { describe, it, expect, vi } from "vitest";
import {
  DEDUPE_MS,
  OFFLINE_BUFFER,
  SESSION_CAP,
  createErrorReporter,
  scrub,
  type ReporterOptions,
} from "./errorReporter";

function setup(overrides: Partial<ReporterOptions> = {}) {
  let now = 0,
    online = true,
    enabled = true;
  const send = vi.fn(async () => undefined);
  const r = createErrorReporter({
    send,
    enabled: () => enabled,
    online: () => online,
    now: () => now,
    url: () => "https://app.example/weekflow/?code=secret#/week?user=a@b.co",
    userAgent: () => "UA",
    release: "abc123",
    ...overrides,
  });
  return {
    r,
    send,
    tick: (ms: number) => (now += ms),
    setOnline: (v: boolean) => (online = v),
    setEnabled: (v: boolean) => (enabled = v),
  };
}

describe("scrub", () => {
  it("strips query strings, emails, ids and tokens", () => {
    const out = scrub(
      "Failed for me@example.com at https://x.io/a?token=abc&b=1 row 0b7d6c1e-3a1f-4c55-9d1e-2f6a8b9c0d1e key eyJhbGciOi.eyJzdWIi.sig",
    );
    expect(out).not.toMatch(/me@example|token=abc|0b7d6c1e|eyJ/);
    expect(out).toContain("<email>");
    expect(out).toContain("<id>");
    expect(out).toContain("<token>");
    expect(out).toContain("https://x.io/a");
  });
});

describe("createErrorReporter", () => {
  it("sends a scrubbed report with the release", () => {
    const { r, send } = setup();
    r.report(new TypeError("bad user 0b7d6c1e-3a1f-4c55-9d1e-2f6a8b9c0d1e"));
    expect(send).toHaveBeenCalledTimes(1);
    const p = (send.mock.calls[0] as unknown[])[0] as Record<string, string>;
    expect(p.message).toBe("TypeError: bad user <id>");
    expect(p.url).toBe("https://app.example/weekflow/#/week");
    expect(p.release).toBe("abc123");
    expect(p.user_agent).toBe("UA");
  });
  it("dedupes the same message for ten minutes", () => {
    const { r, send, tick } = setup();
    r.report(Error("boom"));
    tick(DEDUPE_MS - 1);
    r.report(Error("boom"));
    expect(send).toHaveBeenCalledTimes(1);
    tick(1);
    r.report(Error("boom"));
    expect(send).toHaveBeenCalledTimes(2);
  });
  it("caps reports per session", () => {
    const { r, send } = setup();
    for (let i = 0; i < SESSION_CAP + 5; i++) r.report(Error(`e${i}`));
    expect(send).toHaveBeenCalledTimes(SESSION_CAP);
  });
  it("stays silent when signed out or in preview, and ignores noise", () => {
    const { r, send, setEnabled } = setup();
    setEnabled(false);
    r.report(Error("x"));
    setEnabled(true);
    r.report("Script error.");
    r.report("");
    expect(send).not.toHaveBeenCalled();
  });
  it("buffers up to five while offline and sends them on reconnect", () => {
    const { r, send, setOnline } = setup();
    setOnline(false);
    for (let i = 0; i < 8; i++) r.report(Error(`offline ${i}`));
    expect(send).not.toHaveBeenCalled();
    expect(r.pending()).toBe(OFFLINE_BUFFER);
    setOnline(true);
    r.flush();
    expect(send).toHaveBeenCalledTimes(OFFLINE_BUFFER);
    expect(r.pending()).toBe(0);
  });
  it("never throws, even when sending fails", async () => {
    const send = vi.fn(() => Promise.reject(Error("network")));
    const { r } = setup({ send });
    expect(() => r.report(Error("a"))).not.toThrow();
    const throwing = setup({
      send: () => {
        throw Error("sync");
      },
      url: () => {
        throw Error("no location");
      },
    });
    expect(() => throwing.r.report(Error("b"))).not.toThrow();
    await Promise.resolve();
  });
});
