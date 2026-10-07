// Split mode (state_workflow_settings.infrastructure_tlm_mode = 'split', the default; migration 051): Infrastructure and TLM
// split their shared pool like Teacher Development and ICT. action_plans.tlm_allocation is TLM's part; Infrastructure keeps
// pool − it. Covers: split required first, both sides' limits, partner floors, the ₦0 TLM rule, edit rights, plan-edit
// refusals, send readiness, switching modes both ways, and the migration backfill.
// Usage: node --env-file=.env scripts/test-infrastructure-tlm-split.mjs [baseUrl]   (local only; throwaway state, users and plans; cleans up)
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { Client } from 'pg';
import { hashSync } from 'bcryptjs';
import ExcelJS from 'exceljs';
import ts from 'typescript';

const requireModule = createRequire(import.meta.url);
function load(path) {
  const loaded = { exports: {} };
  const code = ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function('require', 'module', 'exports', code)(id => id.startsWith('.') ? load(resolve(dirname(path), id.endsWith('.ts') ? id : `${id}.ts`)) : requireModule(id), loaded, loaded.exports);
  return loaded.exports;
}
const { componentEnvelope } = load(resolve('lib/funding-policy.ts'));
const { sharedSplit, sideAmount, sharedBelowAllocationProblem, infrastructureSplitProblem } = load(resolve('lib/budget-pairs.ts'));
const { envelopeShortfalls, shortfallMessage } = load(resolve('lib/plan-setup.ts'));
const { splitReadinessProblem } = load(resolve('lib/component-readiness.ts'));

const base = process.argv[2] ?? process.env.TEST_BASE_URL ?? 'http://localhost:5173';
assert.ok(['localhost', '127.0.0.1'].includes(new URL(base).hostname), 'Run this test against a local server only.');
assert.ok(['localhost', '127.0.0.1'].includes(new URL(process.env.DATABASE_URL).hostname), 'Use a local database only.');
const tag = randomUUID().slice(0, 8).toUpperCase(), state = `TS${tag}`, password = randomUUID();
const db = new Client({ connectionString: process.env.DATABASE_URL });
const cookies = {}, userIds = [], schoolIds = [], planIds = [];
const step = message => console.log('✓', message);
async function api(who, path, body, method = body ? 'POST' : 'GET') {
  const isForm = body instanceof FormData;
  const headers = { Cookie: cookies[who] ?? '', Origin: base, ...(body && !isForm ? { 'Content-Type': 'application/json' } : {}) };
  const r = await fetch(base + path, { method, headers, ...(body ? { body: isForm ? body : JSON.stringify(body) } : {}) });
  const cookie = r.headers.get('set-cookie')?.split(';')[0]; if (cookie) cookies[who] = cookie;
  const text = await r.text(); let data; try { data = JSON.parse(text); } catch { data = { error: text.slice(0, 200) }; }
  return { status: r.status, data };
}
const ok = (r, status = 200) => { assert.equal(r.status, status, JSON.stringify(r.data)); return r.data; };
const fails = (r, status, pattern) => { assert.equal(r.status, status, JSON.stringify(r.data)); if (pattern) assert.match(r.data.error ?? '', pattern); return r.data; };

