// API test for the Planning, Research & Statistics component (migration 041).
// Creates a throwaway state with its own users and plan, and removes them all afterwards.
// Usage: node --env-file=.env scripts/test-planning.mjs [baseUrl]
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { hashSync } from 'bcryptjs';

const base = process.argv[2] ?? process.env.TEST_BASE_URL ?? process.env.UBEC_TEST_URL ?? 'http://localhost:5173';
assert.ok(['localhost', '127.0.0.1'].includes(new URL(base).hostname), 'Run this test against a local server only.');
assert.ok(['localhost', '127.0.0.1'].includes(new URL(process.env.DATABASE_URL).hostname), 'Use a local database only.');
const tag = randomUUID().slice(0, 8).toUpperCase(), state = `PL${tag}`, password = randomUUID();
const db = new Client({ connectionString: process.env.DATABASE_URL });
const jars = {}, userIds = [];
let planId, settings, passed = 0;
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
async function user(key, role, departments, chair = false, stateCode = state) {
  const email = `${key}.${tag}@planning.test`.toLowerCase();
  const id = (await db.query('INSERT INTO users(email,full_name,role,department,state_code,password_hash,is_beap_chair) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id', [email, `PL ${key}`, role, departments[0] ?? null, stateCode, hashSync(password, 4), chair])).rows[0].id;
  userIds.push(id);
  for (const department of departments) await db.query('INSERT INTO user_departments(user_id,department) VALUES($1,$2)', [id, department]);
  ok(await api(key, '/api/auth/login', { email, password }));
}
const url = () => `/api/activities?plan=${planId}&workstream=planning`;
const line = (activity, unitCost, extra = {}) => ({ workstream: 'planning', entity: 'line', action: 'create', activity, description: `PL activity ${activity}`, quantity: 1, unitCost, strategy: 'Request for quotation', targetGroup: 'State level', schoolIds: [], ...extra });
const review = async (who, body) => api(who, `/api/plans/review?plan=${planId}`, { ...body, version: ok(await api(who, `/api/plans/review?plan=${planId}`)).plan.version });

