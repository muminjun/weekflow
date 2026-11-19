-- 015: focus sessions, week templates, calendar subscription feed and client error reports.
-- Builds on the 014 definitions of apply_changes, import_backup, dataset_version triggers
-- and purge_expired_records (see docs/superpowers/plans/2026-11-19-completion.md).

-- 1. Focus sessions measured against a time block. At most one open session per user.
create table public.block_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  block_id uuid not null,
  started_at timestamptz not null,
  ended_at timestamptz,
  note text not null default '' check (char_length(note) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version int not null default 1,
  unique (id,user_id),
  check (ended_at is null or (ended_at >= started_at and ended_at <= started_at + interval '24 hours')),
  foreign key (block_id,user_id) references public.time_blocks(id,user_id) on delete cascade
);
create index block_sessions_by_block on public.block_sessions(user_id,block_id);
-- Backstop for the one-open-session rule (the trigger below raises a named error first).
create unique index block_sessions_one_open on public.block_sessions(user_id) where ended_at is null;

create function public.validate_block_session() returns trigger language plpgsql set search_path='' as $$begin
if char_length(new.note)>1000 then raise exception 'INVALID_SESSION_NOTE';end if;
if new.ended_at is not null and (new.ended_at<new.started_at or new.ended_at>new.started_at+interval '24 hours') then raise exception 'INVALID_SESSION_RANGE';end if;
if new.ended_at is null then
 perform pg_advisory_xact_lock(hashtextextended(new.user_id::text,0));
 if exists(select 1 from public.block_sessions where user_id=new.user_id and ended_at is null and id<>new.id) then raise exception 'SESSION_ALREADY_OPEN';end if;
end if;return new;end$$;
create trigger validate before insert or update on public.block_sessions for each row execute function public.validate_block_session();
revoke execute on function public.validate_block_session() from public,anon,authenticated;

-- 2. Reusable week shapes. At most 30 per user.
create table public.week_templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 80),
  blocks jsonb not null default '[]'::jsonb check (jsonb_typeof(blocks) = 'array'),
  goals jsonb not null default '[]'::jsonb check (jsonb_typeof(goals) = 'array'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version int not null default 1,
  unique (id,user_id)
);
create index week_templates_by_owner on public.week_templates(user_id);

