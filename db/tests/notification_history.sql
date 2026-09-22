-- Run after migrations inside BEGIN / ROLLBACK. No real pushes are sent.
update attendance_private.settings set gateway_hash=encode(extensions.digest('history-test-only','sha256'),'hex') where id=true;
update attendance_private.accounts set must_change_password=false where username in ('VIKTOR','NIKOLA');

do $events$
declare tid uuid:=gen_random_uuid(); comment_id uuid:=gen_random_uuid();
 v_token text:=repeat('v',43); n_token text:=repeat('n',43);
begin
 insert into attendance_private.login_sessions(username,token_hash) values
 ('VIKTOR',encode(extensions.digest(v_token,'sha256'),'hex')),('NIKOLA',encode(extensions.digest(n_token,'sha256'),'hex'));
 perform public.account_task_action('history-test-only',v_token,'create',tid,
  jsonb_build_object('title','Notification history fixture','priority','Medium','assignees',jsonb_build_array('Nikola','Miloš'),'requires_approval',false));
 assert (select count(*) from push_private.notifications where task_id=tid and kind='assigned')=2,'One history entry per assignee regardless of devices';
 update public.task_assignments set assigned_by='Milan' where task_id=tid and assignee='Nikola';
 perform public.account_task_action('history-test-only',n_token,'transition',tid,
  jsonb_build_object('assignee','Nikola','status','ACCEPTED','expected_status','PENDING_ACCEPT'));
 assert (select count(*) from push_private.notifications where task_id=tid and kind='accepted' and username='VIKTOR')=1,'Acceptance notifies the original creator';
 assert not exists(select 1 from push_private.notifications where task_id=tid and kind='accepted' and username<>'VIKTOR'),'No acceptance message to the accepting person, other assignees, or later assigner';
 update public.task_assignments set status='ACCEPTED' where task_id=tid and assignee='Nikola';
 assert (select count(*) from push_private.notifications where task_id=tid and kind='accepted')=1,'An unchanged status does not repeat acceptance';
 perform public.account_task_action('history-test-only',n_token,'comment',tid,jsonb_build_object('id',comment_id,'note','Private customer text not shown on lock screen'));
 perform public.account_task_action('history-test-only',n_token,'comment',tid,jsonb_build_object('id',comment_id,'note','Retry'));
 assert (select count(*) from push_private.notifications where task_id=tid and kind='comment')=2,'Creator and other assignee receive one comment update';
 assert not exists(select 1 from push_private.notifications where task_id=tid and kind='comment' and username='NIKOLA'),'Comment author is excluded';
 assert not exists(select 1 from push_private.deliveries where task_id=tid and body like '%Private customer text%'),'Comment text stays off lock screens';
 perform public.account_task_action('history-test-only',v_token,'edit',tid,
  jsonb_build_object('title','Changed notification fixture','priority','High','assignees',jsonb_build_array('Nikola','Miloš','Karina'),'requires_approval',false));
 assert (select count(*) from push_private.notifications where task_id=tid and kind='task_updated')=2,'Existing assignees get the changed task';
 assert (select count(*) from push_private.notifications where task_id=tid and username='KARINA')=1,'New assignee gets one new-task message, not an additional edit message';
 assert not exists(select 1 from push_private.notifications where task_id=tid and kind='task_updated' and username='VIKTOR'),'Editor does not get their own edit';
 perform public.account_task_action('history-test-only',n_token,'transition',tid,
  jsonb_build_object('assignee','Nikola','status','IN_PROGRESS','expected_status','ACCEPTED'));
 assert exists(select 1 from push_private.notifications where task_id=tid and kind='task_updated' and username='VIKTOR'),'Creator receives a status change';
 perform public.account_task_action('history-test-only',n_token,'transition',tid,
  jsonb_build_object('assignee','Nikola','status','DONE','expected_status','IN_PROGRESS'));
 assert (select count(*) from push_private.notifications where task_id=tid and kind='peer_completed')=2,'Completion still notifies only the other two assignees';
 assert not exists(select 1 from push_private.notifications where task_id=tid and kind='peer_completed' and username in('VIKTOR','NIKOLA')),'Creator outside the assignment and completer do not get the peer completion';
 perform public.account_task_action('history-test-only',v_token,'archive',tid,'{}');
 assert (select count(*) from push_private.notifications where task_id=tid and title='Úkol byl archivován')=3,'Archiving notifies the affected assignees';
 perform public.account_task_action('history-test-only',v_token,'restore',tid,'{}');
 assert (select count(*) from push_private.notifications where task_id=tid and title='Úkol byl obnoven')=3,'Restoring notifies the affected assignees';
end $events$;

do $history$
declare
 a_token text:=repeat('a',43); b_token text:=repeat('b',43); a_session uuid:=gen_random_uuid();
 r jsonb; page2 jsonb; a_id uuid; b_id uuid; future_id uuid; tid uuid:=gen_random_uuid(); old_time timestamptz;
