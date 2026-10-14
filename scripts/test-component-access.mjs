// Component-level access for Data Entry Staff (lib/component-access.ts): a user's departments may name single components
// ("physical/monitoring"); they edit, see and send only those, and only they hear about changes asked on them.
// Usage: node --env-file=.env scripts/test-component-access.mjs [baseUrl]   (local only; cleans up)
import assert from 'node:assert/strict';
import { Client } from 'pg';
import { hashSync } from 'bcryptjs';
import ExcelJS from 'exceljs';

const base = process.argv[2] ?? process.env.TEST_BASE_URL ?? process.env.UBEC_TEST_URL ?? 'http://localhost:5173';
assert.ok(['localhost', '127.0.0.1'].includes(new URL(base).hostname));
assert.ok(['localhost', '127.0.0.1'].includes(new URL(process.env.DATABASE_URL).hostname));
const db = new Client({ connectionString: process.env.DATABASE_URL });
const state = `CA${Date.now()}`, password = crypto.randomUUID(), cookies = {}, ids = [], plans = [];
const step = name => console.log(`- ${name}`);
async function api(who, path, body, method = body ? 'POST' : 'GET') {
  const headers = { Cookie: cookies[who] || '', Origin: base };
  if (body && !(body instanceof FormData)) headers['Content-Type'] = 'application/json';
  const r = await fetch(base + path, { method, headers, ...(body ? { body: body instanceof FormData ? body : JSON.stringify(body) } : {}) });
  return { status: r.status, data: await r.json(), cookie: r.headers.get('set-cookie')?.split(';')[0] };
}
const ok = (r, status = 200) => { assert.equal(r.status, status, JSON.stringify(r.data)); return r.data; };
const email = who => `${who}.${state.toLowerCase()}@test.local`;
async function login(who) { const r = await api(who, '/api/auth/login', { email: email(who), password }); ok(r); cookies[who] = r.cookie; }
async function seed(who, role, departments) {
  ids.push((await db.query('INSERT INTO users(full_name,email,role,department,state_code,password_hash) VALUES($1,$2,$3,$4,$5,$6) RETURNING id', [`QA ${who}`, email(who), role, departments[0] ?? null, state, hashSync(password, 4)])).rows[0].id);
  for (const d of departments) await db.query('INSERT INTO user_departments(user_id,department) VALUES($1,$2)', [ids.at(-1), d]);
  await login(who);
}
const line = (workstream, extra = {}) => ({ workstream, entity: 'line', action: 'create', activity: 0, description: `CA ${workstream}`, quantity: 1, unitCost: 100, strategy: 'Request for quotation', targetGroup: 'Schools', ...extra });

await db.connect();
try {
  await seed('chair', 'Executive Chairman', []);
  await seed('director', 'Director', ['physical']);

  step('the Executive Chairman gives Data Entry Staff single components; Directors stay whole departments');
  const create = (who, role, departments) => api('chair', '/api/users', { name: `QA ${who}`, email: email(who), role, departments, active: true });
  const mon = ok(await create('mon', 'Data Entry Staff', ['physical/monitoring']), 201).id;
  const infra = ok(await create('infra', 'Data Entry Staff', ['physical/infrastructure', 'academic/sports']), 201).id;
  const both = ok(await create('both', 'Data Entry Staff', ['physical/infrastructure', 'physical/monitoring']), 201).id;
  ids.push(mon, infra, both);
  ok(await create('dirx', 'Director', ['academic/sports']), 400);
  ok(await create('bad', 'Data Entry Staff', ['physical/sports']), 400);
  ok(await create('bad2', 'Data Entry Staff', ['nowhere']), 400);
  const listed = ok(await api('chair', '/api/users')).users;
  assert.deepEqual(listed.find(u => u.id === mon).departments, ['physical/monitoring']);
  assert.deepEqual(listed.find(u => u.id === infra).departments, ['academic/sports', 'physical/infrastructure']);
  assert.deepEqual(listed.find(u => u.id === both).departments, ['physical'], 'every component of a department becomes the department');
  for (const id of [mon, infra, both]) await db.query('UPDATE users SET password_hash=$1 WHERE id=$2', [hashSync(password, 4), id]);
  for (const who of ['mon', 'infra', 'both']) await login(who);

  step('the department Director manages a single-component account of their department');
  ok(await api('director', '/api/users', { id: mon, name: 'QA mon', role: 'Data Entry Staff', departments: ['physical/monitoring'], active: true }, 'PATCH'));
  ok(await api('director', '/api/users', { id: infra, name: 'QA infra', role: 'Data Entry Staff', departments: ['physical/infrastructure'], active: true }, 'PATCH'), 403);
  await login('mon');

  step('a plan: each account edits and sees only its components');
  const workbook = new ExcelJS.Workbook(); workbook.addWorksheet('RAT').addRow(['Component access QA']);
  const form = new FormData();
  form.set('setup', JSON.stringify({ planningYear: 2025, implementationYear: 2025, quarters: [1, 2], stateLodgment: '100000', fundingSources: [] }));
  form.append('rat', new Blob([await workbook.xlsx.writeBuffer()]), 'rat.xlsx');
  const planId = ok(await api('chair', '/api/plans', form), 201).plan.id; plans.push(planId);
  const url = workstream => `/api/activities?plan=${planId}&workstream=${workstream}`;
  ok(await api('mon', url('monitoring'), line('monitoring')));
  ok(await api('infra', url('monitoring')), 403);
  ok(await api('infra', url('monitoring'), line('monitoring')), 403);
  ok(await api('mon', url('tlm')), 403);
  ok(await api('both', url('monitoring')));
  const beap = ok(await api('mon', `/api/beap?plan=${planId}`));
  assert.deepEqual(beap.editablePillars, ['monitoring']);

  step('only the holder of the component sends it; changes asked go back to them alone');
  const review = async (who, body) => api(who, `/api/plans/review?plan=${planId}`, { ...body, version: ok(await api(who, `/api/plans/review?plan=${planId}`)).plan.version });
  ok(await review('infra', { action: 'submit', pillar: 'monitoring', comment: 'x' }), 403);
  ok(await review('mon', { action: 'submit', pillar: 'monitoring', comment: 'Ready' }));
  ok(await review('director', { action: 'request_changes', pillar: 'monitoring', comment: 'Fix the cost' }));
  const told = (await db.query(`SELECT n.user_id FROM plan_notifications n JOIN plan_review_events e ON e.id=n.event_id WHERE n.plan_id=$1 AND e.action='request_changes'`, [planId])).rows.map(r => r.user_id);
  assert.ok(told.includes(mon) && told.includes(both), `monitoring holders are told (${told})`);
  assert.ok(!told.includes(infra), 'the Infrastructure-only account is not told');
  console.log('PASS component access');
} finally {
  for (const table of ['plan_notifications', 'plan_comments', 'plan_review_events', 'plan_submissions', 'plan_pillar_reviews', 'activity_plan_lines']) await db.query(`DELETE FROM ${table} WHERE plan_id=ANY($1::int[])`, [plans]);
  await db.query('DELETE FROM action_plans WHERE id=ANY($1::int[])', [plans]);
  const all = (await db.query('SELECT id FROM users WHERE state_code=$1', [state])).rows.map(r => r.id);
  await db.query('DELETE FROM user_management_events WHERE actor_id=ANY($1::int[]) OR target_id=ANY($1::int[])', [all]);
  await db.query('DELETE FROM sessions WHERE user_id=ANY($1::int[])', [all]);
  await db.query('DELETE FROM users WHERE id=ANY($1::int[])', [all]);
  await db.end();
}
