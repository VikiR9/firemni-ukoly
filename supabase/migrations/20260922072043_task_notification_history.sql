-- Personal history is independent of device registration or delivery success.
create table push_private.notifications (
 id uuid primary key default gen_random_uuid(),
 username text not null references attendance_private.people(username),
 task_id uuid references public.tasks(id) on delete set null,
 event_key text not null,
 kind text not null,
 title text not null,
 body text not null,
 created_at timestamptz not null default clock_timestamp(),
 read_at timestamptz,
 unique(username,event_key)
);
create index notification_history_user_time on push_private.notifications(username,created_at desc,id desc);
create index notification_history_unread on push_private.notifications(username,created_at) where read_at is null;
alter table push_private.notifications enable row level security;
revoke all on push_private.notifications from public,anon,authenticated;

-- Recover still-retained past notifications once, regardless of device count.
insert into push_private.notifications(username,task_id,event_key,kind,title,body,created_at)
select distinct on (s.username,d.event_key) s.username,d.task_id,d.event_key,d.kind,d.title,d.body,d.created_at
from push_private.deliveries d join push_private.subscriptions s on s.id=d.subscription_id
where d.kind<>'test' and d.created_at>=now()-interval '90 days'
order by s.username,d.event_key,d.created_at,d.id;

create or replace function push_private.enqueue(p_people text[],p_actor text,p_task uuid,p_kind text,p_event text,p_title text,p_body text)
returns void language plpgsql security definer set search_path='' as $$
begin
 insert into push_private.notifications(username,task_id,event_key,kind,title,body)
 select p.username,p_task,p_event,p_kind,p_title,p_body from attendance_private.people p
 where p.display_name=any(p_people) and p.display_name is distinct from p_actor
 on conflict(username,event_key) do nothing;
 insert into push_private.deliveries(subscription_id,task_id,event_key,kind,title,body)
 select s.id,p_task,p_event,p_kind,p_title,p_body
 from push_private.subscriptions s
 join attendance_private.people p on p.username=s.username
 join attendance_private.login_sessions ls on ls.id=s.session_id and ls.revoked_at is null
 where s.enabled and p.display_name=any(p_people) and p.display_name is distinct from p_actor
 on conflict(subscription_id,event_key) do nothing;
end $$;

-- Every task action supplies typed context for its triggers, without parsing
-- the human-readable activity text. Existing authorization remains unchanged.
do $migration$
declare definition text; marker text:=E'begin\n  if p_actor is null';
begin
 definition:=pg_get_functiondef('public.task_workspace(text,text,uuid,jsonb)'::regprocedure);
 if position(marker in definition)=0 then raise exception 'Task action context insertion point not found';end if;
 definition:=replace(definition,marker,E'begin\n  perform set_config(''limmit.task_actor'',p_actor,true);\n  perform set_config(''limmit.task_action'',p_action,true);\n  perform set_config(''limmit.task_event'',gen_random_uuid()::text,true);\n  if p_actor is null');
 execute definition;
end $migration$;

create or replace function push_private.assignment_changed()
returns trigger language plpgsql security definer set search_path='' as $$
declare t public.tasks%rowtype; recipients text[]; actor text; heading text; message text;
 event_id text:=coalesce(nullif(current_setting('limmit.task_event',true),''),gen_random_uuid()::text);
