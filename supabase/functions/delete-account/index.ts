import { admin, authenticate, response } from "../_shared/http.ts";
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return response(req, {});
  if (req.method !== "POST")
    return response(req, { error: "METHOD_NOT_ALLOWED" }, 405);
  let u;
  try {
    u = await authenticate(req);
  } catch {
    return response(req, { error: "UNAUTHENTICATED" }, 401);
  }
  let b: { confirm?: unknown };
  try {
    b = await req.json();
  } catch {
    return response(req, { error: "INVALID_REQUEST" }, 400);
  }
  if (b?.confirm !== "DELETE")
    return response(req, { error: "CONFIRM_REQUIRED" }, 400);
  if (
    !u.last_sign_in_at ||
    Date.now() - Date.parse(u.last_sign_in_at) > 15 * 60000
  )
    return response(req, { error: "RECENT_LOGIN_REQUIRED" }, 403);
  try {
    const { error } = await admin().auth.admin.deleteUser(u.id);
    if (error) throw error;
    return response(req, { deleted: true });
  } catch {
    // Details stay server-side; the client only needs a retryable failure.
    console.error("delete_account_failed");
    return response(req, { error: "DELETE_FAILED" }, 500);
  }
});
