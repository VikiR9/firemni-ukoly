alter table public.task_assignments add column assigned_by text;
update public.task_assignments a set assigned_by=t.created_by from public.tasks t where t.id=a.task_id;
do $migration$
declare body text;
begin
 body:=pg_get_functiondef('public.task_workspace(text,text,uuid,jsonb)'::regprocedure);
 body:=replace(body,'task_assignments(task_id,assignee,status)','task_assignments(task_id,assignee,status,assigned_by)');
 body:=replace(body,$old$case when person=p_actor then 'ACCEPTED' else 'PENDING_ACCEPT' end)$old$,$new$case when person=p_actor then 'ACCEPTED' else 'PENDING_ACCEPT' end,p_actor)$new$);
 execute body;
 body:=pg_get_functiondef('task_board_private.project_gateway(text,text,text,jsonb)'::regprocedure);
 body:=replace(body,$old$('create_task','move_task','add_task','remove_task')$old$,$new$('create_task','move_task','add_task','remove_task','accept_task')$new$);
 body:=replace(body,$old$if p_action='create_task' then perform public.task_workspace$old$,$new$if p_action='accept_task' then
     if not exists(select 1 from public.task_assignments a join public.tasks t on t.id=a.task_id where a.task_id=tid and a.assignee=u.display_name and a.status='PENDING_ACCEPT' and coalesce(a.assigned_by,t.created_by,'')<>u.display_name) then raise exception 'Úkol již byl přijat nebo není ve vaší schránce.';end if;
     perform public.task_workspace('transition',u.display_name,tid,jsonb_build_object('assignee',u.display_name,'status','ACCEPTED','expected_status','PENDING_ACCEPT'));
    end if;
    if p_action='create_task' then perform public.task_workspace$new$);
 execute body;
end $migration$;
notify pgrst,'reload schema';