-- True when v is a JSON integer in [lo,hi] divisible by step. Evaluation order is guaranteed by CASE.
create function public.json_int_in(v jsonb,lo int,hi int,step int) returns boolean language sql immutable set search_path='' as $$
select case when v is null or jsonb_typeof(v)<>'number' then false
 when (v#>>'{}')::numeric<>trunc((v#>>'{}')::numeric) then false
 when (v#>>'{}')::numeric not between lo and hi then false
 else (v#>>'{}')::numeric%step=0 end$$;
revoke execute on function public.json_int_in(jsonb,int,int,int) from public,anon;

create function public.validate_week_template() returns trigger language plpgsql set search_path='' as $$
declare e jsonb;cat text;begin
if tg_op='INSERT' then
 perform pg_advisory_xact_lock(hashtextextended(new.user_id::text,0));
 if (select count(*) from public.week_templates where user_id=new.user_id)>=30 then raise exception 'TEMPLATE_LIMIT';end if;
end if;
if char_length(trim(new.name)) not between 1 and 80 then raise exception 'INVALID_TEMPLATE_NAME';end if;
if jsonb_typeof(new.goals)<>'array' or jsonb_array_length(new.goals)>20 then raise exception 'INVALID_TEMPLATE_GOALS';end if;
for e in select value from jsonb_array_elements(new.goals) loop
 if jsonb_typeof(e)<>'string' or char_length(e#>>'{}')>240 then raise exception 'INVALID_TEMPLATE_GOALS';end if;
end loop;
-- Name/goal-only edits keep previously accepted blocks (a referenced category may since be archived).
if tg_op='UPDATE' and new.blocks is not distinct from old.blocks then return new;end if;
if jsonb_typeof(new.blocks)<>'array' or jsonb_array_length(new.blocks)>200 then raise exception 'INVALID_TEMPLATE_BLOCKS';end if;
for e in select value from jsonb_array_elements(new.blocks) loop
 if jsonb_typeof(e)<>'object'
  or exists(select 1 from jsonb_object_keys(e) k where k not in ('weekday','start_minute','duration','kind','title','category_id','note'))
  or not public.json_int_in(e->'weekday',1,7,1)
  or not public.json_int_in(e->'start_minute',0,1425,15)
  or not public.json_int_in(e->'duration',15,1440,15)
  or coalesce(e->>'kind','') not in ('event','task')
  or coalesce(jsonb_typeof(e->'title'),'')<>'string' or char_length(trim(e->>'title')) not between 1 and 240
  or (e ? 'note' and jsonb_typeof(e->'note') not in ('string','null'))
  or char_length(coalesce(e->>'note',''))>1000
  or (e ? 'category_id' and jsonb_typeof(e->'category_id') not in ('string','null'))
 then raise exception 'INVALID_TEMPLATE_BLOCKS';end if;
 cat:=e->>'category_id';
 if cat is not null then
  if cat !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then raise exception 'INVALID_TEMPLATE_BLOCKS';end if;
  if not exists(select 1 from public.categories where id=cat::uuid and user_id=new.user_id) then raise exception 'TEMPLATE_CATEGORY_FORBIDDEN';end if;
 end if;
end loop;return new;end$$;
create trigger validate before insert or update on public.week_templates for each row execute function public.validate_week_template();
revoke execute on function public.validate_week_template() from public,anon,authenticated;

-- 3. Owner-only reads; writes only through apply_changes/import_backup (as in 008).
do $$declare t text;begin
foreach t in array array['block_sessions','week_templates'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from public,anon,authenticated',t);
 execute format('create policy owner on public.%I for select to authenticated using(user_id=auth.uid())',t);
 execute format('grant select on public.%I to authenticated',t);
 execute format('create trigger bump before update on public.%I for each row execute function public.bump_version()',t);
 execute format('create trigger dataset_version_ins after insert on public.%I referencing new table as changed_rows for each statement execute function public.touch_dataset_version()',t);
 execute format('create trigger dataset_version_upd after update on public.%I referencing new table as changed_rows for each statement execute function public.touch_dataset_version()',t);
 execute format('create trigger dataset_version_del after delete on public.%I referencing old table as changed_rows for each statement execute function public.touch_dataset_version()',t);
end loop;end$$;

-- 4. read_dataset() now also returns block_sessions and week_templates (arrays, RLS-scoped).
create or replace function public.read_dataset() returns jsonb language plpgsql security invoker set search_path='' as $$
declare u uuid:=auth.uid();t text;out jsonb;v jsonb;begin
if u is null then raise exception 'UNAUTHENTICATED';end if;
select jsonb_build_object('profile',to_jsonb(p)) into out from public.profiles p where id=u;
select out||jsonb_build_object('notification_preferences',to_jsonb(p)) into out from public.notification_preferences p where user_id=u;
foreach t in array array['categories','tasks','week_tasks','week_task_day_marks','goals','goal_week_tasks','time_blocks','availability_rules','availability_overrides','recurrence_rules','recurrence_occurrences','week_reviews','block_sessions','week_templates','in_app_notifications'] loop
 execute format('select coalesce(jsonb_agg(to_jsonb(x)),''[]''::jsonb) from public.%I x where user_id=$1',t) into v using u;
 out:=out||jsonb_build_object(t,v);end loop;return out;end$$;

-- 5. apply_changes: 014 definition plus the two new tables in the allow-list.
create or replace function public.apply_changes(p_mutation_id uuid,p_changes jsonb,p_acknowledge boolean default false) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid();op jsonb;r jsonb;tbl text;act text;rid uuid;existing jsonb;cols text;vals text;sets text;res jsonb;ver int;k text;begin
if u is null then raise exception 'UNAUTHENTICATED';end if;
if jsonb_typeof(p_changes)<>'array' or jsonb_array_length(p_changes)>1000 then raise exception 'VALIDATION_ERROR';end if;
perform pg_advisory_xact_lock(hashtextextended(u::text,0));
select result into res from public.client_mutations where user_id=u and mutation_id=p_mutation_id;if found then return res;end if;
for op in select value from jsonb_array_elements(p_changes) loop
 tbl:=op->>'table';act:=op->>'action';r:=op->'row';
 if tbl not in ('profiles','categories','tasks','week_tasks','week_task_day_marks','goals','goal_week_tasks','time_blocks','availability_rules','availability_overrides','recurrence_rules','recurrence_occurrences','week_reviews','notification_preferences','in_app_notifications','block_sessions','week_templates') then raise exception 'FORBIDDEN_TABLE';end if;
 if act is null or act not in ('insert','update','upsert','delete') then raise exception 'VALIDATION_ERROR';end if;
 if r is null or jsonb_typeof(r)<>'object' then raise exception 'VALIDATION_ERROR';end if;
 r:=r-'created_at'-'updated_at'-'version';
 if tbl='profiles' then r:=r||jsonb_build_object('id',u);else r:=r||jsonb_build_object('user_id',u);end if;
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

-- 6. import_backup: 014 definition plus block_sessions (block_id remapped) and week_templates
--    (blocks[].category_id remapped). Backups made before 015 may omit both keys.
create or replace function public.import_backup(p_backup jsonb,p_mode text,p_confirm text) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid();tbl text;r jsonb;rows jsonb;ops jsonb:='[]';oldid uuid;newid uuid;fk text;rowid uuid;existing jsonb;countrows int:=0;owned boolean;open_queued boolean:=false;begin
if u is null then raise exception 'UNAUTHENTICATED';end if;
if p_mode not in ('merge','replace') or p_confirm<>(case when p_mode='replace' then 'REPLACE' else 'MERGE' end) then raise exception 'CONFIRM_REQUIRED';end if;
if (p_backup->>'schemaVersion')::int<>1 or p_backup->>'app'<>'WEEKFLOW' or octet_length(p_backup::text)>10485760 or jsonb_typeof(p_backup->'data')<>'object' then raise exception 'IMPORT_INVALID';end if;
perform pg_advisory_xact_lock(hashtextextended(u::text,0));
create temporary table if not exists wf_import_ids(old_id uuid primary key,new_id uuid not null) on commit drop;
truncate pg_temp.wf_import_ids;
foreach tbl in array array['categories','tasks','week_tasks','goals','time_blocks','block_sessions','week_task_day_marks','availability_rules','availability_overrides','recurrence_rules','recurrence_occurrences','week_reviews','week_templates'] loop
 rows:=p_backup->'data'->tbl;
 if rows is null and tbl in ('block_sessions','week_templates') then rows:='[]';end if;
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
 delete from public.block_sessions where user_id=u;
 delete from public.time_blocks where user_id=u;
 delete from public.tasks where user_id=u;
 delete from public.availability_rules where user_id=u;
 delete from public.availability_overrides where user_id=u;
 delete from public.week_reviews where user_id=u;
 delete from public.week_templates where user_id=u;
 delete from public.categories where user_id=u;
end if;
-- Restore portable settings without restoring account identifiers. The zone must precede time_blocks.
r:=p_backup->'data'->'profile';select to_jsonb(p) into existing from public.profiles p where id=u;
perform public.apply_changes(gen_random_uuid(),jsonb_build_array(jsonb_build_object('table','profiles','action','update','expected_version',existing->'version','row',jsonb_build_object('id',u,'timezone',r->'timezone','pixels_per_hour',r->'pixels_per_hour','display_start_minute',r->'display_start_minute','display_end_minute',r->'display_end_minute','onboarding_completed',r->'onboarding_completed'))),true);
-- Remap all identifiers to the authenticated account. FK/trigger checks run inside this transaction.
foreach tbl in array array['categories','tasks','week_tasks','goals','goal_week_tasks','time_blocks','block_sessions','week_task_day_marks','availability_rules','availability_overrides','recurrence_rules','recurrence_occurrences','week_reviews','week_templates'] loop
 for r in select value from jsonb_array_elements(coalesce(p_backup->'data'->tbl,'[]')) loop
 r:=r-'created_at'-'updated_at'-'version';
 foreach fk in array array['id','task_id','week_task_id','goal_id','category_id','rule_id','parent_rule_id','time_block_id','block_id'] loop
 if r->>fk is not null then select new_id into newid from pg_temp.wf_import_ids where old_id=(r->>fk)::uuid;if newid is null then raise exception 'IMPORT_INVALID_FK %',fk;end if;r:=jsonb_set(r,array[fk],to_jsonb(newid));end if;
 end loop;
 if tbl='recurrence_rules' and r->'template'->>'category_id' is not null then select new_id into newid from pg_temp.wf_import_ids where old_id=(r->'template'->>'category_id')::uuid;if newid is null then raise exception 'IMPORT_INVALID_TEMPLATE_FK';end if;r:=jsonb_set(r,'{template,category_id}',to_jsonb(newid));end if;
 -- Template blocks keep their category when it is part of the backup, otherwise become uncategorized.
 if tbl='week_templates' and jsonb_typeof(r->'blocks')='array' then
 r:=jsonb_set(r,'{blocks}',(select coalesce(jsonb_agg(case when jsonb_typeof(e)='object' and e->>'category_id' is not null then jsonb_set(e,'{category_id}',coalesce((select to_jsonb(m.new_id) from pg_temp.wf_import_ids m where m.old_id::text=lower(e->>'category_id')),'null'::jsonb)) else e end order by n),'[]'::jsonb) from jsonb_array_elements(r->'blocks') with ordinality x(e,n)));end if;
 r:=r||jsonb_build_object('user_id',u);existing:=null;
 if tbl<>'goal_week_tasks' then execute format('select to_jsonb(x) from public.%I x where id=$1 and user_id=$2',tbl) into existing using (r->>'id')::uuid,u;end if;
 -- One running timer per account: an open session is restored only when no other one is open.
 if tbl='block_sessions' and r->>'ended_at' is null then
 if open_queued or exists(select 1 from public.block_sessions where user_id=u and ended_at is null and id<>(r->>'id')::uuid) then continue;end if;
 open_queued:=true;end if;
 ops:=ops||jsonb_build_array(jsonb_build_object('table',tbl,'action',case when existing is null then 'insert' else 'update' end,'row',r,'expected_version',existing->'version'));
 if jsonb_array_length(ops)>=500 then perform public.apply_changes(gen_random_uuid(),ops,true);ops:='[]';end if;
 end loop;
end loop;
perform public.apply_changes(gen_random_uuid(),ops,true);
r:=p_backup->'data'->'notification_preferences';select to_jsonb(p) into existing from public.notification_preferences p where user_id=u;
r:=r-'id'-'created_at'-'updated_at'-'version'||jsonb_build_object('user_id',u);
perform public.apply_changes(gen_random_uuid(),jsonb_build_array(jsonb_build_object('table','notification_preferences','action','update','expected_version',existing->'version','row',r)),true);
return jsonb_build_object('restored',countrows,'mode',p_mode);end$$;

-- 7. Calendar subscription feed. Only the SHA-256 hex of the token is stored; the table is never
--    exposed to clients (RLS on, no policy, no grants). The rate window lives on the same row.
create table public.calendar_feeds (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  rate_window_start timestamptz,
  rate_count int not null default 0
);
alter table public.calendar_feeds enable row level security;
revoke all on public.calendar_feeds from public,anon,authenticated;

-- Returns the new token once (base64url of 48 CSPRNG bytes = three gen_random_uuid(), 366 random bits).
-- Any previous token stops working immediately.
create function public.rotate_calendar_feed() returns text language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid();tok text;begin
if u is null then raise exception 'UNAUTHENTICATED';end if;
if not exists(select 1 from public.profiles where id=u) then raise exception 'PROFILE_REQUIRED';end if;
tok:=translate(encode(uuid_send(gen_random_uuid())||uuid_send(gen_random_uuid())||uuid_send(gen_random_uuid()),'base64'),E'+/=\n','-_');
insert into public.calendar_feeds(user_id,token_hash) values(u,encode(sha256(convert_to(tok,'UTF8')),'hex'))
on conflict(user_id) do update set token_hash=excluded.token_hash,created_at=now(),last_used_at=null,rate_window_start=null,rate_count=0;
return tok;end$$;

create function public.revoke_calendar_feed() returns void language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid();begin
if u is null then raise exception 'UNAUTHENTICATED';end if;
delete from public.calendar_feeds where user_id=u;end$$;

create function public.calendar_feed_status() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare u uuid:=auth.uid();f public.calendar_feeds;begin
if u is null then raise exception 'UNAUTHENTICATED';end if;
select * into f from public.calendar_feeds where user_id=u;
return jsonb_build_object('enabled',f.user_id is not null,'created_at',f.created_at,'last_used_at',f.last_used_at);end$$;

-- Service-only lookup for the calendar-feed Edge Function. Fixed 1-minute window of 30 requests
-- per token, counted atomically under the row lock. Returns {status:'not_found'|'rate_limited'|'ok'}.
create function public.calendar_feed_events(p_token_hash text) returns jsonb language plpgsql security definer set search_path='' as $$
declare f public.calendar_feeds;tz text;ev jsonb;begin
if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then return jsonb_build_object('status','not_found');end if;
update public.calendar_feeds set
 rate_count=case when rate_window_start>now()-interval '1 minute' then rate_count+1 else 1 end,
 rate_window_start=case when rate_window_start>now()-interval '1 minute' then rate_window_start else now() end
where token_hash=p_token_hash returning * into f;
if not found then return jsonb_build_object('status','not_found');end if;
if f.rate_count>30 then return jsonb_build_object('status','rate_limited','retry_after',greatest(1,ceil(extract(epoch from f.rate_window_start+interval '1 minute'-now()))::int));end if;
update public.calendar_feeds set last_used_at=now() where user_id=f.user_id;
select timezone into tz from public.profiles where id=f.user_id;
select coalesce(jsonb_agg(jsonb_build_object('id',b.id,'kind',b.kind,'title',case when b.kind='event' then b.event_title else t.title end,'note',case when b.kind='event' then b.event_note else coalesce(t.description,'') end,'start_at',b.start_at,'end_at',b.end_at,'state',b.state,'version',b.version,'updated_at',b.updated_at) order by b.start_at,b.id),'[]'::jsonb) into ev
from (select * from public.time_blocks where user_id=f.user_id and state<>'skipped' and end_at>now()-interval '30 days' and start_at<now()+interval '90 days' order by start_at limit 3000) b
left join public.week_tasks w on w.id=b.week_task_id and w.user_id=b.user_id
left join public.tasks t on t.id=w.task_id and t.user_id=b.user_id;
return jsonb_build_object('status','ok','timezone',tz,'events',ev);end$$;

-- 8. Client error reports: write-only for clients, capped at 30 per user per hour, kept 30 days.
create table public.client_errors (
  id bigserial primary key,
  user_id uuid references public.profiles(id) on delete cascade,
  message text not null check (char_length(message) <= 500),
  stack text not null default '' check (char_length(stack) <= 4000),
  url text not null default '' check (char_length(url) <= 500),
  user_agent text not null default '' check (char_length(user_agent) <= 300),
  release text not null default '' check (char_length(release) <= 40),
  created_at timestamptz not null default now()
);
create index client_errors_by_user on public.client_errors(user_id,created_at);
create index client_errors_by_age on public.client_errors(created_at);
alter table public.client_errors enable row level security;
revoke all on public.client_errors from public,anon,authenticated;
revoke all on sequence public.client_errors_id_seq from public,anon,authenticated;

create function public.report_client_error(p jsonb) returns void language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid();begin
if u is null then raise exception 'UNAUTHENTICATED';end if;
if p is null or jsonb_typeof(p)<>'object' then raise exception 'VALIDATION_ERROR';end if;
if not exists(select 1 from public.profiles where id=u) then return;end if;
perform pg_advisory_xact_lock(hashtextextended('client_errors:'||u::text,0));
if (select count(*) from public.client_errors where user_id=u and created_at>now()-interval '1 hour')>=30 then return;end if;
insert into public.client_errors(user_id,message,stack,url,user_agent,release)
values(u,left(coalesce(nullif(p->>'message',''),'(no message)'),500),left(coalesce(p->>'stack',''),4000),left(coalesce(p->>'url',''),500),left(coalesce(p->>'user_agent',''),300),left(coalesce(p->>'release',''),40));
end$$;

-- 9. Retention (Cron weekflow-retention): 014 rules plus client errors after 30 days.
create or replace function public.purge_expired_records() returns jsonb language plpgsql security definer set search_path='' as $$
declare n_notifications int;n_mutations int;n_errors int;begin
delete from public.in_app_notifications where read_at is not null and created_at<now()-interval '90 days';
get diagnostics n_notifications=row_count;
delete from public.client_mutations where created_at<now()-interval '30 days';
get diagnostics n_mutations=row_count;
delete from public.client_errors where created_at<now()-interval '30 days';
get diagnostics n_errors=row_count;
return jsonb_build_object('in_app_notifications',n_notifications,'client_mutations',n_mutations,'client_errors',n_errors);end$$;
revoke execute on function public.purge_expired_records() from public,anon,authenticated;
grant execute on function public.purge_expired_records() to service_role;

-- 10. Grants.
revoke execute on function public.rotate_calendar_feed(),public.revoke_calendar_feed(),public.calendar_feed_status(),public.report_client_error(jsonb),public.calendar_feed_events(text) from public,anon,authenticated;
grant execute on function public.rotate_calendar_feed(),public.revoke_calendar_feed(),public.calendar_feed_status(),public.report_client_error(jsonb) to authenticated;
grant execute on function public.calendar_feed_events(text) to service_role;
revoke execute on function public.read_dataset(),public.apply_changes(uuid,jsonb,boolean),public.import_backup(jsonb,text,text) from public,anon;
grant execute on function public.read_dataset(),public.apply_changes(uuid,jsonb,boolean),public.import_backup(jsonb,text,text) to authenticated;
