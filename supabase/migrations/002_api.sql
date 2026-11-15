-- Explicit ownership checks, narrow grants, fixed search_path on every definer.
create function public.bump_version() returns trigger language plpgsql set search_path='' as $$begin new.updated_at=now(); new.version=old.version+1;return new;end$$;
do $$declare t text;begin
foreach t in array array['profiles','categories','tasks','week_tasks','week_task_day_marks','goals','goal_week_tasks','time_blocks','availability_rules','availability_overrides','recurrence_rules','recurrence_occurrences','week_reviews','notification_preferences','push_subscriptions','notification_jobs','in_app_notifications','client_mutations'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from anon, authenticated',t);
 if t='profiles' then
 execute 'create policy owner on public.profiles for all to authenticated using(id=auth.uid()) with check(id=auth.uid())';
 else execute format('create policy owner on public.%I for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid())',t);end if;
 execute format('grant select on public.%I to authenticated',t);
 if t not in ('client_mutations','notification_jobs','push_subscriptions') then execute format('grant insert,update,delete on public.%I to authenticated',t);end if;
 if t in ('profiles','categories','tasks','week_tasks','week_task_day_marks','goals','time_blocks','availability_rules','availability_overrides','recurrence_rules','recurrence_occurrences','week_reviews','notification_preferences') then
 execute format('create trigger bump before update on public.%I for each row execute function public.bump_version()',t);end if;
end loop;end$$;
create function public.ensure_profile() returns void language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid();begin
if u is null then raise exception 'UNAUTHENTICATED';end if;
insert into public.profiles(id) values(u) on conflict do nothing;
if not exists(select 1 from public.categories where user_id=u) then
insert into public.categories(user_id,name,color,sort_order) select u,n,c,i::int from (values('WORK','#F1C9B9',0),('PERSONAL','#DBE8BD',1),('STUDY','#CBDDEA',2),('HEALTH','#E5D7EB',3),('ROUTINE','#EADFBD',4),('OTHER','#DFE0DC',5)) a(n,c,i);
insert into public.availability_rules(user_id,weekday,start_minute,end_minute) select u,d,540,1080 from generate_series(1,5) d;
end if;
insert into public.notification_preferences(user_id) values(u) on conflict do nothing;
end$$;
create function public.validate_relations() returns trigger language plpgsql set search_path='' as $$
declare w date;g date;z text;v jsonb;begin
if tg_table_name='week_task_day_marks' then
 select week_start into w from public.week_tasks where id=new.week_task_id and user_id=new.user_id;
 if new.local_date<w or new.local_date>w+6 then raise exception 'DAY_OUTSIDE_WEEK';end if;
elsif tg_table_name='goal_week_tasks' then
 select week_start into w from public.week_tasks where id=new.week_task_id and user_id=new.user_id;
 select week_start into g from public.goals where id=new.goal_id and user_id=new.user_id;
 if w<>g then raise exception 'GOAL_WEEK_MISMATCH';end if;
elsif tg_table_name='time_blocks' then
 select timezone into z from public.profiles where id=new.user_id;
 new.local_date:=(new.start_at at time zone z)::date;
 if extract(second from new.start_at)<>0 or extract(minute from new.start_at)::int%15<>0 or extract(second from new.end_at)<>0 or extract(minute from new.end_at)::int%15<>0 then raise exception 'QUARTER_HOUR_REQUIRED';end if;
 if new.kind='task' then select week_start into w from public.week_tasks where id=new.week_task_id and user_id=new.user_id;
 if new.local_date<w or new.local_date>w+6 then raise exception 'BLOCK_OUTSIDE_WEEK';end if;end if;
elsif tg_table_name='availability_overrides' then
 if jsonb_typeof(new.windows)<>'array' then raise exception 'INVALID_WINDOWS';end if;
 for v in select value from jsonb_array_elements(new.windows) loop
 if not(v ? 'startMinute' and v ? 'endMinute') or (v->>'startMinute')::int<0 or (v->>'endMinute')::int>1440 or (v->>'startMinute')::int>=(v->>'endMinute')::int then raise exception 'INVALID_WINDOWS';end if;end loop;
elsif tg_table_name='recurrence_rules' then
 if cardinality(new.weekdays)=0 then raise exception 'WEEKDAYS_REQUIRED';end if;
 if length(trim(new.template->>'title'))=0 or not new.template ? 'title' then raise exception 'TITLE_REQUIRED';end if;
 if new.kind='event' and (not(new.template ? 'startMinute' and new.template ? 'duration') or (new.template->>'duration')::int<15 or (new.template->>'duration')::int%15<>0) then raise exception 'INVALID_EVENT_TEMPLATE';end if;
elsif tg_table_name='recurrence_occurrences' then
 if new.state<>'cancelled' and ((new.task_id is not null and not exists(select 1 from public.recurrence_rules where id=new.rule_id and kind='task')) or (new.time_block_id is not null and not exists(select 1 from public.recurrence_rules where id=new.rule_id and kind='event'))) then raise exception 'OCCURRENCE_KIND_MISMATCH';end if;
end if;return new;end$$;
do $$declare t text;begin foreach t in array array['week_task_day_marks','goal_week_tasks','time_blocks','availability_overrides','recurrence_rules','recurrence_occurrences'] loop execute format('create trigger validate before insert or update on public.%I for each row execute function public.validate_relations()',t);end loop;end$$;

create function public.read_dataset() returns jsonb language plpgsql security invoker set search_path='' as $$
declare u uuid:=auth.uid();t text;out jsonb;v jsonb;begin
if u is null then raise exception 'UNAUTHENTICATED';end if;
select jsonb_build_object('profile',to_jsonb(p)) into out from public.profiles p where id=u;
select out||jsonb_build_object('notification_preferences',to_jsonb(p)) into out from public.notification_preferences p where user_id=u;
foreach t in array array['categories','tasks','week_tasks','week_task_day_marks','goals','goal_week_tasks','time_blocks','availability_rules','availability_overrides','recurrence_rules','recurrence_occurrences','week_reviews','in_app_notifications'] loop
 execute format('select coalesce(jsonb_agg(to_jsonb(x)),''[]''::jsonb) from public.%I x where user_id=$1',t) into v using u;
 out:=out||jsonb_build_object(t,v);end loop;return out;end$$;

create function public.apply_changes(p_mutation_id uuid,p_changes jsonb,p_acknowledge boolean default false) returns jsonb language plpgsql security definer set search_path='' as $$
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
 if not p_acknowledge and exists(select 1 from public.time_blocks where user_id=u and id<>rid and state<>'skipped' and start_at<(r->>'end_at')::timestamptz and end_at>(r->>'start_at')::timestamptz) then raise exception 'TIME_CONFLICT';end if;end if;
 -- Only declared table columns may be mutated; defaults remain database defaults on insert.
 if exists(select 1 from jsonb_object_keys(r) x where not exists(select 1 from information_schema.columns where table_schema='public' and table_name=tbl and column_name=x)) then raise exception 'UNKNOWN_FIELD';end if;
 select string_agg(format('%I',key),','),string_agg(format('(jsonb_populate_record(null::public.%I,$1)).%I',tbl,key),','),string_agg(format('%I=(jsonb_populate_record(null::public.%I,$1)).%I',key,tbl,key),',') into cols,vals,sets from jsonb_object_keys(r) as x(key);
 if existing is null then execute format('insert into public.%I(%s) select %s',tbl,cols,vals) using r;
 elsif act in ('update','upsert') then execute format('update public.%I set %s where %I=$2',tbl,sets,k) using r,rid;
 else raise exception 'DUPLICATE_ID';end if;
end loop;
res:=jsonb_build_object('ok',true);insert into public.client_mutations(user_id,mutation_id,operation,result) values(u,p_mutation_id,'batch',res);return res;end$$;

create function public.roll_over(p_ids uuid[],p_target date) returns void language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid();w public.week_tasks;begin
if u is null then raise exception 'UNAUTHENTICATED';end if;
if extract(isodow from p_target)<>1 or cardinality(p_ids)>200 then raise exception 'VALIDATION_ERROR';end if;
perform pg_advisory_xact_lock(hashtextextended(u::text,0));
foreach w.id in array p_ids loop
 select * into w from public.week_tasks where id=w.id and user_id=u for update;
 if not found then raise exception 'FORBIDDEN';end if;
 if w.week_start>=p_target then raise exception 'INVALID_TARGET';end if;
 if w.state not in ('open','carried') then continue;end if;
 insert into public.week_tasks(user_id,task_id,week_start) values(u,w.task_id,p_target) on conflict(user_id,task_id,week_start) do nothing;
 update public.week_tasks set state='carried',carried_to_week=p_target where id=w.id;
end loop;end$$;

create function public.complete_task(p_week_task_id uuid,p_complete boolean,p_future text,p_version int) returns void language plpgsql security definer set search_path='' as $$
declare w public.week_tasks;u uuid:=auth.uid();begin
select * into w from public.week_tasks where id=p_week_task_id and user_id=u for update;
if not found then raise exception 'FORBIDDEN';end if;if w.version<>p_version then raise exception 'VERSION_CONFLICT';end if;
if p_future not in ('keep','skip') then raise exception 'VALIDATION_ERROR';end if;
update public.week_tasks set state=case when p_complete then 'done'::public.week_task_state else 'open'::public.week_task_state end,completed_at=case when p_complete then now() end where id=w.id;
update public.tasks set state=case when p_complete then 'done'::public.task_state else 'open'::public.task_state end,completed_at=case when p_complete then now() end where id=w.task_id and user_id=u;
if p_complete and p_future='skip' then update public.time_blocks set state='skipped' where week_task_id=w.id and user_id=u and start_at>now() and state='planned';end if;end$$;

-- Revoke default PUBLIC function execution, then grant only authenticated entry points.
do $$declare f record;begin for f in select p.oid::regprocedure sig from pg_proc p join pg_namespace n on p.pronamespace=n.oid where n.nspname='public' loop execute format('revoke execute on function %s from public,anon',f.sig);end loop;end$$;
grant execute on function public.ensure_profile(),public.read_dataset(),public.apply_changes(uuid,jsonb,boolean),public.roll_over(uuid[],date),public.complete_task(uuid,boolean,text,int) to authenticated;
