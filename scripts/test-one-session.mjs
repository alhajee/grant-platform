// UBEC115 (migration 072): one signed-in device per account. A new sign-in signs the older device out; the older
// device's session check says 'superseded' (so the page shows "Signed in on another device"), any other ended
// session says 'expired'. Renewal and password change keep the current device signed in.
// Usage: node --env-file=.env scripts/test-one-session.mjs [baseUrl]   (local only; throwaway user; cleans up)
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { hashSync } from 'bcryptjs';

const base = process.argv[2] ?? process.env.TEST_BASE_URL ?? process.env.UBEC_TEST_URL ?? 'http://localhost:5173';
assert.match(base, /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/, 'Run this test against a local server only.');
assert.ok(['localhost', '127.0.0.1'].includes(new URL(process.env.DATABASE_URL).hostname), 'Use a local database only.');
const marker = `OS${randomUUID().slice(0, 8).toUpperCase()}`, password = `Pass-${randomUUID()}1`, email = `one.${marker}@session.test`.toLowerCase();
const db = new Client({ connectionString: process.env.DATABASE_URL });
let userId, passed = 0;
const step = message => { passed++; console.log('✓', message); };

async function call(cookie, path, body, method = body ? 'POST' : 'GET') {
  const response = await fetch(base + path, { method, headers: { Origin: base, ...(body ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const data = await response.json().catch(() => ({}));
  return { status: response.status, data, cookie: response.headers.get('set-cookie')?.split(';')[0] };
}
const signIn = async (pass = password) => { const r = await call(null, '/api/auth/login', { email, password: pass }); assert.equal(r.status, 200, JSON.stringify(r.data)); return r.cookie; };

await db.connect();
try {
  userId = (await db.query("INSERT INTO users(email,full_name,role,department,state_code,password_hash) VALUES($1,'QA one session','Data Entry Staff','physical',$2,$3) RETURNING id", [email, marker, hashSync(password, 4)])).rows[0].id;
  await db.query("INSERT INTO user_departments(user_id,department) VALUES($1,'physical')", [userId]);

  const phone = await signIn();
  assert.equal((await call(phone, '/api/auth/session')).status, 200);
  const pc = await signIn();
  assert.equal((await call(pc, '/api/auth/session')).status, 200, 'the newest sign-in works');
  const old = await call(phone, '/api/auth/session');
  assert.equal(old.status, 401); assert.equal(old.data.reason, 'superseded');
  assert.equal((await call(phone, '/api/notifications')).status, 401, 'every API refuses the older device');
  assert.equal((await call(phone, '/api/auth/session', {})).status, 401, 'the older device cannot renew');
  step('signing in on a second device signs the first out; it is told why (superseded)');

  assert.equal((await call(null, '/api/auth/session')).data.reason, 'expired', 'no cookie reads as expired');
  const renewed = await call(pc, '/api/auth/session', {});
  assert.equal(renewed.status, 200);
  assert.equal((await call(renewed.cookie, '/api/auth/session')).status, 200, 'a renewed cookie stays the current device');
  step('renewal keeps the current device signed in; a missing cookie reads as expired');

  const newPassword = `Pass-${randomUUID()}2`;
  const changed = await call(renewed.cookie, '/api/auth/password/change', { currentPassword: password, newPassword });
  assert.equal(changed.status, 200, JSON.stringify(changed.data));
  assert.equal((await call(changed.cookie, '/api/auth/session')).status, 200, 'changing the password keeps this device signed in');
  assert.equal((await call(pc, '/api/auth/session')).data.reason, 'expired', 'cookies from before a password change read as expired');
  step('a password change keeps this device signed in and ends older cookies (expired)');

  const phoneAgain = await signIn(newPassword);
  assert.equal((await call(phoneAgain, '/api/auth/session')).status, 200);
  assert.equal((await call(changed.cookie, '/api/auth/session')).data.reason, 'superseded', 'signing in again on the first device signs the second out');
  step('newest wins in both directions');

  await db.query('UPDATE users SET current_session_id=NULL WHERE id=$1', [userId]);
  assert.equal((await call(phoneAgain, '/api/auth/session')).status, 200, 'accounts without a recorded sign-in accept their current cookies');
  step('an account with no recorded sign-in (before migration 072) keeps its existing sessions');
  console.log(`\nPASS: ${passed} one-session checks`);
} finally {
  if (userId) { await db.query('DELETE FROM password_reset_tokens WHERE user_id=$1', [userId]).catch(() => {}); await db.query('DELETE FROM user_departments WHERE user_id=$1', [userId]); await db.query('DELETE FROM users WHERE id=$1', [userId]); }
  await db.end();
}
