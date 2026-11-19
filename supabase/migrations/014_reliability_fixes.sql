-- 014: reliability fixes for reminders, block edits, time zones, push, import, retention and sync.
--
-- dataset_version() contract (client change detection)
--   select public.dataset_version();  -- authenticated only, returns bigint
--   * Returns a per-user counter that strictly increases after any committed
--     INSERT/UPDATE/DELETE on a table returned by read_dataset() (profile,
--     notification_preferences, categories, tasks, week_tasks,
--     week_task_day_marks, goals, goal_week_tasks, time_blocks,
--     availability_rules, availability_overrides, recurrence_rules,
--     recurrence_occurrences, week_reviews, in_app_notifications), including
--     server-side writes (Cron materialization, dispatched notifications,
--     retention purges) and deletes.
--   * The value is opaque: compare for equality only. If it equals the value
--     seen with the last full read_dataset(), the dataset is unchanged and the
--     reload can be skipped; any other value (including a lower one, e.g. after
--     account re-creation) means "reload". 0 means no write has been recorded yet.
--   * Read it BEFORE read_dataset() and store that value, so a write that lands
--     between the two calls is detected on the next poll.
--   * Raises UNAUTHENTICATED without a JWT subject.

-- 1. Cancelled reminder jobs re-arm when the same idempotency key becomes valid again.
create or replace function public.schedule_notifications() returns void language plpgsql security definer set search_path='' as $$begin
-- Source changes invalidate old pending work; preferences are checked again at dispatch.
update public.notification_jobs j set state='cancelled' where state in ('pending','retry') and (not exists(select 1 from public.notification_preferences p where p.user_id=j.user_id and p.enabled) or (kind='review' and not exists(select 1 from public.notification_preferences p where p.user_id=j.user_id and p.weekly_review)) or (kind='rollover' and not exists(select 1 from public.notification_preferences p where p.user_id=j.user_id and p.rollover_prompt)) or (kind='block' and not exists(select 1 from public.time_blocks b where b.id=j.source_id and b.user_id=j.user_id and b.state='planned' and b.start_at::text=j.payload->>'start_at' and j.due_at=b.start_at-make_interval(mins=>(select event_reminder_minutes from public.notification_preferences where user_id=j.user_id)))) or (kind in ('due_today','due_d1') and not exists(select 1 from public.tasks t where t.id=j.source_id and t.user_id=j.user_id and t.state='open' and t.due_on::text=j.payload->>'due_on' and (j.payload->>'timezone')=(select timezone from public.profiles where id=j.user_id))));
insert into public.notification_jobs(user_id,kind,source_id,due_at,idempotency_key,payload)
select b.user_id,'block',b.id,b.start_at-make_interval(mins=>p.event_reminder_minutes),'block:'||b.id||':'||b.start_at::text||':'||p.event_reminder_minutes::text,jsonb_build_object('start_at',b.start_at::text,'title','일정이 곧 시작돼요','body',p.event_reminder_minutes||'분 후 예정된 일정이 있어요.','week',((b.start_at at time zone pr.timezone)::date-(extract(isodow from b.start_at at time zone pr.timezone)::int-1))::text)
from public.time_blocks b join public.notification_preferences p on b.user_id=p.user_id join public.profiles pr on pr.id=b.user_id where p.enabled and b.state='planned' and b.start_at>now() and b.start_at<now()+interval '8 days'
on conflict(user_id,idempotency_key) do update set state='pending',attempts=0,due_at=excluded.due_at,payload=excluded.payload,last_error=null,delivered_at=null,updated_at=now()
where public.notification_jobs.state='cancelled' and excluded.due_at>=now()-interval '1 day';
insert into public.notification_jobs(user_id,kind,source_id,due_at,idempotency_key,payload)
select t.user_id,k.kind,t.id,((t.due_on-k.offset_days)::timestamp+interval '9 hours') at time zone pr.timezone,k.kind||':'||t.id||':'||t.due_on::text||':'||pr.timezone,jsonb_build_object('due_on',t.due_on::text,'timezone',pr.timezone,'title',case when k.kind='due_today' then '오늘 마감인 할 일이 있어요' else '내일 마감인 할 일이 있어요' end,'body','플래너에서 마감과 계획을 확인하세요.')
from public.tasks t join public.notification_preferences p on p.user_id=t.user_id join public.profiles pr on pr.id=t.user_id cross join (values('due_today',0),('due_d1',1)) k(kind,offset_days) where p.enabled and t.state='open' and t.due_on between (now() at time zone pr.timezone)::date and (now() at time zone pr.timezone)::date+8 and ((k.kind='due_today' and p.due_today) or(k.kind='due_d1' and p.due_d1))
on conflict(user_id,idempotency_key) do update set state='pending',attempts=0,due_at=excluded.due_at,payload=excluded.payload,last_error=null,delivered_at=null,updated_at=now()
where public.notification_jobs.state='cancelled' and excluded.due_at>=now()-interval '1 day';
insert into public.notification_jobs(user_id,kind,due_at,idempotency_key,payload)
select pr.id,k.kind,((date_trunc('week',now() at time zone pr.timezone)::date+k.days)::timestamp+make_interval(hours=>k.hour)) at time zone pr.timezone,k.kind||':'||date_trunc('week',now() at time zone pr.timezone)::date::text||':'||pr.timezone,jsonb_build_object('title',k.title,'body','WEEKFLOW에서 이번 주 흐름을 확인하세요.')
from public.profiles pr join public.notification_preferences p on p.user_id=pr.id cross join (values('review',6,18,'한 주를 돌아볼 시간이에요'),('rollover',0,9,'지난주에 남긴 할 일을 확인하세요')) k(kind,days,hour,title) where p.enabled and ((k.kind='review' and p.weekly_review) or(k.kind='rollover' and p.rollover_prompt))
on conflict(user_id,idempotency_key) do update set state='pending',attempts=0,due_at=excluded.due_at,payload=excluded.payload,last_error=null,delivered_at=null,updated_at=now()
where public.notification_jobs.state='cancelled' and excluded.due_at>=now()-interval '1 day';
end$$;

