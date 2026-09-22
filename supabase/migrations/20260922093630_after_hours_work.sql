-- Separate ledger: never contributes to attendance, absence settlement or public availability.
create table attendance_private.after_hours_sessions (
  id uuid primary key default gen_random_uuid(),
  username text not null references attendance_private.people(username),
  day date not null,
  started_at timestamptz not null,
  ended_at timestamptz,
  constraint after_hours_valid_interval check (ended_at is null or ended_at >= started_at),
  constraint after_hours_start_day check (day = (started_at at time zone 'Europe/Prague')::date)
);
create unique index after_hours_one_open_per_person
  on attendance_private.after_hours_sessions(username) where ended_at is null;
create index after_hours_person_start on attendance_private.after_hours_sessions(username, started_at);
alter table attendance_private.after_hours_sessions enable row level security;
revoke all on attendance_private.after_hours_sessions from public, anon, authenticated;

-- Called only inside the secret-validated gateway. Non-Viktor users receive their own toggle state only.
create function attendance_private.after_hours_snapshot(p_actor text, p_year integer, p_at timestamptz)
returns jsonb language sql stable security invoker set search_path='' as $$
  select jsonb_build_object(
    'is_working', exists(select 1 from attendance_private.after_hours_sessions s where s.username=p_actor and s.ended_at is null),
    'can_view_reports', p_actor='VIKTOR' and exists(select 1 from attendance_private.people where username=p_actor and role='OWNER'),
    'sessions', case when p_actor='VIKTOR' and exists(select 1 from attendance_private.people where username=p_actor and role='OWNER') then (
      select coalesce(jsonb_agg(to_jsonb(s) || jsonb_build_object('display_name',p.display_name,
        'minutes', greatest(0,floor(extract(epoch from (
          least(coalesce(s.ended_at,p_at),make_date(p_year+1,1,1)::timestamp at time zone 'Europe/Prague')
          - greatest(s.started_at,make_date(p_year,1,1)::timestamp at time zone 'Europe/Prague')
        ))/60))::integer) order by s.started_at desc,s.id), '[]'::jsonb)
      from attendance_private.after_hours_sessions s join attendance_private.people p using(username)
      where s.started_at < (make_date(p_year+1,1,1)::timestamp at time zone 'Europe/Prague')
        and coalesce(s.ended_at,p_at) >= (make_date(p_year,1,1)::timestamp at time zone 'Europe/Prague')
    ) else '[]'::jsonb end
  );
$$;
revoke all on function attendance_private.after_hours_snapshot(text,integer,timestamptz) from public,anon,authenticated;

-- Extend the existing gateway without replacing its current leave and availability rules.
do $migration$
declare
  body text;
  action_marker text := 'if p_action=''set_vacation_balance'' then';
  snapshot_marker text := '''server_now'',v_now,''today'',v_today,''user'',to_jsonb(u),';
  checkin_marker text := 'if p_action=''checkin'' then';
begin
  select pg_get_functiondef('attendance_private.gateway(text,text,text,jsonb)'::regprocedure) into body;
  if position(action_marker in body)=0 or position(snapshot_marker in body)=0 or position(checkin_marker in body)=0 then
    raise exception 'Attendance gateway extension markers missing';
  end if;
  body := replace(body, action_marker, $actions$
    if p_action in ('after_hours_start','after_hours_stop') then
      if p_action='after_hours_start' then
        if exists(select 1 from attendance_private.sessions where username=p_actor and day=v_today and ended_at is null) then
          raise exception 'Nejprve ukončete běžnou práci na home office.';
        end if;
        insert into attendance_private.after_hours_sessions(username,day,started_at)
          values(p_actor,v_today,v_now) on conflict(username) where ended_at is null do nothing;
      else
        -- End the open interval even after midnight or New Year.
        update attendance_private.after_hours_sessions set ended_at=greatest(v_now,started_at)
          where username=p_actor and ended_at is null;
      end if;
      -- Do not expose private after-hours events through the shared attendance history.
      p_action := 'snapshot';
    end if;
    if p_action='set_vacation_balance' then
  $actions$);
  body := replace(body, checkin_marker, $checkin$
    if p_action='checkin' then
      if exists(select 1 from attendance_private.after_hours_sessions where username=p_actor and ended_at is null) then
        raise exception 'Nejprve ukončete práci mimo pracovní dobu.';
      end if;
  $checkin$);
  body := replace(body, snapshot_marker, snapshot_marker || E'\n ''after_hours'',attendance_private.after_hours_snapshot(p_actor,v_year,v_now),');
  execute body;
end;
$migration$;
notify pgrst,'reload schema';
