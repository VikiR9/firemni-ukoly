create table attendance_private.accounts (
 username text primary key references attendance_private.people(username),
 password_hash text not null,
 password_changed_at timestamptz not null default clock_timestamp()
);
create table attendance_private.login_sessions (
 id uuid primary key default gen_random_uuid(),
 username text not null references attendance_private.accounts(username),
 token_hash text not null unique,
 user_agent text not null default '',
 ip_address text not null default '',
 created_at timestamptz not null default clock_timestamp(),
 last_seen_at timestamptz not null default clock_timestamp(),
 expires_at timestamptz not null default clock_timestamp()+interval '7 days',
 revoked_at timestamptz
);
create index login_sessions_user on attendance_private.login_sessions(username,created_at desc);
create table attendance_private.login_limits (
 key text primary key, window_start timestamptz not null, attempts integer not null
);
create table attendance_private.security_events (
 id bigint generated always as identity primary key,
 actor text, username text, action text not null, created_at timestamptz not null default clock_timestamp()
);
alter table attendance_private.accounts enable row level security;
alter table attendance_private.login_sessions enable row level security;
alter table attendance_private.login_limits enable row level security;
alter table attendance_private.security_events enable row level security;
revoke all on attendance_private.accounts,attendance_private.login_sessions,attendance_private.login_limits,attendance_private.security_events from public,anon,authenticated;

create function public.account_gateway(p_secret text,p_token text,p_action text,p_data jsonb default '{}')
returns jsonb language plpgsql security definer set search_path='' as $$
declare cfg text; s attendance_private.login_sessions%rowtype; a attendance_private.accounts%rowtype;
 v_user text; v_password text; v_now timestamptz:=clock_timestamp(); v_key text; v_count integer; v_item jsonb; v_id uuid; v_admin boolean; v_hash text;