-- 2. Overlap warnings only when a block is placed or moved into a non-skipped state.
--    Status/title-only edits keep their existing placement and are never TIME_CONFLICT.
create or replace function public.apply_changes(p_mutation_id uuid,p_changes jsonb,p_acknowledge boolean default false) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid();op jsonb;r jsonb;tbl text;act text;rid uuid;existing jsonb;cols text;vals text;sets text;res jsonb;ver int;k text;begin
if u is null then raise exception 'UNAUTHENTICATED';end if;
if jsonb_typeof(p_changes)<>'array' or jsonb_array_length(p_changes)>1000 then raise exception 'VALIDATION_ERROR';end if;
perform pg_advisory_xact_lock(hashtextextended(u::text,0));
select result into res from public.client_mutations where user_id=u and mutation_id=p_mutation_id;if found then return res;end if;
for op in select value from jsonb_array_elements(p_changes) loop
 tbl:=op->>'table';act:=op->>'action';r:=op->'row';
 if tbl not in ('profiles','categories','tasks','week_tasks','week_task_day_marks','goals','goal_week_tasks','time_blocks','availability_rules','availability_overrides','recurrence_rules','recurrence_occurrences','week_reviews','notification_preferences','in_app_notifications') then raise exception 'FORBIDDEN_TABLE';end if;
 r:=r-'created_at'-'updated_at'-'version';
 if tbl='profiles' then r:=r||jsonb_build_object('id',u);elsif tbl='notification_preferences' then r:=r||jsonb_build_object('user_id',u);else r:=r||jsonb_build_object('user_id',u);end if;
 if tbl='goal_week_tasks' then
 if not exists(select 1 from public.goals where id=(r->>'goal_id')::uuid and user_id=u) or not exists(select 1 from public.week_tasks where id=(r->>'week_task_id')::uuid and user_id=u) then raise exception 'FORBIDDEN';end if;
 if act='delete' then delete from public.goal_week_tasks where user_id=u and goal_id=(r->>'goal_id')::uuid and week_task_id=(r->>'week_task_id')::uuid;
 else insert into public.goal_week_tasks(user_id,goal_id,week_task_id) values(u,(r->>'goal_id')::uuid,(r->>'week_task_id')::uuid) on conflict do nothing;end if;continue;end if;
 k:=case when tbl='notification_preferences' then 'user_id' else 'id' end;
 rid:=case when tbl in ('profiles','notification_preferences') then u else (r->>'id')::uuid end;
 if rid is null then raise exception 'ID_REQUIRED';end if;
 execute format('select to_jsonb(x) from public.%I x where %I=$1 for update',tbl,k) into existing using rid;
 if existing is not null and coalesce(existing->>'user_id',existing->>'id')<>u::text then raise exception 'FORBIDDEN';end if;
 if act in ('update','delete') and existing is null then raise exception 'NOT_FOUND';end if;
 if existing is not null and tbl<>'in_app_notifications' then
 ver:=(op->>'expected_version')::int;
 if ver is null or ver<>(existing->>'version')::int then raise exception 'VERSION_CONFLICT';end if;end if;
 if act='delete' then
 if tbl in ('profiles','notification_preferences') then raise exception 'FORBIDDEN_DELETE';end if;
 -- Preserve cancellation tombstones for repeat occurrences.
 if tbl in ('tasks','time_blocks') then
 update public.recurrence_occurrences set state='cancelled',task_id=null,time_block_id=null where user_id=u and ((tbl='tasks' and task_id=rid) or (tbl='time_blocks' and time_block_id=rid));end if;
 execute format('delete from public.%I where %I=$1',tbl,k) using rid;continue;end if;
 if tbl='time_blocks' then
 r:=coalesce(existing,'{}'::jsonb)||r;
 -- Check placement on insert, on a time move, or when a skipped block becomes active again.
 if not p_acknowledge and coalesce(r->>'state','planned')<>'skipped'
 and (existing is null
  or (r->>'start_at')::timestamptz is distinct from (existing->>'start_at')::timestamptz
  or (r->>'end_at')::timestamptz is distinct from (existing->>'end_at')::timestamptz
  or existing->>'state'='skipped')
 and exists(select 1 from public.time_blocks where user_id=u and id<>rid and state<>'skipped' and start_at<(r->>'end_at')::timestamptz and end_at>(r->>'start_at')::timestamptz) then raise exception 'TIME_CONFLICT';end if;end if;
 -- Only declared table columns may be mutated; defaults remain database defaults on insert.
 if exists(select 1 from jsonb_object_keys(r) x where not exists(select 1 from information_schema.columns where table_schema='public' and table_name=tbl and column_name=x)) then raise exception 'UNKNOWN_FIELD';end if;
 select string_agg(format('%I',key),','),string_agg(format('(jsonb_populate_record(null::public.%I,$1)).%I',tbl,key),','),string_agg(format('%I=(jsonb_populate_record(null::public.%I,$1)).%I',key,tbl,key),',') into cols,vals,sets from jsonb_object_keys(r) as x(key);
 if existing is null then execute format('insert into public.%I(%s) select %s',tbl,cols,vals) using r;
 elsif act in ('update','upsert') then execute format('update public.%I set %s where %I=$2',tbl,sets,k) using r,rid;
 else raise exception 'DUPLICATE_ID';end if;
