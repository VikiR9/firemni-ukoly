-- Keep the existing project gateway (including shared members and inbox acceptance)
-- and extend only project administration. The actor is verified by the server session
-- and the gateway secret; the OWNER role alone does not grant this exception.
do $migration$
declare
  body text;
  old_fragment text;
  new_fragment text;
begin
  body := pg_get_functiondef('task_board_private.project_gateway(text,text,text,jsonb)'::regprocedure);

  old_fragment := 'result jsonb;';
  new_fragment := 'result jsonb; project_admin boolean;';
  if strpos(body, old_fragment) = 0 then raise exception 'Missing project gateway declaration'; end if;
  body := replace(body, old_fragment, new_fragment);

  old_fragment := $old$pid:=nullif(p_data->>'project_id','')::uuid;$old$;
  new_fragment := $new$pid:=nullif(p_data->>'project_id','')::uuid;
 project_admin := u.username='VIKTOR' and u.role='OWNER';
 if p_action='delete_project' then
  if not project_admin then raise exception 'Projekty může mazat pouze Viktor.';end if;
  if pid is null then raise exception 'Vyberte projekt ke smazání.';end if;
 end if;$new$;
  if strpos(body, old_fragment) = 0 then raise exception 'Missing project selection'; end if;
  body := replace(body, old_fragment, new_fragment);

  old_fragment := $old$if pr.owner_username<>p_actor and (p_action='rename_project' or not(p_actor=any(pr.member_usernames))) then raise exception 'Nastavení projektu upravuje jeho správce; nástěnku jeho členové.';end if;$old$;
  new_fragment := $new$if not project_admin and pr.owner_username<>p_actor and (p_action='rename_project' or not(p_actor=any(pr.member_usernames))) then raise exception 'Nastavení projektu upravuje jeho správce nebo Viktor; nástěnku také jeho členové.';end if;$new$;
  if strpos(body, old_fragment) = 0 then raise exception 'Missing shared project authorization'; end if;
  body := replace(body, old_fragment, new_fragment);

  -- This branch runs after the project row lock, authorization and revision check.
  -- Cascades remove only project columns/placements; shared tasks are preserved.
  old_fragment := $old$cid:=nullif(p_data->>'column_id','')::uuid;$old$;
  new_fragment := $new$if p_action='delete_project' then
    delete from task_board_private.projects where id=pid;
    update task_board_private.project_orders
      set project_ids=array_remove(project_ids,pid), revision=revision+1
      where pid=any(project_ids);
    return task_board_private.project_gateway(p_secret,p_actor,'snapshot','{}'::jsonb);
   end if;
   cid:=nullif(p_data->>'column_id','')::uuid;$new$;
  if strpos(body, old_fragment) = 0 then raise exception 'Missing project mutation branch'; end if;
  body := replace(body, old_fragment, new_fragment);

  old_fragment := $old$'can_edit_columns',(pr.owner_username=p_actor or p_actor=any(pr.member_usernames))$old$;
  new_fragment := $new$'can_edit_columns',(project_admin or pr.owner_username=p_actor or p_actor=any(pr.member_usernames))$new$;
  if strpos(body, old_fragment) = 0 then raise exception 'Missing project board permissions'; end if;
  body := replace(body, old_fragment, new_fragment);

  old_fragment := $old$return result||jsonb_build_object('project_memberships',$old$;
  new_fragment := $new$return result||jsonb_build_object(
  'can_manage_project',pid is not null and (project_admin or pr.owner_username=p_actor),
  'can_delete_project',pid is not null and project_admin,
  'project_memberships',$new$;
  if strpos(body, old_fragment) = 0 then raise exception 'Missing project snapshot'; end if;
  body := replace(body, old_fragment, new_fragment);

  execute body;
end $migration$;

notify pgrst, 'reload schema';
