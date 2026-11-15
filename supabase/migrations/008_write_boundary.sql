-- Browser writes go only through versioned, owner-checked transactional RPCs.
revoke insert,update,delete on all tables in schema public from authenticated;
create function public.validate_timezone() returns trigger language plpgsql set search_path='' as $$begin
if not exists(select 1 from pg_timezone_names where name=new.timezone) then raise exception 'INVALID_TIMEZONE';end if;return new;end$$;
create trigger validate_timezone before insert or update on public.profiles for each row execute function public.validate_timezone();
create trigger validate_timezone before insert or update on public.recurrence_rules for each row execute function public.validate_timezone();
revoke execute on function public.validate_timezone() from public,anon,authenticated;
