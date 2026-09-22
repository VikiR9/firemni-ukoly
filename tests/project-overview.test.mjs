import test from "node:test";
import assert from "node:assert/strict";
import {
  projectTaskGroups,
  parseProjectMineFilters,
  isOverviewLayoutMutation,
} from "../lib/task-board.ts";

test("overview uses project order and keeps a shared task in every relevant project", () => {
  const tasks = [{ id: "shared" }, { id: "orphan" }, { id: "single" }];
  const board = {
    projects: [
      { id: "b", title: "B" },
      { id: "a", title: "A" },
      { id: "empty", title: "Empty" },
    ],
    project_memberships: [
      { project_id: "a", task_id: "shared" },
      { project_id: "b", task_id: "shared" },
      { project_id: "a", task_id: "shared" },
      { project_id: "a", task_id: "single" },
      { project_id: "a", task_id: "filtered-out" },
    ],
  };
  const groups = projectTaskGroups(board, tasks);
  assert.deepEqual(
    groups.map((g) => [g.id, g.tasks.map((t) => t.id)]),
    [
      ["b", ["shared"]],
      ["a", ["shared", "single"]],
      ["empty", []],
      ["", ["orphan"]],
    ],
  );
  assert.deepEqual(
    tasks.map((t) => t.id),
    ["shared", "orphan", "single"],
  );
});

test("overview shows unassigned tasks even when there are no projects", () => {
  assert.deepEqual(
    projectTaskGroups({}, [{ id: "one" }]).map((g) => [
      g.title,
      g.tasks.length,
    ]),
    [["Bez projektu", 1]],
  );
});

test("project mine preferences ignore invalid or corrupt browser data", () => {
  assert.deepEqual(
    parseProjectMineFilters('{"a":true,"b":false,"c":"true","":true}'),
    { a: true },
  );
  for (const raw of [null, "broken", "null", "[]", "42"])
    assert.deepEqual(parseProjectMineFilters(raw), {});
});

test("overview blocks manual layout writes while real projects and task editing stay available", () => {
  for (const action of [
    "create_column",
    "rename_column",
    "move_column",
    "delete_column",
    "move_task",
  ]) {
    for (const id of [undefined, null, ""])
      assert.equal(isOverviewLayoutMutation(action, id), true);
    assert.equal(isOverviewLayoutMutation(action, "project-id"), false);
  }
  for (const action of [
    "snapshot",
    "save_task",
    "create_project",
    "reorder_projects",
  ])
    assert.equal(isOverviewLayoutMutation(action, null), false);
});
