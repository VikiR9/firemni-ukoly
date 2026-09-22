alter table task_board_private.projects add column color text not null default '#177d6b' check(color ~ '^#[0-9a-fA-F]{6}$');
do $migration$
declare body text;
begin
 body:=pg_get_functiondef('task_board_private.project_gateway(text,text,text,jsonb)'::regprocedure);
 body:=replace(body,$old$if p_action='create_project' then$old$,$new$if p_action in ('create_project','rename_project') and p_data ? 'color' and (p_data->>'color' is null or p_data->>'color' !~ '^#[0-9a-fA-F]{6}$') then raise exception 'Vyberte platnou barvu projektu.';end if;
 if p_action='create_project' then$new$);
 body:=replace(body,'projects(owner_username,title) values(p_actor,label)','projects(owner_username,title,color) values(p_actor,label,coalesce(p_data->>''color'',''#177d6b''))');
 body:=replace(body,'projects set title=label where id=pid','projects set title=label,color=coalesce(p_data->>''color'',color) where id=pid');
 body:=replace(body,$old$return result||jsonb_build_object('projects',$old$,$new$return result||jsonb_build_object('project_memberships',(select coalesce(jsonb_agg(jsonb_build_object('project_id',m.project_id,'task_id',m.task_id)),'[]') from task_board_private.project_placements m join task_board_private.projects p on p.id=m.project_id where p.owner_username=p_actor or u.role='OWNER'),'projects',$new$);
 execute body;
end $migration$;
