// Test for line timelines (implementation quarters, migration 050) on activity lines, sports budget lines and
// infrastructure packages. Creates a throwaway state with its own users and plan, and removes them all afterwards.
// Usage: node --env-file=.env scripts/test-line-quarters.mjs [baseUrl]
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { hashSync } from 'bcryptjs';
import { formatQuarters, lineQuartersProblem, lineQuartersSchema, planQuarters, quarterRemovalProblem, resolveLineQuarters } from '../lib/line-quarters.ts';

const base = process.argv[2] ?? process.env.UBEC_TEST_URL ?? 'http://localhost:5173';
assert.ok(['localhost', '127.0.0.1'].includes(new URL(base).hostname), 'Run this test against a local server only.');
assert.ok(['localhost', '127.0.0.1'].includes(new URL(process.env.DATABASE_URL).hostname), 'Use a local database only.');
const tag = randomUUID().slice(0, 8).toUpperCase(), state = `LQ${tag}`, password = randomUUID();
const db = new Client({ connectionString: process.env.DATABASE_URL });
const jars = {}, userIds = [], schoolIds = [];
let planId, passed = 0;
const step = message => { passed++; console.log('✓', message); };

async function api(who, path, body, { method = body ? 'POST' : 'GET' } = {}) {
  const jar = jars[who] ??= {};
  const headers = { Cookie: Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; '), Origin: base, ...(body ? { 'Content-Type': 'application/json' } : {}) };
  const response = await fetch(base + path, { method, headers, ...(body ? { body: JSON.stringify(body) } : {}) });
  for (const cookie of response.headers.getSetCookie()) { const pair = cookie.split(';')[0], i = pair.indexOf('='); jars[who][pair.slice(0, i)] = pair.slice(i + 1); }
  const text = await response.text(); let data; try { data = JSON.parse(text); } catch { data = { error: text.slice(0, 200) }; }
  return { status: response.status, data };
}
const ok = (result, status = 200) => { assert.equal(result.status, status, JSON.stringify(result.data)); return result.data; };
const fails = (result, status, pattern) => { assert.equal(result.status, status, JSON.stringify(result.data)); if (pattern) assert.match(result.data.error ?? '', pattern); return result.data; };
async function user(key, role, departments) {
  const email = `${key}.${tag}@quarters.test`.toLowerCase();
  const id = (await db.query('INSERT INTO users(email,full_name,role,department,state_code,password_hash) VALUES($1,$2,$3,$4,$5,$6) RETURNING id', [email, `LQ ${key}`, role, departments[0] ?? null, state, hashSync(password, 4)])).rows[0].id;
  userIds.push(id);
  for (const department of departments) await db.query('INSERT INTO user_departments(user_id,department) VALUES($1,$2)', [id, department]);
  ok(await api(key, '/api/auth/login', { email, password }));
}

// Unit: formatter, schema, plan subset and plan-edit rules.
assert.equal(formatQuarters([1, 2, 3]), 'Q1–Q3');
assert.equal(formatQuarters([1, 3]), 'Q1, Q3');
assert.equal(formatQuarters([4, 1, 2]), 'Q1–Q2, Q4');
assert.deepEqual(planQuarters(null), [1, 2, 3, 4]);
assert.deepEqual(planQuarters({ fundingQuarters: [3, 1] }), [1, 3]);
assert.ok(!lineQuartersSchema.safeParse([]).success);
assert.ok(!lineQuartersSchema.safeParse([0]).success);
assert.ok(!lineQuartersSchema.safeParse([5]).success);
assert.ok(!lineQuartersSchema.safeParse([2, 2]).success);
assert.deepEqual(lineQuartersSchema.parse([3, 1]), [1, 3]);
assert.equal(lineQuartersProblem([1, 2], { fundingQuarters: [1, 2, 3] }), null);
assert.match(lineQuartersProblem([4], { fundingQuarters: [1, 2, 3] }), /Q4 is not in this plan \(Q1–Q3\)/);
assert.deepEqual(resolveLineQuarters(undefined, { fundingQuarters: [2, 3] }), { quarters: [2, 3], problem: null });
assert.equal(quarterRemovalProblem([1, 2, 3], [1, 2], [{ quarters: [1, 2], lines: 4 }]), null);
assert.match(quarterRemovalProblem([1, 2, 3], [1, 2], [{ quarters: [2, 3], lines: 2 }, { quarters: [3], lines: 1 }, { quarters: [1], lines: 5 }]), /^3 lines use Q3 in their timelines/);
step('formatQuarters, schema, plan subset and quarter-removal rules (unit)');

await db.connect();
try {
  await user('prs', 'Data Entry Staff', ['planning']);
  await user('physical', 'Data Entry Staff', ['physical']);
  await user('academic', 'Data Entry Staff', ['academic']);
  await user('ec', 'Executive Chairman', []);
  // A Q1–Q3 plan: ₦400,000,000 state contribution, so every component has room.
  planId = (await db.query("INSERT INTO action_plans(state_code,start_year,end_year,implementation_year,funding_quarters,state_lodgment,other_funding,funding_policy_id) VALUES($1,2038,2038,2038,'{1,2,3}',400000000,0,(SELECT id FROM funding_policies ORDER BY id DESC LIMIT 1)) RETURNING id", [state])).rows[0].id;
  for (const q of [1, 2, 3]) await db.query('INSERT INTO plan_quarters(plan_id,state_code,planning_year,quarter) VALUES($1,$2,2038,$3)', [planId, state, q]);
  schoolIds.push((await db.query("INSERT INTO schools(state_code,name,lga,level,location,enrolment_male,enrolment_female) VALUES($1,'Quarters QA School','QA','Primary','Rural',100,100) RETURNING id", [state])).rows[0].id);

  // Activity lines (shared editor): default, required, subset of the plan's quarters, sorted, no repeats.
  const url = `/api/activities?plan=${planId}&workstream=planning`;
  const line = (activity, extra = {}) => ({ workstream: 'planning', entity: 'line', action: 'create', activity, description: `LQ activity ${activity}`, quantity: 1, unitCost: 1000, strategy: 'Request for quotation', targetGroup: 'State level', schoolIds: [], ...extra });
  const legacy = ok(await api('prs', url, line(0)));
  fails(await api('prs', url, line(1, { quarters: [] })), 400, /at least one quarter/);
  fails(await api('prs', url, line(1, { quarters: [4] })), 400, /Q4 is not in this plan \(Q1–Q3\)/);
  fails(await api('prs', url, line(1, { quarters: [2, 2] })), 400, /each quarter once/);
  fails(await api('prs', url, line(1, { quarters: [0] })), 400);
  const narrowed = ok(await api('prs', url, line(1, { quarters: [3, 1] })));
  ok(await api('prs', url, { ...line(2, { quarters: [2] }), action: 'update', id: legacy.id }));
  fails(await api('prs', url, { ...line(2, { quarters: [1, 4] }), action: 'update', id: legacy.id }), 400, /Q4 is not in this plan/);
  let lines = ok(await api('prs', url)).lines;
  assert.deepEqual(lines.find(l => l.id === legacy.id).quarters, [2]);
  assert.deepEqual(lines.find(l => l.id === narrowed.id).quarters, [1, 3]);
  const defaulted = ok(await api('prs', url, line(3)));
  lines = ok(await api('prs', url)).lines;
  assert.deepEqual(lines.find(l => l.id === defaulted.id).quarters, [1, 2, 3], 'a line saved without quarters gets the plan quarters');
  step('activity lines: timeline required, within the plan quarters, sorted; none sent = the plan quarters');

  // Sports budget lines.
  const sportsUrl = `/api/sports?plan=${planId}`;
  const sports = extra => ({ entity: 'budget', action: 'create', section: 'publicity', activityType: 'Electronic Media', description: 'Radio jingles', quantity: 1, unitCost: 5000, ...extra });
  fails(await api('academic', sportsUrl, sports({ quarters: [] })), 400, /at least one quarter/);
  fails(await api('academic', sportsUrl, sports({ quarters: [3, 4] })), 400, /Q4 is not in this plan/);
  const sportsDefault = ok(await api('academic', sportsUrl, sports()), 201);
  const sportsLine = ok(await api('academic', sportsUrl, sports({ quarters: [2, 3] })), 201);
  ok(await api('academic', sportsUrl, { ...sports({ quarters: [1] }), action: 'update', id: sportsDefault.id }));
  const sportsLines = ok(await api('academic', sportsUrl)).lines;
  assert.deepEqual(sportsLines.find(l => l.id === sportsDefault.id).quarters, [1]);
  assert.deepEqual(sportsLines.find(l => l.id === sportsLine.id).quarters, [2, 3]);
  step('sports budget lines: timeline required, within the plan quarters, update in place');

  // Infrastructure packages: the quarters column and the stored input agree.
  const infraUrl = `/api/infrastructure/packages?plan=${planId}`;
  // Split mode (migration 051): Infrastructure takes the whole Infrastructure & TLM pool here (TLM has no lines).
  await db.query('UPDATE action_plans SET tlm_allocation=0 WHERE id=$1', [planId]);
  const furniture = extra => ({ action: 'save', input: { kind: 'furniture', schoolId: schoolIds[0], components: ['Primary'], furniture: [{ description: 'Desks', quantity: 2, cost: 100 }], documentIds: [], ...extra } });
  fails(await api('physical', infraUrl, furniture({ quarters: [] })), 400, /at least one quarter/);
  fails(await api('physical', infraUrl, furniture({ quarters: [4] })), 400, /Q4 is not in this plan/);
  ok(await api('physical', infraUrl, furniture()));
  let [pkg] = ok(await api('physical', infraUrl)).packages;
  assert.deepEqual(pkg.quarters, [1, 2, 3]); assert.deepEqual(pkg.input.quarters, [1, 2, 3]);
  ok(await api('physical', infraUrl, { ...furniture({ quarters: [3] }), id: pkg.id, version: pkg.version }));
  [pkg] = ok(await api('physical', infraUrl)).packages;
  assert.deepEqual(pkg.quarters, [3]); assert.deepEqual(pkg.input.quarters, [3]);
  step('infrastructure packages: timeline required, within the plan quarters, stored on the package');

  // The database refuses malformed timelines whatever the client does.
  for (const bad of ['{}', '{5}', '{1,1}', '{0}', '{1,NULL}']) await assert.rejects(db.query('UPDATE activity_plan_lines SET quarters=$1::smallint[] WHERE id=$2', [bad, narrowed.id]), /quarters_check/, bad);
  await assert.rejects(db.query("UPDATE sports_budget_lines SET quarters='{}' WHERE id=$1", [sportsLine.id]), /quarters_check/);
  await assert.rejects(db.query("UPDATE infrastructure_packages SET quarters='{6}' WHERE id=$1", [pkg.id]), /quarters_check/);
  step('database CHECK refuses empty, out-of-range, repeated and NULL quarters');

  // Plan edits may not remove a quarter that lines still use.
  const setup = ok(await api('ec', `/api/plans/setup?plan=${planId}`));
  assert.ok(Array.isArray(setup.quarterUsage) && setup.quarterUsage.length > 0);
  const edit = { plan: planId, version: setup.plan.version, planningYear: 2038, implementationYear: 2038, quarters: [1, 2], stateLodgment: '400000000', fundingSources: [] };
  // Q3 is used by: planning lines [1,3] and [1,2,3], sports [2,3], the package [3] = 4 lines.
  fails(await api('ec', '/api/plans/setup', edit, { method: 'PATCH' }), 409, /^4 lines use Q3 in their timelines/);
  fails(await api('ec', '/api/plans/setup', { ...edit, quarters: [2, 3] }, { method: 'PATCH' }), 409, /lines use Q1/);
  const widened = ok(await api('ec', '/api/plans/setup', { ...edit, quarters: [1, 2, 3, 4] }, { method: 'PATCH' }));
  assert.deepEqual(widened.plan.fundingQuarters, [1, 2, 3, 4]);
  const q4 = ok(await api('prs', url, line(4, { quarters: [4] })));
  step('plan edits refuse removing a quarter lines use (409, with the line count); adding a quarter opens it to lines');

  // Snapshots (plan page, UBEC submission and workbook all read lib/plan-snapshot.ts) carry the timeline.
  const { snapshot } = ok(await api('ec', `/api/plans/review?plan=${planId}`));
  assert.deepEqual(snapshot.planning.find(l => l.id === narrowed.id).quarters, [1, 3]);
  assert.deepEqual(snapshot.planning.find(l => l.id === q4.id).quarters, [4]);
  assert.deepEqual(snapshot.sports.find(l => l.id === sportsLine.id).quarters, [2, 3]);
  assert.deepEqual(snapshot.infrastructure.find(l => l.id === -pkg.id).quarters, [3]);
  step('plan snapshot carries the timeline of activity, sports and infrastructure lines');
  console.log(`PASS: ${passed} line timeline checks.`);
} finally {
  if (planId) for (const t of ['plan_review_events', 'plan_notifications', 'plan_submissions', 'plan_pillar_reviews', 'activity_plan_lines', 'infrastructure_packages', 'infrastructure_documents', 'plan_funding_sources', 'plan_quarters']) await db.query(`DELETE FROM ${t} WHERE plan_id=$1`, [planId]);
  if (planId) await db.query('DELETE FROM sports_allocations WHERE line_id IN (SELECT id FROM sports_budget_lines WHERE plan_id=$1)', [planId]);
  if (planId) await db.query('DELETE FROM sports_budget_lines WHERE plan_id=$1', [planId]);
  if (planId) await db.query('DELETE FROM action_plans WHERE id=$1', [planId]);
  if (schoolIds.length) await db.query('DELETE FROM schools WHERE id=ANY($1::int[])', [schoolIds]);
  if (userIds.length) await db.query('DELETE FROM users WHERE id=ANY($1::int[])', [userIds]);
  await db.end();
}
