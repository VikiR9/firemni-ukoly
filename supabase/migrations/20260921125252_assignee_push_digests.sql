-- Only new assignments, completion by a fellow assignee, and two daily digests.
drop trigger push_comment_added on public.task_updates;
drop function push_private.comment_added();

create or replace function push_private.assignment_changed()
returns trigger language plpgsql security definer set search_path='' as $$
declare recipients text[];
begin
 if exists(select 1 from public.tasks where id=new.task_id and archived_at is not null) then return new;end if;
 if tg_op='INSERT' then
  perform push_private.enqueue(array[new.assignee],null,new.task_id,'assigned',gen_random_uuid()::text,
   'Nový úkol','Byl vám přidělen nový úkol. Podrobnosti najdete v aplikaci LIMMIT.');
 elsif new.status='DONE' and old.status is distinct from 'DONE' then
  select array_agg(assignee) into recipients from public.task_assignments
   where task_id=new.task_id and assignee<>new.assignee;
  -- The completing person is excluded, even when also the creator or an owner.
  perform push_private.enqueue(recipients,new.assignee,new.task_id,'peer_completed',gen_random_uuid()::text,
   'Kolega dokončil úkol',new.assignee||' má svou část společného úkolu hotovou. Podrobnosti najdete v aplikaci LIMMIT.');
 end if;
 return new;
end $$;

create function push_private.overdue_digest(p_at timestamptz)
returns void language plpgsql security definer set search_path='' as $$
declare local_at timestamp:=p_at at time zone 'Europe/Prague'; slot text;
begin
 -- Runs at :30. A 30-minute recovery window tolerates a short scheduler outage.
 -- Unique slot keys prevent repeated minute ticks from creating extra messages.
 if local_at::time>=time '08:30' and local_at::time<time '09:00' then slot:='08:30';
 elsif local_at::time>=time '14:30' and local_at::time<time '15:00' then slot:='14:30';
 else return;end if;
 insert into push_private.deliveries(subscription_id,event_key,kind,title,body,expires_at)
 select s.id,'overdue:'||local_at::date||':'||slot,'overdue','Úkoly po termínu',
  'Počet vašich úkolů po termínu: '||totals.n||'. Otevřete svůj přehled v aplikaci LIMMIT.',
  p_at+interval '4 hours'
 from (
  select a.assignee,count(distinct t.id) as n
  from public.task_assignments a join public.tasks t on t.id=a.task_id
  where t.archived_at is null and t.due<local_at::date and a.status not in ('DONE','DECLINED')
  group by a.assignee
 ) totals
 join attendance_private.people p on p.display_name=totals.assignee
 join push_private.subscriptions s on s.username=p.username and s.enabled
 join attendance_private.login_sessions ls on ls.id=s.session_id and ls.revoked_at is null
 on conflict(subscription_id,event_key) do nothing;
end $$;

create or replace function push_private.reminders()
returns void language sql security definer set search_path='' as $$
 select push_private.overdue_digest(now());
$$;
revoke all on function push_private.overdue_digest(timestamptz) from public,anon,authenticated;

-- Do not deliver notifications left over from the previous notification rules.
update push_private.deliveries set state='cancelled'
 where state in ('pending','sending') and kind not in ('assigned','peer_completed','overdue','test');
notify pgrst,'reload schema';
