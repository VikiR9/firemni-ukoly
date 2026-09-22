-- Durable, per-device deliveries. No task or customer text is put on lock screens.
create schema push_private;
revoke all on schema push_private from public;

create table push_private.settings (
 id boolean primary key default true check (id),
 worker_url text,
 worker_token text,
 enabled boolean not null default false,
 last_tick_at timestamptz,
 last_worker_at timestamptz
);
insert into push_private.settings(id) values(true);

create table push_private.subscriptions (
 id uuid primary key default gen_random_uuid(),
 username text not null references attendance_private.people(username),
 session_id uuid not null references attendance_private.login_sessions(id) on delete cascade,
 endpoint text not null unique,
 p256dh text not null,
 auth text not null,
 enabled boolean not null default true,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 last_test_at timestamptz
);
create index push_subscriptions_user on push_private.subscriptions(username) where enabled;
create index push_subscriptions_session on push_private.subscriptions(session_id);

create table push_private.deliveries (
 id uuid primary key default gen_random_uuid(),
 subscription_id uuid not null references push_private.subscriptions(id) on delete cascade,
 task_id uuid references public.tasks(id) on delete cascade,
 event_key text not null,
 kind text not null,
 title text not null,
 body text not null,
 created_at timestamptz not null default now(),
 available_at timestamptz not null default now(),
 expires_at timestamptz not null default now() + interval '24 hours',
 state text not null default 'pending' check(state in ('pending','sending','accepted','failed','cancelled')),
 attempts integer not null default 0,
 lease_id uuid,
 lease_until timestamptz,
 accepted_at timestamptz,
 displayed_at timestamptz,
 receipt_token uuid not null default gen_random_uuid(),
 last_status integer,
 unique(subscription_id,event_key)
);
create index push_deliveries_pending on push_private.deliveries(available_at) where state in ('pending','sending');
create index push_deliveries_task on push_private.deliveries(task_id);
alter table push_private.settings enable row level security;
alter table push_private.subscriptions enable row level security;
alter table push_private.deliveries enable row level security;
revoke all on all tables in schema push_private from public,anon,authenticated;

create function push_private.enqueue(p_people text[],p_actor text,p_task uuid,p_kind text,p_event text,p_title text,p_body text)
returns void language sql security definer set search_path='' as $$
 insert into push_private.deliveries(subscription_id,task_id,event_key,kind,title,body)
 select s.id,p_task,p_event,p_kind,p_title,p_body
 from push_private.subscriptions s
 join attendance_private.people p on p.username=s.username
 join attendance_private.login_sessions ls on ls.id=s.session_id and ls.revoked_at is null
 where s.enabled and p.display_name=any(p_people) and p.display_name is distinct from p_actor
 on conflict(subscription_id,event_key) do nothing;
$$;

create function push_private.assignment_changed()
returns trigger language plpgsql security definer set search_path='' as $$
declare t public.tasks%rowtype; recipients text[]; actor text; heading text; kind text;
begin
 select * into t from public.tasks where id=new.task_id;
 if t.archived_at is not null then return new;end if;
 if tg_op='INSERT' then
  recipients:=array[new.assignee];actor:=coalesce(new.assigned_by,t.created_by);
  heading:='Nový úkol';kind:='assigned';
 elsif new.status is not distinct from old.status then return new;
 elsif new.status in ('RETURNED','PENDING_ACCEPT') then
  recipients:=array[new.assignee];heading:='Úkol čeká na vás';kind:='returned';
 elsif new.status='DONE' and old.status='SUBMITTED_DONE' then
  recipients:=array[new.assignee];heading:='Úkol byl schválen';kind:='approved';
 elsif new.status='SUBMITTED_DONE' then
  select array_agg(display_name) into recipients from attendance_private.people where role='OWNER';
  actor:=new.assignee;heading:='Úkol čeká na kontrolu';kind:='review';
 elsif new.status in ('ACCEPTED','DONE','DECLINED','BLOCKED') then
  recipients:=array[coalesce(new.assigned_by,t.created_by)];actor:=new.assignee;
  heading:=case new.status when 'ACCEPTED' then 'Úkol byl přijat' when 'DONE' then 'Úkol byl dokončen' when 'DECLINED' then 'Úkol byl odmítnut' else 'Úkol čeká na další krok' end;
  kind:='status';
 else return new;
 end if;
 perform push_private.enqueue(recipients,actor,new.task_id,kind,gen_random_uuid()::text,heading,'Podrobnosti najdete v aplikaci LIMMIT.');
 return new;
