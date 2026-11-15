-- Initialization is retry-safe after an empty-category restore and parallel logins.
create or replace function public.ensure_profile() returns void
language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid();
begin
  if u is null then raise exception 'UNAUTHENTICATED'; end if;
  insert into public.profiles(id) values(u) on conflict do nothing;
  perform 1 from public.profiles where id=u for update;
  if not exists(select 1 from public.categories where user_id=u) then
    insert into public.categories(user_id,name,color,sort_order)
    select u,n,c,i::int from (values
      ('WORK','#F1C9B9',0),('PERSONAL','#DBE8BD',1),
      ('STUDY','#CBDDEA',2),('HEALTH','#E5D7EB',3),
      ('ROUTINE','#EADFBD',4),('OTHER','#DFE0DC',5)
    ) a(n,c,i);
    insert into public.availability_rules(user_id,weekday,start_minute,end_minute)
    select u,d,540,1080 from generate_series(1,5) d
    on conflict(user_id,weekday,start_minute,end_minute) do nothing;
  end if;
  insert into public.notification_preferences(user_id) values(u) on conflict do nothing;
end$$;
