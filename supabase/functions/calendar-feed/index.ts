// Public, token-authenticated ICS subscription feed (verify_jwt=false).
// GET /functions/v1/calendar-feed?token=<base64url token from rotate_calendar_feed()>
// Only the SHA-256 of the token reaches the database; the lookup RPC is service-only.
import { admin } from "../_shared/http.ts";
import { calendarFeed, type FeedEvent } from "./ics.ts";

const TOKEN = /^[A-Za-z0-9_-]{43,128}$/;
const plain = (status: number, body: string, extra: HeadersInit = {}) =>
  new Response(body, {
    status,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...extra,
    },
  });
async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}
type FeedResult =
  | { status: "not_found" }
  | { status: "rate_limited"; retry_after: number }
  | { status: "ok"; timezone: string | null; events: FeedEvent[] };

Deno.serve(async (req) => {
  if (req.method !== "GET" && req.method !== "HEAD")
    return plain(405, "Method Not Allowed", { Allow: "GET, HEAD" });
  const token = new URL(req.url).searchParams.get("token") ?? "";
  if (!TOKEN.test(token)) return plain(404, "Not Found");
  try {
    const { data, error } = await admin().rpc("calendar_feed_events", {
      p_token_hash: await sha256Hex(token),
    });
    if (error) throw error;
    const result = data as FeedResult;
    if (result.status === "not_found") return plain(404, "Not Found");
    if (result.status === "rate_limited")
      return plain(429, "Too Many Requests", {
        "Retry-After": String(result.retry_after ?? 60),
      });
    const body = calendarFeed(result.events, { timezone: result.timezone });
    return new Response(req.method === "HEAD" ? null : body, {
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": 'inline; filename="weekflow.ics"',
        "Cache-Control": "private, max-age=300",
        "X-Content-Type-Options": "nosniff",
        "Referrer-Policy": "no-referrer",
      },
    });
  } catch {
    // Never log the token or the hash; the caller only needs a retryable failure.
    console.error("calendar_feed_failed");
    return plain(500, "Feed Unavailable");
  }
});
