import { admin, response } from "../_shared/http.ts";
import { sendPush } from "../_shared/push.ts";
import { prepareRecurrences } from "../_shared/recurrences.ts";
// Hash both sides so comparison length and timing never depend on the secret.
async function secretMatches(given: string | null, secret: string) {
  const enc = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(given ?? "")),
    crypto.subtle.digest("SHA-256", enc.encode(secret)),
  ]);
  const x = new Uint8Array(a),
    y = new Uint8Array(b);
  let diff = given === null ? 1 : 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}
// supabase-js reports failures as { error } instead of throwing; retry bookkeeping briefly.
async function must(write: () => PromiseLike<{ error: unknown }>, tries = 3) {
  let last: unknown;
  for (let i = 0; i < tries; i++) {
    const { error } = await write();
    if (!error) return;
    last = error;
  }
  throw last;
}
type Db = ReturnType<typeof admin>;
type Job = {
  id: string;
  user_id: string;
  kind: string;
  source_id: string | null;
  due_at: string;
  attempts: number;
  payload: Record<string, string | undefined>;
};
Deno.serve(async (req) => {
  if (req.method !== "POST")
    return response(req, { error: "METHOD_NOT_ALLOWED" }, 405);
  const secret = Deno.env.get("CRON_SECRET");
  if (
    !secret ||
    !(await secretMatches(req.headers.get("x-cron-secret"), secret))
  )
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
    let sent = 0,
      failed = 0;
    for (const job of (jobs ?? []) as Job[]) {
      try {
        if (await processJob(db, job)) sent++;
      } catch {
        // The job stays 'sending'; claim_notifications re-claims it after 10 minutes and
        // recorded deliveries keep devices that already received it from a duplicate.
        failed++;
      }
    }
    if (failed) console.error("dispatch_job_failed", { count: failed });
    return response(req, { processed: sent, failed });
  } catch {
    return response(req, { error: "DISPATCH_FAILED" }, 500);
  }
});
async function processJob(db: Db, job: Job) {
  const now = () => new Date().toISOString();
  const { data: prefs, error: prefsError } = await db
    .from("notification_preferences")
    .select("*")
    .eq("user_id", job.user_id)
    .maybeSingle();
  if (prefsError) throw prefsError;
  let valid = !!prefs?.enabled;
  if (job.kind === "review") valid = valid && !!prefs?.weekly_review;
  if (job.kind === "rollover") valid = valid && !!prefs?.rollover_prompt;
  if (job.kind === "block") {
    const { data: b, error: blockError } = await db
      .from("time_blocks")
      .select("*")
      .eq("id", job.source_id)
      .eq("user_id", job.user_id)
      .maybeSingle();
    if (blockError) throw blockError;
    valid =
      valid &&
      b?.state === "planned" &&
      Date.parse(b.start_at) > Date.now() &&
      Date.parse(b.start_at) === Date.parse(job.payload.start_at ?? "") &&
      Date.parse(job.due_at) ===
        Date.parse(b.start_at) - prefs.event_reminder_minutes * 60000;
  }
  if (job.kind === "due_today" || job.kind === "due_d1") {
    const { data: t, error: taskError } = await db
      .from("tasks")
      .select("*")
      .eq("id", job.source_id)
      .eq("user_id", job.user_id)
      .maybeSingle();
    if (taskError) throw taskError;
    valid =
      valid &&
      t?.state === "open" &&
      t?.due_on === job.payload.due_on &&
      !!prefs?.[job.kind];
  }
  if (!valid) {
    await must(() =>
      db
        .from("notification_jobs")
        .update({ state: "cancelled", updated_at: now() })
        .eq("id", job.id),
    );
    return false;
  }
  const hash =
    "#/planner" +
    (job.payload.week ? "?week=" + encodeURIComponent(job.payload.week) : "");
  const payload = {
    title: job.payload.title,
    body: job.payload.body,
    url: "https://muminjun.github.io/weekflow/" + hash,
  };
  await must(() =>
    db.from("in_app_notifications").upsert(
      {
        job_id: job.id,
        user_id: job.user_id,
        kind: job.kind,
        title: payload.title,
        body: payload.body,
        target_ref: hash,
      },
      { onConflict: "job_id", ignoreDuplicates: true },
    ),
  );
  const { data: subs, error: subsError } = await db
    .from("push_subscriptions")
    .select("*")
    .eq("user_id", job.user_id)
    .eq("is_active", true);
  if (subsError) throw subsError;
  let retry = false,
    unrecorded = 0;
  for (const s of subs ?? []) {
    const { data: previous, error: previousError } = await db
      .from("notification_deliveries")
      .select("state")
      .eq("job_id", job.id)
      .eq("subscription_id", s.id)
      .maybeSingle();
    // Unknown history: do not risk a duplicate now; try this device on the next run.
    if (previousError) {
      retry = true;
      continue;
    }
    if (
      previous?.state === "sent" ||
      previous?.state === "expired" ||
      previous?.state === "failed"
    )
      continue;
    let status = 201,
      delivered = false;
    try {
      await sendPush(s, payload);
      delivered = true;
    } catch (e) {
      status = (e as { statusCode?: number }).statusCode ?? 0;
    }
    try {
      if (delivered) {
        await must(() =>
          db.from("notification_deliveries").upsert({
            job_id: job.id,
            subscription_id: s.id,
            user_id: job.user_id,
            state: "sent",
            attempts: job.attempts,
            last_status: 201,
          }),
        );
        const { error: successError } = await db
          .from("push_subscriptions")
          .update({ last_success_at: now() })
          .eq("id", s.id);
        if (successError) console.warn("push_success_unrecorded");
      } else if (status === 404 || status === 410) {
        await must(() => db.from("push_subscriptions").delete().eq("id", s.id));
      } else {
        const transient = status === 0 || status === 429 || status >= 500;
        retry = retry || transient;
        await must(() =>
          db.from("notification_deliveries").upsert({
            job_id: job.id,
            subscription_id: s.id,
            user_id: job.user_id,
            state: transient ? "retry" : "failed",
            last_status: status,
            attempts: job.attempts,
          }),
        );
      }
    } catch {
      // The outcome is known but unrecorded. A delivered push never sets retry,
      // so the job below is finalized instead of being re-sent to this device.
      unrecorded++;
    }
  }
  if (unrecorded) console.error("delivery_unrecorded", { count: unrecorded });
  await must(() =>
    db
      .from("notification_jobs")
      .update({
        state: retry ? (job.attempts >= 5 ? "failed" : "retry") : "sent",
        delivered_at: retry ? null : now(),
        updated_at: now(),
        last_error: retry ? "TRANSIENT_DELIVERY_FAILURE" : null,
      })
      .eq("id", job.id),
  );
  return true;
}
