import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('../app/api/attendance/route.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
function setup(username, role = 'EMPLOYEE', rpcError = null) {
  const calls = [];
  const result = {
    server_now: '2026-09-22T12:00:00Z', today: '2026-09-22',
    sessions: [], absences: [], requests: [], week_requests: [],
    after_hours: { is_working: true, can_view_reports: true, sessions: [{ id: 'private-output', username: 'KARINA', minutes: 30 }] },
  };
  const exports = {};
  vm.runInNewContext(compiled, {
    exports,
    require: (name) => {
      if (name === 'next/server') return { NextResponse: { json: (body, init) => Response.json(body, init) } };
      if (name === '@/lib/server-session') return { sessionUser: async () => username ? { username, role } : null, gatewaySecret: () => 'test-secret' };
      if (name === '@/lib/supabaseClient') return { supabase: { rpc: async (name, args) => { calls.push({ name, args }); return { data: structuredClone(result), error: rpcError }; } } };
      throw Error(`Unexpected dependency: ${name}`);
    },
  });
  return { handler: exports, calls };
}
const request = (action, data = {}, origin = 'https://example.test') => ({
  nextUrl: new URL('https://example.test/api/attendance'),
  headers: new Headers({ origin }),
  json: async () => ({ action, ...data }),
});

test('after-hours actions require a session and same-origin request', async () => {
  const anon = setup(null);
  assert.equal((await anon.handler.POST(request('after_hours_start'))).status, 401);
  assert.equal(anon.calls.length, 0);
  const employee = setup('KARINA');
  assert.equal((await employee.handler.POST(request('after_hours_stop', {}, 'https://attacker.test'))).status, 403);
  assert.equal(employee.calls.length, 0);
});

test('both actions use the authenticated actor and preserve only own toggle state', async () => {
  for (const action of ['after_hours_start', 'after_hours_stop']) {
    const { handler, calls } = setup('KARINA');
    const response = await handler.POST(request(action, { p_actor: 'VIKTOR' }));
    assert.equal(response.status, 200);
    assert.equal(calls[0].args.p_actor, 'KARINA');
    assert.equal(calls[0].args.p_action, action);
    const body = await response.json();
    assert.deepEqual(body.after_hours, { is_working: true, can_view_reports: false, sessions: [] });
    assert.equal(body.worklog_hidden, true);
    assert.equal(response.headers.get('cache-control'), 'no-store');
  }
});

test('only Viktor with owner role receives after-hours output, including GET snapshots', async () => {
  for (const [username, role, expected] of [['MILAN', 'OWNER', false], ['NIKOLA', 'EMPLOYEE', false], ['VIKTOR', 'EMPLOYEE', false], ['VIKTOR', 'OWNER', true]]) {
    const { handler } = setup(username, role);
    const response = await handler.GET(request('snapshot'));
    const body = await response.json();
    assert.equal(body.after_hours.can_view_reports, expected);
    assert.equal(body.after_hours.sessions.length, expected ? 1 : 0);
  }
});

test('after-hours cannot be operated for a colleague or unlock team access', async () => {
  for (const [username, role, status] of [['KARINA', 'EMPLOYEE', 403], ['MILAN', 'OWNER', 403], ['VIKTOR', 'OWNER', 400]]) {
    const { handler, calls } = setup(username, role);
    assert.equal((await handler.POST(request('after_hours_start', { target_username: 'NIKOLA' }))).status, status);
    assert.equal(calls.length, 0);
  }
  const { handler, calls } = setup('KARINA');
  assert.equal((await handler.POST(request('after_hours_start', { team: true }))).status, 403);
  assert.equal(calls.length, 0);
});

test('database failure is returned without claiming a successful toggle', async () => {
  const { handler } = setup('KARINA', 'EMPLOYEE', { message: 'network error' });
  const response = await handler.POST(request('after_hours_start'));
  assert.equal(response.status, 400);
  const body = await response.json();
  assert.ok(body.error);
  assert.equal(body.after_hours, undefined);
});
