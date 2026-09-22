-- Store each person's project order without changing shared projects.
create table task_board_private.project_orders (
  username text primary key references attendance_private.people(username) on delete cascade,
  project_ids uuid[] not null default '{}',
  revision bigint not null default 0
);
alter table task_board_private.project_orders enable row level security;
revoke all on task_board_private.project_orders from public, anon, authenticated;

create function task_board_private.ordered_project_gateway(
  p_secret text, p_actor text, p_action text, p_data jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  result jsonb;
  preferences task_board_private.project_orders%rowtype;
  requested uuid[];
  allowed uuid[];
begin
  -- Authenticate and enforce project visibility through the existing gateway first.
  result := task_board_private.project_gateway(
    p_secret, p_actor,
    case when p_action = 'reorder_projects' then 'snapshot' else p_action end,
    p_data
  );
  if p_action = 'reorder_projects' then
    if jsonb_typeof(p_data->'project_ids') is distinct from 'array' then
      raise exception 'Vyberte platné pořadí projektů.';
    end if;
    select coalesce(array_agg(value::uuid order by ordinal), '{}') into requested
      from jsonb_array_elements_text(p_data->'project_ids') with ordinality as ids(value, ordinal);
    select coalesce(array_agg((value->>'id')::uuid order by (value->>'id')::uuid), '{}') into allowed
      from jsonb_array_elements(result->'projects');
    if cardinality(requested) <> cardinality(allowed)
      or (select coalesce(array_agg(id order by id), '{}') from unnest(requested) id) is distinct from allowed then
      raise exception 'Seznam projektů se změnil. Obnovte přehled a zkuste to znovu.';
    end if;
    insert into task_board_private.project_orders(username) values(p_actor) on conflict do nothing;
    select * into preferences from task_board_private.project_orders where username=p_actor for update;
    if (p_data->>'project_order_revision')::bigint is distinct from preferences.revision then
      raise exception 'Pořadí se mezitím změnilo na jiném zařízení. Obnovte přehled a zkuste to znovu.';
    end if;
    update task_board_private.project_orders set project_ids=requested, revision=revision+1
      where username=p_actor returning * into preferences;
  else
    select * into preferences from task_board_private.project_orders where username=p_actor;
  end if;
  return result || jsonb_build_object(
    'project_order_revision', coalesce(preferences.revision,0),
    'projects', (select coalesce(jsonb_agg(value order by
      array_position(preferences.project_ids,(value->>'id')::uuid) nulls last,
      value->>'created_at', value->>'id'), '[]')
      from jsonb_array_elements(result->'projects'))
  );
end $$;
revoke all on function task_board_private.ordered_project_gateway(text,text,text,jsonb) from public;
grant execute on function task_board_private.ordered_project_gateway(text,text,text,jsonb) to anon, authenticated;
create or replace function public.task_board_gateway(
  p_secret text,p_actor text,p_action text,p_data jsonb default '{}'
) returns jsonb language sql security invoker set search_path='' as $$
  select task_board_private.ordered_project_gateway(p_secret,p_actor,p_action,p_data);
$$;
notify pgrst, 'reload schema';