// Unit: pool ₦15,000 (75% of 2 × ₦10,000) + ₦750 sources = ₦15,750.
const plan = { infrastructureTlmMode: 'split', stateLodgment: '10000.00', otherFunding: '0.00', fundingSources: [{ component: 'tlm', funder: 'UNICEF', amount: '500.00' }, { component: 'infrastructure', funder: 'AfDB', amount: '250.00' }] };
assert.equal(componentEnvelope(plan, 'tlm'), null); assert.equal(componentEnvelope(plan, 'infrastructure'), null);
const set = { ...plan, tlmAllocation: '5000.00' };
assert.equal(componentEnvelope(set, 'tlm'), '5000.00'); assert.equal(componentEnvelope(set, 'infrastructure'), '10750.00');
assert.equal(sideAmount(set, 'infrastructure'), '10750.00'); assert.equal(sideAmount(set, 'tlm'), '5000.00');
assert.equal(componentEnvelope({ ...set, infrastructureTlmMode: 'shared_pool' }, 'tlm'), '15750.00', 'shared_pool ignores the split');
const none = { own: '0', partner: '0' };
assert.match(sharedSplit(plan, 'tlm', '0', none).problem, /Enter a TLM allocation greater than zero/);
assert.match(sharedSplit(plan, 'tlm', '15750.01', none).problem, /up to the shared Infrastructure & TLM budget of ₦15,750\.00/);
assert.match(sharedSplit(plan, 'tlm', '100', { own: '200', partner: '0' }).problem, /TLM lines already propose ₦200\.00/);
assert.match(sharedSplit(plan, 'tlm', '15000', { own: '0', partner: '1000' }).problem, /Infrastructure packages already propose ₦1,000\.00, so TLM can use up to ₦14,750\.00/);
assert.equal(sharedSplit(plan, 'infrastructure', '15750', none).allocation, '0.00', 'TLM may be left ₦0 while it has no lines');
assert.match(sharedSplit(plan, 'infrastructure', '15750', { own: '0', partner: '0.01' }).problem, /TLM lines already propose ₦0\.01/);
assert.equal(sharedSplit(plan, 'infrastructure', '10750', none).allocation, '5000.00');
assert.match(infrastructureSplitProblem(plan, 1n), /Infrastructure will use before adding packages/);
assert.match(infrastructureSplitProblem(set, 1075001n), /exceeded the Infrastructure allocation \(₦10,750\.00\) by ₦0\.01/);
assert.match(sharedBelowAllocationProblem({ ...set, stateLodgment: '1000.00', fundingSources: [] }), /^Infrastructure & TLM would have ₦1,500\.00 available, but TLM has already been allocated ₦5,000\.00\. Ask TLM to reduce its allocation first/);
assert.equal(sharedBelowAllocationProblem({ ...set, infrastructureTlmMode: 'shared_pool', stateLodgment: '1000.00', fundingSources: [] }), null);
assert.deepEqual(envelopeShortfalls(set, { ...set, fundingSources: [] }, { infrastructure: '10000.00', tlm: '5000.00' }), [], 'each side still fits its part');
const tight = envelopeShortfalls(set, { ...set, stateLodgment: '9900.00', fundingSources: [] }, { infrastructure: '10000.00', tlm: '5000.00' });
assert.deepEqual(tight.map(s => [s.component, s.ceiling]), [['infrastructure', '9850.00']]);
assert.match(shortfallMessage(tight[0]), /^Infrastructure would have/);
const snapshot = items => ({ setup: set, tlm: items.map(kobo => ({ activity: 6, quantity: 1, unit_cost: (Number(kobo) / 100).toFixed(2) })), infrastructure: [] });
assert.equal(splitReadinessProblem('tlm', snapshot([500000n])), null);
assert.match(splitReadinessProblem('tlm', snapshot([500001n])), /exceeded/);
assert.match(splitReadinessProblem('tlm', { ...snapshot([1n]), setup: plan }), /Set how much of the shared Infrastructure & TLM budget TLM will use before sending/);
assert.equal(splitReadinessProblem('tlm', { ...snapshot([500001n]), setup: { ...set, infrastructureTlmMode: 'shared_pool' } }), null);
step('split envelopes, split bounds, ₦0 TLM rule, plan-edit and readiness rules (unit)');

