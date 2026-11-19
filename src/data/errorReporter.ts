/**
 * Best-effort client error reporting to `report_client_error`. Never throws,
 * never reports for signed-out or demo-preview sessions, and strips anything
 * that could identify the person (query strings, emails, ids, tokens).
 */
import { rpc } from "./supabase";

export interface ClientErrorReport {
  message: string;
  stack: string;
  url: string;
  user_agent: string;
  release: string;
}
export interface ReporterOptions {
  send: (p: ClientErrorReport) => Promise<unknown>;
  enabled: () => boolean;
  online: () => boolean;
  now: () => number;
  url: () => string;
  userAgent: () => string;
  release: string;
}

export const DEDUPE_MS = 10 * 60 * 1000;
export const SESSION_CAP = 10;
export const OFFLINE_BUFFER = 5;
const LIMITS = { message: 500, stack: 4000, url: 500, user_agent: 300 };

/** Remove query strings and email / UUID / token-like values. */
export function scrub(text: string): string {
  return (
    text
      // query strings in any URL-ish text, up to the fragment or whitespace
      .replace(/\?[^\s#"'`)]*/g, "")
      .replace(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, "<email>")
      .replace(
        /\b[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}\b/gi,
        "<id>",
      )
      // JWTs and other long opaque tokens
      .replace(/\beyJ[\w-]+\.[\w-]+(?:\.[\w-]+)?/g, "<token>")
      .replace(/\b[0-9a-f]{24,}\b/gi, "<token>")
      .replace(/\b[A-Za-z0-9_-]{40,}\b/g, "<token>")
  );
}

/** Messages that carry no information or come from the environment. */
const NOISE =
  /^(Script error\.?|ResizeObserver loop (limit exceeded|completed with undelivered notifications)\.?)$/i;

function describe(error: unknown): { message: string; stack: string } {
  if (error instanceof Error)
    return {
      message: `${error.name && error.name !== "Error" ? `${error.name}: ` : ""}${error.message}`,
      stack: error.stack ?? "",
    };
  if (typeof error === "string") return { message: error, stack: "" };
  try {
    return { message: JSON.stringify(error) ?? String(error), stack: "" };
  } catch {
    return { message: String(error), stack: "" };
  }
}

export function createErrorReporter(o: ReporterOptions) {
  const seen = new Map<string, number>();
  const buffer: ClientErrorReport[] = [];
  let count = 0;

  const deliver = (p: ClientErrorReport) => {
    try {
      void o.send(p).catch(() => {
        /* reporting is best-effort; a failure must not create another error */
      });
    } catch {
      /* ignore */
    }
  };

  function report(error: unknown, extraStack = "") {
    try {
      if (!o.enabled() || count >= SESSION_CAP) return;
      const d = describe(error);
      const message = scrub(d.message.trim()).slice(0, LIMITS.message);
      if (!message || NOISE.test(message)) return;
      const now = o.now();
      const last = seen.get(message);
      if (last !== undefined && now - last < DEDUPE_MS) return;
      seen.set(message, now);
      count++;
      const p: ClientErrorReport = {
        message,
        stack: scrub([d.stack, extraStack].filter(Boolean).join("\n")).slice(
          0,
          LIMITS.stack,
        ),
        url: scrub(o.url()).slice(0, LIMITS.url),
        user_agent: o.userAgent().slice(0, LIMITS.user_agent),
        release: o.release.slice(0, 40),
      };
      if (o.online()) deliver(p);
      else if (buffer.length < OFFLINE_BUFFER) buffer.push(p);
    } catch {
      /* never throw from the reporter */
    }
  }

  /** Sends what was held back while offline. */
  function flush() {
    try {
      if (!o.online() || !o.enabled()) return;
      for (const p of buffer.splice(0)) deliver(p);
    } catch {
      /* ignore */
    }
  }

  return { report, flush, pending: () => buffer.length };
}

let enabled = false;
/** Called by the app when the session changes; demo preview stays off. */
export function setErrorReportingEnabled(value: boolean) {
  enabled = value;
  if (value) reporter.flush();
}

const reporter = createErrorReporter({
  send: (p) => rpc("report_client_error", { p }),
  enabled: () => enabled,
  online: () => typeof navigator === "undefined" || navigator.onLine !== false,
  now: () => Date.now(),
  url: () => (typeof location === "undefined" ? "" : location.href),
  userAgent: () =>
    typeof navigator === "undefined" ? "" : navigator.userAgent,
  release: String(import.meta.env.VITE_RELEASE ?? "dev"),
});

export const reportError = (error: unknown, extraStack?: string) =>
  reporter.report(error, extraStack);

/** Listens for uncaught errors and rejections; returns an uninstaller. */
export function installErrorReporter() {
  const onError = (e: ErrorEvent) => {
    if (e.error || e.message) reporter.report(e.error ?? e.message);
  };
  const onRejection = (e: PromiseRejectionEvent) => reporter.report(e.reason);
  const onOnline = () => reporter.flush();
  window.addEventListener("error", onError);
  window.addEventListener("unhandledrejection", onRejection);
  window.addEventListener("online", onOnline);
  return () => {
    window.removeEventListener("error", onError);
    window.removeEventListener("unhandledrejection", onRejection);
    window.removeEventListener("online", onOnline);
  };
}
