begin;
update attendance_private.settings set gateway_hash=encode(extensions.digest('inbox-test','sha256'),'hex') where true;
do $$
declare b jsonb; pid uuid; cid uuid; tid uuid:=gen_random_uuid(); bad boolean;
begin
 perform public.task_workspace('create','Viktor',tid,jsonb_build_object('title','Doručený úkol','assignees',jsonb_build_array('Viktor','Karina'),'priority','Medium','requires_approval',false));
 assert (select status='ACCEPTED' and assigned_by='Viktor' from public.task_assignments where task_id=tid and assignee='Viktor'), 'Self assignment bypasses inbox';
 assert (select status='PENDING_ACCEPT' and assigned_by='Viktor' from public.task_assignments where task_id=tid and assignee='Karina'), 'Other assignee waits in inbox';
 b:=public.task_board_gateway('inbox-test','KARINA','create_project','{"title":"Moje příchozí úkoly"}');pid:=(b->>'project_id')::uuid;cid:=(b->'columns'->1->>'id')::uuid;
 bad:=false;begin perform public.task_board_gateway('inbox-test','KARINA','accept_task',jsonb_build_object('project_id',pid,'column_id',gen_random_uuid(),'task_id',tid,'revision',b->'revision'));exception when others then bad:=true;end;
 assert bad and (select status='PENDING_ACCEPT' from public.task_assignments where task_id=tid and assignee='Karina'), 'Invalid destination preserves pending status';
 bad:=false;begin perform public.task_board_gateway('inbox-test','VIKTOR','accept_task',jsonb_build_object('project_id',pid,'column_id',cid,'task_id',tid,'revision',b->'revision'));exception when others then bad:=true;end; assert bad, 'Owner cannot accept for colleague';
 b:=public.task_board_gateway('inbox-test','KARINA','accept_task',jsonb_build_object('project_id',pid,'column_id',cid,'task_id',tid,'revision',b->'revision'));
 assert (select status='ACCEPTED' from public.task_assignments where task_id=tid and assignee='Karina'), 'Accepted';
 assert (select column_id=cid from task_board_private.project_placements where project_id=pid and task_id=tid), 'Placed in selected column atomically';
 bad:=false;begin perform public.task_board_gateway('inbox-test','KARINA','accept_task',jsonb_build_object('project_id',pid,'column_id',cid,'task_id',tid,'revision',b->'revision'));exception when others then bad:=true;end;assert bad, 'Repeat acceptance rejected';
 assert (select count(*)=1 from task_board_private.project_placements where project_id=pid and task_id=tid), 'No duplicate placement';
end $$;
select 'Inbox assertions passed; rolled back' as result;
rollback;
