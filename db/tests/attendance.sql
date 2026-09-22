-- Integration assertions; all fixtures and the temporary gateway key roll back.
begin;
update attendance_private.settings set gateway_hash=encode(extensions.digest('attendance-test-only','sha256'),'hex');
do $$
declare r jsonb; id1 uuid:=gen_random_uuid(); id2 uuid:=gen_random_uuid(); aid uuid; rejected boolean; wk date; today date:=(now() at time zone 'Europe/Prague')::date;
begin
 assert attendance_private.workdays('2026-04-03','2026-04-06')=0, 'Easter holidays';
 assert attendance_private.absence_minutes('KARINA','2025-09-09','2025-09-09 20:00+02')=420, '7 hour cap';
 assert attendance_private.absence_minutes('VIKTOR','2025-09-09','2025-09-09 20:00+02')=540, '9 hour cap';
 insert into attendance_private.sessions(username,day,started_at,ended_at) values
 ('KARINA','2025-09-09','2025-09-09 08:40+02','2025-09-09 10:00+02'),
 ('KARINA','2025-09-09','2025-09-09 10:30+02','2025-09-09 15:30+02');
 assert attendance_private.absence_minutes('KARINA','2025-09-09','2025-09-09 20:00+02')=40, 'Late arrival plus checkout gap';
 r:=attendance_private.gateway('attendance-test-only','KARINA','request',jsonb_build_object('id',id1,'kind','PERSONAL','date_from','2025-09-09','date_to','2025-09-09','time_from','10:00','time_to','10:30'));
 assert (select status='APPROVED' from attendance_private.requests where id=id1), 'Personal leave automatically recorded';
 assert attendance_private.absence_minutes('KARINA','2025-09-09','2025-09-09 20:00+02')=10, 'Personal leave excludes gap';
 rejected:=false;begin perform attendance_private.gateway('wrong','VIKTOR','snapshot','{}');exception when others then rejected:=true;end;
 assert rejected, 'Wrong gateway key rejected';
 rejected:=false;begin perform attendance_private.gateway('attendance-test-only','KARINA','snapshot','{"team":true}');exception when others then rejected:=true;end;
 assert rejected, 'Employee cannot read team';
 r:=attendance_private.gateway('attendance-test-only','KARINA','snapshot','{}');
 assert jsonb_array_length(r->'people')=1, 'Own scope';
 wk:='2098-02-03'::date;
 while not (attendance_private.workdays(wk,wk+4)=5 and extract(isodow from wk)=1) loop wk:=wk+1;end loop;
 perform attendance_private.gateway('attendance-test-only','KARINA','home_plan',jsonb_build_object('week',wk,'days',jsonb_build_array(wk,wk+1,wk+2,wk+3,wk+4)));
 assert (select count(*)=5 from attendance_private.home_days where username='KARINA' and day between wk and wk+4), 'Five HO days allowed';
 perform attendance_private.gateway('attendance-test-only','KARINA','home_plan',jsonb_build_object('week',date_trunc('week',today)::date,'days','[]'::jsonb));
 perform attendance_private.gateway('attendance-test-only','KARINA','home_plan',jsonb_build_object('week',wk,'days','[]'::jsonb));
 insert into attendance_private.home_days(username,day) values('NIKOLA',today) on conflict do nothing;
 perform attendance_private.gateway('attendance-test-only','NIKOLA','checkin','{"started_at":"2000-01-01"}');
 perform attendance_private.gateway('attendance-test-only','NIKOLA','checkin','{}');
 assert (select count(*)=1 from attendance_private.sessions where username='NIKOLA' and day=today and ended_at is null), 'Checkin idempotence';
 assert (select started_at>now()-interval '1 minute' from attendance_private.sessions where username='NIKOLA' and day=today and ended_at is null), 'Server timestamp';
 perform attendance_private.gateway('attendance-test-only','NIKOLA','checkout','{}');
 assert not exists(select 1 from attendance_private.sessions where username='NIKOLA' and day=today and ended_at is null), 'Checkout closes interval';
 perform attendance_private.gateway('attendance-test-only','NIKOLA','checkin','{}');
 assert (select count(*)=2 from attendance_private.sessions where username='NIKOLA' and day=today), 'Second work interval';
 insert into attendance_private.absences(username,day) values('KARINA','2025-09-09') on conflict do nothing;
 select id into aid from attendance_private.absences where username='KARINA' and day='2025-09-09';
 perform attendance_private.gateway('attendance-test-only','VIKTOR','ask_excuse',jsonb_build_object('id',aid));
 perform attendance_private.gateway('attendance-test-only','KARINA','submit_excuse',jsonb_build_object('id',aid,'note','Test explanation'));
 perform attendance_private.gateway('attendance-test-only','MILAN','review_excuse',jsonb_build_object('id',aid,'decision','EXCUSED'));
 assert (select status='EXCUSED' from attendance_private.absences where id=aid), 'Excuse workflow';
 -- Future year avoids pre-existing employee records and backdating restrictions.
 perform attendance_private.gateway('attendance-test-only','KARINA','request',jsonb_build_object('id',id2,'kind','VACATION','date_from','2090-01-02','date_to','2090-01-27'));
 rejected:=false;begin perform attendance_private.gateway('attendance-test-only','KARINA','request',jsonb_build_object('id',gen_random_uuid(),'kind','VACATION','date_from','2090-02-01','date_to','2090-02-28'));exception when others then rejected:=true;end;
 assert rejected, 'Vacation budget includes pending requests';
 rejected:=false;begin perform attendance_private.gateway('attendance-test-only','NIKOLA','review_request',jsonb_build_object('id',id2,'decision','APPROVED'));exception when others then rejected:=true;end;
 assert rejected, 'Only owner approves vacation';
 perform attendance_private.gateway('attendance-test-only','VIKTOR','review_request',jsonb_build_object('id',id2,'decision','APPROVED'));
 assert (select status='APPROVED' from attendance_private.requests where id=id2), 'Vacation approval';
end $$;
select 'Attendance assertions passed; fixtures rolled back' as result;
rollback;
