-- Trusted Cron may prepare the next reminder horizon even when the app is closed.
create function public.materialize_for_user(p_user uuid,p_from date,p_to date,p_holidays date[] default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare previous_sub text:=current_setting('request.jwt.claim.sub',true);result jsonb;begin
if not exists(select 1 from public.profiles where id=p_user) then raise exception 'UNKNOWN_USER';end if;
perform set_config('request.jwt.claim.sub',p_user::text,true);
result:=public.materialize_recurrences(p_from,p_to,p_holidays);
perform set_config('request.jwt.claim.sub',coalesce(previous_sub,''),true);
return result;end$$;
revoke execute on function public.materialize_for_user(uuid,date,date,date[]) from public,anon,authenticated;
grant execute on function public.materialize_for_user(uuid,date,date,date[]) to service_role;
