// Deleting a plan (DELETE /api/plans/setup): plan creators only, same origin, current version, never once sent to UBEC;
// the plan goes with its lines, documents, comments, review history and notifications.
// Usage: node --env-file=.env scripts/test-plan-delete.mjs [baseUrl]   (local only; cleans up)
import assert from 'node:assert/strict';
import { Client } from 'pg';
import { hashSync } from 'bcryptjs';
import ExcelJS from 'exceljs';

const base = process.argv[2] ?? process.env.TEST_BASE_URL ?? process.env.UBEC_TEST_URL ?? 'http://localhost:5173';
assert.ok(['localhost', '127.0.0.1'].includes(new URL(base).hostname));
assert.ok(['localhost', '127.0.0.1'].includes(new URL(process.env.DATABASE_URL).hostname));
const db = new Client({ connectionString: process.env.DATABASE_URL });
const state = `PD${Date.now()}`, password = crypto.randomUUID(), cookies = {}, ids = [], plans = [];
const step = name => console.log(`- ${name}`);
async function api(who, path, body, method = body ? 'POST' : 'GET', origin = base) {
  const headers = { Cookie: cookies[who] || '' };
  if (origin) headers.Origin = origin;
  if (body && !(body instanceof FormData)) headers['Content-Type'] = 'application/json';
  const r = await fetch(base + path, { method, headers, ...(body ? { body: body instanceof FormData ? body : JSON.stringify(body) } : {}) });
  return { status: r.status, data: await r.json(), cookie: r.headers.get('set-cookie')?.split(';')[0] };
}
const ok = (r, status = 200) => { assert.equal(r.status, status, JSON.stringify(r.data)); return r.data; };
const workbook = new ExcelJS.Workbook(); workbook.addWorksheet('RAT').addRow(['Plan delete QA']);
const ratFile = new Blob([await workbook.xlsx.writeBuffer()]);
function create(year) {
  const form = new FormData();
  form.set('setup', JSON.stringify({ planningYear: year, implementationYear: year, quarters: [1, 2], stateLodgment: '100000', fundingSources: [] }));
  form.append('rat', ratFile, 'rat.xlsx');
  return api('chair', '/api/plans', form);
}
const line = { workstream: 'sbmc', entity: 'line', action: 'create', activity: 0, description: 'Community planning session', rationale: 'Improve participation', implementationApproach: 'Workshops', quantity: 1, unitCost: 10000, strategy: 'NCB', targetGroup: 'Community level', equipment: '' };
const remaining = async planId => Object.fromEntries(await Promise.all(['action_plans', 'activity_plan_lines', 'plan_review_events', 'plan_pillar_reviews', 'plan_notifications', 'plan_documents', 'plan_quarters', 'plan_comments']
  .map(async table => [table, Number((await db.query(`SELECT count(*) FROM ${table} WHERE ${table === 'action_plans' ? 'id' : 'plan_id'}=$1`, [planId])).rows[0].count)])));

