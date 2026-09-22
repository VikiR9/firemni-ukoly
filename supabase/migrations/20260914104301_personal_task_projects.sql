create table task_board_private.projects (
 id uuid primary key default gen_random_uuid(), owner_username text not null references attendance_private.people(username),
 title text not null check(length(trim(title)) between 1 and 80), revision bigint not null default 0, created_at timestamptz not null default now()
);
create table task_board_private.project_columns (
 id uuid primary key default gen_random_uuid(), project_id uuid not null references task_board_private.projects(id) on delete cascade,
 title text not null check(length(trim(title)) between 1 and 80), position numeric not null, unique(project_id,id)
);
create table task_board_private.project_placements (
 project_id uuid not null references task_board_private.projects(id) on delete cascade, task_id uuid not null references public.tasks(id) on delete cascade,
 column_id uuid not null, position numeric not null, primary key(project_id,task_id),
 foreign key(project_id,column_id) references task_board_private.project_columns(project_id,id)
);
create index on task_board_private.project_placements(project_id,column_id,position);
alter table task_board_private.projects enable row level security;
alter table task_board_private.project_columns enable row level security;
alter table task_board_private.project_placements enable row level security;
revoke all on task_board_private.projects,task_board_private.project_columns,task_board_private.project_placements from public,anon,authenticated;

