// Component-specific other funding (UBEC04/05/06) and plan detail edits (UBEC33).
// Usage: node scripts/test-funding-sources.mjs [baseUrl]   (needs DATABASE_URL; local only; cleans up)
import assert from 'node:assert/strict';
import { Client } from 'pg';
import { hashSync } from 'bcryptjs';
import ExcelJS from 'exceljs';

const base = process.argv[2] || process.env.TEST_BASE_URL || 'http://localhost:5174';
assert.ok(['localhost', '127.0.0.1'].includes(new URL(base).hostname));
assert.ok(['localhost', '127.0.0.1'].includes(new URL(process.env.DATABASE_URL).hostname));
const db = new Client({ connectionString: process.env.DATABASE_URL });
const state = `FS${Date.now()}`, password = crypto.randomUUID(), cookies = {}, ids = [];
const step = name => console.log(`- ${name}`);
async function api(who, path, body, method = body ? 'POST' : 'GET', origin = base) {
  const headers = { Cookie: cookies[who] || '' };
  if (origin) headers.Origin = origin;
  if (body && !(body instanceof FormData)) headers['Content-Type'] = 'application/json';
  const r = await fetch(base + path, { method, headers, ...(body ? { body: body instanceof FormData ? body : JSON.stringify(body) } : {}) });
  return { status: r.status, data: await r.json(), cookie: r.headers.get('set-cookie')?.split(';')[0] };
}
const ok = (r, status = 200) => { assert.equal(r.status, status, JSON.stringify(r.data)); return r.data; };
const setup = { planningYear: 2033, implementationYear: 2033, quarters: [1, 2], stateLodgment: '10000', fundingSources: [{ component: 'sbmc', funder: 'World Bank', amount: '3000' }] };
const workbook = new ExcelJS.Workbook(); workbook.addWorksheet('RAT').addRow(['Funding sources QA']);
const ratFile = new Blob([await workbook.xlsx.writeBuffer()]);
function create(who, input) { const form = new FormData(); form.set('setup', JSON.stringify(input)); form.append('rat', ratFile, 'rat.xlsx'); return api(who, '/api/plans', form); }
const line = { workstream: 'sbmc', entity: 'line', action: 'create', activity: 0, description: 'Community planning session', rationale: 'Improve participation', implementationApproach: 'Workshops', quantity: 1, unitCost: 0, strategy: 'NCB', targetGroup: 'Community level', equipment: '' };
const kobo = v => Math.round(Number(v) * 100);

