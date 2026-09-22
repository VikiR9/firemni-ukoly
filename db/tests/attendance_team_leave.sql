begin;
-- Tests run in a rollback transaction, including gateway configuration.
update attendance_private.settings set gateway_hash=encode(extensions.digest('team-leave-test','sha256'),'hex');
do $test$
declare v_id uuid:=gen_random_uuid(); own_id uuid:=gen_random_uuid(); blocked boolean; test_actor text; payload jsonb;
begin
 payload:=jsonb_build_object('target_username','KARINA','year',2097,'team',true,'id',v_id,'kind','VACATION','date_from','2097-02-04','date_to','2097-02-04');
 foreach test_actor in array array['MILAN','NIKOLA'] loop
  blocked:=false;
  begin perform attendance_private.gateway('team-leave-test',test_actor,'request',payload); exception when others then blocked:=true;end;
  assert blocked,'Only Viktor can create colleague leave';
 end loop;
 perform attendance_private.gateway('team-leave-test','VIKTOR','request',payload);
 assert (select username='KARINA' and status='APPROVED' and reviewer='VIKTOR' from attendance_private.requests where id=v_id),'Colleague vacation approved';
 assert attendance_private.vacation_remaining('KARINA',2097)=19*7*60,'Target daily hours';
 assert exists(select 1 from attendance_private.events where record_id=v_id and actor='VIKTOR' and username='KARINA'),'Audit actor distinct from colleague';
 perform attendance_private.gateway('team-leave-test','VIKTOR','request',payload);
 assert (select count(*)=1 from attendance_private.requests where id=v_id),'Retry idempotence';
 blocked:=false;
 begin perform attendance_private.gateway('team-leave-test','VIKTOR','request',payload||jsonb_build_object('id',gen_random_uuid()));exception when others then blocked:=true;end;
 assert blocked,'Overlapping vacation rejected';
 perform attendance_private.gateway('team-leave-test','VIKTOR','request',jsonb_build_object('id',own_id,'kind','VACATION','date_from','2097-02-04','date_to','2097-02-04'));
 assert (select status='PENDING' from attendance_private.requests where id=own_id),'Own request still needs approval';
 perform attendance_private.gateway('team-leave-test','VIKTOR','request',payload||jsonb_build_object('id',gen_random_uuid(),'kind','PERSONAL','date_from','2097-02-05','date_to','2097-02-05','time_from','10:00','time_to','11:00'));
 assert exists(select 1 from attendance_private.requests where username='KARINA' and kind='PERSONAL' and date_from='2097-02-05' and reviewer='VIKTOR' and status='APPROVED'),'Personal leave created';
 perform attendance_private.gateway('team-leave-test','VIKTOR','home_plan','{"target_username":"KARINA","year":2097,"week":"2097-02-04","days":["2097-02-06"]}');
 assert exists(select 1 from attendance_private.home_days where username='KARINA' and day='2097-02-06'),'Colleague home office';
 assert not exists(select 1 from attendance_private.home_days where username='VIKTOR' and day='2097-02-06'),'Own home office unaffected';
 blocked:=false;
 begin perform attendance_private.gateway('team-leave-test','VIKTOR','home_plan','{"target_username":"KARINA","year":2097,"week":"2097-02-04","days":["2097-02-04"]}');exception when others then blocked:=true;end;
 assert blocked,'Home office vacation collision';
 perform attendance_private.gateway('team-leave-test','VIKTOR','set_vacation_balance','{"target_username":"KARINA","year":2097,"remaining_days":12.5}');
 perform attendance_private.gateway('team-leave-test','VIKTOR','set_vacation_balance','{"target_username":"KARINA","year":2097,"remaining_days":12.5}');
 assert attendance_private.vacation_remaining('KARINA',2097)=5250,'Absolute balance, repeated safely';
 assert attendance_private.vacation_remaining('KARINA',2096)=8400,'Other years unaffected';
 blocked:=false;
 begin perform attendance_private.gateway('team-leave-test','MILAN','set_vacation_balance','{"target_username":"KARINA","year":2097,"remaining_days":2}');exception when others then blocked:=true;end;
 assert blocked,'Balance permission';
 blocked:=false;
 begin perform attendance_private.gateway('team-leave-test','VIKTOR','request',payload||jsonb_build_object('id',gen_random_uuid(),'date_from','2097-03-01','date_to','2097-03-31'));exception when others then blocked:=true;end;
 assert blocked,'Insufficient vacation rejected';
end $test$;
select 'Team leave tests passed' as result;
rollback;