end loop;
res:=jsonb_build_object('ok',true);insert into public.client_mutations(user_id,mutation_id,operation,result) values(u,p_mutation_id,'batch',res);return res;end$$;

-- 3. Accept only zones that browsers' Intl also accepts.
create or replace function public.validate_timezone() returns trigger language plpgsql set search_path='' as $$begin
if new.timezone is null
 or new.timezone ~* '^(posix|right)/'
 or new.timezone in ('Factory','posixrules','localtime')
 or not exists(select 1 from pg_timezone_names where name=new.timezone) then raise exception 'INVALID_TIMEZONE';end if;return new;end$$;
revoke execute on function public.validate_timezone() from public,anon,authenticated;

-- 4. Cron pages through every user with an active rule (PostgREST caps responses at max_rows).
create function public.recurrence_users(p_after uuid default null,p_limit int default 500) returns table(id uuid,timezone text) language sql stable security definer set search_path='' as $$
select p.id,p.timezone from public.profiles p
where (p_after is null or p.id>p_after)
and exists(select 1 from public.recurrence_rules r where r.user_id=p.id and r.is_active)
order by p.id limit least(greatest(coalesce(p_limit,500),1),1000)$$;
revoke execute on function public.recurrence_users(uuid,int) from public,anon,authenticated;
grant execute on function public.recurrence_users(uuid,int) to service_role;

