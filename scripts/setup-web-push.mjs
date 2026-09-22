import { existsSync, appendFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import webpush from 'web-push';

if (existsSync('.env.local')) process.loadEnvFile('.env.local');
const mode = process.argv[2];
if (mode === 'keys') {
  if (!!process.env.PUSH_VAPID_PUBLIC_KEY !== !!process.env.PUSH_VAPID_PRIVATE_KEY) throw new Error('Incomplete VAPID pair; restore the original keys instead of rotating one key.');
  const additions = {};
  if (!process.env.PUSH_VAPID_PUBLIC_KEY) {
    const keys = webpush.generateVAPIDKeys();
    additions.PUSH_VAPID_PUBLIC_KEY = keys.publicKey;
    additions.PUSH_VAPID_PRIVATE_KEY = keys.privateKey;
  }
  if (!process.env.PUSH_VAPID_SUBJECT) additions.PUSH_VAPID_SUBJECT = 'https://firemni-ukoly.vercel.app';
  if (!process.env.PUSH_WORKER_SECRET) additions.PUSH_WORKER_SECRET = randomBytes(32).toString('base64url');
  if (Object.keys(additions).length) appendFileSync('.env.local', '\n' + Object.entries(additions).map(([name, value]) => `${name}=${value}`).join('\n') + '\n');
  console.log('Web Push keys are ready in the ignored .env.local file. Keys are never printed.');
} else if (mode === 'configure') {
  const required = ['NEXT_PUBLIC_SUPABASE_URL','NEXT_PUBLIC_SUPABASE_ANON_KEY','ATTENDANCE_GATEWAY_SECRET','PUSH_WORKER_SECRET'];
  for (const name of required) if (!process.env[name]) throw new Error(`Missing ${name}`);
  const origin = new URL(process.argv[3] || 'https://firemni-ukoly.vercel.app');
  if (origin.protocol !== 'https:') throw new Error('The dispatcher requires HTTPS.');
  // Use the same project resolution as the app (including its retired-project migration).
  const { supabase: client } = await import('../lib/supabaseClient.ts');
  const { data, error } = await client.rpc('web_push_gateway', {
    p_secret: process.env.ATTENDANCE_GATEWAY_SECRET, p_token: '', p_action: 'configure',
    p_data: { url: `${origin.origin}/api/push/dispatch`, token: process.env.PUSH_WORKER_SECRET },
  });
  if (error || !data?.ok) throw new Error(`Scheduler configuration failed (${error?.code || 'unknown'}).`);
  console.log('Server scheduler enabled. It runs independently of open applications.');
} else throw new Error('Use: node scripts/setup-web-push.mjs keys | configure [production-origin]');
