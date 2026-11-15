import { createClient } from "npm:@supabase/supabase-js@2.119.0";
export const admin = () =>
  createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
const origins = new Set([
  "https://muminjun.github.io",
  "http://127.0.0.1:5173",
  "http://localhost:5173",
]);
export function headers(req: Request) {
  const origin = req.headers.get("Origin");
  return {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin":
      origin && origins.has(origin) ? origin : "https://muminjun.github.io",
    Vary: "Origin",
    "Access-Control-Allow-Headers":
      "authorization,apikey,content-type,x-client-info",
    "Access-Control-Allow-Methods": "POST,OPTIONS",
  };
}
export const response = (req: Request, body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: headers(req) });
export async function authenticate(req: Request) {
  const token = req.headers.get("Authorization")?.replace(/^Bearer /i, "");
  if (!token) throw Error("UNAUTHENTICATED");
  const { data, error } = await admin().auth.getUser(token);
  if (error || !data.user) throw Error("UNAUTHENTICATED");
  return data.user;
}
export function validEndpoint(endpoint: string) {
  try {
    const u = new URL(endpoint);
    return (
      u.protocol === "https:" &&
      (!u.port || u.port === "443") &&
      !u.username &&
      !u.password &&
      (u.hostname === "fcm.googleapis.com" ||
        u.hostname === "updates.push.services.mozilla.com" ||
        u.hostname.endsWith(".push.apple.com") ||
        u.hostname.endsWith(".notify.windows.com"))
    );
  } catch {
    return false;
  }
}
