// Shared-pool mode (state_workflow_settings.infrastructure_tlm_mode = 'shared_pool', migration 051): Infrastructure and TLM
// share one pool with no split: the infrastructure policy share plus their funding sources. Infrastructure proposed + TLM
// proposed may not exceed it, from either side (409); plan edits may not shrink it below both; a stored split is ignored.
// The test switches the platform to shared_pool for its run and restores the previous mode. Split mode: test-infrastructure-tlm-split.mjs.
// Usage: node --env-file=.env scripts/test-infrastructure-pool.mjs [baseUrl]   (local only; throwaway state, users and plan; cleans up)
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
const { componentEnvelope, infrastructurePoolEnvelope, allocationSchema, defaultAllocation } = load(resolve('lib/funding-policy.ts'));
const { infrastructurePoolProblem } = load(resolve('lib/infrastructure-pool.ts'));
const { envelopeShortfalls, shortfallMessage } = load(resolve('lib/plan-setup.ts'));

const base = process.argv[2] ?? process.env.TEST_BASE_URL ?? 'http://localhost:5173';
assert.ok(['localhost', '127.0.0.1'].includes(new URL(base).hostname), 'Run this test against a local server only.');
assert.ok(['localhost', '127.0.0.1'].includes(new URL(process.env.DATABASE_URL).hostname), 'Use a local database only.');
const tag = randomUUID().slice(0, 8).toUpperCase(), state = `TP${tag}`, password = randomUUID();
const db = new Client({ connectionString: process.env.DATABASE_URL });
const cookies = {}, userIds = [], schoolIds = [];
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

// Unit: both ceilings are the whole pool; TLM and Infrastructure sources add to it; a legacy TLM split and a stored split are ignored.
const plan = { infrastructureTlmMode: 'shared_pool', tlmAllocation: '100.00', stateLodgment: '10000.00', otherFunding: '0.00', fundingSources: [{ component: 'tlm', funder: 'UNICEF', amount: '500.00' }, { component: 'infrastructure', funder: 'AfDB', amount: '250.00' }] };
assert.equal(infrastructurePoolEnvelope(plan), '15750.00');
assert.equal(componentEnvelope(plan, 'tlm'), '15750.00'); assert.equal(componentEnvelope(plan, 'infrastructure'), '15750.00');
const legacy = { ...plan, fundingPolicy: { id: 1, allocation: { ...defaultAllocation, tlmWithinInfrastructure: 2000 } } };
assert.equal(componentEnvelope(legacy, 'tlm'), '15750.00');
assert.ok(allocationSchema.safeParse(legacy.fundingPolicy.allocation).success, 'stored policies with the retired TLM split still parse');
assert.equal(infrastructurePoolProblem(plan, { infrastructure: 0n, tlm: 1575000n }), null);
assert.match(infrastructurePoolProblem(plan, { infrastructure: 1n, tlm: 1575000n }), /exceed it by ₦0\.01/);
assert.equal(infrastructurePoolProblem({ stateLodgment: null }, { infrastructure: 10n ** 12n, tlm: 0n }), null, 'no ceiling until funding is set');
const shortfalls = envelopeShortfalls(plan, { ...plan, fundingSources: [] }, { infrastructure: '10000.00', tlm: '5500.00' });
assert.deepEqual(shortfalls.map(s => [s.component, s.ceiling, s.proposed]), [['infrastructure', '15000.00', '15500.00']]);
assert.match(shortfallMessage(shortfalls[0]), /Infrastructure and TLM would share/);
step('pool envelope, sources, legacy policy and edit shortfalls (unit)');

