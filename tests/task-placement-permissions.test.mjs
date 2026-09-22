import test from 'node:test';
import assert from 'node:assert/strict';
import { canOrganize } from '../lib/tasks.ts';

const karina = { username: 'KARINA', displayName: 'Karina', role: 'EMPLOYEE' };
const viktor = { username: 'VIKTOR', displayName: 'Viktor', role: 'OWNER' };
const task = (creator, assignee, status, archived_at = null) => ({
  created_by: creator, archived_at, task_assignments: assignee ? [{ assignee, status }] : [],
});

test('authors organize their own tasks even when assigned only to others', () => {
  assert.equal(canOrganize(task('Karina', 'Vendula', 'PENDING_ACCEPT'), karina), true);
  assert.equal(canOrganize(task('Karina', 'Karina', 'ACCEPTED', '2026-09-22'), karina), false);
});

test('recipients can organize after acceptance, without gaining rights on unrelated tasks', () => {
  for (const status of ['ACCEPTED', 'IN_PROGRESS', 'BLOCKED', 'RETURNED', 'SUBMITTED_DONE', 'DONE']) {
    assert.equal(canOrganize(task('Vendula', 'Karina', status), karina), true);
  }
  for (const status of ['PENDING_ACCEPT', 'DECLINED']) assert.equal(canOrganize(task('Vendula', 'Karina', status), karina), false);
  assert.equal(canOrganize(task('Vendula', 'Miloš', 'ACCEPTED'), karina), false);
});

test('owners retain management but cannot use placement editing to skip their inbox', () => {
  assert.equal(canOrganize(task('Karina', 'Vendula', 'ACCEPTED'), viktor), true);
  assert.equal(canOrganize(task('Karina', 'Viktor', 'PENDING_ACCEPT'), viktor), false);
});
