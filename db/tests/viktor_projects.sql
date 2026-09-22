begin;
update attendance_private.settings set gateway_hash=encode(extensions.digest('viktor-projects-test','sha256'),'hex') where true;

do $$
declare
  a jsonb; b jsonb; pid uuid; other_pid uuid; cid uuid;
  tid uuid := gen_random_uuid();
  actor text; action text; denied boolean;
  assignment_before jsonb; comments_before jsonb;
begin
  -- Viktor can administer projects belonging to employees, another owner and himself.
  foreach actor in array array['KARINA','MILAN','VIKTOR'] loop
    a := public.task_board_gateway('viktor-projects-test',actor,'create_project',
      '{"title":"TEST Viktor project permissions","member_usernames":["VENDULA"]}');
    pid := (a->>'project_id')::uuid;
    cid := (a->'columns'->0->>'id')::uuid;
    b := public.task_board_gateway('viktor-projects-test','VIKTOR','snapshot',jsonb_build_object('project_id',pid));
    assert (b->>'can_manage_project')::boolean and (b->>'can_delete_project')::boolean and (b->>'can_edit_columns')::boolean,
      'Viktor can manage every project, even without membership';
    a := public.task_board_gateway('viktor-projects-test','VIKTOR','rename_project',jsonb_build_object(
      'project_id',pid,'revision',b->'revision','title','TEST Upravený projekt','color','#123abc',
      'member_usernames',jsonb_build_array('NIKOLA',actor)));
    assert (select title='TEST Upravený projekt' and color='#123abc' and owner_username=actor
      and member_usernames=array['NIKOLA'] from task_board_private.projects where id=pid),
      'Viktor edits title, color and members without changing the creator';
    a := public.task_board_gateway('viktor-projects-test','VIKTOR','rename_column',jsonb_build_object(
      'project_id',pid,'revision',a->'revision','column_id',cid,'title','Nový název sloupce'));
    assert (select title='Nový název sloupce' from task_board_private.project_columns where id=cid);
    a := public.task_board_gateway('viktor-projects-test','VIKTOR','delete_project',jsonb_build_object('project_id',pid,'revision',a->'revision'));
    assert a->>'project_id' is null and not (a->>'can_manage_project')::boolean and not (a->>'can_delete_project')::boolean,
      'Deletion returns the all-task board without project controls';
    assert not exists(select 1 from task_board_private.projects where id=pid);
  end loop;

  a := public.task_board_gateway('viktor-projects-test','KARINA','create_project',
    '{"title":"TEST Project to remove","member_usernames":["VENDULA"]}');
  pid := (a->>'project_id')::uuid;
  cid := (a->'columns'->0->>'id')::uuid;
  assert (a->>'can_manage_project')::boolean and not (a->>'can_delete_project')::boolean,
    'Creators keep editing rights but do not gain deletion';
  foreach actor in array array['MILAN','VENDULA','NIKOLA','KARINA'] loop
    if actor in ('MILAN','VENDULA') then
      b := public.task_board_gateway('viktor-projects-test',actor,'snapshot',jsonb_build_object('project_id',pid));
      assert not (b->>'can_manage_project')::boolean and not (b->>'can_delete_project')::boolean;
      assert (b->>'can_edit_columns')::boolean = (actor='VENDULA'), 'Only members can edit the board';
    end if;
    foreach action in array array['rename_project','delete_project'] loop
      if actor='KARINA' and action='rename_project' then continue;end if;
      denied := false;
      begin
        perform public.task_board_gateway('viktor-projects-test',actor,action,jsonb_build_object(
          'project_id',pid,'revision',a->'revision','title','Forbidden','can_manage_project',true,'can_delete_project',true));
      exception when raise_exception then denied := true;end;
      assert denied, 'Other users cannot gain project administration by forging permission flags';
    end loop;
  end loop;

  -- Tasks and their full history can be shared with another project.
  a := public.task_board_gateway('viktor-projects-test','KARINA','create_task',jsonb_build_object(
    'project_id',pid,'column_id',cid,'task_id',tid,'draft',jsonb_build_object(
      'title','TEST Preserved task','assignees',jsonb_build_array('Karina'),'priority','Medium')));
  perform public.task_workspace('comment','Karina',tid,'{"note":"TEST Preserved comment"}');
  select jsonb_agg(to_jsonb(x) order by assignee) into assignment_before from public.task_assignments x where task_id=tid;
  select jsonb_agg(to_jsonb(x) order by id) into comments_before from public.task_updates x where task_id=tid;
  b := public.task_board_gateway('viktor-projects-test','KARINA','create_project','{"title":"TEST Other project"}');
  other_pid := (b->>'project_id')::uuid;
  b := public.task_board_gateway('viktor-projects-test','KARINA','add_task',jsonb_build_object(
    'project_id',other_pid,'column_id',b->'columns'->0->>'id','task_id',tid));
  insert into task_board_private.project_orders(username,project_ids,revision)
    values('VIKTOR',array[other_pid,pid],10),('VENDULA',array[pid],20)
    on conflict(username) do update set project_ids=excluded.project_ids,revision=excluded.revision;

  -- Missing/stale revisions and missing identifiers must never delete anything.
  foreach action in array array['rename_project','delete_project'] loop
    denied := false;
    begin
      perform public.task_board_gateway('viktor-projects-test','VIKTOR',action,jsonb_build_object(
        'project_id',pid,'revision',-1,'title','Stale edit'));
    exception when raise_exception then denied := sqlerrm='Projekt se mezitím změnil. Obnovte jej a zkuste to znovu.';end;
    assert denied, 'Stale operations are rejected';
  end loop;
  denied := false;
  begin
    perform public.task_board_gateway('viktor-projects-test','VIKTOR','delete_project',jsonb_build_object('project_id',pid));
  exception when raise_exception then denied := sqlerrm='Projekt se mezitím změnil. Obnovte jej a zkuste to znovu.';end;
  assert denied, 'Deletion requires the current revision';
  denied := false;
  begin
    perform public.task_board_gateway('viktor-projects-test','VIKTOR','delete_project','{}');
  exception when raise_exception then denied := sqlerrm='Vyberte projekt ke smazání.';end;
  assert denied, 'Deletion requires a project ID';
  denied := false;
  begin
    perform public.task_board_gateway('wrong-secret','VIKTOR','delete_project',jsonb_build_object('project_id',pid,'revision',a->'revision'));
  exception when raise_exception then denied := sqlerrm='Neplatné přihlášení.';end;
  assert denied, 'Viktor cannot bypass gateway authentication';
  update attendance_private.people set role='EMPLOYEE' where username='VIKTOR';
  denied := false;
  begin
    perform public.task_board_gateway('viktor-projects-test','VIKTOR','delete_project',jsonb_build_object('project_id',pid,'revision',a->'revision'));
  exception when raise_exception then denied := sqlerrm='Projekty může mazat pouze Viktor.';end;
  assert denied, 'Viktor must retain the OWNER role';
  update attendance_private.people set role='OWNER' where username='VIKTOR';

  a := public.task_board_gateway('viktor-projects-test','VIKTOR','delete_project',jsonb_build_object('project_id',pid,'revision',a->'revision'));
  assert not exists(select 1 from task_board_private.projects where id=pid);
  assert not exists(select 1 from task_board_private.project_columns where project_id=pid);
  assert not exists(select 1 from task_board_private.project_placements where project_id=pid);
  assert exists(select 1 from public.tasks where id=tid and archived_at is null), 'Project deletion preserves the task';
  assert (select jsonb_agg(to_jsonb(x) order by assignee) from public.task_assignments x where task_id=tid)=assignment_before,
    'Assignees and their statuses are preserved';
  assert (select jsonb_agg(to_jsonb(x) order by id) from public.task_updates x where task_id=tid)=comments_before,
    'Comments and history are preserved';
  assert exists(select 1 from task_board_private.project_placements where project_id=other_pid and task_id=tid),
    'Placement in other projects is preserved';
  assert exists(select 1 from task_board_private.placements where task_id=tid), 'Task remains on the all-task board';
  assert not exists(select 1 from task_board_private.project_orders where pid=any(project_ids));
  assert (a->>'project_order_revision')::bigint=11, 'Deletion invalidates saved project ordering';
  assert (select project_ids=array[other_pid] from task_board_private.project_orders where username='VIKTOR'),
    'Other project ordering is retained';
  assert not exists(select 1 from jsonb_array_elements(a->'projects') p where p->>'id'=pid::text);
  denied := false;
  begin
    perform public.task_board_gateway('viktor-projects-test','VIKTOR','snapshot',jsonb_build_object('project_id',pid));
  exception when raise_exception then denied := sqlerrm='Projekt není dostupný.';end;
  assert denied, 'Removed projects become unavailable to open clients';
end $$;

rollback;
