begin;
update attendance_private.settings set gateway_hash=encode(extensions.digest('settlement-test','sha256'),'hex');
do $$
declare aid uuid; snap jsonb; baseline integer; before_personal integer; denied boolean; budget_id uuid:=gen_random_uuid();
begin
 assert (select daily_hours*20=140 from attendance_private.people where username='KARINA');
 assert (select daily_hours*20=140 from attendance_private.people where username='VENDULA');
 assert (select daily_hours*20=180 from attendance_private.people where username='VIKTOR');
 insert into attendance_private.absences(username,day,status,explanation) values('KARINA','2024-01-10','SUBMITTED','Test') returning id into aid;
 insert into attendance_private.sessions(username,day,started_at,ended_at) values
 ('KARINA','2024-01-10','2024-01-10 08:40+01','2024-01-10 10:00+01'),
 ('KARINA','2024-01-10','2024-01-10 10:30+01','2024-01-10 15:30+01');
 before_personal:=attendance_private.personal_minutes('KARINA',2024);
 perform attendance_private.gateway('settlement-test','VIKTOR','review_excuse',jsonb_build_object('id',aid,'decision','EXCUSED','year',2024,'team',true));
 assert (select count(*)=2 from attendance_private.requests where source_absence_id=aid and status='APPROVED'), 'Two exact gap intervals';
 assert attendance_private.personal_minutes('KARINA',2024)=before_personal+40, 'Approved excuse adds 40 personal minutes';
 assert attendance_private.absence_minutes('KARINA','2024-01-10',now())=0, 'No absence remains after personal conversion';
 assert (select excused_minutes=40 from attendance_private.absences where id=aid), 'Original duration retained';
 denied:=false;begin perform attendance_private.gateway('settlement-test','VIKTOR','review_excuse',jsonb_build_object('id',aid,'decision','EXCUSED'));exception when others then denied:=true;end;
 assert denied, 'No double approval';
 perform attendance_private.gateway('settlement-test','MILAN','reverse_excuse',jsonb_build_object('id',aid,'note','Test reversal'));
 assert attendance_private.personal_minutes('KARINA',2024)=before_personal, 'Reversal removes personal credit';
 assert attendance_private.absence_minutes('KARINA','2024-01-10',now())=40, 'Reversal reopens gaps';
 baseline:=attendance_private.vacation_remaining('KARINA',2024);
 denied:=false;begin perform attendance_private.gateway('settlement-test','KARINA','deduct_vacation',jsonb_build_object('id',aid,'expected_minutes',40));exception when others then denied:=true;end;
 assert denied, 'Employee cannot deduct';
 denied:=false;begin perform attendance_private.gateway('settlement-test','VIKTOR','deduct_vacation',jsonb_build_object('id',aid,'expected_minutes',41));exception when others then denied:=true;end;
 assert denied, 'Stale amount rejected';
 perform attendance_private.gateway('settlement-test','VIKTOR','deduct_vacation',jsonb_build_object('id',aid,'expected_minutes',40));
 assert attendance_private.vacation_remaining('KARINA',2024)=baseline-40, 'Minute-precise holiday debit';
 perform attendance_private.gateway('settlement-test','VIKTOR','deduct_vacation',jsonb_build_object('id',aid,'expected_minutes',40));
 assert attendance_private.vacation_remaining('KARINA',2024)=baseline-40, 'Idempotent debit';
 assert attendance_private.personal_minutes('KARINA',2024)=before_personal, 'Vacation debit is not personal leave';
 perform attendance_private.gateway('settlement-test','MILAN','reverse_deduction',jsonb_build_object('id',aid,'note','Test reversal'));
 assert attendance_private.vacation_remaining('KARINA',2024)=baseline, 'Vacation debit refunded';
 insert into attendance_private.requests(id,username,kind,date_from,date_to,status) values(budget_id,'KARINA','VACATION','2024-01-02','2024-01-29','PENDING');
 assert attendance_private.vacation_remaining('KARINA',2024)=0, 'Pending vacation reserves hourly budget';
 denied:=false;begin perform attendance_private.gateway('settlement-test','VIKTOR','deduct_vacation',jsonb_build_object('id',aid,'expected_minutes',40));exception when others then denied:=true;end;
 assert denied, 'Insufficient balance rejected';
 delete from attendance_private.requests where id=budget_id;
 insert into attendance_private.home_days(username,day) values('KARINA','2024-01-10');
 assert attendance_private.worked_minutes('KARINA','2024-01-10',now())=380, '6h20 worked against 7h target';
 update attendance_private.absences set status='OPEN',explanation=null where id=aid;
 denied:=false;begin perform attendance_private.gateway('settlement-test','KARINA','grant_personal',jsonb_build_object('id',aid));exception when others then denied:=true;end;
 assert denied, 'Employee cannot directly grant personal leave';
 perform attendance_private.gateway('settlement-test','VIKTOR','grant_personal',jsonb_build_object('id',aid,'note','Direct owner resolution'));
 assert attendance_private.absence_minutes('KARINA','2024-01-10',now())=0, 'Direct personal resolution covers gap without employee submission';
 assert (select excused_minutes=40 from attendance_private.absences where id=aid), 'Direct resolution records exact duration';
 -- Exactly five days does not exceed threshold; the next minute does.
 insert into attendance_private.requests(username,kind,date_from,date_to,time_from,time_to,status)
 select 'VENDULA','PERSONAL',d::date,d::date,'08:30','15:30','APPROVED' from generate_series('2024-01-02'::date,'2024-01-08'::date,'1 day') d where attendance_private.business_day(d::date);
 assert attendance_private.personal_minutes('VENDULA',2024)=2100, '5 x 7 hours';
 insert into attendance_private.requests(username,kind,date_from,date_to,time_from,time_to,status) values('VENDULA','PERSONAL','2024-01-09','2024-01-09','08:30','08:31','APPROVED');
 assert attendance_private.personal_minutes('VENDULA',2024)>2100, 'Threshold exceeded after minute';
 assert attendance_private.personal_minutes('VENDULA',2025)=0, 'New calendar year starts at zero';
 snap:=attendance_private.gateway('settlement-test','VENDULA','snapshot','{"year":2024}');
 assert jsonb_array_length(snap->'personal_totals')=1, 'Employee totals remain private';
 assert (snap->'personal_totals'->0->>'minutes')::int=2101, 'Alert total returned';
end $$;
select 'Attendance settlement assertions passed' as result;
rollback;
