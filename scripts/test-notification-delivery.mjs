// UBEC260: notifications reach people outside the open tab. Checks the push subscription API (/api/push), that each
// bell notification is claimed for delivery once (old ones skipped), and what the push and the email say.
// Usage: node --env-file=.env scripts/test-notification-delivery.mjs [baseUrl]   (local only; throwaway user and plan; cleans up)
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { hashSync } from 'bcryptjs';
import { tsImport } from 'tsx/esm/api';

const base = process.argv[2] ?? process.env.TEST_BASE_URL ?? process.env.UBEC_TEST_URL ?? 'http://localhost:5173';
assert.match(base, /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/, 'Run this test against a local server only.');
assert.ok(['localhost', '127.0.0.1'].includes(new URL(process.env.DATABASE_URL).hostname), 'Use a local database only.');
const marker = `ND${randomUUID().slice(0, 8).toUpperCase()}`, password = randomUUID();
const db = new Client({ connectionString: process.env.DATABASE_URL });
const cookies = {}, ids = {};
let passed = 0;
const step = message => { passed++; console.log('✓', message); };

async function api(who, path, body, method = body ? 'POST' : 'GET', origin = base) {
  const response = await fetch(base + path, { method, headers: { Origin: origin, ...(body ? { 'Content-Type': 'application/json' } : {}), ...(cookies[who] ? { Cookie: cookies[who] } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const text = await response.text(); let data; try { data = JSON.parse(text); } catch { data = { error: text.slice(0, 200) }; }
  if (path === '/api/auth/login' && response.ok) cookies[who] = response.headers.get('set-cookie').split(';')[0];
  return { status: response.status, data };
}
const ok = (r, status = 200) => { assert.equal(r.status, status, JSON.stringify(r.data)); return r.data; };

async function user(who, role) {
  const email = `${who}.${marker}@delivery.test`.toLowerCase();
  ids[who] = (await db.query('INSERT INTO users(email,full_name,role,department,state_code,password_hash) VALUES($1,$2,$3,$4,$5,$6) RETURNING id', [email, `QA ${who}`, role, 'teachers', marker, hashSync(password, 4)])).rows[0].id;
  await db.query('INSERT INTO user_departments(user_id,department) VALUES($1,$2)', [ids[who], 'teachers']);
  ok(await api(who, '/api/auth/login', { email, password }));
}

async function cleanup() {
  await db.query('DELETE FROM plan_notifications WHERE plan_id IN (SELECT id FROM action_plans WHERE state_code=$1)', [marker]);
  await db.query('DELETE FROM plan_review_events WHERE plan_id IN (SELECT id FROM action_plans WHERE state_code=$1)', [marker]);
  await db.query('DELETE FROM action_plans WHERE state_code=$1', [marker]);
  await db.query("DELETE FROM users WHERE email LIKE $1", [`%.${marker.toLowerCase()}@delivery.test`]);
}

try {
  await db.connect();
  const { pushPayload, notificationEmail, deliverNotifications } = await tsImport('../lib/notification-delivery.ts', import.meta.url);

  // Unit: what a push and an email say.
  const item = { id: 7, planId: 9, eventId: 11, source: 'state', action: 'request_changes', scope: 'teachers', actorName: 'UBEC BEAP Chair', actorRole: 'UBEC BEAP Chair', comment: 'Two items were rejected.', stateCode: 'KT', startYear: 2026, endYear: 2026, fundingQuarters: [1, 2, 3, 4], createdAt: new Date().toISOString(), readAt: null };
  const payload = pushPayload(item);
  assert.match(payload.url, /^\/beap\/review\?plan=9/); assert.match(payload.body, /^UBEC BEAP Chair: /); assert.equal(payload.tag, 'beapms-7');
  const mail = notificationEmail(item, 'Amina', 'https://portal.example');
  assert.match(mail.subject, /^Changes requested: /);
  assert.match(mail.text, /Hello Amina/); assert.match(mail.text, /Two items were rejected/); assert.match(mail.text, /https:\/\/portal\.example\/beap\/review\?plan=9/);
  assert.match(notificationEmail({ ...item, action: 'approve', comment: '' }, 'Amina', 'https://portal.example').subject, /^Approved: /);
  assert.ok(!mail.html.includes('<script'), 'the email escapes what it quotes');
  assert.ok(notificationEmail({ ...item, comment: '<script>x</script>' }, 'A', 'https://p').html.includes('&lt;script&gt;'));
  step('a push carries the plan, who did what and the link; the email says what changed, quotes the note (escaped) and links the plan');

  await user('des', 'Data Entry Staff'); await user('other', 'Data Entry Staff');
  assert.equal((await api('nobody', '/api/push')).status, 401);
  const { publicKey } = ok(await api('des', '/api/push'));
  assert.match(publicKey, /^[A-Za-z0-9_-]{80,}$/);
  assert.equal(ok(await api('other', '/api/push')).publicKey, publicKey, 'one key pair for everyone');
  const subscription = { endpoint: `https://push.example/${marker}`, keys: { p256dh: 'BPub', auth: 'secret' } };
  assert.equal((await api('des', '/api/push', subscription, 'POST', 'https://evil.example')).status, 403);
  assert.equal((await api('des', '/api/push', { ...subscription, endpoint: 'http://push.example/x' })).status, 400);
  assert.equal((await api('des', '/api/push', { endpoint: subscription.endpoint })).status, 400);
  ok(await api('des', '/api/push', subscription));
  ok(await api('des', '/api/push', subscription));
  assert.equal((await db.query('SELECT user_id FROM push_subscriptions WHERE endpoint=$1', [subscription.endpoint])).rows[0].user_id, ids.des, 'saving twice keeps one row');
  ok(await api('other', '/api/push', subscription));
  assert.equal((await db.query('SELECT user_id FROM push_subscriptions WHERE endpoint=$1', [subscription.endpoint])).rows[0].user_id, ids.other, 'a device belongs to whoever signed in on it last');
  ok(await api('des', '/api/push', { endpoint: subscription.endpoint }, 'DELETE'));
  assert.equal((await db.query('SELECT 1 FROM push_subscriptions WHERE endpoint=$1', [subscription.endpoint])).rowCount, 1, 'nobody removes another person\'s device');
  ok(await api('other', '/api/push', { endpoint: subscription.endpoint }, 'DELETE'));
  assert.equal((await db.query('SELECT 1 FROM push_subscriptions WHERE endpoint=$1', [subscription.endpoint])).rowCount, 0);
  step('the push key needs a sign-in; subscriptions need the same origin and an https address, are saved once, follow the last user, and only their owner removes them');

  const plan = (await db.query('INSERT INTO action_plans(state_code,start_year,end_year) VALUES($1,2026,2026) RETURNING id', [marker])).rows[0].id;
  const event = (await db.query("INSERT INTO plan_review_events(plan_id,submission_number,action,scope,actor_name,actor_email,actor_role,comment) VALUES($1,1,'request_changes','teachers','QA chair','chair@delivery.test','Director','Fix the unit costs') RETURNING id", [plan])).rows[0].id;
  const fresh = (await db.query('INSERT INTO plan_notifications(plan_id,user_id,event_id) VALUES($1,$2,$3) RETURNING id', [plan, ids.des, event])).rows[0].id;
  const old = (await db.query("INSERT INTO plan_notifications(plan_id,user_id,event_id,created_at) VALUES($1,$2,$3,NOW()-interval '2 days') RETURNING id", [plan, ids.other, event])).rows[0].id;
  // The dev server's bell polling may deliver them first (no worker locally); either way each is claimed once.
  for (let i = 0; i < 3; i++) await deliverNotifications(db);
  const rows = (await db.query('SELECT id,delivered_at FROM plan_notifications WHERE id=ANY($1::int[]) ORDER BY id', [[fresh, old]])).rows;
  assert.ok(rows.every(r => r.delivered_at), 'both are marked delivered');
  const first = rows.map(r => r.delivered_at.toISOString());
  await deliverNotifications(db);
  assert.deepEqual((await db.query('SELECT delivered_at FROM plan_notifications WHERE id=ANY($1::int[]) ORDER BY id', [[fresh, old]])).rows.map(r => r.delivered_at.toISOString()), first, 'a delivered notification is never claimed again');
  assert.equal((await db.query('SELECT COUNT(*)::int AS n FROM plan_notifications WHERE delivered_at IS NULL AND created_at < NOW() - interval \'1 minute\'')).rows[0].n, 0, 'nothing is left waiting');
  step('each notification is claimed for delivery once; ones older than a day are marked without sending');

  console.log(`\nAll ${passed} notification delivery checks passed.`);
} finally {
  await cleanup().catch(cause => console.error('cleanup failed', cause));
  await db.end();
}
