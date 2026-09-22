begin;
-- The test credential and all writes exist only in this rolled-back transaction.
update attendance_private.settings set gateway_hash=encode(extensions.digest('project-order-test','sha256'),'hex');
do $$
declare original jsonb; reordered jsonb; again jsonb; other jsonb; ids jsonb; rejected boolean; pid uuid;
begin
  original := public.task_board_gateway('project-order-test','VIKTOR','snapshot','{}');
  other := public.task_board_gateway('project-order-test','MILAN','snapshot','{}');
  select jsonb_agg(value->>'id' order by n desc) into ids
    from jsonb_array_elements(original->'projects') with ordinality p(value,n);
  reordered := public.task_board_gateway('project-order-test','VIKTOR','reorder_projects',jsonb_build_object('project_ids',ids,'project_order_revision',original->'project_order_revision'));
  assert (reordered->>'project_order_revision')::bigint=(original->>'project_order_revision')::bigint+1, 'Order revision increments';
  again := public.task_board_gateway('project-order-test','VIKTOR','snapshot','{}');
  assert again->'projects'=reordered->'projects', 'Order persists across reloads';
  assert again->'projects'->0->>'id'=ids->>0, 'Visual order matches saved order';
  assert again->'columns'=original->'columns' and again->'placements'=original->'placements', 'Task positions untouched';
  again := public.task_board_gateway('project-order-test','MILAN','snapshot','{}');
  assert again->'projects'=other->'projects', 'Other user order untouched';
  rejected:=false;
  begin perform public.task_board_gateway('project-order-test','VIKTOR','reorder_projects',jsonb_build_object('project_ids',ids,'project_order_revision',original->'project_order_revision'));
  exception when others then rejected:=true; end;
  assert rejected, 'Stale order rejected';
  rejected:=false;
  begin perform public.task_board_gateway('project-order-test','VIKTOR','reorder_projects',jsonb_build_object('project_ids',jsonb_build_array(ids->0,ids->0),'project_order_revision',reordered->'project_order_revision'));
  exception when others then rejected:=true; end;
  assert rejected, 'Missing and duplicate project IDs rejected';
  rejected:=false;
  begin perform public.task_board_gateway('project-order-test','KARINA','reorder_projects',jsonb_build_object('project_ids',ids,'project_order_revision',0));
  exception when others then rejected:=true; end;
  assert rejected, 'Projects outside user visibility rejected';
  rejected:=false;
  begin perform public.task_board_gateway('incorrect-secret','VIKTOR','reorder_projects',jsonb_build_object('project_ids',ids,'project_order_revision',reordered->'project_order_revision'));
  exception when others then rejected:=true; end;
  assert rejected, 'Unauthenticated mutation rejected';
  insert into task_board_private.projects(owner_username,title) values('VIKTOR','TEST ORDER APPEND') returning id into pid;
  again:=public.task_board_gateway('project-order-test','VIKTOR','snapshot','{}');
  assert again->'projects'->-1->>'id'=pid::text, 'New project appended after saved order';
end $$;
select 'All project order assertions passed; all test writes rolled back.' as result;
rollback;