await db.connect();
try {
  for (const [who, role, department] of [['chair', 'Executive Chairman', null], ['director', 'Director', 'social'], ['social', 'Data Entry Staff', 'social']]) {
    const email = `${who}.${state.toLowerCase()}@test.local`;
    ids.push((await db.query('INSERT INTO users(full_name,email,role,department,state_code,password_hash) VALUES($1,$2,$3,$4,$5,$6) RETURNING id', [`QA ${who}`, email, role, department, state, hashSync(password, 4)])).rows[0].id);
    if (department) await db.query('INSERT INTO user_departments(user_id,department) VALUES($1,$2)', [ids.at(-1), department]);
    const r = await api(who, '/api/auth/login', { email, password }); ok(r); cookies[who] = r.cookie;
  }

  step('no plan for a year after the current one (Africa/Lagos)');
  const nextYear = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Lagos', year: 'numeric' }).format(new Date())) + 1;
  const future = await create(nextYear); ok(future, 400); assert.match(future.data.error, /Plans can't be created for a year after/);

  step('a plan with a line, a submitted component, a comment and notifications');
  const plan = ok(await create(2024), 201).plan; plans.push(plan.id);
  ok(await api('social', `/api/activities?plan=${plan.id}&workstream=sbmc`, line));
  const version = async () => ok(await api('chair', `/api/plans/setup?plan=${plan.id}`)).plan.version;
  const reviewVersion = ok(await api('social', `/api/plans/review?plan=${plan.id}`)).plan.version;
  ok(await api('social', `/api/plans/review?plan=${plan.id}`, { action: 'submit', pillar: 'sbmc', version: reviewVersion, comment: 'Ready' }));
  const lineId = ok(await api('director', `/api/plans/review?plan=${plan.id}`)).snapshot.sbmc[0].id;
  ok(await api('director', `/api/plans/comments?plan=${plan.id}`, { sheet: 'sbmc', rowRef: String(lineId), columnId: null, body: 'Check the cost' }), 201);
  const before = await remaining(plan.id);
  for (const table of ['action_plans', 'activity_plan_lines', 'plan_review_events', 'plan_documents', 'plan_quarters', 'plan_comments']) assert.ok(before[table] > 0, `${table} should have rows before the delete`);

  step('GET setup tells plan creators they may delete; others may not');
  const info = ok(await api('chair', `/api/plans/setup?plan=${plan.id}`));
  assert.equal(info.canDelete, true); assert.equal(info.deleteBlockedReason, null);
  assert.equal(ok(await api('social', `/api/plans/setup?plan=${plan.id}`)).canDelete, false);

  step('DELETE guards: origin, permission, version');
  const body = { plan: plan.id, version: await version() };
  ok(await api('chair', '/api/plans/setup', body, 'DELETE', null), 403);
  ok(await api('director', '/api/plans/setup', body, 'DELETE'), 403);
  ok(await api('social', '/api/plans/setup', body, 'DELETE'), 403);
  ok(await api('chair', '/api/plans/setup', { ...body, version: body.version + 5 }, 'DELETE'), 409);
  ok(await api('chair', '/api/plans/setup', { plan: 'x' }, 'DELETE'), 400);

  step('a plan sent to UBEC cannot be deleted');
  const round = (await db.query('INSERT INTO ubec_rounds(plan_id,number,state_submission,snapshot,submitted_by) VALUES($1,1,1,$2,$3) RETURNING id', [plan.id, '{}', ids[0]])).rows[0].id;
  const blocked = await api('chair', '/api/plans/setup', body, 'DELETE'); ok(blocked, 409); assert.match(blocked.data.error, /sent to UBEC/);
  const blockedInfo = ok(await api('chair', `/api/plans/setup?plan=${plan.id}`));
  assert.equal(blockedInfo.canDelete, false); assert.match(blockedInfo.deleteBlockedReason, /sent to UBEC/);
  await db.query('DELETE FROM ubec_rounds WHERE id=$1', [round]);

  step('the Executive Chairman deletes it; everything recorded against it goes');
  assert.equal(ok(await api('chair', '/api/plans/setup', body, 'DELETE')).deleted, plan.id);
  assert.ok(Object.values(await remaining(plan.id)).every(count => count === 0), JSON.stringify(await remaining(plan.id)));
  ok(await api('chair', `/api/plans/setup?plan=${plan.id}`), 404);
  ok(await api('chair', '/api/plans/setup', body, 'DELETE'), 404);

  step('its quarters are free again: a new plan can take them');
  plans.push(ok(await create(2024), 201).plan.id);
  console.log('PASS plan delete');
} finally {
  for (const table of ['plan_notifications', 'plan_comments', 'plan_review_events', 'plan_submissions', 'plan_pillar_reviews', 'activity_plan_lines', 'ubec_rounds']) await db.query(`DELETE FROM ${table} WHERE plan_id=ANY($1::int[])`, [plans]);
  await db.query('DELETE FROM action_plans WHERE id=ANY($1::int[])', [plans]);
  await db.query('DELETE FROM sessions WHERE user_id=ANY($1::int[])', [ids]);
  await db.query('DELETE FROM users WHERE id=ANY($1::int[])', [ids]);
  await db.end();
}