-- 6a. Atomic test-push rate limit: one request per user per minute, serialized by the user lock.
create function public.request_push_test(p_user uuid) returns boolean language plpgsql security definer set search_path='' as $$begin
perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
if exists(select 1 from public.in_app_notifications where user_id=p_user and kind='push_test' and created_at>=now()-interval '1 minute') then return false;end if;
insert into public.in_app_notifications(user_id,kind,title,body) values(p_user,'push_test','Push 테스트를 요청했습니다','기기 알림 수신을 직접 확인하세요.');
return true;end$$;
revoke execute on function public.request_push_test(uuid) from public,anon,authenticated;
grant execute on function public.request_push_test(uuid) to service_role;

-- 6b. A push endpoint belongs to the account that registered it most recently.
create index if not exists push_subscriptions_endpoint on public.push_subscriptions(endpoint);
create function public.claim_push_endpoint() returns trigger language plpgsql security definer set search_path='' as $$begin
delete from public.push_subscriptions where endpoint=new.endpoint and user_id<>new.user_id;
return null;end$$;
create trigger claim_endpoint after insert or update of endpoint,user_id,is_active on public.push_subscriptions
for each row when (new.is_active) execute function public.claim_push_endpoint();
revoke execute on function public.claim_push_endpoint() from public,anon,authenticated;

-- 7a. Block dates follow the profile zone whenever it changes.
create function public.recompute_block_dates() returns trigger language plpgsql security definer set search_path='' as $$begin
-- validate_relations recomputes local_date from the new zone and re-checks the task week.
update public.time_blocks set local_date=(start_at at time zone new.timezone)::date
where user_id=new.id and local_date<>(start_at at time zone new.timezone)::date;
return null;end$$;
create trigger recompute_block_dates after update of timezone on public.profiles
for each row when (old.timezone is distinct from new.timezone) execute function public.recompute_block_dates();
revoke execute on function public.recompute_block_dates() from public,anon,authenticated;

-- 7b. Restore the profile (zone) before time blocks so date/week checks use the restored zone.
create or replace function public.import_backup(p_backup jsonb,p_mode text,p_confirm text) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid();tbl text;r jsonb;rows jsonb;ops jsonb:='[]';oldid uuid;newid uuid;fk text;uid uuid;rowid uuid;existing jsonb;countrows int:=0;owned boolean;begin
if u is null then raise exception 'UNAUTHENTICATED';end if;
if p_mode not in ('merge','replace') or p_confirm<>(case when p_mode='replace' then 'REPLACE' else 'MERGE' end) then raise exception 'CONFIRM_REQUIRED';end if;
if (p_backup->>'schemaVersion')::int<>1 or p_backup->>'app'<>'WEEKFLOW' or octet_length(p_backup::text)>10485760 or jsonb_typeof(p_backup->'data')<>'object' then raise exception 'IMPORT_INVALID';end if;
perform pg_advisory_xact_lock(hashtextextended(u::text,0));
create temporary table if not exists wf_import_ids(old_id uuid primary key,new_id uuid not null) on commit drop;
truncate pg_temp.wf_import_ids;
foreach tbl in array array['categories','tasks','week_tasks','goals','time_blocks','week_task_day_marks','availability_rules','availability_overrides','recurrence_rules','recurrence_occurrences','week_reviews'] loop
 rows:=p_backup->'data'->tbl;
 if rows is null or jsonb_typeof(rows)<>'array' then raise exception 'IMPORT_INVALID_TABLE %',tbl;end if;
 countrows:=countrows+jsonb_array_length(rows);if countrows>10000 then raise exception 'IMPORT_TOO_MANY_ROWS';end if;
 for r in select value from jsonb_array_elements(rows) loop
 oldid:=(r->>'id')::uuid;if oldid is null then raise exception 'IMPORT_ID_REQUIRED';end if;
 execute format('select user_id=$2 from public.%I where id=$1',tbl) into owned using oldid,u;
 newid:=case when coalesce(owned,false) then oldid else (substr(md5(u::text||oldid::text),1,12)||'5'||substr(md5(u::text||oldid::text),14,3)||'8'||substr(md5(u::text||oldid::text),18))::uuid end;
 if tbl='categories' and not coalesce(owned,false) then select id into rowid from public.categories where user_id=u and lower(name)=lower(r->>'name') and archived_at is null;newid:=coalesce(rowid,newid);end if;
 if tbl='availability_rules' then select id into rowid from public.availability_rules where user_id=u and weekday=(r->>'weekday')::int and start_minute=(r->>'start_minute')::int and end_minute=(r->>'end_minute')::int;newid:=coalesce(rowid,newid);
 elsif tbl='availability_overrides' then select id into rowid from public.availability_overrides where user_id=u and local_date=(r->>'local_date')::date;newid:=coalesce(rowid,newid);
 elsif tbl='week_reviews' then select id into rowid from public.week_reviews where user_id=u and week_start=(r->>'week_start')::date;newid:=coalesce(rowid,newid);
 elsif tbl='week_tasks' then select id into rowid from public.week_tasks where user_id=u and task_id=(select new_id from pg_temp.wf_import_ids where old_id=(r->>'task_id')::uuid) and week_start=(r->>'week_start')::date;newid:=coalesce(rowid,newid);
 elsif tbl='week_task_day_marks' then select id into rowid from public.week_task_day_marks where user_id=u and week_task_id=(select new_id from pg_temp.wf_import_ids where old_id=(r->>'week_task_id')::uuid) and local_date=(r->>'local_date')::date;newid:=coalesce(rowid,newid);
 elsif tbl='recurrence_occurrences' then select id into rowid from public.recurrence_occurrences where user_id=u and rule_id=(select new_id from pg_temp.wf_import_ids where old_id=(r->>'rule_id')::uuid) and local_date=(r->>'local_date')::date;newid:=coalesce(rowid,newid);end if;
 insert into pg_temp.wf_import_ids values(oldid,newid) on conflict(old_id) do nothing;
 end loop;end loop;
