// UBEC236 (migration 092): Delete user. The Super Admin (Admin > Users), the SUBEB Executive Chairman and BEAP Chair (/users,
// accounts they manage) and the UBEC BEAP Chair, Directors and Oversight Directors (/ubec/team, their Assessment Officers).
// An account nothing refers to is deleted outright; one with recorded work is removed (inactive, signed out, hidden, email freed).
// Usage: node --env-file=.env scripts/test-delete-users.mjs [baseUrl]   (local only; throwaway accounts; cleans up)
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { hashSync } from 'bcryptjs';

const base = process.argv[2] ?? process.env.TEST_BASE_URL ?? process.env.UBEC_TEST_URL ?? 'http://localhost:5173';
assert.match(base, /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/, 'Run this test against a local server only.');
assert.ok(['localhost', '127.0.0.1'].includes(new URL(process.env.DATABASE_URL).hostname), 'Use a local database only.');
const state = `DU${randomUUID().slice(0, 6).toUpperCase()}`, other = `DV${randomUUID().slice(0, 6).toUpperCase()}`, marker = randomUUID().slice(0, 8), password = randomUUID();
const db = new Client({ connectionString: process.env.DATABASE_URL });
const cookies = {}, users = {}, emails = {};
const step = message => console.log('✓', message);

