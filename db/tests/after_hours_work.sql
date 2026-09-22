begin;
update attendance_private.settings set gateway_hash=encode(extensions.digest('after-hours-test','sha256'),'hex');
insert into attendance_private.people(username,display_name,role,daily_hours)
values ('AFTER_HOURS_TEST','Test mimo pracovní dobu','EMPLOYEE',7),
       ('AFTER_HOURS_OTHER','Jiný test','EMPLOYEE',9);
do $test$
declare
  snap jsonb; before_public jsonb; item jsonb; blocked boolean; actor text;
  today date := (clock_timestamp() at time zone 'Europe/Prague')::date;
  yr integer := extract(year from clock_timestamp() at time zone 'Europe/Prague');
  started timestamptz; stopped timestamptz;
begin
  before_public := attendance_private.availability(clock_timestamp())->'people';
  snap := attendance_private.gateway('after-hours-test','AFTER_HOURS_TEST','after_hours_start','{}');
  assert (snap#>>'{after_hours,is_working}')::boolean, 'Start without a home-office plan';
  assert snap#>'{after_hours,sessions}'='[]'::jsonb, 'Employees cannot read their own output';
  assert not (snap#>>'{after_hours,can_view_reports}')::boolean, 'No report capability for employee';
  select started_at into started from attendance_private.after_hours_sessions where username='AFTER_HOURS_TEST';
  perform attendance_private.gateway('after-hours-test','AFTER_HOURS_TEST','after_hours_start','{}');
  assert (select count(*)=1 and min(started_at)=started from attendance_private.after_hours_sessions where username='AFTER_HOURS_TEST'), 'Repeated start is idempotent';
  assert not exists(select 1 from attendance_private.sessions where username='AFTER_HOURS_TEST'), 'No ordinary sessions';
  assert not exists(select 1 from attendance_private.checkins where username='AFTER_HOURS_TEST'), 'No ordinary checkins';
  assert not exists(select 1 from attendance_private.events where username='AFTER_HOURS_TEST'), 'No times leaked in shared history';
  assert not exists(select 1 from attendance_private.absences where username='AFTER_HOURS_TEST'), 'No artificial absences';
  assert attendance_private.availability(clock_timestamp())->'people'=before_public, 'Colleague availability does not expose private work';
  snap := attendance_private.gateway('after-hours-test','AFTER_HOURS_OTHER','snapshot','{}');
  assert not (snap#>>'{after_hours,is_working}')::boolean, 'Current status belongs only to the caller';
  snap := attendance_private.gateway('after-hours-test','MILAN','snapshot','{"team":true}');
  assert snap#>'{after_hours,sessions}'='[]'::jsonb and not (snap#>>'{after_hours,can_view_reports}')::boolean, 'Other owner cannot read output';
  snap := attendance_private.gateway('after-hours-test','VIKTOR','snapshot','{"team":false}');
  assert (snap#>>'{after_hours,can_view_reports}')::boolean, 'Viktor can read reports';
  assert exists(select 1 from jsonb_array_elements(snap#>'{after_hours,sessions}') s where s->>'username'='AFTER_HOURS_TEST'), 'Viktor receives team output';
  foreach actor in array array['AFTER_HOURS_OTHER','VIKTOR'] loop
    blocked:=false;
    begin perform attendance_private.gateway('after-hours-test',actor,'after_hours_stop','{"target_username":"AFTER_HOURS_TEST"}'); exception when others then blocked:=true; end;
    assert blocked, 'Cannot stop another person';
  end loop;
  blocked:=false;
  begin perform attendance_private.gateway('incorrect','AFTER_HOURS_TEST','after_hours_stop','{}'); exception when sqlstate '28000' then blocked:=true; end;
  assert blocked, 'Gateway secret required';
  blocked:=false;
  begin perform attendance_private.gateway('after-hours-test','UNKNOWN_USER','after_hours_start','{}'); exception when sqlstate '28000' then blocked:=true; end;
  assert blocked, 'Known authenticated actor required';
  insert into attendance_private.home_days(username,day) values('AFTER_HOURS_TEST',today);
  blocked:=false;
  begin perform attendance_private.gateway('after-hours-test','AFTER_HOURS_TEST','checkin','{}'); exception when others then blocked:=true; end;
  assert blocked, 'Cannot start ordinary work during after-hours interval';
  snap := attendance_private.gateway('after-hours-test','AFTER_HOURS_TEST','after_hours_stop','{}');
  assert not (snap#>>'{after_hours,is_working}')::boolean, 'Stop returns offline';
  select ended_at into stopped from attendance_private.after_hours_sessions where username='AFTER_HOURS_TEST';
  perform attendance_private.gateway('after-hours-test','AFTER_HOURS_TEST','after_hours_stop','{}');
  assert (select ended_at=stopped from attendance_private.after_hours_sessions where username='AFTER_HOURS_TEST'), 'Repeated stop preserves timestamp';
  perform attendance_private.gateway('after-hours-test','AFTER_HOURS_TEST','checkin','{}');
  blocked:=false;
  begin perform attendance_private.gateway('after-hours-test','AFTER_HOURS_TEST','after_hours_start','{}'); exception when others then blocked:=true; end;
  assert blocked, 'Cannot double count ordinary and after-hours work';
  perform attendance_private.gateway('after-hours-test','AFTER_HOURS_TEST','checkout','{}');
  perform attendance_private.gateway('after-hours-test','AFTER_HOURS_TEST','after_hours_start','{}');
  assert (select count(*)=2 from attendance_private.after_hours_sessions where username='AFTER_HOURS_TEST'), 'Multiple separate intervals supported';
  update attendance_private.after_hours_sessions
    set day=make_date(yr-1,12,31),started_at=(make_date(yr-1,12,31)+time '23:30') at time zone 'Europe/Prague'
    where username='AFTER_HOURS_TEST' and ended_at is null;
  snap:=attendance_private.gateway('after-hours-test','AFTER_HOURS_TEST','snapshot','{"year":2097}');
  assert (snap#>>'{after_hours,is_working}')::boolean, 'Active toggle independent of date and selected year';
  snap:=attendance_private.gateway('after-hours-test','AFTER_HOURS_TEST','after_hours_stop','{}');
  assert not (snap#>>'{after_hours,is_working}')::boolean, 'Stop works across midnight and New Year';
  insert into attendance_private.after_hours_sessions(username,day,started_at,ended_at) values
    ('AFTER_HOURS_OTHER','2096-12-31','2096-12-31 23:30+01','2097-01-01 01:30+01'),
    ('AFTER_HOURS_OTHER','2097-03-31','2097-03-31 01:00+01','2097-03-31 04:00+02');
  snap:=attendance_private.after_hours_snapshot('VIKTOR',2097,'2097-12-31 23:00+01');
  select s into item from jsonb_array_elements(snap->'sessions') s where s->>'day'='2096-12-31';
  assert (item->>'minutes')::integer=90, 'Year boundary clips durations in Prague timezone';
  select s into item from jsonb_array_elements(snap->'sessions') s where s->>'day'='2097-03-31';
  assert (item->>'minutes')::integer=120, 'Durations use elapsed time, including offset changes';
  update attendance_private.people set role='EMPLOYEE' where username='VIKTOR';
  snap:=attendance_private.gateway('after-hours-test','VIKTOR','snapshot','{}');
  assert snap#>'{after_hours,sessions}'='[]'::jsonb and not (snap#>>'{after_hours,can_view_reports}')::boolean, 'Viktor must retain owner role';
  assert not has_table_privilege('anon','attendance_private.after_hours_sessions','SELECT'), 'No anonymous table access';
  assert not has_table_privilege('authenticated','attendance_private.after_hours_sessions','SELECT'), 'No direct authenticated table access';
  assert not has_function_privilege('anon','attendance_private.after_hours_snapshot(text,integer,timestamptz)','EXECUTE'), 'No anonymous helper access';
  assert not has_function_privilege('authenticated','attendance_private.after_hours_snapshot(text,integer,timestamptz)','EXECUTE'), 'No authenticated helper access';
end;
$test$;
select 'After-hours work tests passed' as result;
rollback;