begin
 select gateway_hash into cfg from attendance_private.settings;
 if p_secret is null or cfg is null or encode(extensions.digest(p_secret,'sha256'),'hex')<>cfg then
  raise exception 'Neplatné přihlášení.' using errcode='28000';
 end if;
 perform pg_advisory_xact_lock(hashtextextended('account:sessions',0));
 if p_action='bootstrap' then
  if exists(select 1 from attendance_private.accounts) then raise exception 'Účty již byly založeny.';end if;
  for v_item in select value from jsonb_array_elements(p_data->'users') loop
   v_password:=v_item->>'password';
   if v_password is null or length(v_password)<12 or octet_length(v_password)>72 then raise exception 'Heslo musí mít alespoň 12 znaků a nejvýše 72 bajtů.';end if;
   insert into attendance_private.accounts(username,password_hash) values(v_item->>'username',extensions.crypt(v_password,extensions.gen_salt('bf',12)));
  end loop;
  if (select count(*) from attendance_private.accounts)<>(select count(*) from attendance_private.people) then raise exception 'Chybí účty kolegů.';end if;
  insert into attendance_private.security_events(action) values('accounts_initialized');
  return jsonb_build_object('ok',true);
 end if;
 if p_action='login' then
  v_user:=upper(coalesce(p_data->>'username',''));v_password:=p_data->>'password';
  if p_token is null or length(p_token)<40 or length(p_token)>200 then raise exception 'Neplatná relace.';end if;
  delete from attendance_private.login_limits where window_start<v_now-interval '1 day';
  foreach v_key in array array['user:'||v_user,'ip:'||left(coalesce(p_data->>'ip','unknown'),100)] loop
   insert into attendance_private.login_limits(key,window_start,attempts) values(v_key,v_now,1)
   on conflict(key) do update set
    attempts=case when attendance_private.login_limits.window_start<v_now-interval '15 minutes' then 1 else attendance_private.login_limits.attempts+1 end,
    window_start=case when attendance_private.login_limits.window_start<v_now-interval '15 minutes' then v_now else attendance_private.login_limits.window_start end
   returning attempts into v_count;
   if v_count>(case when v_key like 'user:%' then 10 else 60 end) then return jsonb_build_object('error','Příliš mnoho pokusů. Zkuste přihlášení za 15 minut.','status',429);end if;
  end loop;
  select * into a from attendance_private.accounts where username=v_user;
  if v_password is null or octet_length(v_password)>72 then return jsonb_build_object('error','Neplatné přihlašovací údaje.','status',401);end if;
  v_hash:=coalesce(a.password_hash,(select password_hash from attendance_private.accounts order by username limit 1));
  if v_hash is null or extensions.crypt(v_password,v_hash)<>v_hash or a.username is null then
   return jsonb_build_object('error','Neplatné přihlašovací údaje.','status',401);
  end if;
  delete from attendance_private.login_limits where key='user:'||v_user;
  insert into attendance_private.login_sessions(username,token_hash,user_agent,ip_address)
   values(v_user,encode(extensions.digest(p_token,'sha256'),'hex'),left(coalesce(p_data->>'user_agent',''),1000),left(coalesce(p_data->>'ip',''),100)) returning id into v_id;
  insert into attendance_private.security_events(actor,username,action) values(v_user,v_user,'login');
  return jsonb_build_object('username',v_user,'session_id',v_id);
 end if;
 select * into s from attendance_private.login_sessions where token_hash=encode(extensions.digest(coalesce(p_token,''),'sha256'),'hex') and revoked_at is null and expires_at>v_now;
 if not found then return jsonb_build_object('error','Přihlášení vypršelo nebo bylo odhlášeno.','status',401);end if;
 select exists(select 1 from attendance_private.people where username=s.username and username='VIKTOR' and role='OWNER') into v_admin;
 if s.last_seen_at<v_now-interval '1 minute' then update attendance_private.login_sessions set last_seen_at=v_now where id=s.id;end if;
 if p_action='check' then return jsonb_build_object('username',s.username,'session_id',s.id);end if;
 if p_action='logout' then
  update attendance_private.login_sessions set revoked_at=v_now where id=s.id;
  insert into attendance_private.security_events(actor,username,action) values(s.username,s.username,'logout');
  return jsonb_build_object('ok',true);
 end if;
 if p_action='list' then
  return jsonb_build_object('current_session_id',s.id,'can_manage_team',v_admin,
   'people',(select jsonb_agg(jsonb_build_object('username',p.username,'display_name',p.display_name,'password_changed_at',acc.password_changed_at) order by p.display_name) from attendance_private.people p join attendance_private.accounts acc using(username) where v_admin or p.username=s.username),
   'sessions',(select coalesce(jsonb_agg(to_jsonb(x) order by x.last_seen_at desc),'[]') from
    (select id,username,user_agent,ip_address,created_at,last_seen_at,expires_at,revoked_at from attendance_private.login_sessions where (v_admin or username=s.username) and created_at>v_now-interval '90 days') x));
 end if;
 v_user:=coalesce(nullif(p_data->>'username',''),s.username);
 if v_user<>s.username and not v_admin then return jsonb_build_object('error','Správa kolegů je dostupná pouze Viktorovi.','status',403);end if;
 if not exists(select 1 from attendance_private.accounts where username=v_user) then return jsonb_build_object('error','Uživatel nebyl nalezen.','status',404);end if;
 if p_action='revoke' then
  v_id:=(p_data->>'session_id')::uuid;
  if not exists(select 1 from attendance_private.login_sessions where id=v_id and username=v_user) then return jsonb_build_object('error','Zařízení nebylo nalezeno.','status',404);end if;
  update attendance_private.login_sessions set revoked_at=coalesce(revoked_at,v_now) where id=v_id and username=v_user;
 elsif p_action='revoke_all' then
  update attendance_private.login_sessions set revoked_at=coalesce(revoked_at,v_now) where username=v_user;
 elsif p_action='password' then
  if not v_admin then
   select * into a from attendance_private.accounts where username=s.username;
   if nullif(p_data->>'old_password','') is null or octet_length(p_data->>'old_password')>72 or extensions.crypt(p_data->>'old_password',a.password_hash)<>a.password_hash then return jsonb_build_object('error','Současné heslo není správné.','status',400);end if;
  end if;
  v_password:=p_data->>'password';
  if v_password is null or length(v_password)<12 or octet_length(v_password)>72 then return jsonb_build_object('error','Heslo musí mít alespoň 12 znaků a nejvýše 72 bajtů.','status',400);end if;
  update attendance_private.accounts set password_hash=extensions.crypt(v_password,extensions.gen_salt('bf',12)),password_changed_at=v_now where username=v_user;
  update attendance_private.login_sessions set revoked_at=coalesce(revoked_at,v_now) where username=v_user;
 else return jsonb_build_object('error','Neplatná akce.','status',400);
 end if;
 insert into attendance_private.security_events(actor,username,action) values(s.username,v_user,p_action);
 return jsonb_build_object('ok',true);
end $$;
revoke all on function public.account_gateway(text,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.account_gateway(text,text,text,jsonb) to anon,authenticated;
