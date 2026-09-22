begin;
update attendance_private.settings set gateway_hash=encode(extensions.digest('editor-test','sha256'),'hex') where true;

create function pg_temp.save_editor_task(actor text, action text, tid uuid, source jsonb, destination jsonb, column_id uuid, draft jsonb default '{}')
returns jsonb language sql as $$
  select public.task_board_gateway('editor-test',actor,'save_task',jsonb_build_object(
    'save_action',action,'task_id',tid,'draft',draft,'placement',jsonb_build_object(
      'project_id',destination->'project_id','column_id',column_id,'revision',destination->'revision',
      'source_project_id',source->'project_id','source_revision',source->'revision',
      'source_column_id',(select p->>'column_id' from jsonb_array_elements(source->'placements') p where p->>'task_id'=tid::text))));
$$;

do $$
declare
  a jsonb; b jsonb; v jsonb; shared jsonb; other jsonb; global_board jsonb;
  pid_a uuid; pid_b uuid; pid_v uuid; pid_shared uuid; pid_other uuid;
  tid uuid := gen_random_uuid(); bad_tid uuid := gen_random_uuid();
  draft jsonb := '{"title":"TEST Editor task","description":"Shared content","priority":"Medium","assignees":["Karina","Vendula"],"requires_approval":false}';
  denied boolean;
  old_position numeric;