create function task_board_private.project_gateway(p_secret text,p_actor text,p_action text,p_data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare u attendance_private.people%rowtype; pr task_board_private.projects%rowtype; pid uuid; cid uuid; tid uuid; anchor uuid; label text; target numeric; following numeric; previous numeric; result jsonb;
begin
 if p_secret is null or not exists(select 1 from attendance_private.settings where gateway_hash=encode(extensions.digest(p_secret,'sha256'),'hex')) then raise exception 'Neplatné přihlášení.';end if;
 select * into u from attendance_private.people where username=p_actor;
 if not found then raise exception 'Neznámý uživatel.';end if;
 pid:=nullif(p_data->>'project_id','')::uuid;
 if p_action='create_project' then
  label:=trim(coalesce(p_data->>'title','')); if length(label) not between 1 and 80 then raise exception 'Název projektu musí mít 1 až 80 znaků.';end if;
  insert into task_board_private.projects(owner_username,title) values(p_actor,label) returning id into pid;
  insert into task_board_private.project_columns(project_id,title,position) values(pid,'Připraveno',1024),(pid,'V řešení',2048),(pid,'Hotovo',3072);
  p_action:='snapshot';
 end if;
 if pid is null then
  result:=task_board_private.gateway(p_secret,p_actor,p_action,p_data)||jsonb_build_object('project_id',null,'can_edit_columns',u.role='OWNER');
 else
  select * into pr from task_board_private.projects where id=pid for update;
  if not found or (pr.owner_username<>p_actor and u.role<>'OWNER') then raise exception 'Projekt není dostupný.';end if;
  if p_action<>'snapshot' then
   if pr.owner_username<>p_actor then raise exception 'Projekt upravuje jeho autor.';end if;
   if p_action not in ('create_task','create_column','add_task') and (p_data->>'revision')::bigint is distinct from pr.revision then raise exception 'Projekt se mezitím změnil. Obnovte jej a zkuste to znovu.';end if;
   cid:=nullif(p_data->>'column_id','')::uuid;
   anchor:=nullif(p_data->>'before_id','')::uuid;
   if p_action in ('create_column','rename_column','rename_project') then
    label:=trim(coalesce(p_data->>'title',''));if length(label) not between 1 and 80 then raise exception 'Název musí mít 1 až 80 znaků.';end if;
    if p_action='create_column' then
     if (select count(*) from task_board_private.project_columns where project_id=pid)>=30 then raise exception 'Projekt může mít nejvýše 30 sloupců.';end if;
     insert into task_board_private.project_columns(project_id,title,position) select pid,label,coalesce(max(position),0)+1024 from task_board_private.project_columns where project_id=pid;
    elsif p_action='rename_project' then update task_board_private.projects set title=label where id=pid;
    else update task_board_private.project_columns set title=label where id=cid and project_id=pid;if not found then raise exception 'Sloupec nenalezen.';end if;end if;
   elsif p_action='move_column' then
    if not exists(select 1 from task_board_private.project_columns where id=cid and project_id=pid) or anchor=cid then raise exception 'Neplatný sloupec.';end if;
    if anchor is null then select max(position)+1024 into target from task_board_private.project_columns where project_id=pid;
    else
     select position into following from task_board_private.project_columns where id=anchor and project_id=pid;if not found then raise exception 'Cílový sloupec nenalezen.';end if;
     select max(position) into previous from task_board_private.project_columns where project_id=pid and position<following and id<>cid;target:=(following+coalesce(previous,following-2048))/2;
    end if;
    update task_board_private.project_columns set position=target where id=cid and project_id=pid;
   elsif p_action='delete_column' then
    anchor:=nullif(p_data->>'destination_id','')::uuid;
    if (select count(*) from task_board_private.project_columns where project_id=pid)<=1 or anchor=cid or not exists(select 1 from task_board_private.project_columns where id=anchor and project_id=pid) then raise exception 'Vyberte jiný sloupec pro úkoly.';end if;
    select coalesce(max(position),0) into target from task_board_private.project_placements where project_id=pid and column_id=anchor;
    with moved as(select task_id,row_number() over(order by position,task_id) seq from task_board_private.project_placements where project_id=pid and column_id=cid)
    update task_board_private.project_placements p set column_id=anchor,position=target+m.seq*1024 from moved m where p.project_id=pid and p.task_id=m.task_id;
    delete from task_board_private.project_columns where project_id=pid and id=cid;if not found then raise exception 'Sloupec nenalezen.';end if;
   elsif p_action in ('create_task','move_task','add_task','remove_task') then
    tid:=(p_data->>'task_id')::uuid;
    if p_action<>'remove_task' and not exists(select 1 from task_board_private.project_columns where project_id=pid and id=cid) then raise exception 'Sloupec není v tomto projektu.';end if;
    if p_action='create_task' then perform public.task_workspace('create',u.display_name,tid,p_data->'draft');end if;
    if not exists(select 1 from public.tasks t where id=tid and archived_at is null and (u.role='OWNER' or t.created_by=u.display_name or exists(select 1 from public.task_assignments a where a.task_id=tid and a.assignee=u.display_name))) then raise exception 'Úkol není dostupný.';end if;
    if p_action='move_task' and not exists(select 1 from task_board_private.project_placements where project_id=pid and task_id=tid) then raise exception 'Úkol není v tomto projektu.';end if;
    if p_action='remove_task' then delete from task_board_private.project_placements where project_id=pid and task_id=tid;
    else
     if anchor=tid then raise exception 'Neplatné pořadí.';end if;
     if anchor is null then select coalesce(max(position),0)+1024 into target from task_board_private.project_placements where project_id=pid and column_id=cid;
     else
      select position into following from task_board_private.project_placements where project_id=pid and column_id=cid and task_id=anchor;if not found then raise exception 'Cílový úkol se přesunul.';end if;
      select max(position) into previous from task_board_private.project_placements where project_id=pid and column_id=cid and position<following and task_id<>tid;target:=(following+coalesce(previous,following-2048))/2;
     end if;
     insert into task_board_private.project_placements(project_id,task_id,column_id,position) values(pid,tid,cid,target) on conflict(project_id,task_id) do update set column_id=excluded.column_id,position=excluded.position;
    end if;
   else raise exception 'Neznámá akce projektu.';end if;
   update task_board_private.projects set revision=revision+1 where id=pid returning * into pr;
  end if;
  result:=jsonb_build_object('project_id',pid,'can_edit_columns',pr.owner_username=p_actor,'revision',pr.revision,'columns',(select coalesce(jsonb_agg(to_jsonb(c) order by position,id),'[]') from task_board_private.project_columns c where project_id=pid),'placements',(select coalesce(jsonb_agg(to_jsonb(p) order by position,task_id),'[]') from task_board_private.project_placements p where project_id=pid));
 end if;
 return result||jsonb_build_object('projects',(select coalesce(jsonb_agg(to_jsonb(p) order by p.created_at,p.id),'[]') from task_board_private.projects p where p.owner_username=p_actor or u.role='OWNER'));
end $$;
revoke all on function task_board_private.project_gateway(text,text,text,jsonb) from public;
grant execute on function task_board_private.project_gateway(text,text,text,jsonb) to anon,authenticated;
create or replace function public.task_board_gateway(p_secret text,p_actor text,p_action text,p_data jsonb default '{}') returns jsonb language sql security invoker set search_path='' as $$select task_board_private.project_gateway(p_secret,p_actor,p_action,p_data);$$;
notify pgrst,'reload schema';
