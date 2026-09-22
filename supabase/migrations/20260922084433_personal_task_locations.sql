-- Save task content and the editor's selected placement in one transaction.
-- Each project retains its own placement; shared project columns stay shared.
create function task_board_private.save_task(p_secret text, p_actor text, p_data jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  u attendance_private.people%rowtype;
  t public.tasks%rowtype;
  location jsonb := p_data->'placement';
  action text := p_data->>'save_action';
  tid uuid;
  source_pid uuid;
  destination_pid uuid;
  cid uuid;
  source_board jsonb;
  destination_board jsonb;
  source_column uuid;
  destination_column uuid;
begin
  if p_secret is null or not exists(select 1 from attendance_private.settings
    where gateway_hash=encode(extensions.digest(p_secret,'sha256'),'hex')) then
    raise exception 'Neplatné přihlášení.';
  end if;
  select * into u from attendance_private.people where username=p_actor;
  if not found then raise exception 'Neznámý uživatel.';end if;
  if action is null or action not in ('create','edit','organize') or jsonb_typeof(location) is distinct from 'object' then
    raise exception 'Neplatné uložení úkolu.';
  end if;
  tid := nullif(p_data->>'task_id','')::uuid;
  source_pid := nullif(location->>'source_project_id','')::uuid;
  destination_pid := nullif(location->>'project_id','')::uuid;
  cid := nullif(location->>'column_id','')::uuid;
  if tid is null or cid is null then raise exception 'Vyberte úkol a cílový sloupec.';end if;

  -- The editor changes an actor's own/member projects, never another person's
  -- private project just because the actor can administer task content.
  if exists(select 1 from unnest(array[destination_pid,case when action<>'create' then source_pid end]) as requested(project_id)
    where requested.project_id is not null and not exists(select 1 from task_board_private.projects p
      where p.id=requested.project_id and (p.owner_username=p_actor or p_actor=any(p.member_usernames)))) then
    raise exception 'Vyberte vlastní nebo sdílený projekt, jehož jste členem.';
  end if;
  -- Lock both projects in a consistent order for concurrent cross-project moves.
  perform 1 from task_board_private.projects where id=any(array[source_pid,destination_pid]) order by id for update;
  destination_board := task_board_private.ordered_project_gateway(p_secret,p_actor,'snapshot',jsonb_build_object('project_id',destination_pid));
  if not exists(select 1 from jsonb_array_elements(destination_board->'columns') c where c->>'id'=cid::text) then
    raise exception 'Sloupec není v cílovém projektu. Vyberte jej znovu.';
  end if;

  if action='create' then
    if exists(select 1 from public.tasks where id=tid and created_by is distinct from u.display_name) then
      raise exception 'Tento úkol již vytvořil někdo jiný.';
    end if;
    return task_board_private.ordered_project_gateway(p_secret,p_actor,'create_task',jsonb_build_object(
      'project_id',destination_pid,'column_id',cid,'task_id',tid,'draft',p_data->'draft'));
  end if;

  if not (location ? 'source_project_id') or not (location ? 'source_column_id') then
    raise exception 'Chybí původní zařazení úkolu. Otevřete formulář znovu.';
  end if;
  select * into t from public.tasks where id=tid for update;
  if not found or t.archived_at is not null then raise exception 'Úkol není dostupný nebo je v archivu.';end if;
  if t.created_by is distinct from u.display_name and (
    exists(select 1 from public.task_assignments where task_id=tid and assignee=u.display_name and status='PENDING_ACCEPT') or
    (u.role<>'OWNER' and not exists(select 1 from public.task_assignments
      where task_id=tid and assignee=u.display_name and status not in ('PENDING_ACCEPT','DECLINED')))) then
    raise exception 'Zařazení můžete měnit u vlastních nebo přijatých úkolů.';
  end if;
  if source_pid is not distinct from destination_pid then source_board := destination_board;
  else source_board := task_board_private.ordered_project_gateway(p_secret,p_actor,'snapshot',jsonb_build_object('project_id',source_pid));end if;
  select (p->>'column_id')::uuid into source_column from jsonb_array_elements(source_board->'placements') p where p->>'task_id'=tid::text;
  select (p->>'column_id')::uuid into destination_column from jsonb_array_elements(destination_board->'placements') p where p->>'task_id'=tid::text;
  if source_column is null or source_column is distinct from nullif(location->>'source_column_id','')::uuid
    or (location->>'source_revision')::bigint is distinct from (source_board->>'revision')::bigint
    or (location->>'revision')::bigint is distinct from (destination_board->>'revision')::bigint then
    raise exception 'Zařazení úkolu se mezitím změnilo. Otevřete formulář znovu.';
  end if;

  if action='edit' then perform public.task_workspace('edit',u.display_name,tid,p_data->'draft');end if;
  if source_pid is not distinct from destination_pid and source_column=cid then
    return destination_board;
  end if;
  -- Do not remove any other project placement, including the recipient's choice.
  if destination_column is distinct from cid then
    perform task_board_private.ordered_project_gateway(p_secret,p_actor,
      case when destination_pid is null or destination_column is not null then 'move_task' else 'add_task' end,
      jsonb_build_object('project_id',destination_pid,'column_id',cid,'task_id',tid,'revision',destination_board->'revision'));
  end if;
  if source_pid is not null and source_pid is distinct from destination_pid then
    perform task_board_private.ordered_project_gateway(p_secret,p_actor,'remove_task',jsonb_build_object(
      'project_id',source_pid,'task_id',tid,'revision',source_board->'revision'));
  end if;
  return task_board_private.ordered_project_gateway(p_secret,p_actor,'snapshot',jsonb_build_object('project_id',destination_pid));
end $$;
revoke all on function task_board_private.save_task(text,text,jsonb) from public;
grant execute on function task_board_private.save_task(text,text,jsonb) to anon,authenticated;

create or replace function public.task_board_gateway(p_secret text,p_actor text,p_action text,p_data jsonb default '{}')
returns jsonb language sql security invoker set search_path='' as $$
  select case when p_action='save_task' then task_board_private.save_task(p_secret,p_actor,p_data)
    else task_board_private.ordered_project_gateway(p_secret,p_actor,p_action,p_data) end;
$$;
notify pgrst,'reload schema';