async function api(who, path, body, method = body ? 'POST' : 'GET', origin = base) {
  const response = await fetch(base + path, { method, headers: { ...(origin ? { Origin: origin } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}), ...(cookies[who] ? { Cookie: cookies[who] } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const data = await response.json().catch(() => ({}));
  if (path === '/api/auth/login' && response.ok) cookies[who] = response.headers.get('set-cookie').split(';')[0];
  return { status: response.status, data };
}
const ok = (r, status = 200) => { assert.equal(r.status, status, JSON.stringify(r.data)); return r.data; };
const fails = (r, status, pattern) => { assert.equal(r.status, status, JSON.stringify(r.data)); if (pattern) assert.match(r.data.error ?? '', pattern); return r.data; };
async function user(who, role, stateCode, departments = [], extra = {}) {
  emails[who] = `${who}.${marker}@${stateCode === 'UBEC' ? 'ubec.gov.ng' : 'delete-users.test'}`.toLowerCase();
  users[who] = (await db.query('INSERT INTO users(email,full_name,role,department,state_code,password_hash,is_beap_chair,role_title) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id', [emails[who], `QA ${who}`, role, departments[0] ?? null, stateCode, hashSync(password, 4), !!extra.chair, extra.roleTitle ?? ''])).rows[0].id;
  for (const department of departments) await db.query('INSERT INTO user_departments(user_id,department) VALUES($1,$2)', [users[who], department]);
  if (!extra.noLogin) ok(await api(who, '/api/auth/login', { email: emails[who], password }));
}
const row = async id => (await db.query('SELECT active, deleted_at, email, session_version, current_session_id FROM users WHERE id=$1', [id])).rows[0];
/** Gives the account recorded work (a user-management event it made), so it is removed rather than deleted. */
const recordWork = async id => db.query("INSERT INTO user_management_events(actor_id,target_id,state_code,action,details) VALUES($1,$1,$2,'update','{}'::jsonb)", [id, state]);

await db.connect();
try {
  await user('admin', 'Super Admin', 'UBEC'); await user('admin2', 'Super Admin', 'UBEC', [], { noLogin: true });
  await user('ec', 'Executive Chairman', state); await user('chair', 'Director', state, ['physical'], { chair: true });
  await user('director', 'Director', state, ['academic']); await user('clerk', 'Data Entry Staff', state, ['physical']);
  await user('clerk2', 'Data Entry Staff', state, ['academic']); await user('clerk3', 'Data Entry Staff', state, ['academic'], { noLogin: true });
  await user('outsider', 'Data Entry Staff', other, ['physical'], { noLogin: true });
  await user('dpp', 'UBEC Director', 'UBEC', ['physical']); await user('offP', 'UBEC Assessment Officer', 'UBEC', ['physical'], { roleTitle: 'UBEC Assessment Officer 1' });
  await user('offQ', 'UBEC Assessment Officer', 'UBEC', ['quality'], { noLogin: true });

  // Guards.
  fails(await api('admin', '/api/admin/users', { id: users.clerk3 }, 'DELETE', null), 403);
  fails(await api('admin', '/api/admin/users', { id: users.admin }, 'DELETE'), 403, /your own account/);
  fails(await api('clerk', '/api/admin/users', { id: users.clerk3 }, 'DELETE'), 403);
  fails(await api('clerk', '/api/users', { id: users.clerk2 }, 'DELETE'), 403, /Executive Chairman and BEAP Chair/);
  fails(await api('chair', '/api/users', { id: users.director }, 'DELETE'), 403, /cannot delete this account/);
  fails(await api('chair', '/api/users', { id: users.chair }, 'DELETE'), 403);
  fails(await api('chair', '/api/users', { id: users.outsider }, 'DELETE'), 404);
  fails(await api('chair', '/api/users', { id: users.clerk2 }, 'DELETE', null), 403);
  step('same origin; nobody deletes themselves; the BEAP Chair deletes Data Entry Staff of their own state only; Data Entry deletes nobody');

  // An account nothing refers to is deleted outright, and the record of it kept.
  const deleted = ok(await api('chair', '/api/users', { id: users.clerk3 }, 'DELETE'));
  assert.equal(deleted.mode, 'deleted'); assert.match(deleted.message, /QA clerk3 was deleted/);
  assert.equal(await row(users.clerk3), undefined);
  const record = (await db.query("SELECT target_id, details FROM user_management_events WHERE action='delete' AND details->>'email'=$1", [emails.clerk3])).rows[0];
  assert.equal(record.target_id, null); assert.equal(record.details.mode, 'deleted');
  step('BEAP Chair: an account without recorded work is deleted outright; the delete is logged with who it was');

  // An account with recorded work is removed: inactive, signed out, hidden, email freed.
  await recordWork(users.clerk2);
  const before = await row(users.clerk2);
  ok(await api('clerk2', '/api/auth/session'));
  const removed = ok(await api('chair', '/api/users', { id: users.clerk2 }, 'DELETE'));
  assert.equal(removed.mode, 'removed'); assert.ok(removed.references.includes('user_management_events'));
  const after = await row(users.clerk2);
  assert.equal(after.active, false); assert.ok(after.deleted_at); assert.equal(after.email, `deleted+${users.clerk2}+${emails.clerk2}`);
  assert.equal(after.session_version, before.session_version + 1); assert.equal(after.current_session_id, null);
  assert.equal((await api('clerk2', '/api/auth/session')).status, 401, 'signed out at once');
  assert.ok(!ok(await api('ec', '/api/users')).users.some(u => u.id === users.clerk2), 'hidden from the Users list');
  fails(await api('chair', '/api/users', { id: users.clerk2 }, 'DELETE'), 404);
  fails(await api('ec', '/api/users', { id: users.clerk2, name: 'Back again', role: 'Data Entry Staff', departments: ['academic'], active: true }, 'PATCH'), 404, /not found/);
  // The email can be used again.
  const again = ok(await api('chair', '/api/users', { name: 'QA clerk2 again', email: emails.clerk2, role: 'Data Entry Staff', departments: ['academic'], active: true }), 201);
  users.clerk2again = again.id;
  step('an account with recorded work is removed: inactive, signed out, hidden from Users, and its email can be used again');

  // The Executive Chairman deletes Directors.
  ok(await api('ec', '/api/users', { id: users.director }, 'DELETE'));
  step('the Executive Chairman deletes a Director');

  // UBEC: Directors delete Assessment Officers of their own department; default officers and open work drop out.
  await db.query("INSERT INTO ubec_default_officers(pillar,officer_id,updated_by_name) VALUES('monitoring',$1,'QA')", [users.offP]);
  await recordWork(users.offP);
  fails(await api('dpp', '/api/ubec/officers', { id: users.offQ }, 'DELETE'), 403, /own department/);
  fails(await api('offP', '/api/ubec/officers', { id: users.offP }, 'DELETE'), 403);
  const team = ok(await api('dpp', '/api/ubec/officers'));
  assert.ok(team.officers.some(o => o.id === users.offP));
  const officer = ok(await api('dpp', '/api/ubec/officers', { id: users.offP }, 'DELETE'));
  assert.equal(officer.mode, 'removed');
  assert.equal((await db.query('SELECT COUNT(*)::int AS n FROM ubec_default_officers WHERE officer_id=$1', [users.offP])).rows[0].n, 0);
  assert.ok(!ok(await api('dpp', '/api/ubec/officers')).officers.some(o => o.id === users.offP), 'hidden from the Officers page');
  step('UBEC Director: deletes their own department\'s officers only; default officers drop out');

  // Super Admin.
  ok(await api('admin', '/api/admin/users', { id: users.offQ }, 'DELETE'));
  ok(await api('admin', '/api/admin/users', { id: users.admin2 }, 'DELETE'), 200);
  assert.ok(!(await api('admin', '/api/admin/impersonation')).data.users.some(u => u.id === users.clerk2), 'hidden from Admin > Users');
  fails(await api('admin', '/api/admin/users', { id: users.clerk2 }, 'DELETE'), 404);
  step('Super Admin: deletes any account (also another Super Admin), never their own; removed accounts are hidden');
  console.log('PASS: delete users (UBEC236)');
} finally {
  const ids = Object.values(users);
  await db.query('DELETE FROM user_management_events WHERE actor_id=ANY($1::int[]) OR target_id=ANY($1::int[])', [ids]);
  await db.query('DELETE FROM ubec_default_officers WHERE officer_id=ANY($1::int[])', [ids]);
  await db.query('DELETE FROM sessions WHERE user_id=ANY($1::int[])', [ids]).catch(() => {});
  await db.query('DELETE FROM user_departments WHERE user_id=ANY($1::int[])', [ids]);
  await db.query('DELETE FROM users WHERE id=ANY($1::int[])', [ids]);
  await db.end();
}