begin
 select * into t from public.tasks where id=new.task_id;
 if t.archived_at is not null then return new;end if;
 actor:=nullif(current_setting('limmit.task_actor',true),'');
 if tg_op='INSERT' then
  perform push_private.enqueue(array[new.assignee],null,new.task_id,'assigned',
   'assigned:'||event_id||':'||new.task_id||':'||new.assignee,
   'Nový úkol','Byl vám přidělen nový úkol. Podrobnosti najdete v aplikaci LIMMIT.');
 elsif new.status is not distinct from old.status then return new;
 elsif new.status='ACCEPTED' and old.status='PENDING_ACCEPT' then
  perform push_private.enqueue(array[t.created_by],new.assignee,new.task_id,'accepted',gen_random_uuid()::text,
   'Úkol byl přijat',new.assignee||' přijal(a) vámi vytvořený úkol. Podrobnosti najdete v aplikaci LIMMIT.');
 elsif new.status='DONE' then
  select array_agg(assignee) into recipients from public.task_assignments
   where task_id=new.task_id and assignee<>new.assignee;
  perform push_private.enqueue(recipients,new.assignee,new.task_id,'peer_completed',gen_random_uuid()::text,
   'Kolega dokončil úkol',new.assignee||' má svou část společného úkolu hotovou. Podrobnosti najdete v aplikaci LIMMIT.');
 else
  select array_agg(person) into recipients from (
   select assignee as person from public.task_assignments where task_id=new.task_id
   union select t.created_by
  ) participants;
  heading:=case new.status when 'SUBMITTED_DONE' then 'Úkol čeká na schválení' when 'RETURNED' then 'Úkol byl vrácen' when 'DECLINED' then 'Úkol byl odmítnut' else 'Změna stavu úkolu' end;
  message:=new.assignee||' · '||case new.status when 'IN_PROGRESS' then 'Rozpracováno' when 'BLOCKED' then 'Čeká na další krok' when 'SUBMITTED_DONE' then 'Ke schválení' when 'RETURNED' then 'Vráceno k dopracování' when 'DECLINED' then 'Odmítnuto' else 'Čeká na přijetí' end||'. Podrobnosti najdete v aplikaci LIMMIT.';
  perform push_private.enqueue(recipients,coalesce(actor,new.assignee),new.task_id,'task_updated',gen_random_uuid()::text,heading,message);
 end if;
 return new;
end $$;

create function push_private.task_activity_added()
returns trigger language plpgsql security definer set search_path='' as $$
declare recipients text[]; action text:=current_setting('limmit.task_action',true); heading text; message text;
begin
 if new.kind='comment' then
  heading:='Nová aktualizace úkolu';message:=new.author||' přidal(a) aktualizaci k úkolu. Podrobnosti najdete v aplikaci LIMMIT.';
 elsif new.kind='event' and action in ('edit','archive','restore') then
  heading:=case action when 'archive' then 'Úkol byl archivován' when 'restore' then 'Úkol byl obnoven' else 'Zadání úkolu se změnilo' end;
  message:=new.author||' aktualizoval(a) úkol. Podrobnosti najdete v aplikaci LIMMIT.';
 else return new;end if;
 select array_agg(person) into recipients from (
  select assignee as person from public.task_assignments where task_id=new.task_id
  union select created_by from public.tasks where id=new.task_id
 ) participants
 -- A newly added assignee already gets the new-task notification for this edit.
 where new.kind='comment' or not exists (
  select 1 from push_private.notifications n join attendance_private.people p on p.username=n.username
  where p.display_name=person and n.event_key='assigned:'||current_setting('limmit.task_event',true)||':'||new.task_id||':'||person
 );
 perform push_private.enqueue(recipients,new.author,new.task_id,
  case when new.kind='comment' then 'comment' else 'task_updated' end,
  'activity:'||new.id,heading,message);
 return new;
end $$;
create trigger push_task_activity_added after insert on public.task_updates
 for each row execute function push_private.task_activity_added();
revoke all on function push_private.task_activity_added() from public,anon,authenticated;

create or replace function push_private.overdue_digest(p_at timestamptz)
returns void language plpgsql security definer set search_path='' as $$
declare local_at timestamp:=p_at at time zone 'Europe/Prague'; slot text; event_id text;
begin
 if local_at::time>=time '08:30' and local_at::time<time '09:00' then slot:='08:30';
 elsif local_at::time>=time '14:30' and local_at::time<time '15:00' then slot:='14:30';
 else return;end if;
 event_id:='overdue:'||local_at::date||':'||slot;
 insert into push_private.notifications(username,event_key,kind,title,body)
 select p.username,event_id,'overdue','Úkoly po termínu',
  'Počet vašich úkolů po termínu: '||totals.n||'. Otevřete svůj přehled v aplikaci LIMMIT.'
 from (
  select a.assignee,count(distinct t.id) as n
  from public.task_assignments a join public.tasks t on t.id=a.task_id
  where t.archived_at is null and t.due<local_at::date and a.status not in ('DONE','DECLINED')
  group by a.assignee
 ) totals join attendance_private.people p on p.display_name=totals.assignee
 on conflict(username,event_key) do nothing;
 insert into push_private.deliveries(subscription_id,event_key,kind,title,body,expires_at)
 select s.id,n.event_key,n.kind,n.title,n.body,p_at+interval '4 hours'
 from push_private.notifications n
 join push_private.subscriptions s on s.username=n.username and s.enabled
 join attendance_private.login_sessions ls on ls.id=s.session_id and ls.revoked_at is null
 where n.event_key=event_id and n.kind='overdue'
 on conflict(subscription_id,event_key) do nothing;
