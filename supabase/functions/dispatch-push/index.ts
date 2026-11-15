import { admin, response } from "../_shared/http.ts";
import { sendPush } from "../_shared/push.ts";
import { prepareRecurrences } from "../_shared/recurrences.ts";
Deno.serve(async (req) => {
  if (req.method !== "POST")
    return response(req, { error: "METHOD_NOT_ALLOWED" }, 405);
  const secret = Deno.env.get("CRON_SECRET");
  if (!secret || req.headers.get("x-cron-secret") !== secret)
    return response(req, { error: "FORBIDDEN" }, 403);
  const db = admin();
  try {
    await prepareRecurrences();
    const scheduled = await db.rpc("schedule_notifications");
    if (scheduled.error) throw scheduled.error;
    const { data: jobs, error } = await db.rpc("claim_notifications", {
      p_limit: 30,
    });
    if (error) throw error;
    let sent = 0;
    for (const job of jobs ?? []) {
      const { data: prefs } = await db
        .from("notification_preferences")
        .select("*")
        .eq("user_id", job.user_id)
        .single();
      let valid = !!prefs?.enabled;
      if (job.kind === "review") valid = valid && !!prefs?.weekly_review;
      if (job.kind === "rollover") valid = valid && !!prefs?.rollover_prompt;
      if (job.kind === "block") {
        const { data: b } = await db
          .from("time_blocks")
          .select("*")
          .eq("id", job.source_id)
          .eq("user_id", job.user_id)
          .single();
        valid =
          valid &&
          b?.state === "planned" &&
          Date.parse(b.start_at) > Date.now() &&
          Date.parse(b.start_at) === Date.parse(job.payload.start_at) &&
          Date.parse(job.due_at) ===
            Date.parse(b.start_at) - prefs.event_reminder_minutes * 60000;
      }
      if (job.kind === "due_today" || job.kind === "due_d1") {
        const { data: t } = await db
          .from("tasks")
          .select("*")
          .eq("id", job.source_id)
          .eq("user_id", job.user_id)
          .single();
        valid =
          valid &&
          t?.state === "open" &&
          t?.due_on === job.payload.due_on &&
          !!prefs?.[job.kind];
      }
      if (!valid) {
        await db
          .from("notification_jobs")
          .update({ state: "cancelled", updated_at: new Date().toISOString() })
          .eq("id", job.id);
        continue;
      }
      const hash =
        "#/planner" +
        (job.payload.week
          ? "?week=" + encodeURIComponent(job.payload.week)
          : "");
      const payload = {
        title: job.payload.title,
        body: job.payload.body,
        url: "https://muminjun.github.io/weekflow/" + hash,
      };
      await db.from("in_app_notifications").upsert(
        {
          job_id: job.id,
          user_id: job.user_id,
          kind: job.kind,
          title: payload.title,
          body: payload.body,
          target_ref: hash,
        },
        { onConflict: "job_id", ignoreDuplicates: true },
      );
      const { data: subs } = await db
        .from("push_subscriptions")
        .select("*")
        .eq("user_id", job.user_id)
        .eq("is_active", true);
      let retry = false;
      for (const s of subs ?? []) {
        const { data: previous } = await db
          .from("notification_deliveries")
          .select("state")
          .eq("job_id", job.id)
          .eq("subscription_id", s.id)
          .maybeSingle();
        if (
          previous?.state === "sent" ||
          previous?.state === "expired" ||
          previous?.state === "failed"
        )
          continue;
        try {
          await sendPush(s, payload);
          await db.from("notification_deliveries").upsert({
            job_id: job.id,
            subscription_id: s.id,
            user_id: job.user_id,
            state: "sent",
            attempts: job.attempts,
            last_status: 201,
          });
          await db
            .from("push_subscriptions")
            .update({ last_success_at: new Date().toISOString() })
            .eq("id", s.id);
        } catch (e) {
          const status = (e as { statusCode?: number }).statusCode ?? 0;
          if (status === 404 || status === 410) {
            await db.from("push_subscriptions").delete().eq("id", s.id);
          } else {
            const transient = status === 0 || status === 429 || status >= 500;
            retry = retry || transient;
            await db.from("notification_deliveries").upsert({
              job_id: job.id,
              subscription_id: s.id,
              user_id: job.user_id,
              state: transient ? "retry" : "failed",
              last_status: status,
              attempts: job.attempts,
            });
          }
        }
      }
      await db
        .from("notification_jobs")
        .update({
          state: retry ? (job.attempts >= 5 ? "failed" : "retry") : "sent",
          delivered_at: retry ? null : new Date().toISOString(),
          updated_at: new Date().toISOString(),
          last_error: retry ? "TRANSIENT_DELIVERY_FAILURE" : null,
        })
        .eq("id", job.id);
      sent++;
    }
    return response(req, { processed: sent });
  } catch {
    return response(req, { error: "DISPATCH_FAILED" }, 500);
  }
});
