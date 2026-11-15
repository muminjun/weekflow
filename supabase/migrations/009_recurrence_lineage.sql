create or replace function public.materialize_recurrences(p_from date,p_to date,p_holidays date[] default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid();r public.recurrence_rules;d date;tid uuid;wid uuid;bid uuid;st timestamptz;cnt int:=0;paused int:=0;begin
if u is null then raise exception 'UNAUTHENTICATED';end if;
if p_to<p_from or p_to-p_from>30 then raise exception 'RANGE_LIMIT';end if;
perform pg_advisory_xact_lock(hashtextextended(u::text,0));
for r in select * from public.recurrence_rules where user_id=u and is_active and starts_on<=p_to and (ends_on is null or ends_on>=p_from) loop
 if r.skip_public_holidays and p_holidays is null then paused:=paused+1;continue;end if;
 for d in select x::date from generate_series(greatest(p_from,r.starts_on)::timestamp,least(p_to,coalesce(r.ends_on,p_to))::timestamp,interval '1 day') x loop
 if not(extract(isodow from d)::int=any(r.weekdays)) or (r.skip_public_holidays and d=any(p_holidays)) then continue;end if;
 if exists(select 1 from public.recurrence_occurrences where user_id=u and rule_id=r.id and local_date=d) then continue;end if;
 -- Revisions share a lineage. Completed/exception/cancelled ancestor dates stay authoritative.
 if exists(with recursive ancestors(id) as(select r.parent_rule_id where r.parent_rule_id is not null union select p.parent_rule_id from public.recurrence_rules p join ancestors a on p.id=a.id where p.parent_rule_id is not null and p.user_id=u) select 1 from public.recurrence_occurrences o join ancestors a on a.id=o.rule_id where o.user_id=u and o.local_date=d and not(o.overrides @> '{"superseded":true}'::jsonb)) then continue;end if;
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

