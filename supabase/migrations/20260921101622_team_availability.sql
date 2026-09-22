-- Only current availability is shared; leave reasons and work logs stay private.
create function attendance_private.availability(p_at timestamptz)
returns jsonb language sql stable security invoker set search_path='' as $$
 with moment as (
  select (p_at at time zone 'Europe/Prague')::date as day,
         (p_at at time zone 'Europe/Prague')::time as local_time
 ), states as (
  select p.username,p.display_name,
   case
    when not attendance_private.business_day(m.day) then 'OFFLINE'
    when exists (
     select 1 from attendance_private.requests r
     where r.username=p.username and r.status='APPROVED'
      and m.day between r.date_from and r.date_to
      and ((r.kind='VACATION' and r.vacation_part is null)
        or (m.local_time>=r.time_from and m.local_time<r.time_to))
    ) then 'OFFLINE'
    when exists(select 1 from attendance_private.home_days h where h.username=p.username and h.day=m.day)
     then case when exists(select 1 from attendance_private.sessions s
       where s.username=p.username and s.day=m.day and s.started_at<=p_at
        and (s.ended_at is null or s.ended_at>p_at)) then 'HOME_ONLINE' else 'HOME_OFFLINE' end
    else 'OFFICE'
   end as status
  from attendance_private.people p cross join moment m
 )
 select jsonb_build_object('server_now',p_at,'people',coalesce(jsonb_agg(
  jsonb_build_object('username',username,'display_name',display_name,
    'status',status,'online',status in ('OFFICE','HOME_ONLINE')) order by display_name),'[]'::jsonb))
 from states
$$;
revoke all on function attendance_private.availability(timestamptz) from public,anon,authenticated;

-- Reuse the authenticated gateway, before its private attendance snapshot logic.
do $migration$
declare body text; marker text := 'if team and u.role<>''OWNER'' then';
begin
 select pg_get_functiondef('attendance_private.gateway(text,text,text,jsonb)'::regprocedure) into body;
 if position(marker in body)=0 then raise exception 'Attendance gateway marker missing'; end if;
 body:=replace(body,marker,
  'if p_action=''availability'' then return attendance_private.availability(v_now); end if; '||marker);
 execute body;
end;
$migration$;
notify pgrst,'reload schema';
