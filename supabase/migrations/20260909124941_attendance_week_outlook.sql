create or replace function attendance_private.gateway(p_secret text,p_actor text,p_action text,p_data jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare cfg attendance_private.settings%rowtype;u attendance_private.people%rowtype;r attendance_private.requests%rowtype;ab attendance_private.absences%rowtype;
 v_now timestamptz:=clock_timestamp();v_today date:=(clock_timestamp() at time zone 'Europe/Prague')::date;
 d1 date;d2 date;wk date;days date[];v_id uuid;person text;yr integer;used integer;decision text;v_kind text;
 team boolean:=coalesce((p_data->>'team')::boolean,false);v_year int:=coalesce((p_data->>'year')::int,extract(year from clock_timestamp() at time zone 'Europe/Prague')::int);
begin
 select * into cfg from attendance_private.settings;
 if p_secret is null or cfg.gateway_hash is null or encode(extensions.digest(p_secret,'sha256'),'hex')<>cfg.gateway_hash then raise exception 'Neplatné přihlášení.' using errcode='28000';end if;
 select * into u from attendance_private.people where username=p_actor;
 if not found then raise exception 'Neznámý uživatel.' using errcode='28000';end if;
 cfg.work_end:=(cfg.work_start+make_interval(hours=>u.daily_hours))::time;
 if team and u.role<>'OWNER' then raise exception 'Přehled týmu je dostupný pouze majiteli.';end if;
 if v_year not between 2020 and 2100 then raise exception 'Neplatný rok.';end if;
 perform pg_advisory_xact_lock(hashtextextended('attendance:'||p_actor,0));
 if p_action='request' then
  v_id:=(p_data->>'id')::uuid;d1:=(p_data->>'date_from')::date;d2:=(p_data->>'date_to')::date;v_kind:=p_data->>'kind';
  if d1 is null or d2 is null or d2<d1 or d2-d1>370 or v_kind not in ('VACATION','PERSONAL') then raise exception 'Zkontrolujte typ a termín volna.';end if;
  if exists(select 1 from attendance_private.requests where id=v_id and username=p_actor) then return jsonb_build_object('saved',true);end if;
  if v_kind='VACATION' and d1<v_today then raise exception 'O dovolenou požádejte před jejím začátkem.';end if;
  if attendance_private.workdays(d1,d2)=0 then raise exception 'Vyberte alespoň jeden pracovní den.';end if;
  if v_kind='PERSONAL' and (d1<>d2 or nullif(p_data->>'time_from','') is null or nullif(p_data->>'time_to','') is null or (p_data->>'time_to')::time<=(p_data->>'time_from')::time) then raise exception 'Osobní volno musí mít jeden den a platný čas od–do.';end if;
  if exists(select 1 from attendance_private.requests x where x.username=p_actor and x.status in ('PENDING','APPROVED') and daterange(x.date_from,x.date_to,'[]')&&daterange(d1,d2,'[]') and (v_kind='VACATION' or x.kind='VACATION' or ((p_data->>'time_from')::time<x.time_to and (p_data->>'time_to')::time>x.time_from))) then raise exception 'Termín se překrývá s jiným nahlášeným volnem.';end if;
  if v_kind='VACATION' then
   for yr in extract(year from d1)::int..extract(year from d2)::int loop
    select coalesce(sum(attendance_private.workdays(greatest(x.date_from,make_date(yr,1,1)),least(x.date_to,make_date(yr,12,31)))),0) into used from attendance_private.requests x where x.username=p_actor and x.kind='VACATION' and x.status in ('PENDING','APPROVED') and x.date_from<=make_date(yr,12,31) and x.date_to>=make_date(yr,1,1);
    if used+attendance_private.workdays(greatest(d1,make_date(yr,1,1)),least(d2,make_date(yr,12,31)))>25 then raise exception 'Pro rok % překračujete 25 dnů dovolené (včetně čekajících žádostí).',yr;end if;
   end loop;
  end if;
  insert into attendance_private.requests(id,username,kind,date_from,date_to,time_from,time_to,note,status)
  values(v_id,p_actor,v_kind,d1,d2,case when v_kind='PERSONAL' then (p_data->>'time_from')::time end,case when v_kind='PERSONAL' then (p_data->>'time_to')::time end,coalesce(p_data->>'note',''),case when v_kind='PERSONAL' and not cfg.personal_approval then 'APPROVED' else 'PENDING' end);
  person:=p_actor;
 elsif p_action in ('review_request','cancel_request') then
  v_id:=(p_data->>'id')::uuid;select * into r from attendance_private.requests where id=v_id for update;
  if not found then raise exception 'Žádost nenalezena.';end if;
  person:=r.username;
  if p_action='review_request' then
   if u.role<>'OWNER' or r.username=p_actor then raise exception 'Žádost schvaluje jiný majitel než žadatel.';end if;
   if r.status<>'PENDING' then raise exception 'Žádost již byla vyřízena. Obnovte přehled.';end if;
   decision:=p_data->>'decision';if decision not in ('APPROVED','REJECTED') then raise exception 'Neplatné rozhodnutí.';end if;
   if decision='REJECTED' and length(trim(coalesce(p_data->>'note','')))=0 then raise exception 'Doplňte důvod zamítnutí.';end if;
   update attendance_private.requests set status=decision,reviewer=p_actor,reviewed_at=v_now,review_note=p_data->>'note' where id=v_id;
  else
   if r.username<>p_actor and u.role<>'OWNER' then raise exception 'Zrušit lze jen vlastní žádost.';end if;
   if r.status not in ('PENDING','APPROVED') or (r.status='APPROVED' and r.kind='VACATION' and r.date_from<=v_today) then raise exception 'Probíhající nebo minulé schválené volno nelze zpětně zrušit.';end if;
   update attendance_private.requests set status='CANCELLED' where id=v_id;
  end if;
 elsif p_action='home_plan' then
  wk:=(p_data->>'week')::date;
  select array_agg(distinct value::date) into days from jsonb_array_elements_text(p_data->'days');
  if wk is null or extract(isodow from wk)<>1 then raise exception 'Vyberte týden začínající pondělím.';end if;
  if v_today>=wk then raise exception 'Home office je nutné nahlásit nejpozději v neděli před daným týdnem.';end if;
  if wk>v_today+370 or coalesce(cardinality(days),0)>4 then raise exception 'Home office může být nejvýše 4 dny v týdnu.';end if;
  if exists(select 1 from unnest(days) d where d<wk or d>wk+4 or not attendance_private.business_day(d)) then raise exception 'Home office lze nahlásit pouze na pracovní dny vybraného týdne.';end if;
  if exists(select 1 from unnest(days) d join attendance_private.requests x on x.username=p_actor and x.kind='VACATION' and x.status in ('PENDING','APPROVED') and d between x.date_from and x.date_to) then raise exception 'Home office se překrývá s dovolenou.';end if;
  delete from attendance_private.home_days where username=p_actor and day between wk and wk+4 and not(day=any(coalesce(days,'{}'::date[])));
  insert into attendance_private.home_days(username,day) select p_actor,d from unnest(days) d on conflict do nothing;
  person:=p_actor;

 elsif p_action in ('checkin','checkout') then
  if not exists(select 1 from attendance_private.home_days where username=p_actor and day=v_today) then raise exception 'Na dnešek nemáte nahlášený home office.';end if;
  if p_action='checkin' then
   if exists(select 1 from attendance_private.requests x where x.username=p_actor and x.kind='VACATION' and x.status='APPROVED' and v_today between x.date_from and x.date_to) then raise exception 'Dnes máte schválenou dovolenou.';end if;
   insert into attendance_private.sessions(username,day,started_at) values(p_actor,v_today,v_now) on conflict(username,day) where ended_at is null do nothing;
   insert into attendance_private.checkins(username,day,checked_in_at) values(p_actor,v_today,v_now) on conflict do nothing;
  else
   update attendance_private.sessions set ended_at=v_now where username=p_actor and day=v_today and ended_at is null;
  end if;
  person:=p_actor;
 elsif p_action in ('ask_excuse','submit_excuse','review_excuse') then
  v_id:=(p_data->>'id')::uuid;select * into ab from attendance_private.absences where id=v_id for update;
  if not found then raise exception 'Absence nenalezena. Obnovte přehled.';end if;
  person:=ab.username;
  if p_action='submit_excuse' then
   if ab.username<>p_actor then raise exception 'Omluvenku vyplňuje dotčený zaměstnanec.';end if;
   if ab.status='EXCUSED' then raise exception 'Absence už je omluvená.';end if;
   if length(trim(coalesce(p_data->>'note',''))) not between 1 and 3000 then raise exception 'Vyplňte omluvenku (nejvýše 3000 znaků).';end if;
   update attendance_private.absences set status='SUBMITTED',explanation=p_data->>'note',submitted_at=v_now where id=v_id;
  else
   if u.role<>'OWNER' or ab.username=p_actor then raise exception 'Omluvenku vyřizuje jiný majitel.';end if;
   if p_action='ask_excuse' then
    if ab.status in ('SUBMITTED','EXCUSED') then raise exception 'Omluvenka už byla dodána nebo schválena.';end if;
    update attendance_private.absences set status='REQUESTED',requested_by=p_actor,requested_at=v_now,request_note=coalesce(nullif(p_data->>'note',''),'Prosím doplňte omluvenku k absenci.') where id=v_id;
   else
    if ab.status<>'SUBMITTED' then raise exception 'Nejprve musí být dodána omluvenka.';end if;
    decision:=p_data->>'decision';if decision not in ('EXCUSED','REJECTED') then raise exception 'Neplatné rozhodnutí.';end if;
    if decision='REJECTED' and length(trim(coalesce(p_data->>'note','')))=0 then raise exception 'Doplňte důvod zamítnutí.';end if;
    update attendance_private.absences set status=decision,reviewer=p_actor,reviewed_at=v_now,review_note=p_data->>'note' where id=v_id;
   end if;
  end if;
 elsif p_action<>'snapshot' then raise exception 'Neznámá akce.';
 end if;
 if p_action<>'snapshot' then insert into attendance_private.events(username,actor,action,record_id,details) values(person,p_actor,p_action,v_id,p_data-'team');end if;
 -- Materialize missing cases from durable plans, even after days without visits.
 insert into attendance_private.absences(username,day)
 select h.username,h.day from attendance_private.home_days h
 where (h.username=p_actor or (team and u.role='OWNER')) and h.day<=v_today and attendance_private.absence_minutes(h.username,h.day,v_now)>0
 on conflict(username,day) do nothing;
 return jsonb_build_object(
 'server_now',v_now,'today',v_today,'user',to_jsonb(u),
 'rules',jsonb_build_object('vacation_days',25,'home_limit',4,'work_start',cfg.work_start,'work_end',cfg.work_end,'personal_approval',cfg.personal_approval,'timezone','Europe/Prague'),
 'people',(select coalesce(jsonb_agg(to_jsonb(p)),'[]') from attendance_private.people p where p.username=p_actor or team),
 'balances',(select coalesce(jsonb_agg(jsonb_build_object('username',p.username,'approved',(select coalesce(sum(attendance_private.workdays(greatest(x.date_from,make_date(v_year,1,1)),least(x.date_to,make_date(v_year,12,31)))),0) from attendance_private.requests x where x.username=p.username and x.kind='VACATION' and x.status='APPROVED' and x.date_from<=make_date(v_year,12,31) and x.date_to>=make_date(v_year,1,1)),'pending',(select coalesce(sum(attendance_private.workdays(greatest(x.date_from,make_date(v_year,1,1)),least(x.date_to,make_date(v_year,12,31)))),0) from attendance_private.requests x where x.username=p.username and x.kind='VACATION' and x.status='PENDING' and x.date_from<=make_date(v_year,12,31) and x.date_to>=make_date(v_year,1,1)))),'[]') from attendance_private.people p where p.username=p_actor or team),
 'week_requests',(select coalesce(jsonb_agg(to_jsonb(x) order by x.date_from),'[]') from attendance_private.requests x where (x.username=p_actor or team) and x.date_from<=v_today-extract(isodow from v_today)::int+12 and x.date_to>=v_today-extract(isodow from v_today)::int+1),
 'week_home_days',(select coalesce(jsonb_agg(to_jsonb(h) order by h.day),'[]') from attendance_private.home_days h where (h.username=p_actor or team) and h.day between v_today-extract(isodow from v_today)::int+1 and v_today-extract(isodow from v_today)::int+12),
 'requests',(select coalesce(jsonb_agg(to_jsonb(x)||jsonb_build_object('days',attendance_private.workdays(x.date_from,x.date_to)) order by x.created_at desc),'[]') from attendance_private.requests x where (x.username=p_actor or team) and x.date_from<=make_date(v_year,12,31) and x.date_to>=make_date(v_year,1,1)),
 'home_days',(select coalesce(jsonb_agg(to_jsonb(h) order by h.day),'[]') from attendance_private.home_days h where (h.username=p_actor or team) and h.day between make_date(v_year,1,1) and make_date(v_year,12,31)+14),
 'checkins',(select coalesce(jsonb_agg(to_jsonb(c)),'[]') from attendance_private.checkins c where (c.username=p_actor or team) and extract(year from c.day)=v_year),
 'sessions',(select coalesce(jsonb_agg(to_jsonb(z) order by z.started_at desc),'[]') from attendance_private.sessions z where (z.username=p_actor or team) and extract(year from z.day)=v_year),
 'absences',(select coalesce(jsonb_agg(to_jsonb(a)||jsonb_build_object('minutes',attendance_private.absence_minutes(a.username,a.day,v_now)) order by a.day desc),'[]') from attendance_private.absences a where (a.username=p_actor or team) and extract(year from a.day)=v_year),
 'events',(select coalesce(jsonb_agg(to_jsonb(e) order by e.created_at desc),'[]') from (select * from attendance_private.events where (username=p_actor or team) and extract(year from created_at at time zone 'Europe/Prague')=v_year order by created_at desc limit 100) e)
 );
end;$$;

notify pgrst,'reload schema';
