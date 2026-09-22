create or replace function task_board_private.gateway(p_secret text,p_actor text,p_action text,p_data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare u attendance_private.people%rowtype; v_task public.tasks%rowtype; rev bigint; cid uuid; tid uuid; anchor uuid; previous numeric; following numeric; target numeric; label text; original text; n integer;
begin
 if p_secret is null or not exists(select 1 from attendance_private.settings where gateway_hash=encode(extensions.digest(p_secret,'sha256'),'hex')) then raise exception 'Neplatné přihlášení.';end if;
 select * into u from attendance_private.people where username=p_actor;
 if not found then raise exception 'Neznámý uživatel.';end if;
 perform pg_advisory_xact_lock(hashtextextended('task-board',0));
 select revision into rev from task_board_private.state;
 -- Legacy task creation is supported; placement is assigned exactly once.
 insert into task_board_private.placements(task_id,column_id,position)
 select t.id,coalesce((select c.id from task_board_private.columns c where c.system_key=case
 when exists(select 1 from public.task_assignments a where a.task_id=t.id) and not exists(select 1 from public.task_assignments a where a.task_id=t.id and a.status<>'DONE') then 'done'
 when exists(select 1 from public.task_assignments a where a.task_id=t.id and a.status='SUBMITTED_DONE') then 'review'
 when exists(select 1 from public.task_assignments a where a.task_id=t.id and a.status in ('IN_PROGRESS','BLOCKED','RETURNED')) then 'progress' else 'ready' end),(select id from task_board_private.columns order by position,id limit 1)),
 coalesce((select max(position) from task_board_private.placements),0)+row_number() over(order by t.created_at,t.id)*1024
 from public.tasks t where not exists(select 1 from task_board_private.placements p where p.task_id=t.id);
 get diagnostics n=row_count;
 if n>0 then rev:=rev+1;update task_board_private.state set revision=rev;end if;
 if p_action<>'snapshot' then
  if p_action not in ('create_task','create_column') and (p_data->>'revision')::bigint is distinct from rev then raise exception 'Nástěnka se mezitím změnila. Obnovte ji a zkuste přesun znovu.';end if;
  if p_action in ('create_column','rename_column','move_column','delete_column') and u.role<>'OWNER' then raise exception 'Sloupce spravuje majitel.';end if;
  cid:=nullif(p_data->>'column_id','')::uuid;
  if p_action='create_column' then
   label:=trim(coalesce(p_data->>'title',''));if length(label) not between 1 and 80 then raise exception 'Název sloupce musí mít 1 až 80 znaků.';end if;
   if (select count(*) from task_board_private.columns)>=30 then raise exception 'Nástěnka může mít nejvýše 30 sloupců.';end if;
   insert into task_board_private.columns(title,position) values(label,(select max(position)+1024 from task_board_private.columns));
  elsif p_action='rename_column' then
   label:=trim(coalesce(p_data->>'title',''));if length(label) not between 1 and 80 then raise exception 'Název sloupce musí mít 1 až 80 znaků.';end if;
   update task_board_private.columns set title=label where id=cid;if not found then raise exception 'Sloupec už neexistuje.';end if;
  elsif p_action='move_column' then
   if not exists(select 1 from task_board_private.columns where id=cid) then raise exception 'Sloupec už neexistuje.';end if;
   anchor:=nullif(p_data->>'before_id','')::uuid;
   if anchor=cid then raise exception 'Neplatné pořadí.';end if;
   if anchor is null then select max(position)+1024 into target from task_board_private.columns;
   else
    select position into following from task_board_private.columns where id=anchor;if not found then raise exception 'Cílový sloupec už neexistuje.';end if;
    select max(position) into previous from task_board_private.columns where position<following and id<>cid;target:=(following+coalesce(previous,following-2048))/2;
   end if;
   update task_board_private.columns set position=target where id=cid;
  elsif p_action='delete_column' then
   anchor:=nullif(p_data->>'destination_id','')::uuid;
   if (select count(*) from task_board_private.columns)<=1 then raise exception 'Musí zůstat alespoň jeden sloupec.';end if;
   if anchor=cid or not exists(select 1 from task_board_private.columns where id=anchor) then raise exception 'Vyberte jiný sloupec pro přesun úkolů.';end if;
   select coalesce(max(position),0) into target from task_board_private.placements where column_id=anchor;
   with moved as(select task_id,row_number() over(order by position,task_id) as seq from task_board_private.placements where column_id=cid)
   update task_board_private.placements p set column_id=anchor,position=target+m.seq*1024 from moved m where p.task_id=m.task_id;
   delete from task_board_private.columns where id=cid;if not found then raise exception 'Sloupec už neexistuje.';end if;
  elsif p_action in ('move_task','create_task') then
   tid:=(p_data->>'task_id')::uuid;
   if not exists(select 1 from task_board_private.columns where id=cid) then raise exception 'Vybraný sloupec už neexistuje.';end if;
   if p_action='create_task' then
    perform public.task_workspace('create',u.display_name,tid,p_data->'draft');
   end if;
   select * into v_task from public.tasks where id=tid for update;
   if not found or v_task.archived_at is not null then raise exception 'Úkol není dostupný nebo je v archivu.';end if;
   if u.role<>'OWNER' and v_task.created_by is distinct from u.display_name and not exists(select 1 from public.task_assignments where task_id=tid and assignee=u.display_name) then raise exception 'Přesouvat lze vlastní nebo zadané úkoly.';end if;
   anchor:=nullif(p_data->>'before_id','')::uuid;
   if anchor=tid then raise exception 'Neplatné pořadí.';end if;
   if anchor is null then select coalesce(max(position),0)+1024 into target from task_board_private.placements where column_id=cid;
   else
    select position into following from task_board_private.placements where task_id=anchor and column_id=cid;if not found then raise exception 'Cílový úkol se přesunul. Obnovte nástěnku.';end if;
    select max(position) into previous from task_board_private.placements where column_id=cid and position<following and task_id<>tid;target:=(following+coalesce(previous,following-2048))/2;
   end if;
   insert into task_board_private.placements(task_id,column_id,position) values(tid,cid,target) on conflict(task_id) do update set column_id=excluded.column_id,position=excluded.position;
   select title into label from task_board_private.columns where id=cid;
   insert into public.task_updates(task_id,author,body,kind) values(tid,u.display_name,'Umístil/a úkol do sloupce „'||label||'“.','event');
  else raise exception 'Neznámá akce nástěnky.';
  end if;
  update task_board_private.state set revision=revision+1 returning revision into rev;
 end if;
 return jsonb_build_object('revision',rev,'columns',(select jsonb_agg(to_jsonb(c) order by position,id) from task_board_private.columns c),'placements',(select coalesce(jsonb_agg(to_jsonb(p) order by position,task_id),'[]') from task_board_private.placements p));
end;$$;
