import { admin, authenticate, response } from "../_shared/http.ts";
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return response(req, {});
  if (req.method !== "POST")
    return response(req, { error: "METHOD_NOT_ALLOWED" }, 405);
  try {
    const u = await authenticate(req);
    const b = await req.json();
    if (b.confirm !== "DELETE")
      return response(req, { error: "CONFIRM_REQUIRED" }, 400);
    if (
      !u.last_sign_in_at ||
      Date.now() - Date.parse(u.last_sign_in_at) > 15 * 60000
    )
      return response(req, { error: "RECENT_LOGIN_REQUIRED" }, 403);
    const { error } = await admin().auth.admin.deleteUser(u.id);
    if (error) throw error;
    return response(req, { deleted: true });
  } catch (e) {
    return response(
      req,
      {
        error: String(e).includes("UNAUTHENTICATED")
          ? "UNAUTHENTICATED"
          : "DELETE_FAILED",
      },
      401,
    );
  }
});