begin
  a := public.task_board_gateway('editor-test','KARINA','create_project','{"title":"TEST Author A"}');pid_a := (a->>'project_id')::uuid;
  b := public.task_board_gateway('editor-test','KARINA','create_project','{"title":"TEST Author B"}');pid_b := (b->>'project_id')::uuid;
  v := public.task_board_gateway('editor-test','VENDULA','create_project','{"title":"TEST Recipient"}');pid_v := (v->>'project_id')::uuid;
  shared := public.task_board_gateway('editor-test','KARINA','create_project','{"title":"TEST Shared","member_usernames":["VENDULA"]}');pid_shared := (shared->>'project_id')::uuid;
  other := public.task_board_gateway('editor-test','MILAN','create_project','{"title":"TEST Private Milan"}');pid_other := (other->>'project_id')::uuid;

  a := pg_temp.save_editor_task('KARINA','create',tid,'{}',a,(a->'columns'->1->>'id')::uuid,draft);
  assert (select created_by='Karina' from public.tasks where id=tid);
  assert (select status='ACCEPTED' from public.task_assignments where task_id=tid and assignee='Karina');
  assert (select status='PENDING_ACCEPT' from public.task_assignments where task_id=tid and assignee='Vendula'), 'Creation must not accept for the recipient';
  assert (select column_id=(a->'columns'->1->>'id')::uuid from task_board_private.project_placements where project_id=pid_a and task_id=tid), 'Creator chooses the column';
  assert not exists(select 1 from task_board_private.project_placements where project_id=pid_v and task_id=tid), 'Creator does not place in recipient project';

  global_board := public.task_board_gateway('editor-test','VENDULA','snapshot','{}');
  denied := false;
  begin
    perform pg_temp.save_editor_task('VENDULA','organize',tid,global_board,v,(v->'columns'->0->>'id')::uuid);
  exception when raise_exception then denied := sqlerrm='Zařazení můžete měnit u vlastních nebo přijatých úkolů.';end;
  assert denied, 'Recipients must first accept the task';
  v := public.task_board_gateway('editor-test','VENDULA','accept_task',jsonb_build_object(
    'project_id',pid_v,'task_id',tid,'column_id',v->'columns'->2->>'id','revision',v->'revision'));
  assert (select column_id=(v->'columns'->2->>'id')::uuid from task_board_private.project_placements where project_id=pid_v and task_id=tid), 'Recipient chooses own column';

  -- Editing moves only the selected author placement, never the recipient's.
  draft := draft || '{"title":"TEST Edited by author"}';
  b := pg_temp.save_editor_task('KARINA','edit',tid,a,b,(b->'columns'->1->>'id')::uuid,draft);
  assert not exists(select 1 from task_board_private.project_placements where project_id=pid_a and task_id=tid);
  assert (select column_id=(b->'columns'->1->>'id')::uuid from task_board_private.project_placements where project_id=pid_b and task_id=tid);
  assert (select column_id=(v->'columns'->2->>'id')::uuid from task_board_private.project_placements where project_id=pid_v and task_id=tid), 'Recipient location is preserved';
  assert (select title='TEST Edited by author' from public.tasks where id=tid);
  assert (select status='ACCEPTED' from public.task_assignments where task_id=tid and assignee='Vendula');

  denied := false;
  begin
    perform pg_temp.save_editor_task('VENDULA','edit',tid,v,shared,(shared->'columns'->1->>'id')::uuid,draft || '{"title":"Forbidden edit"}');
  exception when raise_exception then denied := sqlerrm='Zadání může změnit zadavatel nebo majitel.';end;
  assert denied, 'Accepted recipients cannot edit shared content';
  assert exists(select 1 from task_board_private.project_placements where project_id=pid_v and task_id=tid), 'Failed content edit does not move a task';
  shared := pg_temp.save_editor_task('VENDULA','organize',tid,v,shared,(shared->'columns'->1->>'id')::uuid,'{"title":"Ignored forged draft"}');
  assert (select title='TEST Edited by author' from public.tasks where id=tid), 'Organizing cannot alter content';
  assert not exists(select 1 from task_board_private.project_placements where project_id=pid_v and task_id=tid);
  assert exists(select 1 from task_board_private.project_placements where project_id=pid_b and task_id=tid), 'Recipient move preserves author project';

  shared := pg_temp.save_editor_task('KARINA','edit',tid,b,shared,(shared->'columns'->0->>'id')::uuid,draft);
  v := public.task_board_gateway('editor-test','VENDULA','snapshot',jsonb_build_object('project_id',pid_shared));
  assert exists(select 1 from jsonb_array_elements(v->'placements') p where p->>'task_id'=tid::text and p->>'column_id'=shared->'columns'->0->>'id'), 'Shared project has one common column';
  select position into old_position from task_board_private.project_placements where project_id=pid_shared and task_id=tid;
  shared := pg_temp.save_editor_task('KARINA','edit',tid,shared,shared,(shared->'columns'->0->>'id')::uuid,draft);
  assert (select position=old_position from task_board_private.project_placements where project_id=pid_shared and task_id=tid), 'Content-only edit preserves manual position';

  -- Stale source/destination and foreign columns roll back all content changes.
  denied := false;
  begin
    perform pg_temp.save_editor_task('KARINA','edit',tid,shared || '{"revision":-1}',shared,(shared->'columns'->2->>'id')::uuid,draft || '{"title":"Stale edit"}');
  exception when raise_exception then denied := sqlerrm='Zařazení úkolu se mezitím změnilo. Otevřete formulář znovu.';end;
  assert denied;
  denied := false;
  begin
    perform pg_temp.save_editor_task('KARINA','edit',tid,shared,b || '{"revision":-1}',(b->'columns'->0->>'id')::uuid,draft || '{"title":"Stale destination"}');
  exception when raise_exception then denied := sqlerrm='Zařazení úkolu se mezitím změnilo. Otevřete formulář znovu.';end;
  assert denied;
  assert (select title='TEST Edited by author' from public.tasks where id=tid), 'Rejected placement must not save shared edits';
  denied := false;
  begin
    perform pg_temp.save_editor_task('KARINA','create',bad_tid,'{}',shared,(other->'columns'->0->>'id')::uuid,draft);
  exception when raise_exception then denied := sqlerrm='Sloupec není v cílovém projektu. Vyberte jej znovu.';end;
  assert denied;
  assert not exists(select 1 from public.tasks where id=bad_tid), 'Invalid placement must not leave a created task';
  denied := false;
  begin
    perform pg_temp.save_editor_task('KARINA','edit',tid,shared,other,(other->'columns'->0->>'id')::uuid,draft);
  exception when raise_exception then denied := sqlerrm='Vyberte vlastní nebo sdílený projekt, jehož jste členem.';end;
  assert denied, 'Having any own project must not grant access to a foreign project';

  -- Moving to no project retains other project links and all task/assignment data.
  a := public.task_board_gateway('editor-test','KARINA','snapshot',jsonb_build_object('project_id',pid_a));
  a := public.task_board_gateway('editor-test','KARINA','add_task',jsonb_build_object('project_id',pid_a,'task_id',tid,'column_id',a->'columns'->0->>'id'));
  global_board := public.task_board_gateway('editor-test','VENDULA','snapshot','{}');
  global_board := pg_temp.save_editor_task('VENDULA','organize',tid,shared,global_board,(global_board->'columns'->1->>'id')::uuid);
  assert not exists(select 1 from task_board_private.project_placements where project_id=pid_shared and task_id=tid);
  assert exists(select 1 from task_board_private.project_placements where project_id=pid_a and task_id=tid), 'Other project links remain';
  assert (select count(*)=2 from public.task_assignments where task_id=tid), 'Moving preserves all assignees';
  assert (select column_id=(global_board->'columns'->1->>'id')::uuid from task_board_private.placements where task_id=tid);
end $$;

rollback;
