import { z } from "npm:zod@4.6.7";
import {
  admin,
  authenticate,
  response,
  validEndpoint,
} from "../_shared/http.ts";
import { sendPush } from "../_shared/push.ts";
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return response(req, {});
  if (req.method !== "POST")
    return response(req, { error: "METHOD_NOT_ALLOWED" }, 405);
  try {
    const user = await authenticate(req);
    const client = admin();
    const body = await req.json();
    if (body.action === "subscribe") {
      const s = z
        .object({
          endpoint: z.url().max(4096).refine(validEndpoint),
          keys: z.object({
            p256dh: z.string().regex(/^[\w-]{87,90}=?$/),
            auth: z.string().regex(/^[\w-]{20,26}={0,2}$/),
          }),
        })
        .parse(body.subscription);
      const { count, error: countError } = await client
        .from("push_subscriptions")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user.id);
      if (countError) throw countError;
      if ((count ?? 0) >= 10) {
        const { data: existing, error: existingError } = await client
          .from("push_subscriptions").select("id")
          .eq("user_id", user.id).eq("endpoint", s.endpoint).maybeSingle();
        if (existingError) throw existingError;
        if (!existing) return response(req, { error: "DEVICE_LIMIT" }, 429);
      }
      const { error } = await client.from("push_subscriptions").upsert(
        {
          user_id: user.id,
          endpoint: s.endpoint,
          p256dh: s.keys.p256dh,
          auth_secret: s.keys.auth,
          is_active: true,
        },
        { onConflict: "user_id,endpoint" },
      );
      if (error) throw error;
      return response(req, { ok: true });
    }
    if (body.action === "unsubscribe") {
      if (typeof body.endpoint === "string") {
        const { error } = await client
          .from("push_subscriptions")
          .delete()
          .eq("user_id", user.id)
          .eq("endpoint", body.endpoint);
        if (error) throw error;
      }
      return response(req, { ok: true });
    }
    if (body.action === "test") {
      let subscriptionQuery = client
        .from("push_subscriptions")
        .select("*")
        .eq("user_id", user.id)
        .eq("is_active", true);
      if (body.endpoint !== undefined) {
        if (typeof body.endpoint !== "string" || !validEndpoint(body.endpoint))
          return response(req, { error: "INVALID_ENDPOINT" }, 400);
        subscriptionQuery = subscriptionQuery.eq("endpoint", body.endpoint);
      }
      const { data: subscriptions, error } = await subscriptionQuery;
      if (error) throw error;
      if (!subscriptions?.length)
        return response(req, { error: "NO_SUBSCRIPTION" }, 400);
      const { data: recent } = await client
        .from("in_app_notifications")
        .select("id")
        .eq("user_id", user.id)
        .eq("kind", "push_test")
        .gte("created_at", new Date(Date.now() - 60000).toISOString());
      if (recent?.length) return response(req, { error: "RATE_LIMIT" }, 429);
      await client.from("in_app_notifications").insert({
        user_id: user.id,
        kind: "push_test",
        title: "Push 테스트를 요청했습니다",
        body: "기기 알림 수신을 직접 확인하세요.",
      });
      let sent = 0;
      for (const s of subscriptions) {
        try {
          await sendPush(s, {
            title: "WEEKFLOW 테스트 알림",
            tag: "weekflow-push-test",
            body: "이 알림이 보이면 실제 Push 수신이 확인된 것입니다.",
            url: "https://muminjun.github.io/weekflow/#/planner",
          });
          sent++;
        } catch (e) {
          const status = (e as { statusCode?: number }).statusCode;
          if (status === 404 || status === 410)
            await client.from("push_subscriptions").delete().eq("id", s.id);
        }
      }
      if (!sent) return response(req, { error: "PUSH_DELIVERY_FAILED" }, 502);
      return response(req, { accepted: sent });
    }
    return response(req, { error: "INVALID_ACTION" }, 400);
  } catch (e) {
    const auth = String(e).includes("UNAUTHENTICATED");
    return response(
      req,
      { error: auth ? "UNAUTHENTICATED" : "REQUEST_FAILED" },
      auth ? 401 : 400,
    );
  }
});
