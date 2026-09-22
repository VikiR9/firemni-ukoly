-- Run in a transaction after the migration. Every fixture is rolled back.
update attendance_private.settings set gateway_hash=encode(extensions.digest('push-test-only','sha256'),'hex');
update attendance_private.accounts set must_change_password=false where username in ('VIKTOR','NIKOLA');

do $test$
declare
 v_token text:=repeat('p',43); n_token text:=repeat('q',43);
 v_session uuid:=gen_random_uuid(); n_session uuid:=gen_random_uuid();
 v_sub uuid; n_sub uuid; n_sub2 uuid; v_task_id uuid:=gen_random_uuid();
 comment_id uuid:=gen_random_uuid(); r jsonb; batch jsonb; item jsonb; n integer;
begin
 insert into attendance_private.login_sessions(id,username,token_hash)
 values(v_session,'VIKTOR',encode(extensions.digest(v_token,'sha256'),'hex')),
       (n_session,'NIKOLA',encode(extensions.digest(n_token,'sha256'),'hex'));
 begin
  perform public.web_push_gateway('wrong',v_token,'status','{}');
  raise exception 'Wrong gateway secret was accepted';
 exception when invalid_authorization_specification then null;end;
 r:=public.web_push_gateway('push-test-only','bad-token','status','{}');
 assert (r->>'status')::int=401,'Invalid sessions are rejected';

 r:=public.web_push_gateway('push-test-only',v_token,'subscribe',jsonb_build_object('username','NIKOLA','endpoint','https://fcm.googleapis.com/fcm/send/push-test-v','p256dh',repeat('A',87),'auth',repeat('A',22)));
 v_sub:=(r->>'id')::uuid;
 assert r->>'username'='VIKTOR','Identity comes from session, never browser input';
 r:=public.web_push_gateway('push-test-only',n_token,'subscribe',jsonb_build_object('endpoint','https://web.push.apple.com/push-test-n','p256dh',repeat('A',87),'auth',repeat('A',22)));
 n_sub:=(r->>'id')::uuid;
 r:=public.web_push_gateway('push-test-only',n_token,'subscribe',jsonb_build_object('endpoint','https://fcm.googleapis.com/fcm/send/push-test-n2','p256dh',repeat('A',87),'auth',repeat('A',22)));
 n_sub2:=(r->>'id')::uuid;
 r:=public.web_push_gateway('push-test-only',v_token,'test',jsonb_build_object('subscription_id',n_sub));
 assert (r->>'status')::int=404,'Users cannot send tests to somebody else';

 perform public.account_task_action('push-test-only',v_token,'create',v_task_id,
  jsonb_build_object('title','Push test: never committed','priority','Medium','assignees',jsonb_build_array('Nikola'),'requires_approval',true));
 assert (select count(*) from push_private.deliveries where task_id=v_task_id and subscription_id in(n_sub,n_sub2))=2,'Assignment reaches both devices';
 assert not exists(select 1 from push_private.deliveries d where d.task_id=v_task_id and subscription_id=v_sub),'Creator not notified of own assignment';
 perform public.account_task_action('push-test-only',n_token,'comment',v_task_id,jsonb_build_object('id',comment_id,'note','Private task text must not appear in a push payload'));
 perform public.account_task_action('push-test-only',n_token,'comment',v_task_id,jsonb_build_object('id',comment_id,'note','Retry'));
 assert (select count(*) from push_private.deliveries where subscription_id=v_sub and kind='comment')=1,'Comment retries create only one notification per device';
 assert not exists(select 1 from push_private.deliveries where body like '%Private task text%'),'Notification previews omit private content';

 -- Isolate test fixtures from any existing deliveries without committing changes.
 update push_private.deliveries set available_at=now()+interval '1 day' where subscription_id not in(v_sub,n_sub,n_sub2);
 r:=public.web_push_gateway('push-test-only','', 'claim','{}'); batch:=r->'deliveries';
 assert jsonb_array_length(batch)=3,'Claim returns assignment and comment recipient devices';
 r:=public.web_push_gateway('push-test-only','', 'claim','{}');
 assert jsonb_array_length(r->'deliveries')=0,'Concurrent workers cannot claim the same delivery';
 item:=batch->0;
 perform public.web_push_gateway('push-test-only','','complete',jsonb_build_object('id',item->>'id','lease_id',gen_random_uuid(),'status',201));
 assert (select state from push_private.deliveries where id=(item->>'id')::uuid)='sending','Stale leases cannot finish messages';
 perform public.web_push_gateway('push-test-only','','complete',jsonb_build_object('id',item->>'id','lease_id',item->>'lease_id','status',503));
 assert (select state='pending' and available_at>now() from push_private.deliveries where id=(item->>'id')::uuid),'Transient errors retry later';
 item:=batch->1;
 perform public.web_push_gateway('push-test-only','','complete',jsonb_build_object('id',item->>'id','lease_id',item->>'lease_id','status',201));
 assert (select accepted_at is not null and displayed_at is null from push_private.deliveries where id=(item->>'id')::uuid),'Service acceptance is not reported as display';
 perform public.web_push_gateway('push-test-only','','receipt',jsonb_build_object('id',item->>'id','receipt_token',gen_random_uuid()));
 assert (select displayed_at is null from push_private.deliveries where id=(item->>'id')::uuid),'Forged receipt ignored';
 perform public.web_push_gateway('push-test-only','','receipt',jsonb_build_object('id',item->>'id','receipt_token',item->>'receipt_token'));
 assert (select displayed_at is not null from push_private.deliveries where id=(item->>'id')::uuid),'Device display is acknowledged separately';

 r:=public.web_push_gateway('push-test-only',n_token,'test',jsonb_build_object('subscription_id',n_sub));
 assert (r->>'queued')::boolean,'Delayed test is queued';
 assert exists(select 1 from push_private.deliveries where subscription_id=n_sub and kind='test' and available_at>now()),'Test leaves time to close the app';
 r:=public.web_push_gateway('push-test-only',n_token,'test',jsonb_build_object('subscription_id',n_sub));
 assert (r->>'status')::int=429,'Tests are rate limited';

 -- An owner/creator is only notified of completion when also an assignee.
 update public.task_assignments set status='DONE' where task_id=v_task_id and assignee='Nikola';
 assert not exists(select 1 from push_private.deliveries where task_id=v_task_id and kind='peer_completed'),'A single assignee produces no completion broadcast';
 insert into public.task_assignments(task_id,assignee,status,assigned_by) values(v_task_id,'Viktor','ACCEPTED','Viktor');
 update public.task_assignments set status='SUBMITTED_DONE' where task_id=v_task_id and assignee='Nikola';
 assert not exists(select 1 from push_private.deliveries where task_id=v_task_id and kind='peer_completed'),'Submission for review is not completion';
 update public.task_assignments set status='DONE' where task_id=v_task_id and assignee='Nikola';
 update public.task_assignments set status='DONE',updated_at=now() where task_id=v_task_id and assignee='Nikola';
 assert (select count(*) from push_private.deliveries where task_id=v_task_id and kind='peer_completed' and subscription_id=v_sub)=1,'A transition to DONE notifies the other assignee once';
 assert not exists(select 1 from push_private.deliveries where task_id=v_task_id and kind='peer_completed' and subscription_id in(n_sub,n_sub2)),'The completing assignee gets no own completion notification';
 perform public.account_gateway('push-test-only',n_token,'logout','{}');
 assert not exists(select 1 from push_private.subscriptions where session_id=n_session and enabled),'Logout disables every subscription for that login';
 assert not exists(select 1 from push_private.deliveries where subscription_id in(n_sub,n_sub2) and state in('pending','sending')),'Logout cancels queued deliveries';

 assert not has_table_privilege('anon','push_private.subscriptions','SELECT'),'Anonymous clients cannot read device secrets';
 assert not has_table_privilege('authenticated','push_private.deliveries','UPDATE'),'Clients cannot change delivery state directly';
 assert not has_function_privilege('anon','push_private.tick()','EXECUTE'),'Scheduler is private';
 assert has_function_privilege('anon','public.web_push_gateway(text,text,text,jsonb)','EXECUTE'),'Authenticated gateway is callable';
