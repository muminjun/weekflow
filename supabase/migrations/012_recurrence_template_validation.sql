create function public.validate_recurrence_template() returns trigger language plpgsql set search_path='' as $$
declare cat uuid;start_minute int;duration int;estimate int;begin
if char_length(trim(new.template->>'title')) not between 1 and 240 then raise exception 'INVALID_TEMPLATE_TITLE';end if;
cat:=(new.template->>'category_id')::uuid;
if cat is not null and not exists(select 1 from public.categories where id=cat and user_id=new.user_id) then raise exception 'TEMPLATE_CATEGORY_FORBIDDEN';end if;
if new.kind='event' then
 start_minute:=(new.template->>'startMinute')::int;duration:=(new.template->>'duration')::int;
 if start_minute is null or duration is null or start_minute not between 0 and 1439 or start_minute%15<>0 or duration not between 15 and 10080 or duration%15<>0 then raise exception 'INVALID_EVENT_TEMPLATE';end if;
else
 estimate:=(new.template->>'estimate_minutes')::int;
 if estimate is not null and (estimate not between 15 and 10080 or estimate%15<>0) then raise exception 'INVALID_TASK_TEMPLATE';end if;
end if;return new;end$$;
create trigger template_validation before insert or update on public.recurrence_rules for each row execute function public.validate_recurrence_template();
revoke execute on function public.validate_recurrence_template() from public,anon,authenticated;
