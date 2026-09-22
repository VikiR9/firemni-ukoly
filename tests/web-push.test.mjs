import test from 'node:test';
import assert from 'node:assert/strict';
import { createECDH, randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { validPushEndpoint, validSubscription } from '../lib/push-validation.ts';

test('accepts Apple, Android/Chrome, Firefox and Edge push services only', () => {
  for (const endpoint of ['https://web.push.apple.com/QH/test', 'https://fcm.googleapis.com/fcm/send/test', 'https://updates.push.services.mozilla.com/wpush/v2/test', 'https://abc.notify.windows.com/?token=123']) {
    assert.equal(validPushEndpoint(endpoint), true);
  }
  for (const endpoint of ['http://fcm.googleapis.com/test', 'https://127.0.0.1/test', 'https://fcm.googleapis.com.attacker.invalid/test', 'https://user:pass@web.push.apple.com/test', 'https://web.push.apple.com:8443/test', 'file:///etc/passwd', 'https://push.apple.com.attacker.invalid/test']) assert.equal(validPushEndpoint(endpoint), false);
});

test('validates real encryption keys instead of accepting arbitrary strings', () => {
  const ec = createECDH('prime256v1'); ec.generateKeys();
  const sub = { endpoint: 'https://fcm.googleapis.com/fcm/send/test', keys: { p256dh: ec.getPublicKey().toString('base64url'), auth: randomBytes(16).toString('base64url') } };
  assert.equal(validSubscription(sub), true);
  assert.equal(validSubscription({ ...sub, keys: { ...sub.keys, p256dh: 'A'.repeat(87) } }), false);
  assert.equal(validSubscription({ ...sub, keys: { ...sub.keys, auth: 'short' } }), false);
});

async function workerHarness({ offline = false, windows = [] } = {}) {
  const handlers = {}, displayed = [], opened = [], requests = [];
  const context = vm.createContext({ URL, AbortSignal, fetch: async (url, options) => { requests.push({ url, options }); if (offline) throw new Error('offline'); return { ok: true }; }, self: {
    location: { origin: 'https://firemni-ukoly.vercel.app' },
    registration: { showNotification: async (title, options) => { displayed.push({ title, options }); } },
    addEventListener: (type, handler) => { handlers[type] = handler; },
    clients: { matchAll: async () => windows, openWindow: async url => { opened.push(url); } },
  } });
  vm.runInContext(await readFile(new URL('../public/push-worker.js', import.meta.url), 'utf8'), context);
  async function push(data) { let work; handlers.push({ data, waitUntil: promise => { work = promise; } }); await work; }
  async function click(url) { let work; handlers.notificationclick({ notification: { close() {}, data: { url } }, waitUntil: promise => { work = promise; } }); await work; }
  return { displayed, opened, requests, push, click };
}

test('displays a notification with no open window and even when receipt network fails', async () => {
  const worker = await workerHarness({ offline: true });
  await worker.push({ json: () => ({ title: 'Nový úkol', body: 'Podrobnosti', receipt: { id: 'test', token: 'test' }, url: '/?task=123' }) });
  assert.equal(worker.displayed.length, 1);
  assert.equal(worker.displayed[0].title, 'Nový úkol');
  assert.equal(worker.requests.length, 1);
});

test('invalid or empty payloads still produce visible notifications on iOS', async () => {
  const worker = await workerHarness();
  await worker.push(null);
  await worker.push({ json: () => { throw new Error('bad json'); } });
  await worker.push({ json: () => null });
  assert.equal(worker.displayed.length, 3);
});

test('notification click opens the task and rejects external destinations', async () => {
  const worker = await workerHarness();
  await worker.click('/?task=123');
  await worker.click('https://attacker.invalid/');
  assert.deepEqual(worker.opened, ['https://firemni-ukoly.vercel.app/?task=123', 'https://firemni-ukoly.vercel.app/']);
});

test('click navigates an existing window instead of opening a duplicate', async () => {
  const navigated = []; let focused = false;
  const worker = await workerHarness({ windows: [{ url: 'https://firemni-ukoly.vercel.app/ucet', navigate: async url => { navigated.push(url); return { focus: async () => { focused = true; } }; } }] });
  await worker.click('/?task=123');
  assert.equal(navigated.length, 1); assert.equal(focused, true); assert.equal(worker.opened.length, 0);
});