await db.connect();
let planId;
const previousMode = (await db.query("SELECT infrastructure_tlm_mode AS mode FROM state_workflow_settings WHERE state_code='GLOBAL'")).rows[0]?.mode;
assert.ok(previousMode, 'Run migration 051 first.');
await db.query("UPDATE state_workflow_settings SET infrastructure_tlm_mode='shared_pool' WHERE state_code='GLOBAL'");
try {
  for (const [key, role, department] of [['physical', 'Data Entry Staff', 'physical'], ['academic', 'Data Entry Staff', 'academic'], ['chair', 'Executive Chairman', null]]) {
    const email = `${key}.${tag}@tlm-pool.test`.toLowerCase();
    const id = (await db.query('INSERT INTO users(email,full_name,role,department,state_code,password_hash) VALUES($1,$2,$3,$4,$5,$6) RETURNING id', [email, `QA ${key}`, role, department, state, hashSync(password, 4)])).rows[0].id;
    userIds.push(id);
    if (department) await db.query('INSERT INTO user_departments(user_id,department) VALUES($1,$2)', [id, department]);
    ok(await api(key, '/api/auth/login', { email, password }));
  }
  // State contribution ₦10,000 → shared ₦20,000 → pool 75% = ₦15,000 under the default policy.
  const workbook = new ExcelJS.Workbook(); workbook.addWorksheet('RAT').addRow(['Pool QA']);
  const form = new FormData(); form.set('setup', JSON.stringify({ planningYear: 2037, implementationYear: 2037, quarters: [1], stateLodgment: '10000', fundingSources: [] }));
  form.append('rat', new Blob([await workbook.xlsx.writeBuffer()]), 'rat.xlsx');
  const created = ok(await api('chair', '/api/plans', form), 201).plan; planId = created.id;
  const policy = created.fundingPolicy.allocation;
  const pool = 20000 * policy.shares.infrastructure / 10000;
  schoolIds.push((await db.query("INSERT INTO schools(state_code,name,lga,level,location,enrolment_male,enrolment_female) VALUES($1,'Pool QA School','QA','Primary','Rural',100,100) RETURNING id", [state])).rows[0].id);

  const tlmUrl = `/api/activities?plan=${planId}&workstream=tlm`, infraUrl = `/api/infrastructure/packages?plan=${planId}`;
  const tlmLine = unitCost => ({ workstream: 'tlm', entity: 'line', action: 'create', activity: 6, description: 'Story books', quantity: 1, unitCost, strategy: 'Request for quotation', targetGroup: 'Schools' });
  const furniture = cost => ({ action: 'save', input: { kind: 'furniture', schoolId: schoolIds[0], components: ['Primary'], furniture: [{ description: 'Desks', quantity: 1, cost }], documentIds: [] } });

  assert.equal(ok(await api('academic', tlmUrl)).plan.infrastructureTlmMode, 'shared_pool');
  fails(await api('academic', `/api/activities/budget-split?plan=${planId}`, { amount: '100', side: 'tlm' }, 'PATCH'), 409, /share one budget/);
  const whole = ok(await api('academic', tlmUrl, tlmLine(pool)));
  fails(await api('academic', tlmUrl, tlmLine(0.01)), 409, /Infrastructure and TLM share/);
  fails(await api('physical', infraUrl, furniture(1)), 409, /Together they would exceed it by ₦1\.00/);
  assert.equal(Number(ok(await api('physical', infraUrl)).tlmProposed), pool);
  step('TLM can use the whole pool while Infrastructure has nothing; then Infrastructure is refused (409)');

  ok(await api('academic', tlmUrl, { ...tlmLine(pool - 1000), action: 'update', id: whole.id }));
  ok(await api('physical', infraUrl, furniture(1000)));
  fails(await api('physical', infraUrl, furniture(0.01)), 409, /exceed it by ₦0\.01/);
  fails(await api('academic', tlmUrl, { ...tlmLine(pool - 999.99), action: 'update', id: whole.id }), 409, /exceed it by ₦0\.01/);
  const [saved] = ok(await api('physical', infraUrl)).packages;
  assert.equal(Number(ok(await api('academic', tlmUrl)).partnerProposed), 1000);
  fails(await api('physical', infraUrl, { ...furniture(1000.01), id: saved.id, version: saved.version }), 409);
  ok(await api('physical', infraUrl, { ...furniture(900), id: saved.id, version: saved.version }));
  step('either side is refused (409) when the combined total would exceed the pool; lowering is always allowed');

  const info = ok(await api('chair', `/api/plans/setup?plan=${planId}`));
  const edit = { plan: planId, version: info.plan.version, planningYear: 2037, implementationYear: 2037, quarters: [1], stateLodgment: '10000', fundingSources: [] };
  fails(await api('chair', '/api/plans/setup', { ...edit, stateLodgment: '9900' }, 'PATCH'), 409, /Infrastructure and TLM would share/);
  ok(await api('chair', '/api/plans/setup', { ...edit, fundingSources: [{ component: 'tlm', funder: 'UNICEF', amount: '50' }] }, 'PATCH'));
  ok(await api('physical', infraUrl, furniture(150)));
  fails(await api('academic', tlmUrl, tlmLine(0.01)), 409);
  step('a TLM funding source raises the pool for both sides; edits may not shrink it below their proposals');

  const review = ok(await api('chair', `/api/plans/review?plan=${planId}`));
  assert.equal(review.snapshot.setup.fundingPolicy.id, created.fundingPolicy.id, 'snapshots carry the plan policy the cards read');
  console.log('PASS: Infrastructure and TLM share one pool.');
} finally {
  await db.query("UPDATE state_workflow_settings SET infrastructure_tlm_mode=$1 WHERE state_code='GLOBAL'", [previousMode]);
  if (planId) {
    for (const t of ['plan_notifications', 'plan_review_events', 'plan_submissions', 'plan_pillar_reviews', 'activity_plan_lines', 'infrastructure_packages', 'infrastructure_documents', 'plan_funding_sources']) await db.query(`DELETE FROM ${t} WHERE plan_id=$1`, [planId]);
    await db.query('DELETE FROM action_plans WHERE id=$1', [planId]);
  }
  if (schoolIds.length) await db.query('DELETE FROM schools WHERE id=ANY($1::int[]) AND state_code=$2', [schoolIds, state]);
  if (userIds.length) {
    await db.query('DELETE FROM sessions WHERE user_id=ANY($1::int[])', [userIds]);
    await db.query('DELETE FROM user_departments WHERE user_id=ANY($1::int[])', [userIds]);
    await db.query('DELETE FROM users WHERE id=ANY($1::int[])', [userIds]);
  }
  await db.end();
}