await db.connect();
try {
  settings = (await db.query("SELECT beap_chair_submission_mode, ubec_submission_mode FROM state_workflow_settings WHERE state_code='GLOBAL'")).rows[0];
  await user('prs', 'Data Entry Staff', ['planning']);
  await user('qa', 'Data Entry Staff', ['me']);
  await user('prsDirector', 'Director', ['planning']);
  await user('meDirector', 'Director', ['me']);
  await user('chair', 'Director', ['physical'], true);
  await user('ec', 'Executive Chairman', []);
  await user('es', 'UBEC Executive Secretary', [], false, 'UBEC');
  await user('ubecChair', 'UBEC BEAP Chair', [], false, 'UBEC');
  await user('dprs', 'UBEC Director', ['planning'], false, 'UBEC');
  await user('revPlanning', 'UBEC Assessment Officer', ['planning'], false, 'UBEC');
  await user('revQuality', 'UBEC Assessment Officer', ['quality'], false, 'UBEC');
  // State contribution ₦400,000,000 → shared ₦800,000,000 → Planning, Research & Statistics gets ₦16,000,000 (2%).
  planId = (await db.query("INSERT INTO action_plans(state_code,start_year,end_year,implementation_year,funding_quarters,state_lodgment,other_funding,funding_policy_id) VALUES($1,2032,2032,2032,'{1}',400000000,0,(SELECT id FROM funding_policies ORDER BY id DESC LIMIT 1)) RETURNING id", [state])).rows[0].id;
  await db.query('INSERT INTO plan_quarters(plan_id,state_code,planning_year,quarter) VALUES($1,$2,2032,1)', [planId, state]);

  // Department permissions: only Planning, Research & Statistics staff (and the whole-plan roles) see it; only they edit it.
  fails(await api('qa', url()), 403);
  fails(await api('qa', url(), line(1, 100)), 403);
  fails(await api('meDirector', url()), 403);
  fails(await api('ec', url(), line(1, 100)), 403);
  const empty = ok(await api('prs', url()));
  assert.deepEqual(empty.lines, []); assert.equal(empty.canEdit, true);
  // Stage-gated visibility: the Executive Chairman reads it only once it has been sent to them (below).
  fails(await api('ec', url()), 403, /not been sent to you/);
  step('Planning editor: department access for Data Entry, other departments refused, Executive Chairman refused until it reaches them');

  // Line form: description, quantity, implementation strategy, target group, unit cost; six activities.
  fails(await api('prs', url(), line(7, 100)), 400, /valid allowable activity/);
  fails(await api('prs', url(), line(1, 100, { description: '' })), 400, /description/);
  fails(await api('prs', url(), line(1, 100, { strategy: '' })), 400, /implementation strategy/);
  fails(await api('prs', url(), line(1, 100, { targetGroup: '' })), 400, /target group/);
  fails(await api('prs', url(), line(1, 100, { equipmentType: 'Vehicles' })), 400, /only applies/);
  const plan = ok(await api('prs', url(), line(1, 2500000, { quantity: 2 })));
  assert.ok(Number.isInteger(plan.id));
  ok(await api('prs', url(), { ...line(1, 3000000, { quantity: 2, description: 'SMTBESP 2032-2035' }), action: 'update', id: plan.id }));
  const extra = ok(await api('prs', url(), line(4, 50000)));
  ok(await api('prs', url(), { workstream: 'planning', entity: 'line', action: 'delete', id: extra.id }));
  // ₦16,000,000 ceiling: ₦6,000,000 used, so ₦10,000,000.01 more is refused.
  fails(await api('prs', url(), line(4, 10000000.01)), 400, /exceeded the Planning, EMIS & Data Platform allocation \(₦16,000,000\.00\) by ₦0\.01/);
  let lines = ok(await api('prs', url())).lines;
  assert.equal(lines.length, 1); assert.equal(lines[0].description, 'SMTBESP 2032-2035'); assert.equal(lines[0].unitCost, 3000000);
  step('Planning lines: create, update, delete, six activities, required fields and the ₦16M ceiling');

  // Compulsory activities (0, 2, 3, 5) block sending, with the missing list.
  const missing = fails(await review('prs', { action: 'submit', pillar: 'planning' }), 409, /compulsory activity/);
  assert.match(missing.error, /Conduct annual school census; Review and track the implementation of SMTBESP; Capacity building of EMIS, ICT and PRS Officers at SUBEB & LGEA; Provide technical assistance for planning activities/);
  assert.doesNotMatch(missing.error, /Develop State Medium-Term/);
  for (const activity of [0, 2, 3]) ok(await api('prs', url(), line(activity, 1000000)));
  fails(await review('prs', { action: 'submit', pillar: 'planning' }), 409, /Provide technical assistance for planning activities/);
  ok(await api('prs', url(), line(5, 500000)));
  step('Compulsory Planning activities block Send to Director until each has a line');

  // Visibility, snapshot and dashboard totals.
  const qaView = ok(await api('qa', `/api/plans/review?plan=${planId}`));
  assert.ok(!qaView.visiblePillars.includes('planning')); assert.equal(qaView.snapshot.planning, undefined);
  // Stage-gated visibility: the BEAP Chair and Executive Chairman see the draft's status only.
  const draftChairView = ok(await api('chair', `/api/plans/review?plan=${planId}`));
  assert.ok(!draftChairView.visiblePillars.includes('planning')); assert.equal(draftChairView.snapshot.planning, undefined);
  assert.equal(ok(await api('prs', `/api/plans/review?plan=${planId}`)).snapshot.planning.length, 5);
  const overview = ok(await api('prs', `/api/beap?plan=${planId}`));
  assert.equal(overview.planning.lineCount, 5); assert.ok(overview.editablePillars.includes('planning'));
  assert.equal(ok(await api('ec', '/api/plans')).plans.find(p => p.id === planId).planningBudget, 0);
  const listed = ok(await api('prs', '/api/plans')).plans.find(p => p.id === planId);
  assert.equal(listed.planningBudget, 6000000 + 3 * 1000000 + 500000);
  step('Snapshots, department visibility, overview and /api/plans planningBudget');

  // Review chain: Data Entry → Planning Director → BEAP Chair → Executive Chairman → UBEC.
  await db.query("UPDATE state_workflow_settings SET beap_chair_submission_mode='individual_components', ubec_submission_mode='reviewed_components' WHERE state_code='GLOBAL'");
  fails(await review('qa', { action: 'submit', pillar: 'planning' }), 403);
  ok(await review('prs', { action: 'submit', pillar: 'planning' }));
  fails(await api('prs', url(), line(4, 100)), 409);
  fails(await review('meDirector', { action: 'endorse', pillar: 'planning' }), 403);
  // The Director comments on a cell of the Planning sheet while holding the component.
  const lineId = String(lines[0].id);
  ok(await api('prsDirector', `/api/plans/comments?plan=${planId}`, { sheet: 'planning', rowRef: lineId, columnId: 'unitCost', body: 'Attach the SMTBESP costing.' }), 201);
  fails(await api('prsDirector', `/api/plans/comments?plan=${planId}`, { sheet: 'planning', rowRef: lineId, columnId: 'equipment', body: 'No such column.' }), 400);
  // A Director edit that removes a compulsory line blocks the next send step too.
  const census = ok(await api('prsDirector', url())).lines.find(l => l.activity === 0);
  ok(await api('prsDirector', url(), { workstream: 'planning', entity: 'line', action: 'delete', id: census.id }));
  fails(await review('prsDirector', { action: 'endorse', pillar: 'planning' }), 409, /Conduct annual school census/);
  ok(await api('prsDirector', url(), line(0, 1000000)));
  ok(await review('prsDirector', { action: 'endorse', pillar: 'planning' }));
  const chairView = ok(await api('chair', `/api/plans/review?plan=${planId}`));
  assert.ok(chairView.visiblePillars.includes('planning')); assert.equal(chairView.snapshot.planning.length, 5);
  fails(await api('ec', url()), 403, /not been sent to you/);
  ok(await review('chair', { action: 'forward', pillar: 'planning' }));
  ok(await api('ec', url()));
  assert.equal(ok(await api('ec', '/api/plans')).plans.find(p => p.id === planId).planningBudget, 6000000 + 3 * 1000000 + 500000);
  const ecView = ok(await api('ec', `/api/plans/review?plan=${planId}`));
  assert.equal(ecView.pillarReviews.find(r => r.pillar === 'planning').status, 'chairman_ready');
  const ubecPath = `/api/ubec/review?plan=${planId}`;
  ok(await api('ec', ubecPath, { action: 'submit', version: ok(await api('ec', ubecPath)).plan.version }));
  const esView = ok(await api('es', ubecPath));
  assert.equal(esView.round.snapshot.planning.length, 5);
  ok(await api('ubecChair', ubecPath, { action: 'release', version: esView.plan.version, roundId: esView.round.id, comment: 'Released for assessment.' }));
  ok(await api('dprs', `/api/ubec/components?plan=${planId}`, { action: 'assign_officers', roundId: esView.round.id, pillar: 'planning', officerIds: [userIds[userIds.length - 2]], comment: 'Assess the planning lines.' }));
  assert.equal(ok(await api('revPlanning', ubecPath)).round.snapshot.planning.length, 5);
  fails(await api('revQuality', ubecPath), 404, /No assigned submission/);
  fails(await api('prs', url(), line(4, 100)), 409);
  step('Planning flows Director → BEAP Chair → Executive Chairman → UBEC, released by the UBEC BEAP Chair and assigned by the Planning, Research & Statistics Director');
  console.log(`PASS: ${passed} planning checks.`);
} finally {
  if (settings) await db.query("UPDATE state_workflow_settings SET beap_chair_submission_mode=$1, ubec_submission_mode=$2 WHERE state_code='GLOBAL'", [settings.beap_chair_submission_mode, settings.ubec_submission_mode]);
  if (planId) { await db.query('DELETE FROM ubec_events WHERE plan_id=$1', [planId]); await db.query('DELETE FROM ubec_assignments WHERE round_id IN (SELECT id FROM ubec_rounds WHERE plan_id=$1)', [planId]); await db.query('DELETE FROM ubec_rounds WHERE plan_id=$1', [planId]); }
  if (planId) for (const t of ['plan_comments', 'plan_notifications', 'plan_review_events', 'plan_submissions', 'plan_pillar_reviews', 'activity_plan_lines', 'plan_quarters']) await db.query(`DELETE FROM ${t} WHERE plan_id=$1`, [planId]);
  if (planId) await db.query('DELETE FROM action_plans WHERE id=$1', [planId]);
  if (userIds.length) await db.query('DELETE FROM users WHERE id=ANY($1::int[])', [userIds]);
  await db.end();
}
