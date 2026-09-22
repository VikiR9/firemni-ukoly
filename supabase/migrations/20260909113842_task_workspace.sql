-- Additive upgrade: preserve legacy tasks and notes.
alter table public.tasks add column created_by text;
alter table public.tasks add column requires_approval boolean not null default true;
alter table public.tasks add column archived_at timestamptz;
create table public.task_assignments (
  task_id uuid not null references public.tasks(id) on delete cascade,
  assignee text not null,
  status text not null default 'PENDING_ACCEPT' check(status in ('PENDING_ACCEPT','ACCEPTED','IN_PROGRESS','BLOCKED','SUBMITTED_DONE','DONE','DECLINED','RETURNED')),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  reminder_on date,
  primary key(task_id,assignee)
);
insert into public.task_assignments(task_id,assignee,status,completed_at)
select id,assignee,case when status='ARCHIVED' then 'DONE' else status end,completed_at
from public.tasks where assignee is not null;
update public.tasks set archived_at=coalesce(owner_verified_at,updated_at) where status='ARCHIVED';
create table public.task_updates (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  author text not null,
  body text not null check(length(trim(body)) between 1 and 6000),
  kind text not null default 'comment' check(kind in ('comment','event')),
  created_at timestamptz not null default now()
);
insert into public.task_updates(task_id,author,body,kind,created_at)
select id,coalesce(assignee,'Původní záznam'),completion_note,'comment',coalesce(completed_at,updated_at)
from public.tasks where length(trim(coalesce(completion_note,'')))>0;
insert into public.task_updates(task_id,author,body,kind,created_at)
select id,'Původní kontrola',owner_review_note,'comment',coalesce(owner_verified_at,updated_at)
from public.tasks where length(trim(coalesce(owner_review_note,'')))>0;
create index task_updates_task_time_idx on public.task_updates(task_id,created_at);
create index task_assignments_person_status_idx on public.task_assignments(assignee,status);
alter table public.task_assignments enable row level security;
alter table public.task_updates enable row level security;
-- Compatibility with the existing internal browser login. These are NOT
-- user-identity authorization boundaries; migrate to Supabase Auth separately.
create policy internal_assignments_access on public.task_assignments for all to anon,authenticated using(true) with check(true);
create policy internal_updates_read on public.task_updates for select to anon,authenticated using(true);
create policy internal_updates_insert on public.task_updates for insert to anon,authenticated with check(kind in ('comment','event'));
grant select,insert,update,delete on public.task_assignments to anon,authenticated;
grant select,insert on public.task_updates to anon,authenticated;

create function public.task_workspace(p_action text,p_actor text,p_task_id uuid,p_data jsonb default '{}')
returns uuid language plpgsql security invoker set search_path='' as $$
declare
  t public.tasks%rowtype;
  a public.task_assignments%rowtype;
  people text[];
  person text;
  next_status text;
  note text := trim(coalesce(p_data->>'note',''));
  owner boolean := p_actor in ('Milan','Viktor');
  allowed_people text[] := array['Milan','Miloš','Karina','Kateřina','Vendula','Viktor','Nikola'];