if p_mode='replace' then
 delete from public.notification_jobs where user_id=u;
 delete from public.in_app_notifications where user_id=u;
 delete from public.recurrence_occurrences where user_id=u;
 update public.recurrence_rules set parent_rule_id=null where user_id=u;
 delete from public.recurrence_rules where user_id=u;
 delete from public.goals where user_id=u;
 delete from public.time_blocks where user_id=u;
 delete from public.tasks where user_id=u;
 delete from public.availability_rules where user_id=u;
 delete from public.availability_overrides where user_id=u;
 delete from public.week_reviews where user_id=u;
 delete from public.categories where user_id=u;
end if;
-- Restore portable settings without restoring account identifiers. The zone must precede time_blocks.
r:=p_backup->'data'->'profile';select to_jsonb(p) into existing from public.profiles p where id=u;
perform public.apply_changes(gen_random_uuid(),jsonb_build_array(jsonb_build_object('table','profiles','action','update','expected_version',existing->'version','row',jsonb_build_object('id',u,'timezone',r->'timezone','pixels_per_hour',r->'pixels_per_hour','display_start_minute',r->'display_start_minute','display_end_minute',r->'display_end_minute','onboarding_completed',r->'onboarding_completed'))),true);
-- Remap all identifiers to the authenticated account. FK/trigger checks run inside this transaction.
foreach tbl in array array['categories','tasks','week_tasks','goals','goal_week_tasks','time_blocks','week_task_day_marks','availability_rules','availability_overrides','recurrence_rules','recurrence_occurrences','week_reviews'] loop
 for r in select value from jsonb_array_elements(coalesce(p_backup->'data'->tbl,'[]')) loop
 r:=r-'created_at'-'updated_at'-'version';
 foreach fk in array array['id','task_id','week_task_id','goal_id','category_id','rule_id','parent_rule_id','time_block_id'] loop
 if r->>fk is not null then select new_id into newid from pg_temp.wf_import_ids where old_id=(r->>fk)::uuid;if newid is null then raise exception 'IMPORT_INVALID_FK %',fk;end if;r:=jsonb_set(r,array[fk],to_jsonb(newid));end if;
 end loop;
 if tbl='recurrence_rules' and r->'template'->>'category_id' is not null then select new_id into newid from pg_temp.wf_import_ids where old_id=(r->'template'->>'category_id')::uuid;if newid is null then raise exception 'IMPORT_INVALID_TEMPLATE_FK';end if;r:=jsonb_set(r,'{template,category_id}',to_jsonb(newid));end if;
 r:=r||jsonb_build_object('user_id',u);existing:=null;
 if tbl<>'goal_week_tasks' then execute format('select to_jsonb(x) from public.%I x where id=$1 and user_id=$2',tbl) into existing using (r->>'id')::uuid,u;end if;
 ops:=ops||jsonb_build_array(jsonb_build_object('table',tbl,'action',case when existing is null then 'insert' else 'update' end,'row',r,'expected_version',existing->'version'));
 if jsonb_array_length(ops)>=500 then perform public.apply_changes(gen_random_uuid(),ops,true);ops:='[]';end if;
 end loop;
