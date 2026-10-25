// Forgot password (email link) and change password (migration 067). Uses a throwaway user and cleans up.
// `node --env-file=.env scripts/test-password-reset.mjs [baseUrl]`
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { Client } from 'pg';
import bcrypt from 'bcryptjs';

const base = process.argv[2] ?? process.env.TEST_BASE_URL ?? process.env.UBEC_TEST_URL ?? 'http://localhost:5173';
assert.ok(['localhost', '127.0.0.1'].includes(new URL(base).hostname), 'local server only');
assert.ok(['localhost', '127.0.0.1'].includes(new URL(process.env.DATABASE_URL).hostname), 'local database only');
const db = new Client({ connectionString: process.env.DATABASE_URL }); await db.connect();
const state = `PW${Date.now()}`, email = `reset.${state.toLowerCase()}@test.local`, password = 'Original-pass-123';
let userId;

async function api(path, body, { cookie = '', origin = base, method } = {}) {
  const r = await fetch(base + path, { method: method ?? (body ? 'POST' : 'GET'), headers: { 'Content-Type': 'application/json', Origin: origin, Cookie: cookie }, ...(body ? { body: JSON.stringify(body) } : {}) });
  return { status: r.status, data: await r.json().catch(() => ({})), cookie: r.headers.get('set-cookie')?.split(';')[0] };
}
const ok = (r, status = 200) => { assert.equal(r.status, status, JSON.stringify(r.data)); return r.data; };
const login = async pass => api('/api/auth/login', { email, password: pass });
const tokens = async () => (await db.query('SELECT token_hash, used_at FROM password_reset_tokens WHERE user_id=$1 ORDER BY id', [userId])).rows;
const plantToken = async (minutes = 60) => { const token = randomBytes(32).toString('base64url'); await db.query("INSERT INTO password_reset_tokens(user_id, token_hash, expires_at) VALUES($1, $2, NOW() + make_interval(mins => $3))", [userId, createHash('sha256').update(token).digest('hex'), minutes]); return token; };
const step = name => console.log(`✓ ${name}`);

try {
  userId = (await db.query("INSERT INTO users(full_name, email, role, department, state_code, password_hash) VALUES('QA Reset User', $1, 'Data Entry Staff', 'social', $2, $3) RETURNING id", [email, state, bcrypt.hashSync(password, 4)])).rows[0].id;
  await db.query("INSERT INTO user_departments(user_id, department) VALUES($1, 'social')", [userId]);

  // Forgot password: same reply for any address, cross-site refused, one live link per account, rate limited.
  ok(await api('/api/auth/password/forgot', { email }, { origin: 'https://evil.example' }), 403);
  ok(await api('/api/auth/password/forgot', { email: 'not-an-email' }), 400);
  const unknown = ok(await api('/api/auth/password/forgot', { email: `nobody.${state.toLowerCase()}@test.local` }));
  const known = ok(await api('/api/auth/password/forgot', { email: email.toUpperCase() }));
  assert.deepEqual(Object.keys(unknown).sort(), Object.keys(known).sort(), 'the reply does not reveal whether the account exists');
  let rows = await tokens();
  assert.equal(rows.length, 1); assert.match(rows[0].token_hash, /^[0-9a-f]{64}$/, 'only a hash is stored');
  ok(await api('/api/auth/password/forgot', { email }));
  rows = await tokens();
  assert.equal(rows.length, 2); assert.ok(rows[0].used_at && !rows[1].used_at, 'a new link replaces the earlier one');
  for (let i = 0; i < 3; i++) ok(await api('/api/auth/password/forgot', { email }));
  assert.equal((await tokens()).length, 3, 'at most three links an hour per account');
  step('forgot password: generic reply, same origin, hashed one-time links, rate limited');

  // Reset with a link: weak passwords refused, then the password changes, every session ends and the link is spent.
  await db.query('DELETE FROM password_reset_tokens WHERE user_id=$1', [userId]);
  const before = (await login(password)).cookie; assert.ok(before);
  const expiredToken = await plantToken(-1);
  assert.equal(ok(await api(`/api/auth/password/reset?token=${expiredToken}`)).valid, false);
  ok(await api('/api/auth/password/reset', { token: expiredToken, password: 'Brand-new-pass-456' }), 400);
  const token = await plantToken();
  assert.equal(ok(await api(`/api/auth/password/reset?token=${token}`)).valid, true);
  assert.equal(ok(await api('/api/auth/password/reset?token=garbage')).valid, false);
  ok(await api('/api/auth/password/reset', { token, password: 'Brand-new-pass-456' }, { origin: 'https://evil.example' }), 403);
  assert.match(ok(await api('/api/auth/password/reset', { token, password: 'short1' }), 400).error, /at least 10 characters/);
  assert.match(ok(await api('/api/auth/password/reset', { token, password: 'onlyletterspassword' }), 400).error, /letter and one number/);
  ok(await api('/api/auth/password/reset', { token, password: 'Brand-new-pass-456' }));
  ok(await api('/api/auth/session', undefined, { cookie: before }), 401);
  ok(await login(password), 401);
  ok(await login('Brand-new-pass-456'));
  ok(await api('/api/auth/password/reset', { token, password: 'Another-pass-789' }), 400);
  step('reset link: checked first, password rules, signs out everywhere, works once, expired links refused');

  // Change password: current password required, new rules, this browser stays signed in, others are signed out.
  // One device per account (migration 072): the later sign-in is the one that stays, so sign in elsewhere first.
  const elsewhere = (await login('Brand-new-pass-456')).cookie, here = (await login('Brand-new-pass-456')).cookie;
  ok(await api('/api/auth/password/change', { currentPassword: 'Brand-new-pass-456', newPassword: 'Changed-pass-321' }), 401);
  ok(await api('/api/auth/password/change', { currentPassword: 'Brand-new-pass-456', newPassword: 'Changed-pass-321' }, { cookie: here, origin: 'https://evil.example' }), 403);
  assert.equal(ok(await api('/api/auth/password/change', { currentPassword: 'wrong-pass-000', newPassword: 'Changed-pass-321' }, { cookie: here }), 400).field, 'currentPassword');
  assert.match(ok(await api('/api/auth/password/change', { currentPassword: 'Brand-new-pass-456', newPassword: 'Brand-new-pass-456' }, { cookie: here }), 400).error, /different/);
  assert.match(ok(await api('/api/auth/password/change', { currentPassword: 'Brand-new-pass-456', newPassword: email }, { cookie: here }), 400).error, /./);
  const changed = await api('/api/auth/password/change', { currentPassword: 'Brand-new-pass-456', newPassword: 'Changed-pass-321' }, { cookie: here });
  ok(changed); assert.ok(changed.cookie, 'this browser gets a fresh cookie');
  ok(await api('/api/auth/session', undefined, { cookie: changed.cookie }));
  ok(await api('/api/auth/session', undefined, { cookie: elsewhere }), 401);
  ok(await login('Changed-pass-321'));
  step('change password: current password checked, rules, stays signed in here, other sessions end');
  console.log('PASS: forgot password (email link) and change password.');
} finally {
  if (userId) await db.query('DELETE FROM users WHERE id=$1', [userId]);
  await db.end();
}
