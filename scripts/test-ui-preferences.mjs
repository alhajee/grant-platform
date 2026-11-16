// UBEC261: display choices saved to the account (GET/PATCH /api/account/preferences, users.ui_preferences).
// Usage: node --env-file=.env scripts/test-ui-preferences.mjs [baseUrl]   (local only; throwaway user; cleans up)
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { hashSync } from 'bcryptjs';

const base = process.argv[2] ?? process.env.TEST_BASE_URL ?? process.env.UBEC_TEST_URL ?? 'http://localhost:5173';
assert.match(base, /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/, 'Run this test against a local server only.');
assert.ok(['localhost', '127.0.0.1'].includes(new URL(process.env.DATABASE_URL).hostname), 'Use a local database only.');
const marker = `UP${randomUUID().slice(0, 8).toLowerCase()}`, password = randomUUID();
const email = `des.${marker}@preferences.test`.toLowerCase();
const db = new Client({ connectionString: process.env.DATABASE_URL });
let cookie = '';

async function api(path, body, method = body ? 'PATCH' : 'GET', origin = base) {
  const response = await fetch(base + path, { method, headers: { Origin: origin, ...(body ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const text = await response.text(); let data; try { data = JSON.parse(text); } catch { data = { error: text.slice(0, 200) }; }
  if (path === '/api/auth/login' && response.ok) cookie = response.headers.get('set-cookie').split(';')[0];
  return { status: response.status, data };
}

try {
  await db.connect();
  assert.equal((await api('/api/account/preferences')).status, 401, 'needs a sign-in');
  const id = (await db.query('INSERT INTO users(email,full_name,role,department,state_code,password_hash) VALUES($1,$2,$3,$4,$5,$6) RETURNING id', [email, 'QA Data Entry', 'Data Entry Staff', 'teachers', marker.slice(0, 8).toUpperCase(), hashSync(password, 4)])).rows[0].id;
  await db.query('INSERT INTO user_departments(user_id,department) VALUES($1,$2)', [id, 'teachers']);
  const login = await api('/api/auth/login', { email, password }, 'POST'); assert.equal(login.status, 200, JSON.stringify(login.data));

  assert.deepEqual((await api('/api/account/preferences')).data.preferences, {}, 'nothing saved yet');
  assert.equal((await api('/api/account/preferences', { assessLayout: 'grid' }, 'PATCH', 'https://evil.example')).status, 403, 'same origin only');
  assert.equal((await api('/api/account/preferences', { assessLayout: 'table' })).status, 400, 'only listed values');
  assert.equal((await api('/api/account/preferences', { colour: 'red' })).status, 400, 'only known keys');
  assert.deepEqual((await api('/api/account/preferences', { assessLayout: 'grid' })).data.preferences, { assessLayout: 'grid' });
  assert.deepEqual((await api('/api/account/preferences', { assessText: 'large' })).data.preferences, { assessLayout: 'grid', assessText: 'large' }, 'a change keeps the other choices');
  assert.deepEqual((await api('/api/account/preferences')).data.preferences, { assessLayout: 'grid', assessText: 'large' }, 'saved to the account');
  await db.query(`UPDATE users SET ui_preferences = ui_preferences || '{"old":1,"assessText":"huge"}'::jsonb WHERE email=$1`, [email]);
  assert.deepEqual((await api('/api/account/preferences')).data.preferences, { assessLayout: 'grid' }, 'unknown keys and bad values are ignored on read');
  console.log('✓ display preferences need a sign-in and the same origin, take only listed values, merge, and are read back from the account');
  console.log('\nAll 1 UI preference checks passed.');
} finally {
  await db.query('DELETE FROM users WHERE email=$1', [email]).catch(cause => console.error('cleanup failed', cause));
  await db.end();
}