await db.connect();
try {
  for (const [who, role, department] of [['chair', 'Executive Chairman', null], ['director', 'Director', 'social'], ['social', 'Data Entry Staff', 'social']]) {
    const email = `${who}.${state.toLowerCase()}@test.local`;
    ids.push((await db.query('INSERT INTO users(full_name,email,role,department,state_code,password_hash) VALUES($1,$2,$3,$4,$5,$6) RETURNING id', [`QA ${who}`, email, role, department, state, hashSync(password, 4)])).rows[0].id);
    if (department) await db.query('INSERT INTO user_departments(user_id,department) VALUES($1,$2)', [ids.at(-1), department]);
    const r = await api(who, '/api/auth/login', { email, password }); ok(r); cookies[who] = r.cookie;
  }
  const policy = (await db.query('SELECT allocation FROM funding_policies ORDER BY id DESC LIMIT 1')).rows[0].allocation;
  const sbmcShare = kobo('20000') * policy.shares.sbmc / 10000; // base envelope = 10000 × 2

  step('creation validates sources and rejects spread other funding');
  for (const change of [{ fundingSources: [{ component: 'sbmc', funder: '', amount: '5' }] }, { fundingSources: [{ component: 'sbmc', funder: 'X', amount: '0' }] }, { fundingSources: [{ component: 'roads', funder: 'X', amount: '5' }] }, { otherFunding: '5' }, { stateLodgment: '0', fundingSources: [] }])
    ok(await create('chair', { ...setup, ...change }), 400);
  ok(await create('chair', { ...setup, stateLodgment: '0' }), 201); // a source alone is enough funding
  await db.query('DELETE FROM action_plans WHERE state_code=$1', [state]);
  const created = ok(await create('chair', { ...setup, otherFunding: '0' }), 201).plan;
  assert.equal(created.fundingTotal, '23000.00'); assert.equal(created.otherFunding, '0.00');
  assert.deepEqual(created.fundingSources.map(s => [s.component, s.funder, s.amount]), [['sbmc', 'World Bank', '3000.00']]);

  step('the SBMC ceiling is its policy share plus its own source; other components are unaffected');
  const url = `/api/activities?plan=${created.id}&workstream=sbmc`;
  const ceiling = sbmcShare + kobo('3000');
  ok(await api('social', url, { ...line, unitCost: (ceiling + 1) / 100 }), 400);
  ok(await api('social', url, { ...line, unitCost: (ceiling - 100) / 100 }));
  const dashboard = ok(await api('chair', '/api/plans'));
  assert.equal(dashboard.plans[0].fundingSources.length, 1); assert.equal(dashboard.plans[0].fundingTotal, '23000.00');

  step('GET setup: permissions, proposed totals and reserved quarters');
  ok(await api('anonymous', `/api/plans/setup?plan=${created.id}`), 401);
  const info = ok(await api('chair', `/api/plans/setup?plan=${created.id}`));
  assert.equal(info.canEdit, true); assert.equal(info.allowed, true); assert.equal(kobo(info.proposed.sbmc), ceiling - 100); assert.deepEqual(info.reserved, []);
  const staffInfo = ok(await api('social', `/api/plans/setup?plan=${created.id}`));
  assert.equal(staffInfo.allowed, false); assert.equal(staffInfo.canEdit, false); assert.match(staffInfo.lockedReason, /authorised/);

  step('PATCH guards: origin, permission, version and ceilings');
  const edit = { plan: created.id, version: info.plan.version, planningYear: 2033, implementationYear: 2033, quarters: [1, 2], stateLodgment: '10000', fundingSources: setup.fundingSources };
  ok(await api('chair', '/api/plans/setup', edit, 'PATCH', null), 403);
  ok(await api('director', '/api/plans/setup', edit, 'PATCH'), 403);
  ok(await api('chair', '/api/plans/setup', { ...edit, version: edit.version + 5 }, 'PATCH'), 409);
  ok(await api('chair', '/api/plans/setup', { ...edit, implementationYear: 2032 }, 'PATCH'), 400);
  const short = await api('chair', '/api/plans/setup', { ...edit, fundingSources: [] }, 'PATCH'); ok(short, 409); assert.match(short.data.error, /SBMC would have .* already proposed/);
  // Moving the source to another component leaves SBMC short too.
  ok(await api('chair', '/api/plans/setup', { ...edit, fundingSources: [{ component: 'sports', funder: 'World Bank', amount: '3000' }] }, 'PATCH'), 409);
  assert.equal(ok(await api('chair', '/api/plans/setup', edit, 'PATCH')).changed, false);

  step('PATCH saves period, contribution and sources, renames the plan and records history');
  const other = ok(await create('chair', { ...setup, quarters: [4], fundingSources: [] }), 201).plan;
  ok(await api('chair', '/api/plans/setup', { ...edit, quarters: [1, 2, 4] }, 'PATCH'), 409);
  const saved = ok(await api('chair', '/api/plans/setup', { ...edit, planningYear: 2034, implementationYear: 2035, quarters: [2, 3], stateLodgment: '12000', fundingSources: [...setup.fundingSources, { component: 'tlm', funder: 'UNICEF', amount: '500.50' }] }, 'PATCH'));
  assert.equal(saved.changed, true); assert.equal(saved.plan.startYear, 2034); assert.equal(saved.plan.implementationYear, 2035); assert.deepEqual(saved.plan.fundingQuarters, [2, 3]);
  assert.match(saved.plan.beapName, /-2034-Q2.*Q3-BEAP$/); assert.equal(saved.plan.fundingTotal, '27500.50'); assert.equal(saved.plan.fundingSources.length, 2);
  assert.deepEqual((await db.query('SELECT planning_year,quarter FROM plan_quarters WHERE plan_id=$1 ORDER BY quarter', [created.id])).rows, [{ planning_year: 2034, quarter: 2 }, { planning_year: 2034, quarter: 3 }]);
  const review = ok(await api('chair', `/api/plans/review?plan=${created.id}`));
  const event = review.events.find(e => e.action === 'edit'); assert.ok(event); assert.match(event.comment, /funding year 2033 → 2034/); assert.match(event.comment, /UNICEF/);
  assert.equal(review.snapshot.setup.fundingSources.length, 2);
  // The freed 2033 quarters are available again.
  ok(await create('chair', { ...setup, fundingSources: [] }), 201);

  step('locked while the plan is with UBEC');
  await db.query("UPDATE action_plans SET status='ubec_review' WHERE id=$1", [created.id]);
  const locked = ok(await api('chair', `/api/plans/setup?plan=${created.id}`)); assert.equal(locked.canEdit, false); assert.match(locked.lockedReason, /with UBEC/);
  const blocked = await api('chair', '/api/plans/setup', { ...edit, version: locked.plan.version, planningYear: 2034, implementationYear: 2035, quarters: [2, 3], stateLodgment: '1' }, 'PATCH'); ok(blocked, 409); assert.match(blocked.data.error, /with UBEC/);
  assert.ok(other.id);
  console.log('PASS: component funding sources, ceilings, plan detail edits, history and locks.');
} finally {
  const plans = (await db.query('SELECT id FROM action_plans WHERE state_code=$1', [state])).rows.map(r => r.id);
  for (const table of ['plan_notifications', 'plan_review_events', 'plan_submissions', 'plan_pillar_reviews', 'activity_plan_lines']) await db.query(`DELETE FROM ${table} WHERE plan_id=ANY($1::int[])`, [plans]);
  await db.query('DELETE FROM action_plans WHERE id=ANY($1::int[])', [plans]);
  await db.query('DELETE FROM sessions WHERE user_id=ANY($1::int[])', [ids]);
  await db.query('DELETE FROM users WHERE id=ANY($1::int[])', [ids]);
  await db.end(); console.log('Removed funding source test records.');
}