end $$;
create trigger push_assignment_changed after insert or update on public.task_assignments
 for each row execute function push_private.assignment_changed();

create function push_private.comment_added()
returns trigger language plpgsql security definer set search_path='' as $$
declare recipients text[];
begin
 if new.kind<>'comment' or exists(select 1 from public.tasks where id=new.task_id and archived_at is not null) then return new;end if;
 select array_agg(person) into recipients from (
  select assignee as person from public.task_assignments where task_id=new.task_id
  union select created_by from public.tasks where id=new.task_id
 ) x;
 perform push_private.enqueue(recipients,new.author,new.task_id,'comment','comment:'||new.id,'Nový komentář k úkolu','Podrobnosti najdete v aplikaci LIMMIT.');
 return new;
end $$;
create trigger push_comment_added after insert on public.task_updates
 for each row execute function push_private.comment_added();

create function push_private.session_revoked()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.revoked_at is not null and old.revoked_at is null then
  update push_private.subscriptions set enabled=false where session_id=new.id;
  update push_private.deliveries set state='cancelled' where state in ('pending','sending') and subscription_id in
   (select id from push_private.subscriptions where session_id=new.id);
 end if;
 return new;
end $$;
create trigger push_session_revoked after update of revoked_at on attendance_private.login_sessions
 for each row execute function push_private.session_revoked();

create function push_private.reminders()
returns void language plpgsql security definer set search_path='' as $$
declare day date:=(now() at time zone 'Europe/Prague')::date; r record;
begin
 -- After 08:00 Prague time, including daylight saving. A unique event key makes
 -- repeated scheduler calls safe; completed and archived tasks are skipped.
 if (now() at time zone 'Europe/Prague')::time < time '08:00' then return;end if;
 for r in
  select a.task_id,a.assignee,t.due,a.reminder_on
  from public.task_assignments a join public.tasks t on t.id=a.task_id
  where t.archived_at is null and a.status not in ('DONE','DECLINED','SUBMITTED_DONE')
   and (t.due=day or a.reminder_on=day)
 loop
  perform push_private.enqueue(array[r.assignee],null,r.task_id,'reminder',
   'reminder:'||day||':'||r.task_id||':'||r.assignee,
   case when r.due=day then 'Dnes je termín úkolu' else 'Připomenutí úkolu' end,
   'Podrobnosti najdete v aplikaci LIMMIT.');
 end loop;
end $$;