begin
 insert into attendance_private.people(username,display_name,role) values('HISTORY_A','History A','EMPLOYEE'),('HISTORY_B','History B','EMPLOYEE');
 insert into attendance_private.accounts(username,password_hash,must_change_password) values('HISTORY_A','no-password',false),('HISTORY_B','no-password',false);
 insert into attendance_private.login_sessions(id,username,token_hash) values
 (a_session,'HISTORY_A',encode(extensions.digest(a_token,'sha256'),'hex')),(gen_random_uuid(),'HISTORY_B',encode(extensions.digest(b_token,'sha256'),'hex'));
 insert into public.tasks(id,title,created_by) values(tid,'History fixture title','History A');
 perform push_private.enqueue(array['History A'],null,tid,'assigned','history-device-test','Test','Test');
 perform push_private.enqueue(array['History A'],null,tid,'assigned','history-device-test','Test','Test');
 assert (select count(*) from push_private.notifications where username='HISTORY_A')=1,'History is recorded without push permission and deduplicated';
 assert not exists(select 1 from push_private.deliveries d join push_private.subscriptions s on s.id=d.subscription_id where s.username='HISTORY_A'),'No device is required for history';
 select id into a_id from push_private.notifications where username='HISTORY_A';
 perform push_private.enqueue(array['History B'],null,tid,'assigned','history-b','Test B','Test B');
 select id into b_id from push_private.notifications where username='HISTORY_B';
 r:=public.task_notification_history('history-test-only',a_token,'list',jsonb_build_object('username','HISTORY_B'));
 assert jsonb_array_length(r->'items')=1 and r->'items'->0->>'id'=a_id::text,'History is scoped by verified session, not browser username';
 assert r->'items'->0->>'task_title'='History fixture title','Accessible task is linked from history';
 r:=public.task_notification_history('history-test-only',b_token,'list','{}');
 assert r->'items'->0->>'url' is null and r->'items'->0->>'task_title' is null,'History does not expose a task no longer accessible';
 perform public.task_notification_history('history-test-only',a_token,'read',jsonb_build_object('id',b_id));
 assert (select read_at is null from push_private.notifications where id=b_id),'Reading another user notification has no effect';
 perform public.task_notification_history('history-test-only',a_token,'read',jsonb_build_object('id',a_id));
 select read_at into old_time from push_private.notifications where id=a_id;
 perform public.task_notification_history('history-test-only',a_token,'read',jsonb_build_object('id',a_id));
 assert (select read_at=old_time from push_private.notifications where id=a_id),'Repeated read preserves the original read time';
 insert into push_private.notifications(username,event_key,kind,title,body)
 select 'HISTORY_A','history-page-'||i,'comment','History page '||i,'Test' from generate_series(1,35) i;
 r:=public.task_notification_history('history-test-only',a_token,'list','{}');
 assert jsonb_array_length(r->'items')=30 and r->'next_cursor' is not null,'First page has a cursor';
 page2:=public.task_notification_history('history-test-only',a_token,'list',r->'next_cursor');
 assert jsonb_array_length(page2->'items')=6 and page2->>'next_cursor' is null,'Second page returns the remaining entries';
 assert not exists(select 1 from jsonb_array_elements(r->'items') a join jsonb_array_elements(page2->'items') b on a->>'id'=b->>'id'),'Pagination has no repeated records';
 insert into push_private.notifications(username,event_key,kind,title,body) values('HISTORY_A','after-page','comment','Newer notice','Test') returning id into future_id;
 perform public.task_notification_history('history-test-only',a_token,'read_all',jsonb_build_object('through',r->>'as_of'));
 assert (select read_at is null from push_private.notifications where id=future_id),'Mark all does not read a notification that arrived after opening the list';
 r:=public.task_notification_history('history-test-only',a_token,'count','{}');
 assert (r->>'unread_count')::int=1,'Unread count is shared across devices';
 assert (select read_at is null from push_private.notifications where id=b_id),'Mark all does not affect another account';
 r:=public.task_notification_history('history-test-only','invalid','list','{}');
 assert (r->>'status')::int=401,'History rejects invalid sessions';
 begin
  perform public.task_notification_history('invalid',a_token,'list','{}');
  raise exception 'Wrong secret accepted';
 exception when invalid_authorization_specification then null;end;
 perform public.account_gateway('history-test-only',a_token,'logout','{}');
 r:=public.task_notification_history('history-test-only',a_token,'list','{}');
 assert (r->>'status')::int=401,'Revoked sessions cannot read history';
 assert not has_table_privilege('anon','push_private.notifications','SELECT'),'History table is private';
 assert not has_table_privilege('authenticated','push_private.notifications','UPDATE'),'Read state cannot be spoofed directly';
end $history$;
select 'Task notification history checks passed' as result;