end loop;
perform public.apply_changes(gen_random_uuid(),ops,true);
r:=p_backup->'data'->'notification_preferences';select to_jsonb(p) into existing from public.notification_preferences p where user_id=u;
r:=r-'id'-'created_at'-'updated_at'-'version'||jsonb_build_object('user_id',u);
perform public.apply_changes(gen_random_uuid(),jsonb_build_array(jsonb_build_object('table','notification_preferences','action','update','expected_version',existing->'version','row',r)),true);
return jsonb_build_object('restored',countrows,'mode',p_mode);end$$;

-- 9. Retention for Cron (see supabase/cron.sql): read notifications after 90 days, replay receipts after 30.
create function public.purge_expired_records() returns jsonb language plpgsql security definer set search_path='' as $$
declare n_notifications int;n_mutations int;begin
delete from public.in_app_notifications where read_at is not null and created_at<now()-interval '90 days';
get diagnostics n_notifications=row_count;
delete from public.client_mutations where created_at<now()-interval '30 days';
get diagnostics n_mutations=row_count;
return jsonb_build_object('in_app_notifications',n_notifications,'client_mutations',n_mutations);end$$;
revoke execute on function public.purge_expired_records() from public,anon,authenticated;
grant execute on function public.purge_expired_records() to service_role;

-- 10. Per-user dataset counter, bumped once per writing statement (see contract at the top).
create table public.dataset_versions(
  user_id uuid primary key,
  version bigint not null default 1,
  updated_at timestamptz not null default now()
);
alter table public.dataset_versions enable row level security;
revoke all on public.dataset_versions from public,anon,authenticated;
create function public.touch_dataset_version() returns trigger language plpgsql security definer set search_path='' as $$begin
if tg_table_name='profiles' and tg_op='DELETE' then
 delete from public.dataset_versions d using changed_rows c where d.user_id=c.id;return null;end if;
-- Skip owners whose profile is gone (account-deletion cascades).
insert into public.dataset_versions as d(user_id)
select x.uid from (select distinct coalesce(to_jsonb(c)->>'user_id',to_jsonb(c)->>'id')::uuid uid from changed_rows c) x
where exists(select 1 from public.profiles p where p.id=x.uid) order by x.uid
on conflict(user_id) do update set version=d.version+1,updated_at=now();
return null;end$$;
revoke execute on function public.touch_dataset_version() from public,anon,authenticated;
do $$declare t text;begin
foreach t in array array['profiles','notification_preferences','categories','tasks','week_tasks','week_task_day_marks','goals','goal_week_tasks','time_blocks','availability_rules','availability_overrides','recurrence_rules','recurrence_occurrences','week_reviews','in_app_notifications'] loop
 execute format('create trigger dataset_version_ins after insert on public.%I referencing new table as changed_rows for each statement execute function public.touch_dataset_version()',t);
 execute format('create trigger dataset_version_upd after update on public.%I referencing new table as changed_rows for each statement execute function public.touch_dataset_version()',t);
 execute format('create trigger dataset_version_del after delete on public.%I referencing old table as changed_rows for each statement execute function public.touch_dataset_version()',t);
end loop;end$$;
create function public.dataset_version() returns bigint language plpgsql stable security definer set search_path='' as $$
declare u uuid:=auth.uid();v bigint;begin
if u is null then raise exception 'UNAUTHENTICATED';end if;
select version into v from public.dataset_versions where user_id=u;
return coalesce(v,0);end$$;
revoke execute on function public.dataset_version() from public,anon;
grant execute on function public.dataset_version() to authenticated;