await db.connect();
const previousMode = (await db.query("SELECT infrastructure_tlm_mode AS mode FROM state_workflow_settings WHERE state_code='GLOBAL'")).rows[0]?.mode;
assert.ok(previousMode, 'Run migration 051 first.');
await db.query("UPDATE state_workflow_settings SET infrastructure_tlm_mode='split' WHERE state_code='GLOBAL'");
try {
  for (const [key, role, department] of [['physical', 'Data Entry Staff', 'physical'], ['academic', 'Data Entry Staff', 'academic'], ['academicDirector', 'Director', 'academic'], ['chair', 'Executive Chairman', null]]) {
    const email = `${key}.${tag}@tlm-split.test`.toLowerCase();
    const id = (await db.query('INSERT INTO users(email,full_name,role,department,state_code,password_hash) VALUES($1,$2,$3,$4,$5,$6) RETURNING id', [email, `QA ${key}`, role, department, state, hashSync(password, 4)])).rows[0].id;
    userIds.push(id);
    if (department) await db.query('INSERT INTO user_departments(user_id,department) VALUES($1,$2)', [id, department]);
    ok(await api(key, '/api/auth/login', { email, password }));
  }
  // State contribution ₦10,000 → shared ₦20,000 → pool 75% = ₦15,000 under the default policy.
  const workbook = new ExcelJS.Workbook(); workbook.addWorksheet('RAT').addRow(['Split QA']);
  const form = new FormData(); form.set('setup', JSON.stringify({ planningYear: 2038, implementationYear: 2038, quarters: [1], stateLodgment: '10000', fundingSources: [] }));
  form.append('rat', new Blob([await workbook.xlsx.writeBuffer()]), 'rat.xlsx');
  const created = ok(await api('chair', '/api/plans', form), 201).plan; const planId = created.id; planIds.push(planId);
  const pool = 20000 * created.fundingPolicy.allocation.shares.infrastructure / 10000;
  assert.equal(pool, 15000);
  schoolIds.push((await db.query("INSERT INTO schools(state_code,name,lga,level,location,enrolment_male,enrolment_female) VALUES($1,'Split QA School','QA','Primary','Rural',100,100) RETURNING id", [state])).rows[0].id);

  const tlmUrl = `/api/activities?plan=${planId}&workstream=tlm`, infraUrl = `/api/infrastructure/packages?plan=${planId}`, splitUrl = `/api/activities/budget-split?plan=${planId}`;
  const tlmLine = unitCost => ({ workstream: 'tlm', entity: 'line', action: 'create', activity: 6, description: 'Story books', quantity: 1, unitCost, strategy: 'Request for quotation', targetGroup: 'Schools' });
  const furniture = cost => ({ action: 'save', input: { kind: 'furniture', schoolId: schoolIds[0], components: ['Primary'], furniture: [{ description: 'Desks', quantity: 1, cost }], documentIds: [] } });
  const split = (who, side, amount) => api(who, splitUrl, { amount, side }, 'PATCH');

  const opened = ok(await api('academic', tlmUrl));
  assert.equal(opened.plan.infrastructureTlmMode, 'split'); assert.equal(opened.plan.tlmAllocation, null);
  fails(await api('academic', tlmUrl, tlmLine(1)), 409, /Set how much of the shared Infrastructure & TLM budget TLM will use before adding TLM items/);
  fails(await api('physical', infraUrl, furniture(1)), 409, /Infrastructure will use before adding packages/);
  step('TLM lines and Infrastructure packages are refused until the split is set (409)');

  fails(await split('academic', 'infrastructure', '15000'), 403);
  fails(await split('physical', 'tlm', '100'), 403);
  fails(await split('academic', 'tlm', '0'), 409, /greater than zero/);
  fails(await split('academic', 'tlm', '15000.01'), 409, /up to the shared Infrastructure & TLM budget of ₦15,000\.00/);
  assert.equal(ok(await split('physical', 'infrastructure', '15000')).tlmAllocation, '0.00');
  ok(await api('physical', infraUrl, furniture(1000)));
  fails(await api('academic', tlmUrl, tlmLine(0.01)), 409, /exceeded the Teaching & Learning Materials allocation \(₦0\.00\)/);
  step('each side sets the split only for its own component; Infrastructure may take it all, leaving TLM ₦0');

  assert.equal(ok(await split('academic', 'tlm', '5000')).tlmAllocation, '5000.00');
  fails(await split('academic', 'tlm', '14000.01'), 409, /Infrastructure packages already propose ₦1,000\.00, so TLM can use up to ₦14,000\.00/);
  ok(await api('academic', tlmUrl, tlmLine(5000)));
  fails(await api('academic', tlmUrl, tlmLine(0.01)), 409, /exceeded the Teaching & Learning Materials allocation \(₦5,000\.00\) by ₦0\.01/);
  fails(await split('academic', 'tlm', '4999.99'), 409, /TLM lines already propose ₦5,000\.00/);
  fails(await split('physical', 'infrastructure', '15000'), 409, /TLM lines already propose ₦5,000\.00, so Infrastructure can use up to ₦10,000\.00/);
  fails(await split('physical', 'infrastructure', '999.99'), 409, /Infrastructure packages already propose ₦1,000\.00/);
  fails(await api('physical', infraUrl, furniture(9000.01)), 409, /exceeded the Infrastructure allocation \(₦10,000\.00\) by ₦0\.01/);
  ok(await api('physical', infraUrl, furniture(8000)));
  const infra = ok(await api('physical', infraUrl));
  assert.equal(Number(infra.partnerProposed), 5000); assert.equal(Number(infra.tlmProposed), 5000);
  assert.equal(Number(ok(await api('academic', tlmUrl)).partnerProposed), 9000);
  step('both sides stay within their parts and protect each other’s proposals (409); partnerProposed on both editors');

  // Lowering is always allowed, even when a side is over (here: TLM's allocation raised behind Infrastructure's back).
  await db.query('UPDATE action_plans SET tlm_allocation=6500 WHERE id=$1', [planId]);
  const big = infra.packages.find(p => Number(p.total_cost) === 8000);
  fails(await api('physical', infraUrl, { ...furniture(8000.01), id: big.id, version: big.version }), 409, /exceeded the Infrastructure allocation/);
  ok(await api('physical', infraUrl, { ...furniture(7500), id: big.id, version: big.version }));
  await db.query('UPDATE action_plans SET tlm_allocation=5000 WHERE id=$1', [planId]);
  step('lowering a package is allowed while over; raising is refused');

  const info = ok(await api('chair', `/api/plans/setup?plan=${planId}`));
  const edit = { plan: planId, version: info.plan.version, planningYear: 2038, implementationYear: 2038, quarters: [1], stateLodgment: '10000', fundingSources: [] };
  fails(await api('chair', '/api/plans/setup', { ...edit, stateLodgment: '8900' }, 'PATCH'), 409, /Infrastructure would have ₦8,350\.00 available, but ₦8,500\.00 is already proposed/);
  fails(await api('chair', '/api/plans/setup', { ...edit, stateLodgment: '3000' }, 'PATCH'), 409, /Infrastructure & TLM would have ₦4,500\.00 available, but TLM has already been allocated ₦5,000\.00/);
  ok(await api('chair', '/api/plans/setup', { ...edit, fundingSources: [{ component: 'tlm', funder: 'UNICEF', amount: '100' }] }, 'PATCH'));
  assert.equal(Number(ok(await api('physical', infraUrl)).plan.tlmAllocation), 5000);
  ok(await api('physical', infraUrl, furniture(100)), 200);
  step('plan edits may not shrink the pool below TLM’s allocation or Infrastructure below its packages; added funding goes to Infrastructure');

  // Readiness: TLM's distribution list plus its split. Split not set, or a side over its part, blocks the send (409).
  ok(await api('academic', tlmUrl, { workstream: 'tlm', entity: 'school', action: 'create', schoolId: schoolIds[0] }));
  const sendTlm = async () => api('academic', `/api/plans/review?plan=${planId}`, { action: 'submit', pillar: 'tlm', version: ok(await api('academic', `/api/plans/review?plan=${planId}`)).plan.version });
  await db.query('UPDATE action_plans SET tlm_allocation=NULL WHERE id=$1', [planId]);
  fails(await sendTlm(), 409, /Set how much of the shared Infrastructure & TLM budget TLM will use before sending/);
  await db.query('UPDATE action_plans SET tlm_allocation=4000 WHERE id=$1', [planId]);
  fails(await sendTlm(), 409, /exceeded the Teaching & Learning Materials allocation/);
  await db.query('UPDATE action_plans SET tlm_allocation=5000 WHERE id=$1', [planId]);
  const review = ok(await api('chair', `/api/plans/review?plan=${planId}`));
  assert.equal(review.snapshot.setup.tlmAllocation, '5000.00'); assert.equal(review.snapshot.setup.infrastructureTlmMode, 'split');
  ok(await sendTlm());
  step('sending TLM needs the split set and TLM within its part; snapshots carry the split and the mode');

  // Switching to shared_pool ignores the split (pool rules apply); switching back restores the split rules.
  await db.query("UPDATE state_workflow_settings SET infrastructure_tlm_mode='shared_pool' WHERE state_code='GLOBAL'");
  const pooled = ok(await api('physical', infraUrl));
  assert.equal(pooled.plan.infrastructureTlmMode, 'shared_pool');
  const used = pooled.packages.reduce((sum, p) => sum + Number(p.total_cost), 0) + 5000, left = 15100 - used;
  fails(await api('physical', infraUrl, furniture(left + 0.01)), 409, /Infrastructure and TLM share ₦15,100\.00/);
  ok(await api('physical', infraUrl, furniture(left)));
  fails(await split('physical', 'infrastructure', '100'), 409, /share one budget/);
  await db.query("UPDATE state_workflow_settings SET infrastructure_tlm_mode='split' WHERE state_code='GLOBAL'");
  fails(await api('physical', infraUrl, furniture(1)), 409, /exceeded the Infrastructure allocation/);
  step('shared_pool mode ignores the stored split; switching back applies it again without changing data');

  // Backfill (migration 051's UPDATE, limited to this test's plans): TLM lines total; ₦0 with only packages; NULL with neither.
  const migration = readFileSync(resolve('db/postgres/051-infrastructure-tlm-split.sql'), 'utf8');
  const backfill = migration.match(/UPDATE action_plans p SET tlm_allocation[\s\S]*?;/)[0].replace('WHERE t.id = p.id', 'WHERE t.id = p.id AND p.id = ANY($1::int[])');
  const insertPlan = async () => (await db.query("INSERT INTO action_plans(state_code,start_year,end_year,state_lodgment,other_funding) VALUES($1,2039,2039,10000,0) RETURNING id", [state])).rows[0].id;
  const packagesOnly = await insertPlan(), empty = await insertPlan(); planIds.push(packagesOnly, empty);
  await db.query("INSERT INTO infrastructure_packages(plan_id,school_id,kind,input,result,total_cost) VALUES($1,$2,'furniture','{}'::jsonb,'{}'::jsonb,1000)", [packagesOnly, schoolIds[0]]);
  await db.query('UPDATE action_plans SET tlm_allocation=NULL WHERE id=ANY($1::int[])', [planIds]);
  await db.query(backfill, [planIds]);
  const after = Object.fromEntries((await db.query('SELECT id, tlm_allocation::text AS a FROM action_plans WHERE id=ANY($1::int[])', [planIds])).rows.map(r => [r.id, r.a]));
  assert.deepEqual([after[planId], after[packagesOnly], after[empty]], ['5000.00', '0.00', null]);
  step('backfill: TLM lines total, ₦0 with only packages, NULL with neither');
  console.log('PASS: Infrastructure and TLM split their pool.');
} finally {
  await db.query("UPDATE state_workflow_settings SET infrastructure_tlm_mode=$1 WHERE state_code='GLOBAL'", [previousMode]);
  if (planIds.length) {
    for (const t of ['plan_notifications', 'plan_review_events', 'plan_submissions', 'plan_pillar_reviews', 'activity_plan_lines', 'tlm_distribution', 'infrastructure_packages', 'infrastructure_documents', 'plan_funding_sources', 'plan_quarters', 'plan_documents']) await db.query(`DELETE FROM ${t} WHERE plan_id=ANY($1::int[])`, [planIds]);
    await db.query('DELETE FROM action_plans WHERE id=ANY($1::int[])', [planIds]);
  }
  if (schoolIds.length) await db.query('DELETE FROM schools WHERE id=ANY($1::int[]) AND state_code=$2', [schoolIds, state]);
  if (userIds.length) {
    await db.query('DELETE FROM sessions WHERE user_id=ANY($1::int[])', [userIds]);
    await db.query('DELETE FROM user_departments WHERE user_id=ANY($1::int[])', [userIds]);
    await db.query('DELETE FROM users WHERE id=ANY($1::int[])', [userIds]);
  }
  await db.end();
}
