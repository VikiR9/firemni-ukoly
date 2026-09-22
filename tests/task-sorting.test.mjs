import test from "node:test";
import assert from "node:assert/strict";
import { sortTasks, parseTaskSorts, taskSortContext } from "../lib/tasks.ts";

const task = (id, due, created_at, priority = "Medium") => ({
  id,
  due,
  created_at,
  priority,
});
const tasks = [
  task("undated", null, "2026-09-22T08:00:00Z"),
  task("late", "2026-10-15", "2026-09-18T08:00:00Z"),
  task("soon", "2026-09-23", "2026-09-21T08:00:00Z"),
  task("overdue", "2026-09-01", "2026-09-20T08:00:00Z"),
];
const ids = (tasks) => tasks.map((t) => t.id);

test("sorts deadlines in both directions, keeping undated tasks last", () => {
  assert.deepEqual(ids(sortTasks(tasks, "due")), [
    "overdue",
    "soon",
    "late",
    "undated",
  ]);
  assert.deepEqual(ids(sortTasks(tasks, "due_desc")), [
    "late",
    "soon",
    "overdue",
    "undated",
  ]);
});

test("sorts creation dates independently of deadlines in both directions", () => {
  assert.deepEqual(ids(sortTasks(tasks, "newest")), [
    "undated",
    "soon",
    "overdue",
    "late",
  ]);
  assert.deepEqual(ids(sortTasks(tasks, "oldest")), [
    "late",
    "overdue",
    "soon",
    "undated",
  ]);
  const offsets = [
    task("first", null, "2026-09-22T10:00:00+02:00"),
    task("second", null, "2026-09-22T09:00:00Z"),
  ];
  assert.deepEqual(ids(sortTasks(offsets, "newest")), ["second", "first"]);
});

test("sorting is personal and never mutates source order; manual restores it", () => {
  const frozen = Object.freeze([...tasks]);
  sortTasks(frozen, "due");
  sortTasks(frozen, "newest");
  assert.deepEqual(ids(sortTasks(frozen, "manual")), [
    "undated",
    "late",
    "soon",
    "overdue",
  ]);
});

test("ties stay deterministic through refresh and priorities still work", () => {
  const a = task("a", "2026-09-23", "2026-09-22T08:00:00Z");
  const b = { ...a, id: "b" };
  const urgent = { ...a, id: "urgent", priority: "Urgent" };
  assert.deepEqual(ids(sortTasks([b, a], "due")), ["a", "b"]);
  assert.deepEqual(ids(sortTasks([a, b], "due")), ["a", "b"]);
  assert.deepEqual(ids(sortTasks([b, urgent, a], "priority")), [
    "urgent",
    "a",
    "b",
  ]);
});

test("preferences distinguish projects, categories, team views and layouts", () => {
  const contexts = [
    ["", "ME", "active", "list"],
    ["", "ME", "active", "board"],
    ["", "ME", "active", "calendar"],
    ["", "ME", "done", "list"],
    ["", "TEAM", "active", "list"],
    ["project-a", "ME", "active", "list"],
    ["project-b", "ME", "active", "list"],
  ].map((args) => taskSortContext(...args));
  assert.equal(new Set(contexts).size, contexts.length);
  assert.equal(
    taskSortContext("project-a", "ME", "active", "list"),
    taskSortContext("project-a", "TEAM", "active", "list"),
  );
});

test("ignores corrupt or unknown saved preferences without losing valid ones", () => {
  for (const raw of [null, "broken", "null", "[]", "3"])
    assert.deepEqual(parseTaskSorts(raw), {});
  assert.deepEqual(
    parseTaskSorts(
      '{"one":"due_desc","two":"oldest","bad":"future","number":3,"object":{},"inherited":"toString"}',
    ),
    {
      one: "due_desc",
      two: "oldest",
    },
  );
});
