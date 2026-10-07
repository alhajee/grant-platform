// Session renewal (POST /api/auth/session): sliding idle limit, absolute limit, cross-site refusal, Super Admin
// session row and impersonation carried over. Creates throwaway users and removes them.
// Usage: set -a; . ./.env; set +a; node scripts/test-session-renewal.mjs [baseUrl]
import assert from 'node:assert/strict';
import { Client } from 'pg';
import { hashSync } from 'bcryptjs';
import { tsImport } from 'tsx/esm/api';

const base = process.argv[2] ?? process.env.TEST_BASE_URL ?? 'http://localhost:5173';
assert.ok(['localhost', '127.0.0.1'].includes(new URL(base).hostname));
const session = await tsImport('../lib/local-session.ts', import.meta.url);
const db = new Client({ connectionString: process.env.DATABASE_URL });
const marker = `SR${Date.now()}`, password = crypto.randomUUID(), users = {}, jars = {};
let checks = 0;
const step = name => { checks++; console.log(`✓ ${name}`); };

async function api(who, path, { body, method = body ? 'POST' : 'GET', origin = base } = {}) {
  const jar = jars[who] ??= {};
  const response = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', Origin: origin, Cookie: Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ') }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const cookies = response.headers.getSetCookie();
  for (const cookie of cookies) { const first = cookie.split(';')[0], i = first.indexOf('='); jar[first.slice(0, i)] = first.slice(i + 1); }
  const text = await response.text(); let data; try { data = JSON.parse(text); } catch { data = { error: text }; }
  return { status: response.status, data, cookies };
}
const expect = (result, status = 200) => { assert.equal(result.status, status, JSON.stringify(result.data)); return result.data; };
const renew = (who, origin) => api(who, '/api/auth/session', { method: 'POST', origin });

await db.connect();
try {
  for (const [key, role, state] of [['officer', 'Data Entry Staff', marker], ['admin', 'Super Admin', 'ADMIN']]) {
    const email = `${key}.${marker.toLowerCase()}@test.local`;
    const id = (await db.query('INSERT INTO users(email,full_name,role,department,state_code,password_hash) VALUES($1,$2,$3,$4,$5,$6) RETURNING id', [email, `SR ${key}`, role, role === 'Super Admin' ? null : 'physical', state, hashSync(password, 4)])).rows[0].id;
    users[key] = { id, email };
    expect(await api(key, '/api/auth/login', { body: { email, password } }));
  }

  const before = jars.officer.ubec_session;
  expect(await renew('officer', 'https://evil.example'), 403);
  const renewed = await renew('officer');
  expect(renewed);
  assert.notEqual(jars.officer.ubec_session, before, 'a renewal issues a fresh cookie');
  assert.match(renewed.cookies.join(';'), /Max-Age=43[12]\d\d/i, 'the cookie lasts the idle limit (12 hours)');
  expect(await api('officer', '/api/auth/session'));
  expect(await renew('anonymous'), 401);
  step('renewal: same origin only, fresh 12-hour cookie that still signs in; signed-out callers get 401');

  // A session signed in almost 7 days ago is renewed only up to the absolute limit, then refused.
  const tokenAt = async issuedAt => session.createLocalSession({ name: 'SR officer', role: 'Data Entry Staff', email: users.officer.email, sessionVersion: 0 }, issuedAt);
  const week = session.sessionMaxSeconds * 1000;
  jars.late = { ubec_session: await tokenAt(Date.now() - week + 30 * 60 * 1000) };
  const late = expect(await renew('late'));
  assert.ok(Date.parse(late.expiresAt) - Date.now() <= 31 * 60 * 1000, 'never past 7 days from sign-in');
  jars.old = { ubec_session: await tokenAt(Date.now() - week + 30 * 1000) };
  expect(await renew('old'), 401);
  step('absolute limit: renewals stop 7 days after sign-in');

  const target = (await db.query('SELECT id FROM users WHERE id=$1', [users.officer.id])).rows[0].id;
  expect(await api('admin', '/api/admin/impersonation', { body: { action: 'start', userId: target } }));
  await db.query("UPDATE impersonation_sessions SET expires_at=NOW()+INTERVAL '5 minutes' WHERE actor_id=$1 AND ended_at IS NULL", [users.admin.id]);
  expect(await renew('admin'));
  const acting = expect(await api('admin', '/api/auth/session'));
  assert.equal(acting.user.name, 'SR officer', 'the impersonation survives the new cookie');
  const row = (await db.query("SELECT expires_at > NOW()+INTERVAL '55 minutes' AS extended FROM impersonation_sessions WHERE actor_id=$1 AND ended_at IS NULL", [users.admin.id])).rows[0];
  assert.ok(row?.extended, 'impersonation lasts an hour from the last activity');
  const admin = (await db.query("SELECT expires_at > NOW()+INTERVAL '11 hours' AS extended FROM sessions WHERE user_id=$1", [users.admin.id])).rows[0];
  assert.ok(admin?.extended, 'the Super Admin session row is extended');
  step('Super Admin: session row extended; impersonation stays bound and extended');
  console.log(`PASS: ${checks} session renewal checks.`);
} finally {
  const ids = Object.values(users).map(user => user.id);
  await db.query('DELETE FROM impersonation_sessions WHERE actor_id = ANY($1::int[]) OR target_id = ANY($1::int[])', [ids]);
  await db.query('DELETE FROM sessions WHERE user_id = ANY($1::int[])', [ids]);
  await db.query('DELETE FROM users WHERE id = ANY($1::int[])', [ids]);
  await db.end();
}