-- A single authenticated gateway follows the application's existing custom
-- session model. Tables remain private; identity never comes from browser input.
create function push_private.gateway(p_secret text,p_token text,p_action text,p_data jsonb default '{}')
returns jsonb language plpgsql security definer set search_path='' as $$
declare cfg text; identity jsonb; sub push_private.subscriptions%rowtype; result jsonb; current_lease uuid; n integer;
begin
 select gateway_hash into cfg from attendance_private.settings;
 if p_secret is null or cfg is null or encode(extensions.digest(p_secret,'sha256'),'hex')<>cfg then
  raise exception 'Neplatné přihlášení.' using errcode='28000';
 end if;
 if p_action in ('subscribe','unsubscribe','status','test') then
  identity:=public.account_gateway(p_secret,p_token,'check','{}');
  if identity->>'username' is null then return identity;end if;
 end if;
 if p_action='status' then
  select * into sub from push_private.subscriptions where endpoint=p_data->>'endpoint' and username=identity->>'username';
  return jsonb_build_object('username',identity->>'username','scheduler_enabled',(select enabled from push_private.settings),
   'subscription',case when sub.id is null then null else jsonb_build_object('id',sub.id,'enabled',sub.enabled,
    'last_accepted_at',(select max(accepted_at) from push_private.deliveries where subscription_id=sub.id),
    'last_displayed_at',(select max(displayed_at) from push_private.deliveries where subscription_id=sub.id)) end);
 elsif p_action='subscribe' then
  if length(coalesce(p_data->>'endpoint','')) not between 10 and 2048
   or length(coalesce(p_data->>'p256dh',''))<>87 or length(coalesce(p_data->>'auth',''))<>22 then
   return jsonb_build_object('error','Neplatná registrace zařízení.','status',400);
  end if;
  -- Serialise reassignments so pending messages cannot leak to another account.
  perform pg_advisory_xact_lock(hashtextextended('push:'||(p_data->>'endpoint'),0));
  select * into sub from push_private.subscriptions where endpoint=p_data->>'endpoint';
  if sub.id is not null and sub.username<>identity->>'username' then
   delete from push_private.subscriptions where id=sub.id;
  end if;
  insert into push_private.subscriptions(username,session_id,endpoint,p256dh,auth)
  values(identity->>'username',(identity->>'session_id')::uuid,p_data->>'endpoint',p_data->>'p256dh',p_data->>'auth')
  on conflict(endpoint) do update set username=excluded.username,session_id=excluded.session_id,p256dh=excluded.p256dh,auth=excluded.auth,enabled=true,updated_at=now()
  returning * into sub;
  return jsonb_build_object('ok',true,'id',sub.id,'username',sub.username);
 elsif p_action='unsubscribe' then
  update push_private.subscriptions set enabled=false where endpoint=p_data->>'endpoint' and username=identity->>'username' returning * into sub;
  update push_private.deliveries set state='cancelled' where subscription_id=sub.id and state in ('pending','sending');
  return jsonb_build_object('ok',true);
 elsif p_action='test' then
  select * into sub from push_private.subscriptions where id=(p_data->>'subscription_id')::uuid and username=identity->>'username' and enabled for update;
  if not found then return jsonb_build_object('error','Nejdříve zapněte upozornění na tomto zařízení.','status',404);end if;
  if sub.last_test_at>now()-interval '30 seconds' then return jsonb_build_object('error','Další zkoušku můžete odeslat za půl minuty.','status',429);end if;
  update push_private.subscriptions set last_test_at=now() where id=sub.id;
  insert into push_private.deliveries(subscription_id,event_key,kind,title,body,available_at,expires_at)
   values(sub.id,gen_random_uuid()::text,'test','LIMMIT · Upozornění fungují','Tato zpráva může přijít, i když je aplikace zavřená.',now()+interval '10 seconds',now()+interval '15 minutes');
  return jsonb_build_object('ok',true,'queued',true);
 elsif p_action='claim' then
  update push_private.settings set last_worker_at=now();
  update push_private.deliveries set state='cancelled' where state in ('pending','sending') and
   (expires_at<=now() or subscription_id in(select id from push_private.subscriptions where not enabled));
  update push_private.deliveries set state='failed' where state='sending' and lease_until<now() and attempts>=6;
  current_lease:=gen_random_uuid();
  with batch as (
   select d.id from push_private.deliveries d join push_private.subscriptions s on s.id=d.subscription_id
   join attendance_private.login_sessions ls on ls.id=s.session_id and ls.revoked_at is null
   where s.enabled and d.expires_at>now() and d.available_at<=now() and d.attempts<6
    and (d.state='pending' or (d.state='sending' and d.lease_until<now()))
   order by d.available_at,d.id limit 20 for update of d skip locked
  ), leased as (
   update push_private.deliveries d set state='sending',attempts=attempts+1,lease_id=current_lease,lease_until=now()+interval '2 minutes'
   from batch where d.id=batch.id returning d.*
  )
  select coalesce(jsonb_agg(jsonb_build_object('id',d.id,'lease_id',d.lease_id,'receipt_token',d.receipt_token,'title',d.title,'body',d.body,
   'task_id',d.task_id,'kind',d.kind,'expires_at',d.expires_at,'endpoint',s.endpoint,'p256dh',s.p256dh,'auth',s.auth)),'[]') into result
  from leased d join push_private.subscriptions s on s.id=d.subscription_id;
  return jsonb_build_object('deliveries',result);
 elsif p_action='complete' then
  select subscription_id into sub.id from push_private.deliveries
   where id=(p_data->>'id')::uuid and lease_id=(p_data->>'lease_id')::uuid and state='sending';
  if sub.id is null then return jsonb_build_object('ok',true);end if;
  n:=coalesce((p_data->>'status')::integer,0);
  if n in (404,410) then
   update push_private.subscriptions set enabled=false where id=sub.id;
   update push_private.deliveries set state='cancelled',last_status=n where subscription_id=sub.id and state in ('pending','sending');
  else
   update push_private.deliveries set
    state=case when n between 200 and 299 then 'accepted' when attempts>=6 or n in (400,413) then 'failed' else 'pending' end,
    accepted_at=case when n between 200 and 299 then now() else null end,
    available_at=now()+make_interval(secs=>least(3600,60*power(2,attempts-1)::int)),
    last_status=n,lease_until=null
   where id=(p_data->>'id')::uuid and lease_id=(p_data->>'lease_id')::uuid;
  end if;
  return jsonb_build_object('ok',true);
 elsif p_action='receipt' then
  update push_private.deliveries set displayed_at=coalesce(displayed_at,now())
   where id=(p_data->>'id')::uuid and receipt_token=(p_data->>'receipt_token')::uuid;
  return jsonb_build_object('ok',true);
 elsif p_action='configure' then
  if p_data->>'url' !~ '^https://[a-zA-Z0-9.-]+/api/push/dispatch$' or length(coalesce(p_data->>'token',''))<40 then
   raise exception 'Neplatné nastavení odesílání.';
  end if;
  update push_private.settings set worker_url=p_data->>'url',worker_token=p_data->>'token',enabled=true;
  return jsonb_build_object('ok',true);
 else raise exception 'Neznámá akce.';
 end if;
