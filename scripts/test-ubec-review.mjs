// UBEC review rounds (app/api/ubec/review, /api/ubec/dashboard; docs/ubec-flow.md): the SUBEB Executive Chairman sends
// reviewed components to UBEC; the UBEC BEAP Chair releases them; Directors assign Assessment Officers; officers decide
// items; oversight observes; the BEAP Chair returns the whole plan; the state revises and resubmits through its own chain;
// round 2 carries only the resubmitted component and is approved. Covers frozen rounds, stage and department isolation,
// stale/concurrent protection and dashboard figures. The full permission matrix lives in scripts/test-ubec-flow.mjs.
// Runs with the BEAP Chair handoff set to individual_components and UBEC submission set to reviewed_components, and
// restores both afterwards.
// Usage: node --env-file=.env scripts/test-ubec-review.mjs [baseUrl]   (local only; throwaway states, users and plan; cleans up)
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { hashSync } from 'bcryptjs';
import ExcelJS from 'exceljs';

const base = process.argv[2] ?? process.env.TEST_BASE_URL ?? process.env.UBEC_TEST_URL ?? 'http://localhost:5173';
assert.match(base, /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/, 'Run this test against a local server only.');
assert.ok(['localhost', '127.0.0.1'].includes(new URL(process.env.DATABASE_URL).hostname), 'Use a local database only.');
const marker = `UR${randomUUID().slice(0, 8).toUpperCase()}`, password = randomUUID();
const states = [marker, `${marker}F`];
const db = new Client({ connectionString: process.env.DATABASE_URL });
const cookies = {}, ids = {};
let settings, planId;
async function api(who, path, body, method = body ? 'POST' : 'GET') {
  const isForm = body instanceof FormData;
  const response = await fetch(base + path, { method, headers: { Origin: base, ...(body && !isForm ? { 'Content-Type': 'application/json' } : {}), ...(cookies[who] ? { Cookie: cookies[who] } : {}) }, ...(body ? { body: isForm ? body : JSON.stringify(body) } : {}) });
  const text = await response.text(); let data; try { data = JSON.parse(text); } catch { data = { error: text.slice(0, 200) }; }
  if (path === '/api/auth/login' && response.ok) cookies[who] = response.headers.get('set-cookie').split(';')[0];
  return { status: response.status, data };
}
const ok = (r, status = 200) => { assert.equal(r.status, status, JSON.stringify(r.data)); return r.data; };
async function user(who, role, departments, state = marker, chair = false) {
  const email = `${who}.${marker}@ubec-review.test`.toLowerCase();
  ids[who] = (await db.query('INSERT INTO users(email,full_name,role,department,state_code,password_hash,is_beap_chair) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id', [email, `QA ${who}`, role, departments[0] ?? null, state, hashSync(password, 4), chair])).rows[0].id;
  for (const department of departments) await db.query('INSERT INTO user_departments(user_id,department) VALUES($1,$2)', [ids[who], department]);
  const login = ok(await api(who, '/api/auth/login', { email, password }));
  assert.equal(login.destination, role.startsWith('UBEC') ? '/ubec' : '/dashboard');
}