end $test$;

do $digests$
declare
 s1 uuid:=gen_random_uuid(); s2 uuid:=gen_random_uuid(); s3 uuid:=gen_random_uuid();
 device1 uuid:=gen_random_uuid(); device2 uuid:=gen_random_uuid(); device3 uuid:=gen_random_uuid();
 t1 uuid:=gen_random_uuid(); t2 uuid:=gen_random_uuid(); t3 uuid:=gen_random_uuid();
 t4 uuid:=gen_random_uuid(); t5 uuid:=gen_random_uuid(); t6 uuid:=gen_random_uuid(); t7 uuid:=gen_random_uuid();
begin
 insert into attendance_private.people(username,display_name,role) values
  ('PUSH_FIXTURE_A','Push fixture A','EMPLOYEE'),('PUSH_FIXTURE_B','Push fixture B','EMPLOYEE'),('PUSH_FIXTURE_OWNER','Push fixture owner','OWNER');
 insert into attendance_private.accounts(username,password_hash)
  select username,'not-a-usable-password-hash' from attendance_private.people where username like 'PUSH_FIXTURE_%';
 insert into attendance_private.login_sessions(id,username,token_hash) values
  (s1,'PUSH_FIXTURE_A',gen_random_uuid()::text),(s2,'PUSH_FIXTURE_B',gen_random_uuid()::text),(s3,'PUSH_FIXTURE_OWNER',gen_random_uuid()::text);
 insert into push_private.subscriptions(id,username,session_id,endpoint,p256dh,auth) values
  (device1,'PUSH_FIXTURE_A',s1,'https://fcm.googleapis.com/fcm/send/digest-fixture-a',repeat('A',87),repeat('A',22)),
  (device2,'PUSH_FIXTURE_B',s2,'https://fcm.googleapis.com/fcm/send/digest-fixture-b',repeat('A',87),repeat('A',22)),
  (device3,'PUSH_FIXTURE_OWNER',s3,'https://fcm.googleapis.com/fcm/send/digest-fixture-owner',repeat('A',87),repeat('A',22));
 insert into public.tasks(id,title,assignee,priority,due,status,created_by,archived_at) values
  (t1,'Fixture overdue A','Push fixture A','Medium','2030-07-19','ACCEPTED','Push fixture owner',null),
  (t2,'Fixture overdue shared','Push fixture A','Medium','2030-07-19','ACCEPTED','Push fixture owner',null),
  (t3,'Fixture today','Push fixture A','Medium','2030-07-20','ACCEPTED','Push fixture owner',null),
  (t4,'Fixture done','Push fixture A','Medium','2030-07-19','DONE','Push fixture owner',null),
  (t5,'Fixture archived','Push fixture A','Medium','2030-07-19','ACCEPTED','Push fixture owner',now()),
  (t6,'Fixture no due','Push fixture A','Medium',null,'ACCEPTED','Push fixture owner',null),
  (t7,'Fixture declined','Push fixture A','Medium','2030-07-19','ACCEPTED','Push fixture owner',null);
 insert into public.task_assignments(task_id,assignee,status) values
  (t1,'Push fixture A','ACCEPTED'),(t2,'Push fixture A','ACCEPTED'),(t2,'Push fixture B','ACCEPTED'),
  (t3,'Push fixture A','ACCEPTED'),(t4,'Push fixture A','DONE'),(t5,'Push fixture A','ACCEPTED'),
  (t6,'Push fixture A','ACCEPTED'),(t7,'Push fixture A','DECLINED');
 perform push_private.overdue_digest('2030-07-20 06:29:59+00');
 assert not exists(select 1 from push_private.deliveries where subscription_id=device1 and kind='overdue'),'No digest before 08:30 Prague';
 perform push_private.overdue_digest('2030-07-20 06:30:00+00');
 perform push_private.overdue_digest('2030-07-20 06:31:00+00');
 assert (select count(*) from push_private.deliveries where subscription_id=device1 and kind='overdue')=1,'Multiple tasks and repeated ticks produce one morning digest';
 assert exists(select 1 from push_private.deliveries where subscription_id=device1 and kind='overdue' and task_id is null and body like '%: 2.%'),'Only two own unfinished overdue tasks are counted';
 assert exists(select 1 from push_private.deliveries where subscription_id=device2 and kind='overdue' and body like '%: 1.%'),'The other assignee gets only their own task count';
 assert not exists(select 1 from push_private.deliveries where subscription_id=device3 and kind='overdue'),'Owners and creators get no digest for tasks assigned to others';
 perform push_private.overdue_digest('2030-07-20 10:00:00+00');
 assert (select count(*) from push_private.deliveries where subscription_id=device1 and kind='overdue')=1,'No midday extras';
 perform push_private.overdue_digest('2030-07-20 12:30:00+00');
 perform push_private.overdue_digest('2030-07-20 12:31:00+00');
 assert (select count(*) from push_private.deliveries where subscription_id=device1 and kind='overdue')=2,'One additional afternoon digest';
 perform push_private.overdue_digest('2030-01-20 07:29:59+00');
 update public.tasks set due='2030-01-19' where id in(t1,t2);
 perform push_private.overdue_digest('2030-01-20 07:30:00+00');
 assert exists(select 1 from push_private.deliveries where subscription_id=device1 and event_key='overdue:2030-01-20:08:30'),'Winter time also uses 08:30 Prague';
 update public.task_assignments set status='DONE' where task_id in(t1,t2);
 perform push_private.overdue_digest('2030-01-20 13:30:00+00');
 assert not exists(select 1 from push_private.deliveries where subscription_id in(device1,device2) and event_key='overdue:2030-01-20:14:30'),'No notification when nothing is overdue';
 assert not has_function_privilege('anon','push_private.overdue_digest(timestamptz)','EXECUTE'),'Arbitrary digest times are not available to clients';
end $digests$;
select 'Web Push database checks passed' as result;
