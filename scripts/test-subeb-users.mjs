// SUBEB user management (app/api/users): state scope, who may manage whom, department limits, one active Director per
// department, protected accounts, session revocation on edits, deactivation, password resets, audit events and
// department-scoped component editing. The review chain itself is covered by test-state-review.mjs.
// Usage: node --env-file=.env scripts/test-subeb-users.mjs [baseUrl]   (local only; throwaway states, users and plan; cleans up)
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { hashSync } from 'bcryptjs';
import ExcelJS from 'exceljs';

const base = process.argv[2] ?? process.env.TEST_BASE_URL ?? process.env.UBEC_TEST_URL ?? 'http://localhost:5173';
assert.match(base, /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/, 'Run this test against a local server only.');
assert.ok(['localhost', '127.0.0.1'].includes(new URL(process.env.DATABASE_URL).hostname), 'Use a local database only.');
const marker = `SU${randomUUID().slice(0, 8).toUpperCase()}`, states = [marker, `${marker}F`], password = randomUUID();
const db = new Client({ connectionString: process.env.DATABASE_URL }), cookies = {}, ids = {}, emails = {};
async function api(who, path, body, method = body ? 'POST' : 'GET') {
  const isForm = body instanceof FormData;
  const r = await fetch(base + path, { method, headers: { Origin: base, ...(body && !isForm ? { 'Content-Type': 'application/json' } : {}), ...(cookies[who] ? { Cookie: cookies[who] } : {}) }, ...(body ? { body: isForm ? body : JSON.stringify(body) } : {}) });
  const text = await r.text(); let data; try { data = JSON.parse(text); } catch { data = { error: text.slice(0, 200) }; }
  return { status: r.status, data, response: r };
}
const ok = (r, status = 200) => { assert.equal(r.status, status, JSON.stringify(r.data)); return r.data; };
async function login(who, pw = password) { const r = await api(who, '/api/auth/login', { email: emails[who], password: pw }); ok(r); cookies[who] = r.response.headers.get('set-cookie').split(';')[0]; }
await db.connect();
try {
  for (const [who, role, departments, state] of [['chair', 'Executive Chairman', [], marker], ['director', 'Director', ['academic'], marker], ['physical', 'Data Entry Staff', ['physical'], marker], ['academic', 'Data Entry Staff', ['academic'], marker], ['foreign', 'Executive Chairman', [], states[1]]]) {
    emails[who] = `${who}.${marker}@subeb-users.test`.toLowerCase();
    ids[who] = (await db.query('INSERT INTO users(full_name,email,role,department,state_code,password_hash) VALUES($1,$2,$3,$4,$5,$6) RETURNING id', ['QA ' + who, emails[who], role, departments[0] ?? null, state, hashSync(password, 4)])).rows[0].id;
    for (const department of departments) await db.query('INSERT INTO user_departments(user_id,department) VALUES($1,$2)', [ids[who], department]);
    await login(who);
  }
  assert.equal((await api('anonymous', '/api/users')).status, 401);
  assert.equal((await api('physical', '/api/users')).status, 403);
  assert.equal(ok(await api('director', '/api/users')).users.length, 4);
  assert.equal(ok(await api('foreign', '/api/users')).users.length, 1);
  const profile = { name: 'QA new staff', email: `new.${marker}@subeb-users.test`.toLowerCase(), role: 'Data Entry Staff', departments: ['academic'], active: true };
  assert.equal((await api('director', '/api/users', { ...profile, stateCode: states[1] })).status, 400, 'The state comes from the session');
  assert.equal((await api('director', '/api/users', { ...profile, departments: ['procurement'] })).status, 400);
  assert.equal((await api('director', '/api/users', { ...profile, departments: ['physical'] })).status, 403, 'A Director assigns only their own departments');
  assert.equal((await api('director', '/api/users', { ...profile, role: 'Director' })).status, 403, 'Only the Executive Chairman appoints Directors');
  assert.equal((await api('chair', '/api/users', { ...profile, role: 'Director' })).status, 409, 'One active Director per department');
  assert.equal((await api('chair', '/api/users', { ...profile, role: 'Executive Chairman' })).status, 400);
  assert.equal((await api('director', '/api/users', { ...profile, canCreatePlan: true })).status, 403, 'Only the Executive Chairman delegates plan creation');
  const created = ok(await api('director', '/api/users', profile), 201);
  assert.ok(created.password.length > 20);
  assert.equal((await api('director', '/api/users', profile)).status, 409, 'Emails are unique');
  emails.new = profile.email; await login('new', created.password);
  assert.equal((await api('foreign', '/api/users', { id: created.id, action: 'reset_password' }, 'PATCH')).status, 404);
  assert.equal((await api('director', '/api/users', { id: ids.chair, action: 'reset_password' }, 'PATCH')).status, 403);
  assert.equal((await api('director', '/api/users', { id: ids.director, action: 'reset_password' }, 'PATCH')).status, 403, 'Nobody changes their own account here');
  assert.equal((await api('director', '/api/users', { id: ids.physical, name: 'QA physical', role: 'Data Entry Staff', departments: ['physical'], active: true }, 'PATCH')).status, 403, 'A Director manages only staff within their departments');
  const change = { id: created.id, name: 'QA renamed staff', role: profile.role, departments: ['academic'], active: true };
  ok(await api('director', '/api/users', change, 'PATCH'));
  assert.equal((await api('new', '/api/auth/session')).status, 401, 'Edits revoke existing sessions');
  await login('new', created.password);
  const session = ok(await api('new', '/api/auth/session')).user;
  assert.equal(session.name, 'QA renamed staff'); assert.deepEqual(session.departments, ['academic']);
  ok(await api('director', '/api/users', { ...change, active: false }, 'PATCH'));
  assert.equal((await api('new', '/api/auth/login', { email: profile.email, password: created.password })).status, 401);
  assert.equal((await api('new', '/api/auth/session')).status, 401);
  ok(await api('director', '/api/users', change, 'PATCH'));
  const reset = ok(await api('chair', '/api/users', { id: created.id, action: 'reset_password' }, 'PATCH'));
  assert.equal((await api('new', '/api/auth/login', { email: profile.email, password: created.password })).status, 401);
  await login('new', reset.password);

  // Department access: each Data Entry officer edits only their own departments' components.
  const rat = new ExcelJS.Workbook(); rat.addWorksheet('RAT').addRow(['Users QA']);
  const form = new FormData();
  form.set('setup', JSON.stringify({ planningYear: 2036, implementationYear: 2036, quarters: [1], stateLodgment: '100000000', fundingSources: [] }));
  form.append('rat', new Blob([await rat.xlsx.writeBuffer()]), 'rat.xlsx');
  const plan = ok(await api('chair', '/api/plans', form), 201).plan;
  const sports = `/api/sports?plan=${plan.id}`, monitoring = `/api/activities?plan=${plan.id}&workstream=monitoring`;
  const budget = { entity: 'budget', action: 'create', section: 'equipment', activityType: 'Football', description: 'QA balls', quantity: 5, unitCost: 100 };
  const visit = { workstream: 'monitoring', entity: 'line', action: 'create', activity: 0, description: 'QA visit', quantity: 1, unitCost: 1000, strategy: 'Request for quotation', targetGroup: 'Schools' };
  assert.equal((await api('physical', sports, budget)).status, 403);
  assert.equal((await api('academic', monitoring, visit)).status, 403);
  assert.equal((await api('chair', sports, budget)).status, 403);
  ok(await api('academic', sports, budget), 201); ok(await api('new', sports, budget), 201); ok(await api('physical', monitoring, visit));
  assert.equal(ok(await api('academic', sports)).canEdit, true);
  assert.equal((await api('physical', sports)).status, 403, 'Other departments cannot open the component');
  assert.equal((await api('foreign', sports)).status, 404);

  const rows = ok(await api('chair', '/api/users')).users;
  assert.ok(rows.every(u => !('password_hash' in u) && !('session_version' in u) && !('password' in u)));
  assert.equal((await db.query('SELECT COUNT(*)::int AS n FROM user_management_events WHERE state_code=$1', [marker])).rows[0].n, 5);
  console.log('PASS: state-scoped user management, department limits, one Director per department, protected accounts, session revocation, deactivation, password reset, audit events, department-scoped editing.');
} finally {
  await db.query('DELETE FROM user_management_events WHERE state_code=ANY($1::text[])', [states]);
  const plans = 'SELECT id FROM action_plans WHERE state_code=ANY($1::text[])';
  for (const table of ['plan_notifications', 'plan_review_events', 'plan_submissions', 'plan_pillar_reviews', 'activity_plan_lines']) await db.query(`DELETE FROM ${table} WHERE plan_id IN (${plans})`, [states]);
  await db.query('DELETE FROM sports_allocations WHERE line_id IN (SELECT id FROM sports_budget_lines WHERE state_code=ANY($1::text[]))', [states]);
  for (const table of ['sports_budget_lines', 'action_plans']) await db.query(`DELETE FROM ${table} WHERE state_code=ANY($1::text[])`, [states]);
  await db.query('DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE state_code=ANY($1::text[]))', [states]);
  await db.query('DELETE FROM users WHERE state_code=ANY($1::text[])', [states]);
  await db.end();
}
