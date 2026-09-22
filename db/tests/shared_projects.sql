begin;
update attendance_private.settings set gateway_hash=encode(extensions.digest('shared-test','sha256'),'hex') where true;
do $$
declare a jsonb; b jsonb; pid uuid; cid uuid; tid uuid:=gen_random_uuid(); denied boolean;
begin
 a:=public.task_board_gateway('shared-test','KARINA','create_project','{"title":"Společná práce","member_usernames":["VENDULA","LUKAS"]}');
 pid:=(a->>'project_id')::uuid;cid:=(a->'columns'->0->>'id')::uuid;
 assert (select member_usernames @> array['VENDULA','LUKAS'] from task_board_private.projects where id=pid);
 b:=public.task_board_gateway('shared-test','VENDULA','snapshot',jsonb_build_object('project_id',pid));
 assert (b->>'can_edit_columns')::boolean;
 b:=public.task_board_gateway('shared-test','LUKAS','snapshot','{}');
 assert exists(select 1 from jsonb_array_elements(b->'projects') p where p->>'id'=pid::text);
 denied:=false;begin perform public.task_board_gateway('shared-test','NIKOLA','snapshot',jsonb_build_object('project_id',pid));exception when others then denied:=true;end;assert denied;
 a:=public.task_board_gateway('shared-test','KARINA','create_task',jsonb_build_object('project_id',pid,'column_id',cid,'task_id',tid,'draft',jsonb_build_object('title','Týmový úkol','assignees',jsonb_build_array('Karina'),'priority','Medium')));
 a:=public.task_board_gateway('shared-test','VENDULA','move_task',jsonb_build_object('project_id',pid,'column_id',cid,'task_id',tid,'revision',a->'revision'));
 a:=public.task_board_gateway('shared-test','VENDULA','rename_column',jsonb_build_object('project_id',pid,'column_id',cid,'title','Tým','revision',a->'revision'));
 perform public.task_workspace('comment','Vendula',tid,'{"note":"Komentář člena projektu"}');
 assert exists(select 1 from public.task_updates where task_id=tid and author='Vendula');
 denied:=false;begin perform public.task_board_gateway('shared-test','VENDULA','rename_project',jsonb_build_object('project_id',pid,'title','Cizí změna','member_usernames',jsonb_build_array('NIKOLA'),'revision',a->'revision'));exception when others then denied:=true;end;assert denied;
 denied:=false;begin perform public.task_board_gateway('shared-test','KARINA','rename_project',jsonb_build_object('project_id',pid,'title','Chyba','member_usernames',jsonb_build_array('UNKNOWN'),'revision',a->'revision'));exception when others then denied:=true;end;assert denied;
 a:=public.task_board_gateway('shared-test','KARINA','rename_project',jsonb_build_object('project_id',pid,'title','Společná práce','member_usernames',jsonb_build_array('LUKAS'),'revision',a->'revision'));
 denied:=false;begin perform public.task_board_gateway('shared-test','VENDULA','snapshot',jsonb_build_object('project_id',pid));exception when others then denied:=true;end;assert denied;
 denied:=false;begin perform public.task_workspace('comment','Vendula',tid,'{"note":"Po odebrání"}');exception when others then denied:=true;end;assert denied;
 assert exists(select 1 from public.tasks where id=tid), 'Removing membership preserves tasks';
end $$;
rollback;
