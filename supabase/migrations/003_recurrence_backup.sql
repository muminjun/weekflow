create function public.materialize_recurrences(p_from date,p_to date,p_holidays date[] default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid();r public.recurrence_rules;d date;tid uuid;wid uuid;bid uuid;st timestamptz;cnt int:=0;paused int:=0;begin
if u is null then raise exception 'UNAUTHENTICATED';end if;
if p_to<p_from or p_to-p_from>30 then raise exception 'RANGE_LIMIT';end if;
perform pg_advisory_xact_lock(hashtextextended(u::text,0));
for r in select * from public.recurrence_rules where user_id=u and is_active and starts_on<=p_to and (ends_on is null or ends_on>=p_from) loop
 if r.skip_public_holidays and p_holidays is null then paused:=paused+1;continue;end if;
 for d in select x::date from generate_series(greatest(p_from,r.starts_on)::timestamp,least(p_to,coalesce(r.ends_on,p_to))::timestamp,interval '1 day') x loop
 if not(extract(isodow from d)::int=any(r.weekdays)) or (r.skip_public_holidays and d=any(p_holidays)) then continue;end if;
 if exists(select 1 from public.recurrence_occurrences where user_id=u and rule_id=r.id and local_date=d) then continue;end if;
 tid:=null;bid:=null;
 if r.kind='task' then
 tid:=gen_random_uuid();wid:=gen_random_uuid();
 insert into public.tasks(id,user_id,title,description,category_id,estimate_minutes,due_on) values(tid,u,r.template->>'title',coalesce(r.template->>'description',''),(r.template->>'category_id')::uuid,coalesce((r.template->>'estimate_minutes')::int,60),d);
 insert into public.week_tasks(id,user_id,task_id,week_start) values(wid,u,tid,d-(extract(isodow from d)::int-1));
 insert into public.week_task_day_marks(user_id,week_task_id,local_date,mark) values(u,wid,d,'planned');
 else
 bid:=gen_random_uuid();st:=(d::timestamp+make_interval(mins=>(r.template->>'startMinute')::int)) at time zone r.timezone;
 insert into public.time_blocks(id,user_id,kind,event_title,category_id,start_at,end_at,local_date) values(bid,u,'event',r.template->>'title',(r.template->>'category_id')::uuid,st,st+make_interval(mins=>(r.template->>'duration')::int),d);
 end if;
 insert into public.recurrence_occurrences(user_id,rule_id,local_date,task_id,time_block_id) values(u,r.id,d,tid,bid);cnt:=cnt+1;
 end loop;end loop;return jsonb_build_object('generated',cnt,'paused',paused);end$$;

create function public.import_backup(p_backup jsonb,p_mode text,p_confirm text) returns jsonb language plpgsql security definer set search_path='' as $$
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
 newid:=case when coalesce(owned,false) then oldid else md5(u::text||oldid::text)::uuid end;
 if tbl='categories' and not coalesce(owned,false) then select id into rowid from public.categories where user_id=u and lower(name)=lower(r->>'name') and archived_at is null;newid:=coalesce(rowid,newid);end if;
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
-- Restore portable settings without restoring account identifiers.
r:=p_backup->'data'->'profile';select to_jsonb(p) into existing from public.profiles p where id=u;
perform public.apply_changes(gen_random_uuid(),jsonb_build_array(jsonb_build_object('table','profiles','action','update','expected_version',existing->'version','row',jsonb_build_object('id',u,'timezone',r->'timezone','pixels_per_hour',r->'pixels_per_hour','display_start_minute',r->'display_start_minute','display_end_minute',r->'display_end_minute','onboarding_completed',r->'onboarding_completed'))),true);
r:=p_backup->'data'->'notification_preferences';select to_jsonb(p) into existing from public.notification_preferences p where user_id=u;
r:=r-'id'-'created_at'-'updated_at'-'version'||jsonb_build_object('user_id',u);
perform public.apply_changes(gen_random_uuid(),jsonb_build_array(jsonb_build_object('table','notification_preferences','action','update','expected_version',existing->'version','row',r)),true);
return jsonb_build_object('restored',countrows,'mode',p_mode);end$$;
revoke execute on function public.materialize_recurrences(date,date,date[]),public.import_backup(jsonb,text,text) from public,anon;
grant execute on function public.materialize_recurrences(date,date,date[]),public.import_backup(jsonb,text,text) to authenticated;
