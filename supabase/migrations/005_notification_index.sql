drop index if exists public.notification_once;
create unique index notification_once on public.in_app_notifications(job_id);
-- Allow parent/child recurrence rules to restore in either order in one transaction.
alter table public.recurrence_rules alter constraint recurrence_rules_parent_rule_id_user_id_fkey deferrable initially deferred;
