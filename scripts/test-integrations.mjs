// API test for the DNEMIS integration settings (migration 043, app/api/admin/integrations/route.ts).
// Creates a throwaway Super Admin and a non-admin, sets the DNEMIS connection with a fake token, checks access,
// validation, encryption at rest and that the token never comes back, then restores the previous row.
// Usage: set -a; . ./.env; set +a; node scripts/test-integrations.mjs [baseUrl]
import assert from 'node:assert/strict';
import { createDecipheriv, hkdfSync, randomBytes, randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { hashSync } from 'bcryptjs';

const base = process.argv[2] ?? process.env.TEST_BASE_URL ?? process.env.UBEC_TEST_URL ?? 'http://localhost:5173';
assert.match(base, /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/, 'Run this test against a local server only.');
assert.ok(process.env.AUTH_SECRET, 'AUTH_SECRET must be loaded from .env to check decryption.');
const tag = randomUUID().slice(0, 8).toLowerCase();
const password = randomUUID(), token = `d2pat_qa${randomBytes(20).toString('hex')}`, token2 = `d2pat_qb${randomBytes(20).toString('hex')}`;
const path = '/api/admin/integrations', dhis = 'https://asc.education.gov.ng/dhis';
const db = new Client({ connectionString: process.env.DATABASE_URL });
const jars = {}, userIds = [], bodies = [];
let saved, passed = 0;
const step = message => { passed++; console.log('✓', message); };

async function api(who, body, { method = body ? 'PUT' : 'GET', origin = true, url = path } = {}) {
  const jar = jars[who] ??= {};
  const headers = { Cookie: Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; '), ...(origin ? { Origin: base } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) };
  const response = await fetch(base + url, { method, headers, ...(body ? { body: JSON.stringify(body) } : {}) });
  for (const cookie of response.headers.getSetCookie()) { const pair = cookie.split(';')[0], i = pair.indexOf('='); jar[pair.slice(0, i)] = pair.slice(i + 1); }
  const text = await response.text(); bodies.push(text);
  let data; try { data = JSON.parse(text); } catch { data = { error: text.slice(0, 200) }; }
  return { status: response.status, data, headers: response.headers };
}
const ok = (result, status = 200) => { assert.equal(result.status, status, JSON.stringify(result.data)); return result.data; };
const refused = (result, status = 400) => { assert.equal(result.status, status, JSON.stringify(result.data)); assert.ok(result.data.error); return result.data.error; };
const put = (body, options) => api('admin', body, { method: 'PUT', ...options });
const row = async () => (await db.query("SELECT * FROM integration_settings WHERE provider='dnemis'")).rows[0];
function decrypt(box) {
  const [version, iv, authTag, ciphertext] = box.split(':');
  assert.equal(version, 'v1');
  const key = Buffer.from(hkdfSync('sha256', process.env.AUTH_SECRET, 'beapms:secret-box', 'beapms:integration-secrets:v1', 32));
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64')); decipher.setAuthTag(Buffer.from(authTag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(ciphertext, 'base64')), decipher.final()]).toString();
}
async function user(key, role, stateCode, department = null) {
  const email = `${key}.${tag}@integrations.test`;
  const id = (await db.query('INSERT INTO users(email,full_name,role,department,state_code,password_hash) VALUES($1,$2,$3,$4,$5,$6) RETURNING id', [email, `QA ${key}`, role, department, stateCode, hashSync(password, 4)])).rows[0].id;
  userIds.push(id);
  if (department) await db.query('INSERT INTO user_departments(user_id,department) VALUES($1,$2)', [id, department]);
  ok(await api(key, { email, password }, { method: 'POST', url: '/api/auth/login' }));
}

await db.connect();
try {
  saved = await row();
  await db.query("DELETE FROM integration_settings WHERE provider='dnemis'");
  await user('admin', 'Super Admin', 'ADMIN');
  await user('des', 'Data Entry Staff', `IQ${tag.toUpperCase()}`, 'academic');

  refused(await api('des'), 403);
  refused(await api('des', { baseUrl: dhis, enabled: false, token }), 403);
  refused(await api('des', { action: 'test' }, { method: 'POST' }), 403);
  refused(await api('anonymous'), 401);
  assert.equal(await row(), undefined, 'refused writes store nothing');
  step('non-admins get 403 for GET, PUT and test; signed-out users get 401');

  let dnemis = ok(await api('admin')).dnemis;
  assert.equal(dnemis.tokenSet, false); assert.equal(dnemis.baseUrl.startsWith('https://'), true);
  assert.match((await api('admin')).headers.get('cache-control') ?? '', /no-store/);
  step(`GET before setup: tokenSet false, source ${dnemis.source}, no-store`);

  refused(await put({ baseUrl: dhis, enabled: false, token }, { origin: false }), 403);
  refused(await put({ baseUrl: 'http://asc.education.gov.ng/dhis', enabled: false, token }));
  for (const url of ['https://10.0.0.8/dhis', 'https://127.0.0.1', 'https://169.254.169.254/latest', 'https://[::1]/dhis', 'https://localhost/dhis', 'https://postgres', 'https://admin:pw@asc.education.gov.ng/dhis']) {
    refused(await put({ baseUrl: url, enabled: false, token }));
  }
  refused(await put({ baseUrl: dhis, enabled: true }));
  refused(await put({ baseUrl: dhis, enabled: false, token: 'has spaces in it' }));
  refused(await put({ baseUrl: dhis, enabled: false, token, clearToken: true }));
  refused(await put({ baseUrl: dhis, enabled: false, token, extra: 1 }));
  assert.equal(await row(), undefined);
  step('PUT refuses cross-origin, http://, private/loopback/link-local/internal hosts, credentials in the URL, enabling without a token and bad bodies');

  dnemis = ok(await put({ baseUrl: `${dhis}/`, enabled: true, token })).dnemis;
  assert.equal(dnemis.baseUrl, dhis); assert.equal(dnemis.enabled, true); assert.equal(dnemis.tokenSet, true); assert.equal(dnemis.tokenLast4, token.slice(-4));
  assert.equal(dnemis.updatedBy, 'QA admin'); assert.equal(dnemis.source, 'database');
  for (const key of Object.keys(dnemis)) assert.ok(!/token$|ciphertext|secret/i.test(key) || ['tokenSet', 'tokenLast4'].includes(key), key);
  let stored = await row();
  assert.ok(stored.token_ciphertext.startsWith('v1:')); assert.ok(!stored.token_ciphertext.includes(token)); assert.notEqual(stored.token_ciphertext, token);
  assert.equal(decrypt(stored.token_ciphertext), token);
  step('PUT stores the token encrypted (v1 AES-256-GCM, decrypts back with AUTH_SECRET); response shows only "ends in" digits');

  dnemis = ok(await put({ baseUrl: dhis, enabled: false })).dnemis;
  assert.equal(dnemis.tokenSet, true); assert.equal(dnemis.enabled, false);
  assert.equal((await row()).token_ciphertext, stored.token_ciphertext);
  dnemis = ok(await put({ baseUrl: dhis, enabled: false, token: '' })).dnemis;
  assert.equal((await row()).token_ciphertext, stored.token_ciphertext, 'an empty token without clearToken keeps the saved one');
  refused(await put({ baseUrl: 'https://play.dhis2.org/demo', enabled: false }));
  assert.equal((await row()).base_url, dhis);
  step('omitting the token keeps it; changing the server without re-entering the token is refused');

  const tested = ok(await api('admin', { action: 'test' }, { method: 'POST' }));
  assert.equal(tested.result.ok, false, 'a fake token must not connect');
  assert.match(tested.result.message, /access token|sign-in|reach DNEMIS|did not respond/i);
  assert.ok(!tested.result.message.includes(token));
  stored = await row();
  assert.equal(stored.last_test_ok, false); assert.equal(stored.last_test_message, tested.result.message); assert.ok(stored.last_tested_at);
  assert.equal(tested.dnemis.lastTestOk, false);
  step(`test with a fake token fails cleanly: "${tested.result.message}"`);

  dnemis = ok(await put({ baseUrl: dhis, enabled: true, token: token2 })).dnemis;
  assert.equal(dnemis.tokenLast4, token2.slice(-4)); assert.equal(dnemis.lastTestedAt, null, 'a new token clears the old test result');
  assert.equal(decrypt((await row()).token_ciphertext), token2);
  refused(await put({ baseUrl: dhis, enabled: true, clearToken: true }));
  dnemis = ok(await put({ baseUrl: dhis, enabled: false, clearToken: true })).dnemis;
  assert.equal(dnemis.tokenSet, false); assert.equal(dnemis.tokenLast4, null);
  stored = await row(); assert.equal(stored.token_ciphertext, null); assert.equal(stored.token_last4, null);
  step('a typed token replaces the saved one; clearToken removes it (refused while turning the connection on)');

  for (const text of bodies) { assert.ok(!text.includes(token), 'a response leaked the first token'); assert.ok(!text.includes(token2), 'a response leaked the second token'); }
  step(`none of the ${bodies.length} API response bodies contains a saved token`);

  console.log(`\nPASS: ${passed} integration settings checks.`);
} finally {
  await db.query("DELETE FROM integration_settings WHERE provider='dnemis'");
  if (saved) {
    // Every column, including the DNEMIS sync schedule (migration 044).
    await db.query('INSERT INTO integration_settings SELECT * FROM json_populate_record(NULL::integration_settings, $1::json)', [JSON.stringify(saved)]);
  }
  if (userIds.length) {
    await db.query('DELETE FROM sessions WHERE user_id=ANY($1::int[])', [userIds]).catch(() => undefined);
    await db.query('DELETE FROM users WHERE id=ANY($1::int[])', [userIds]);
  }
  const left = (await db.query('SELECT COUNT(*)::int AS n FROM users WHERE email LIKE $1', [`%.${tag}@integrations.test`])).rows[0].n;
  console.log(`cleaned up: ${userIds.length} users (left behind: ${left}); previous DNEMIS row ${saved ? 'restored' : 'was absent, none left'}`);
  await db.end();
}