await db.connect();
try {
  const original = (await db.query('SELECT id,state_code FROM action_plans p ORDER BY id')).rows;
  settings = (await db.query("SELECT beap_chair_submission_mode, ubec_submission_mode FROM state_workflow_settings WHERE state_code='GLOBAL'")).rows[0];
  assert.ok(settings, 'The GLOBAL workflow settings row is missing.');
  await db.query("UPDATE state_workflow_settings SET beap_chair_submission_mode='individual_components', ubec_submission_mode='reviewed_components' WHERE state_code='GLOBAL'");
  await user('desA', 'Data Entry Staff', ['academic']); await user('desP', 'Data Entry Staff', ['physical']);
  await user('dirA', 'Director', ['academic']); await user('dirP', 'Director', ['physical']);
  await user('chair', 'Director', ['physical'], marker, true); await user('ec', 'Executive Chairman', []);
  await user('foreign', 'Executive Chairman', [], states[1]);
  await user('es', 'UBEC Executive Secretary', [], 'UBEC'); await user('ubecChair', 'UBEC BEAP Chair', [], 'UBEC');
  await user('dpp', 'UBEC Director', ['physical'], 'UBEC'); await user('dacs', 'UBEC Director', ['academic'], 'UBEC'); await user('dsm', 'UBEC Director', ['social'], 'UBEC');
  await user('physical', 'UBEC Assessment Officer', ['physical'], 'UBEC'); await user('academic', 'UBEC Assessment Officer', ['academic'], 'UBEC');
  for (const department of ['audit', 'procurement', 'finance']) await user(department, 'UBEC Oversight Director', [department], 'UBEC');

  const ratWorkbook = new ExcelJS.Workbook(); ratWorkbook.addWorksheet('RAT').addRow(['UBEC review QA']);
  const form = new FormData();
  form.set('setup', JSON.stringify({ planningYear: 2035, implementationYear: 2035, quarters: [1, 2, 3, 4], stateLodgment: '100000000', fundingSources: [] }));
  form.append('rat', new Blob([await ratWorkbook.xlsx.writeBuffer()]), 'rat.xlsx');
  planId = ok(await api('ec', '/api/plans', form), 201).plan.id;
  const q = `?plan=${planId}`, statePath = `/api/plans/review${q}`, path = `/api/ubec/review${q}`, sports = `/api/sports${q}`, components = `/api/ubec/components${q}`;
  const school = (await db.query("INSERT INTO schools(name,lga,level,location,state_code) VALUES($1,'QA','Primary','Urban',$1) RETURNING id", [marker])).rows[0].id;
  const budget = { entity: 'budget', action: 'create', section: 'equipment', activityType: 'Football', description: 'QA equipment', quantity: 5, unitCost: 100 };
  const lineId = ok(await api('desA', sports, budget), 201).id;
  ok(await api('desA', sports, { entity: 'allocation', action: 'create', lineId, schoolId: school, quantity: 5 }), 201);
  ok(await api('desP', `/api/activities${q}&workstream=monitoring`, { workstream: 'monitoring', entity: 'line', action: 'create', activity: 0, description: 'QA monitoring visit', quantity: 1, unitCost: 1000, strategy: 'Request for quotation', targetGroup: 'Schools' }));
  const stateStep = async (who, action, pillar, comment = '') => ok(await api(who, statePath, { action, pillar, version: ok(await api('ec', statePath)).plan.version, comment }));
  const throughState = async (pillar, des, dir, comment = '') => { await stateStep(des, 'submit', pillar, comment); await stateStep(dir, 'endorse', pillar); await stateStep('chair', 'forward', pillar); };
  const roundId = async () => ok(await api('ubecChair', path)).round.id;
  const act = async (who, action, extra = {}) => { const current = ok(await api('ec', path)); return api(who, path, { action, version: current.plan.version, ...(current.round ? { roundId: current.round.id } : {}), ...extra }); };
  // One component from release to the BEAP Chair: assign, decide every item, complete, send for oversight, three observations.
  async function assess(pillar, director, officer, decision) {
    const round = await roundId();
    ok(await api(director, components, { action: 'assign_officers', roundId: round, pillar, officerIds: [ids[officer]], comment: 'Please assess.' }));
    for (const line of ok(await api(officer, path)).round.snapshot[pillar]) ok(await api(officer, `/api/ubec/decisions${q}`, { roundId: round, pillar, rowRef: String(line.id), decision, note: decision === 'reject' ? 'Revise the quantity.' : '' }, 'PUT'));
    ok(await api(officer, components, { action: 'complete_assessment', roundId: round, pillar }));
    ok(await api(director, components, { action: 'send_oversight', roundId: round, pillar, comment: 'Assessed.' }));
    for (const who of ['audit', 'procurement', 'finance']) ok(await api(who, components, { action: 'observations_done', roundId: round, pillar }));
  }

  assert.equal((await api('anonymous', '/api/ubec/dashboard')).status, 401);
  assert.equal((await api('desA', '/api/ubec/dashboard')).status, 403);
  assert.equal((await api('foreign', path)).status, 404);
  assert.equal((await api('es', path)).status, 404, 'UBEC sees nothing before a submission');
  assert.equal((await act('ec', 'submit')).status, 409, 'Nothing has reached the Executive Chairman yet');
  await throughState('sports', 'desA', 'dirA');
  await throughState('monitoring', 'desP', 'dirP');
  assert.equal(ok(await api('ec', path)).canSubmit, true);
  for (const who of ['desA', 'dirA', 'chair']) assert.equal((await act(who, 'submit')).status, 403, `${who} cannot send to UBEC`);
  ok(await act('ec', 'submit'));
  assert.equal((await act('ec', 'submit')).status, 409);
  const first = ok(await api('es', path));
  assert.equal(first.round.number, 1); assert.equal(first.round.status, 'received'); assert.equal(first.round.snapshot.sports.length, 1); assert.equal(first.round.snapshot.monitoring.length, 1);
  const frozen = JSON.stringify(first.round.snapshot);
  assert.equal((await api('desA', sports, budget)).status, 409, 'The plan is locked during UBEC review');
  for (const who of ['dpp', 'physical', 'audit']) assert.equal((await api(who, path)).status, 404, `${who} sees nothing before release`);
  assert.equal((await act('es', 'release', { comment: 'x' })).status, 403); assert.equal((await act('dpp', 'release', { comment: 'x' })).status, 403);
  assert.equal((await act('ubecChair', 'release')).status, 400, 'release needs a comment');
  ok(await act('ubecChair', 'release', { comment: 'Released for assessment.' }));
  assert.equal(ok(await api('ec', path)).plan.status, 'ubec_review');

  // Department isolation once released.
  const dpp = ok(await api('dpp', path)), dacs = ok(await api('dacs', path));
  assert.equal(dpp.round.snapshot.sports.length, 0); assert.equal(dpp.round.snapshot.monitoring.length, 1);
  assert.equal(dacs.round.snapshot.monitoring.length, 0); assert.equal(dacs.round.snapshot.sports.length, 1);
  assert.equal((await api('dsm', path)).status, 404, 'a Director with no released component sees nothing');
  assert.equal((await api('physical', path)).status, 404, 'officers see nothing until assigned');
  assert.equal(ok(await api('ec', path)).assignments.length, 0, 'nothing is released to the state yet');
  assert.equal((await api('dacs', components, { action: 'assign_officers', roundId: dacs.round.id, pillar: 'monitoring', officerIds: [ids.physical], comment: 'x' })).status, 403);
  await assess('monitoring', 'dpp', 'physical', 'accept');
  assert.equal(ok(await api('physical', path)).round.snapshot.sports.length, 0, 'officers see only assigned components');
  assert.equal((await act('ubecChair', 'approve', { comment: 'Still waiting' })).status, 409);
  await assess('sports', 'dacs', 'academic', 'reject');
  assert.equal((await act('ubecChair', 'approve', { comment: 'Rejected item' })).status, 409);
  assert.equal((await act('dacs', 'return', { comment: 'No authority' })).status, 403);
  assert.equal((await act('ubecChair', 'return', { comment: '' })).status, 400);
  ok(await act('ubecChair', 'return', { comment: 'Revise sports equipment and resubmit.' }));
  const returned = ok(await api('desA', statePath));
  assert.equal(returned.plan.status, 'changes_requested');
  for (const pillar of ['sports', 'monitoring']) assert.equal(ok(await api('ec', statePath)).pillarReviews.find(r => r.pillar === pillar).status, 'changes_requested', `${pillar} is back with Data Entry`);

  ok(await api('desA', sports, { ...budget, action: 'update', id: lineId, quantity: 6, description: 'Revised equipment specification' }));
  assert.equal((await act('ec', 'submit', { comment: 'Cannot skip state review' })).status, 409);
  await throughState('sports', 'desA', 'dirA', 'Quantity revised.');
  assert.equal((await act('ec', 'submit')).status, 400, 'A resubmission explains how the feedback was addressed');
  ok(await act('ec', 'submit', { comment: 'Addressed equipment feedback.' }));
  assert.equal(JSON.stringify(ok(await api('es', `${path}&round=${first.round.id}`)).round.snapshot), frozen, 'Earlier rounds stay unchanged');
  const second = ok(await api('es', path));
  assert.equal(second.round.number, 2); assert.equal(second.round.snapshot.sports[0].quantity, 6);
  assert.equal(second.round.snapshot.monitoring.length, 0, 'Components that did not reach the Executive Chairman are left out');
  ok(await act('ubecChair', 'release', { comment: 'Resubmission released.' }));
  assert.equal(ok(await api('dpp', path)).round.number, 1, 'a Director without a component in round 2 still sees round 1');
  assert.equal(ok(await api('physical', path)).round.number, 1, 'officers only see rounds assigned to them');
  await assess('sports', 'dacs', 'academic', 'accept');
  const ready = ok(await api('ubecChair', path));
  const decision = { action: 'approve', version: ready.plan.version, roundId: ready.round.id, comment: 'All components assessed.' };
  const results = await Promise.all([api('ubecChair', path, decision), api('ubecChair', path, decision)]);
  assert.deepEqual(results.map(r => r.status).sort(), [200, 409]);
  assert.equal(ok(await api('ec', path)).plan.status, 'ubec_approved');
  const national = ok(await api('es', '/api/ubec/dashboard')).items.find(p => p.planId === planId);
  assert.equal(national.budget, 600); assert.equal(national.schools.length, 1); assert.equal(national.status, 'approved'); assert.equal(national.round, 2);
  assert.equal(ok(await api('academic', '/api/ubec/dashboard')).items.find(p => p.planId === planId).budget, 600);
  assert.equal(ok(await api('dsm', '/api/ubec/dashboard')).items.some(p => p.planId === planId), false);
  assert.equal(ok(await api('dpp', '/api/ubec/dashboard')).items.some(p => p.planId === planId), false, 'round 2 has nothing for Physical Planning');
  // The local database is shared, so plans may change elsewhere meanwhile; check none moved into this test's states.
  for (const row of (await db.query('SELECT id, state_code FROM action_plans WHERE id = ANY($1::int[])', [original.map(p => p.id)])).rows) assert.equal(row.state_code, original.find(p => p.id === row.id).state_code, 'Existing plans must be preserved');
  console.log('PASS: Executive Chairman-only submission; BEAP Chair release; department and officer isolation; return, state re-review and resubmission; frozen rounds; final approval; concurrent protection; dashboard figures; existing plans preserved.');
} finally {
  if (settings) await db.query("UPDATE state_workflow_settings SET beap_chair_submission_mode=$1, ubec_submission_mode=$2 WHERE state_code='GLOBAL'", [settings.beap_chair_submission_mode, settings.ubec_submission_mode]);
  const plans = 'SELECT id FROM action_plans WHERE state_code = ANY($1::text[])';
  await db.query(`DELETE FROM plan_comments WHERE plan_id IN (${plans})`, [states]);
  await db.query(`DELETE FROM plan_notifications WHERE plan_id IN (${plans})`, [states]);
  await db.query(`DELETE FROM ubec_events WHERE plan_id IN (${plans})`, [states]);
  await db.query(`DELETE FROM ubec_assignments WHERE round_id IN (SELECT id FROM ubec_rounds WHERE plan_id IN (${plans}))`, [states]);
  for (const table of ['ubec_rounds', 'plan_review_events', 'plan_submissions', 'plan_pillar_reviews', 'activity_plan_lines']) await db.query(`DELETE FROM ${table} WHERE plan_id IN (${plans})`, [states]);
  await db.query('DELETE FROM sports_allocations WHERE line_id IN (SELECT id FROM sports_budget_lines WHERE state_code=ANY($1::text[]))', [states]);
  for (const table of ['sports_budget_lines', 'action_plans', 'schools']) await db.query(`DELETE FROM ${table} WHERE state_code=ANY($1::text[])`, [states]);
  const userIds = Object.values(ids);
  if (userIds.length) {
    await db.query('DELETE FROM plan_notifications WHERE user_id=ANY($1::int[])', [userIds]);
    await db.query('DELETE FROM sessions WHERE user_id=ANY($1::int[])', [userIds]);
    await db.query('DELETE FROM users WHERE id=ANY($1::int[])', [userIds]);
  }
  await db.end();
}