end $$;

create function public.web_push_gateway(p_secret text,p_token text,p_action text,p_data jsonb default '{}')
returns jsonb language sql security invoker set search_path='' as $$
 select push_private.gateway(p_secret,p_token,p_action,p_data);
$$;
revoke all on all functions in schema push_private from public,anon,authenticated;
revoke all on function public.web_push_gateway(text,text,text,jsonb) from public,anon,authenticated;
grant usage on schema push_private to anon,authenticated;
grant execute on function push_private.gateway(text,text,text,jsonb),public.web_push_gateway(text,text,text,jsonb) to anon,authenticated;

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

create function push_private.tick()
returns void language plpgsql security definer set search_path='' as $$
declare config push_private.settings%rowtype;
begin
 select * into config from push_private.settings;
 if not config.enabled then return;end if;
 update push_private.settings set last_tick_at=now();
 perform push_private.reminders();
 delete from push_private.deliveries where created_at<now()-interval '30 days';
 if exists(select 1 from push_private.deliveries where
  (state='pending' and available_at<=now()) or (state='sending' and lease_until<now())) then
  perform net.http_post(url:=config.worker_url,headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||config.worker_token),body:='{}',timeout_milliseconds:=55000);
 end if;
end $$;
revoke all on function push_private.tick() from public,anon,authenticated;
select cron.schedule('limmit-web-push','* * * * *','select push_private.tick();');
notify pgrst,'reload schema';
