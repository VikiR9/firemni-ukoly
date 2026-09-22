begin;
update attendance_private.settings set gateway_hash=encode(extensions.digest('availability-test','sha256'),'hex');
insert into attendance_private.people(username,display_name,role,daily_hours) values
 ('AVAIL_TEST','Availability test','EMPLOYEE',8);
do $test$
declare snap jsonb; item jsonb; denied boolean:=false;
begin
 snap:=attendance_private.availability('2097-02-04 10:00+01');
 select p into item from jsonb_array_elements(snap->'people') p where p->>'username'='AVAIL_TEST';
 assert item->>'status'='OFFICE' and (item->>'online')::boolean, 'Office is automatically online';
 insert into attendance_private.home_days(username,day) values('AVAIL_TEST','2097-02-04');
 select p into item from jsonb_array_elements(attendance_private.availability('2097-02-04 10:00+01')->'people') p where p->>'username'='AVAIL_TEST';
 assert item->>'status'='HOME_OFFLINE' and not (item->>'online')::boolean, 'Home office starts offline';
 insert into attendance_private.sessions(username,day,started_at) values('AVAIL_TEST','2097-02-04','2097-02-04 09:00+01');
 select p into item from jsonb_array_elements(attendance_private.availability('2097-02-04 10:00+01')->'people') p where p->>'username'='AVAIL_TEST';
 assert item->>'status'='HOME_ONLINE' and (item->>'online')::boolean, 'Started home office is online';
 insert into attendance_private.requests(username,kind,date_from,date_to,status,time_from,time_to,vacation_part)
 values('AVAIL_TEST','VACATION','2097-02-04','2097-02-04','APPROVED','08:30','12:30','AM');
 select p into item from jsonb_array_elements(attendance_private.availability('2097-02-04 10:00+01')->'people') p where p->>'username'='AVAIL_TEST';
 assert item->>'status'='OFFLINE', 'Half-day leave overrides active home office';
 select p into item from jsonb_array_elements(attendance_private.availability('2097-02-04 12:30+01')->'people') p where p->>'username'='AVAIL_TEST';
 assert item->>'status'='HOME_ONLINE', 'Half-day leave ends at its time boundary';
 update attendance_private.requests set vacation_part=null,time_from=null,time_to=null where username='AVAIL_TEST';
 select p into item from jsonb_array_elements(attendance_private.availability('2097-02-04 15:00+01')->'people') p where p->>'username'='AVAIL_TEST';
 assert item->>'status'='OFFLINE', 'Full day leave overrides work';
 update attendance_private.requests set status='CANCELLED' where username='AVAIL_TEST';
 insert into attendance_private.requests(username,kind,date_from,date_to,status,time_from,time_to)
 values('AVAIL_TEST','PERSONAL','2097-02-04','2097-02-04','APPROVED','14:00','15:00');
 select p into item from jsonb_array_elements(attendance_private.availability('2097-02-04 14:00+01')->'people') p where p->>'username'='AVAIL_TEST';
 assert item->>'status'='OFFLINE', 'Personal leave starts exactly at its boundary';
 update attendance_private.sessions set ended_at='2097-02-04 15:00+01' where username='AVAIL_TEST';
 select p into item from jsonb_array_elements(attendance_private.availability('2097-02-04 15:00+01')->'people') p where p->>'username'='AVAIL_TEST';
 assert item->>'status'='HOME_OFFLINE', 'Checkout immediately makes home office offline';
 insert into attendance_private.home_days(username,day) values('AVAIL_TEST','2097-02-05');
 select p into item from jsonb_array_elements(attendance_private.availability('2097-02-05 10:00+01')->'people') p where p->>'username'='AVAIL_TEST';
 assert item->>'status'='HOME_OFFLINE', 'Previous day session never activates today';
 select p into item from jsonb_array_elements(attendance_private.availability('2097-12-25 10:00+01')->'people') p where p->>'username'='AVAIL_TEST';
 assert item->>'status'='OFFLINE', 'Holiday is offline';
 snap:=attendance_private.gateway('availability-test','AVAIL_TEST','availability','{}');
 assert jsonb_array_length(snap->'people')=(select count(*) from attendance_private.people), 'Every employee can see all colleagues';
 assert (select count(*)=2 from jsonb_object_keys(snap)), 'No private snapshot data';
 assert not exists(select 1 from jsonb_array_elements(snap->'people') p where p-'username'-'display_name'-'status'-'online'<>'{}'::jsonb), 'Only public availability fields';
 begin
  perform attendance_private.gateway('wrong-secret','AVAIL_TEST','availability','{}');
 exception when invalid_authorization_specification then denied:=true;
 end;
 assert denied, 'Gateway secret is required';
 assert not has_function_privilege('anon','attendance_private.availability(timestamptz)','EXECUTE'), 'No direct access to private helper';
end;
$test$;
rollback;
