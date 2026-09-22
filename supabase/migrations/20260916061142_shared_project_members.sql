alter table task_board_private.projects add column member_usernames text[] not null default '{}';

-- Membership stays in the private project record and is changed only by its owner.
do $migration$
declare body text;
begin
 body:=pg_get_functiondef('task_board_private.project_gateway(text,text,text,jsonb)'::regprocedure);
 body:=replace(body,'result jsonb;','result jsonb; members text[];');
 body:=replace(body,$old$pid:=nullif(p_data->>'project_id','')::uuid;$old$,$new$pid:=nullif(p_data->>'project_id','')::uuid;
 if p_action in ('create_project','rename_project') and p_data ? 'member_usernames' then
  if jsonb_typeof(p_data->'member_usernames') <> 'array' then raise exception 'Vyberte platné členy projektu.';end if;
  select coalesce(array_agg(distinct value),'{}') into members from jsonb_array_elements_text(p_data->'member_usernames');
  if exists(select 1 from unnest(members) m where m is null or not exists(select 1 from attendance_private.people where username=m)) then raise exception 'Neznámý člen projektu.';end if;
 end if;$new$);
 body:=replace(body,'projects(owner_username,title,color) values(p_actor,label,coalesce(p_data->>''color'',''#177d6b''))', 'projects(owner_username,title,color,member_usernames) values(p_actor,label,coalesce(p_data->>''color'',''#177d6b''),array_remove(coalesce(members,''{}''),p_actor))');
 body:=replace(body,$old$pr.owner_username<>p_actor and u.role<>'OWNER'$old$,$new$pr.owner_username<>p_actor and not(p_actor=any(pr.member_usernames)) and u.role<>'OWNER'$new$);
 body:=replace(body,$old$if pr.owner_username<>p_actor then raise exception 'Projekt upravuje jeho autor.';end if;$old$,$new$if pr.owner_username<>p_actor and (p_action='rename_project' or not(p_actor=any(pr.member_usernames))) then raise exception 'Nastavení projektu upravuje jeho správce; nástěnku jeho členové.';end if;$new$);
 body:=replace(body,$old$projects set title=label,color=coalesce(p_data->>'color',color) where id=pid$old$,$new$projects set title=label,color=coalesce(p_data->>'color',color),member_usernames=array_remove(coalesce(members,member_usernames),pr.owner_username) where id=pid$new$);
 body:=replace(body,$old$u.role='OWNER' or t.created_by=u.display_name or exists(select 1 from public.task_assignments$old$,$new$u.role='OWNER' or t.created_by=u.display_name or (p_action in ('move_task','remove_task') and exists(select 1 from task_board_private.project_placements where project_id=pid and task_id=tid)) or exists(select 1 from public.task_assignments$new$);
 body:=replace(body,$old$'can_edit_columns',pr.owner_username=p_actor$old$,$new$'can_edit_columns',(pr.owner_username=p_actor or p_actor=any(pr.member_usernames))$new$);
 body:=replace(body,$old$p.owner_username=p_actor or u.role='OWNER'$old$,$new$p.owner_username=p_actor or p_actor=any(p.member_usernames) or u.role='OWNER'$new$);
 execute body;
end $migration$;

create function public.task_project_member(p_actor text,p_task_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from task_board_private.project_placements m
 join task_board_private.projects p on p.id=m.project_id
 join attendance_private.people u on u.display_name=p_actor
 where m.task_id=p_task_id and (p.owner_username=u.username or u.username=any(p.member_usernames)));
$$;
revoke all on function public.task_project_member(text,uuid) from public;
grant execute on function public.task_project_member(text,uuid) to anon,authenticated;
do $migration$
declare body text;
begin
 body:=pg_get_functiondef('public.task_workspace(text,text,uuid,jsonb)'::regprocedure);
 body:=replace(body,$old$if not owner and t.created_by is distinct from p_actor and not exists$old$,$new$if not owner and t.created_by is distinct from p_actor and not (p_action='comment' and public.task_project_member(p_actor,p_task_id)) and not exists$new$);
 execute body;
end $migration$;
notify pgrst,'reload schema';