begin
  if p_actor is null or not(p_actor=any(allowed_people)) then raise exception 'Neznámý uživatel.'; end if;
  if p_action in ('create','edit') then
    select array_agg(distinct value) into people from jsonb_array_elements_text(p_data->'assignees');
    if coalesce(cardinality(people),0)=0 or not(people <@ allowed_people) then raise exception 'Vyberte alespoň jednoho platného řešitele.'; end if;
    if length(trim(coalesce(p_data->>'title',''))) not between 1 and 200 then raise exception 'Název musí mít 1 až 200 znaků.'; end if;
    if length(coalesce(p_data->>'description',''))>12000 then raise exception 'Popis je příliš dlouhý.'; end if;
    if coalesce(p_data->>'priority','') not in ('Low','Medium','High','Urgent') then raise exception 'Neplatná priorita.'; end if;
  end if;
  if p_action='create' then
    insert into public.tasks(id,title,description,assignee,priority,due,status,lane,created_by,requires_approval)
    values(p_task_id,trim(p_data->>'title'),p_data->>'description',people[1],p_data->>'priority',nullif(p_data->>'due','')::date,
      'ACCEPTED','Nové',p_actor,coalesce((p_data->>'requires_approval')::boolean,false))
    on conflict(id) do nothing;
    if not found then return p_task_id; end if;
    foreach person in array people loop
      insert into public.task_assignments(task_id,assignee,status)
      values(p_task_id,person,case when person=p_actor then 'ACCEPTED' else 'PENDING_ACCEPT' end);
    end loop;
    insert into public.task_updates(task_id,author,body,kind) values(p_task_id,p_actor,'Vytvořil/a úkol pro: '||array_to_string(people,', '),'event');
    return p_task_id;
  end if;
  select * into t from public.tasks where id=p_task_id for update;
  if not found then raise exception 'Úkol již neexistuje.'; end if;
  if not owner and t.created_by is distinct from p_actor and not exists(select 1 from public.task_assignments where task_id=p_task_id and assignee=p_actor) then
    raise exception 'K tomuto úkolu nemáte přístup.';
  end if;
  if p_action='comment' then
    if length(note) not between 1 and 6000 then raise exception 'Aktualizace musí mít 1 až 6000 znaků.'; end if;
    insert into public.task_updates(id,task_id,author,body) values(coalesce(nullif(p_data->>'id','')::uuid,gen_random_uuid()),p_task_id,p_actor,note) on conflict(id) do nothing;
  elsif p_action='edit' then
    if not owner and t.created_by is distinct from p_actor then raise exception 'Zadání může změnit zadavatel nebo majitel.'; end if;
    if t.archived_at is not null then raise exception 'Nejprve obnovte úkol z archivu.'; end if;
    update public.tasks set title=trim(p_data->>'title'),description=p_data->>'description',priority=p_data->>'priority',
      due=nullif(p_data->>'due','')::date,requires_approval=coalesce((p_data->>'requires_approval')::boolean,false),assignee=people[1] where id=p_task_id;
    delete from public.task_assignments where task_id=p_task_id and not(assignee=any(people));
    foreach person in array people loop
      insert into public.task_assignments(task_id,assignee,status) values(p_task_id,person,case when person=p_actor then 'ACCEPTED' else 'PENDING_ACCEPT' end) on conflict do nothing;
    end loop;
    -- Disabling review releases work already submitted for review.
    if not coalesce((p_data->>'requires_approval')::boolean,false) then
      update public.task_assignments set status='DONE',completed_at=now(),updated_at=now() where task_id=p_task_id and status='SUBMITTED_DONE';
    end if;
    insert into public.task_updates(task_id,author,body,kind) values(p_task_id,p_actor,'Upravil/a zadání, řešitele nebo nastavení úkolu.','event');
  elsif p_action in ('archive','restore') then
    if not owner and t.created_by is distinct from p_actor then raise exception 'Archiv spravuje zadavatel nebo majitel.'; end if;
    update public.tasks set archived_at=case when p_action='archive' then now() else null end where id=p_task_id;
    insert into public.task_updates(task_id,author,body,kind) values(p_task_id,p_actor,case when p_action='archive' then 'Archivoval/a úkol.' else 'Obnovil/a úkol z archivu.' end,'event');
  elsif p_action='transition' then
    if t.archived_at is not null then raise exception 'Úkol je v archivu.'; end if;
    person:=p_data->>'assignee'; next_status:=p_data->>'status';
    select * into a from public.task_assignments where task_id=p_task_id and assignee=person for update;
    if not found then raise exception 'Řešitel nenalezen.'; end if;
    if p_data->>'expected_status' is distinct from a.status then raise exception 'Stav mezitím změnil jiný uživatel. Obnovte přehled.'; end if;
    if next_status in ('RETURNED','DONE') and a.status='SUBMITTED_DONE' then
      if not owner then raise exception 'Kontrolu provádí majitel.'; end if;
    elsif next_status='PENDING_ACCEPT' and a.status in ('DECLINED','DONE') then
      if not owner and t.created_by is distinct from p_actor then raise exception 'Úkol obnovuje zadavatel nebo majitel.'; end if;
    else
      if person<>p_actor then raise exception 'Měnit můžete pouze svůj postup.'; end if;
      if not (
        (a.status='PENDING_ACCEPT' and next_status in ('ACCEPTED','DECLINED')) or
        (a.status in ('ACCEPTED','RETURNED','BLOCKED') and next_status='IN_PROGRESS') or
        (a.status in ('ACCEPTED','IN_PROGRESS','RETURNED') and next_status='BLOCKED') or
        (a.status in ('ACCEPTED','IN_PROGRESS','RETURNED','BLOCKED') and next_status=case when t.requires_approval then 'SUBMITTED_DONE' else 'DONE' end)
      ) then raise exception 'Tato změna stavu není dostupná.'; end if;
    end if;
    if next_status in ('BLOCKED','RETURNED','DECLINED') and length(note)=0 then raise exception 'Doplňte důvod změny.'; end if;
    if length(note)>6000 then raise exception 'Poznámka je příliš dlouhá.'; end if;
    update public.task_assignments set status=next_status,updated_at=now(),
      completed_at=case when next_status='DONE' then now() else null end,
      reminder_on=case when next_status='BLOCKED' then nullif(p_data->>'reminder_on','')::date else null end
    where task_id=p_task_id and assignee=person;
    insert into public.task_updates(task_id,author,body,kind) values(p_task_id,p_actor,
      person||' → '||case next_status when 'ACCEPTED' then 'Přijato' when 'IN_PROGRESS' then 'Rozpracováno' when 'BLOCKED' then 'Čeká na…' when 'SUBMITTED_DONE' then 'Ke schválení' when 'DONE' then 'Hotovo' when 'RETURNED' then 'Vráceno k dopracování' when 'DECLINED' then 'Odmítnuto' else 'Čeká na přijetí' end ||
      case when note<>'' then E'\n'||note else '' end ||
      case when next_status='BLOCKED' and nullif(p_data->>'reminder_on','') is not null then E'\nPřipomenout: '||(p_data->>'reminder_on') else '' end,'event');
  else raise exception 'Neznámá akce.';
  end if;
  update public.tasks set updated_at=now() where id=p_task_id;
  return p_task_id;
end;
$$;
revoke all on function public.task_workspace(text,text,uuid,jsonb) from public;
grant execute on function public.task_workspace(text,text,uuid,jsonb) to anon,authenticated;
notify pgrst,'reload schema';
