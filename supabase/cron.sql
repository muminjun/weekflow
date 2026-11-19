-- pg_net defaults to 5s, shorter than an Edge cold start plus dispatch.
-- Keep the private header inside Vault and allow the Free Edge wall-clock budget.
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;
select cron.schedule('weekflow-notifications', '*/5 * * * *', $job$
  select net.http_post(
    url := 'https://emhmmorcpamlenqxwmaw.supabase.co/functions/v1/dispatch-push',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets
        where name='weekflow_cron_secret' order by created_at desc limit 1)
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
$job$);
-- Daily retention: read in-app notifications after 90 days, mutation receipts and client error reports after 30 (015).
select cron.schedule('weekflow-retention', '17 3 * * *', $job$
  select public.purge_expired_records();
$job$);