end $$;

create function push_private.history_gateway(p_secret text,p_token text,p_action text,p_data jsonb default '{}')
returns jsonb language plpgsql security definer set search_path='' as $$
declare identity jsonb; person text; display_name text; is_owner boolean; entries jsonb; result_count integer; unread_count integer;
 before_at timestamptz; before_id uuid; cutoff timestamptz:=clock_timestamp();
begin
 identity:=public.account_gateway(p_secret,p_token,'check','{}');
 if identity->>'username' is null then return identity;end if;
 person:=identity->>'username';
 select p.display_name,p.role='OWNER' into display_name,is_owner from attendance_private.people p where p.username=person;
 if p_action='read' then
  update push_private.notifications set read_at=coalesce(read_at,clock_timestamp()) where username=person and id=(p_data->>'id')::uuid;
 elsif p_action='read_all' then
  if p_data->>'through' is null then return jsonb_build_object('error','Chybí čas přehledu.','status',400);end if;
  update push_private.notifications set read_at=clock_timestamp()
   where username=person and read_at is null and created_at<=least((p_data->>'through')::timestamptz,cutoff);
 elsif p_action not in ('list','count') then
  return jsonb_build_object('error','Neznámá akce.','status',400);
 end if;
 select count(*) into unread_count from push_private.notifications where username=person and read_at is null and created_at>=cutoff-interval '90 days';
 if p_action<>'list' then return jsonb_build_object('ok',true,'unread_count',unread_count);end if;
 before_at:=(p_data->>'before_at')::timestamptz;before_id:=(p_data->>'before_id')::uuid;
 if (before_at is null)<>(before_id is null) then return jsonb_build_object('error','Neplatná stránka historie.','status',400);end if;
 select coalesce(jsonb_agg(row_to_json(page) order by page.created_at desc,page.id desc),'[]') into entries from (
  select n.id,n.kind,n.title,n.body,n.created_at,n.read_at,
   t.title as task_title,
   case when n.kind='overdue' then '/?filter=overdue' when t.id is not null then '/?task='||t.id else null end as url
  from push_private.notifications n left join public.tasks t on t.id=n.task_id and
   (is_owner or t.created_by=display_name or exists(select 1 from public.task_assignments a where a.task_id=t.id and a.assignee=display_name)
    or public.task_project_member(display_name,t.id))
  where n.username=person and n.created_at>=cutoff-interval '90 days'
   and (before_at is null or (n.created_at,n.id)<(before_at,before_id))
  order by n.created_at desc,n.id desc limit 31
 ) page;
 result_count:=jsonb_array_length(entries);
 return jsonb_build_object('items',case when result_count>30 then entries-30 else entries end,'unread_count',unread_count,'as_of',cutoff,
  'next_cursor',case when result_count>30 then jsonb_build_object('before_at',entries->29->>'created_at','before_id',entries->29->>'id') else null end);
end $$;
create function public.task_notification_history(p_secret text,p_token text,p_action text,p_data jsonb default '{}')
returns jsonb language sql security invoker set search_path='' as $$
 select push_private.history_gateway(p_secret,p_token,p_action,p_data);
$$;
revoke all on function push_private.history_gateway(text,text,text,jsonb),public.task_notification_history(text,text,text,jsonb) from public,anon,authenticated;
grant execute on function push_private.history_gateway(text,text,text,jsonb),public.task_notification_history(text,text,text,jsonb) to anon,authenticated;

do $migration$
declare definition text; marker text:='perform push_private.reminders();';
begin
 definition:=pg_get_functiondef('push_private.tick()'::regprocedure);
 if position(marker in definition)=0 then raise exception 'Notification cleanup insertion point not found';end if;
 definition:=replace(definition,marker,marker||E'\n delete from push_private.notifications where created_at<now()-interval ''90 days'';');
 execute definition;
end $migration$;
notify pgrst,'reload schema';
