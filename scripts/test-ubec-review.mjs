// UBEC review (app/api/ubec/review, /api/ubec/dashboard): the SUBEB Executive Chairman sends reviewed components to
// UBEC; the UBEC ES assigns them to departments; reviewers see and answer only their assignments; the ES returns the
// plan, the state revises and resubmits through its own chain, and the ES approves. Covers frozen rounds, role and
// department isolation, stale/concurrent protection and dashboard figures. Runs with the BEAP Chair handoff set to
// individual_components and UBEC submission set to reviewed_components, and restores both afterwards.
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
const states = [marker, `${marker}F`, `${marker}U`];
const db = new Client({ connectionString: process.env.DATABASE_URL });
const cookies = {}, userIds = [];
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
  const id = (await db.query('INSERT INTO users(email,full_name,role,department,state_code,password_hash,is_beap_chair) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id', [email, `QA ${who}`, role, departments[0] ?? null, state, hashSync(password, 4), chair])).rows[0].id;
  userIds.push(id);
  if (!role.startsWith('UBEC')) for (const department of departments) await db.query('INSERT INTO user_departments(user_id,department) VALUES($1,$2)', [id, department]);
  const login = ok(await api(who, '/api/auth/login', { email, password }));
  assert.equal(login.destination, role.startsWith('UBEC') ? '/ubec' : '/dashboard');
}

await db.connect();
try {
  const original = (await db.query('SELECT id,state_code FROM action_plans p ORDER BY id')).rows;
  settings = (await db.query("SELECT beap_chair_submission_mode, ubec_submission_mode FROM state_workflow_settings WHERE state_code='GLOBAL'")).rows[0];
  assert.ok(settings, 'The GLOBAL workflow settings row is missing.');
  await db.query("UPDATE state_workflow_settings SET beap_chair_submission_mode='individual_components', ubec_submission_mode='reviewed_components' WHERE state_code='GLOBAL'");
  await user('desA', 'Data Entry Staff', ['academic']);
  await user('desP', 'Data Entry Staff', ['physical']);
  await user('dirA', 'Director', ['academic']);
  await user('dirP', 'Director', ['physical']);
  await user('chair', 'Director', ['physical'], marker, true);
  await user('ec', 'Executive Chairman', []);
  await user('foreign', 'Executive Chairman', [], states[1]);
  await user('es', 'UBEC Executive Secretary', [], states[2]);
  await user('physical', 'UBEC Department Reviewer', ['physical'], states[2]);
  await user('academic', 'UBEC Department Reviewer', ['academic'], states[2]);
  await user('audit', 'UBEC Department Reviewer', ['audit'], states[2]);

  const ratWorkbook = new ExcelJS.Workbook(); ratWorkbook.addWorksheet('RAT').addRow(['UBEC review QA']);
  const form = new FormData();
  form.set('setup', JSON.stringify({ planningYear: 2035, implementationYear: 2035, quarters: [1, 2, 3, 4], stateLodgment: '100000000', fundingSources: [] }));
  form.append('rat', new Blob([await ratWorkbook.xlsx.writeBuffer()]), 'rat.xlsx');
  planId = ok(await api('ec', '/api/plans', form), 201).plan.id;
  const statePath = `/api/plans/review?plan=${planId}`, path = `/api/ubec/review?plan=${planId}`, sports = `/api/sports?plan=${planId}`;
  const monitoring = `/api/activities?plan=${planId}&workstream=monitoring`;
  const school = (await db.query("INSERT INTO schools(name,lga,level,location,state_code) VALUES($1,'QA','Primary','Urban',$1) RETURNING id", [marker])).rows[0].id;
  const budget = { entity: 'budget', action: 'create', section: 'equipment', activityType: 'Football', description: 'QA equipment', quantity: 5, unitCost: 100 };
  const lineId = ok(await api('desA', sports, budget), 201).id;
  ok(await api('desA', sports, { entity: 'allocation', action: 'create', lineId, schoolId: school, quantity: 5 }), 201);
  ok(await api('desP', monitoring, { workstream: 'monitoring', entity: 'line', action: 'create', activity: 0, description: 'QA monitoring visit', quantity: 1, unitCost: 1000, strategy: 'Request for quotation', targetGroup: 'Schools' }));
  const stateStep = async (who, action, pillar, comment = '') => ok(await api(who, statePath, { action, pillar, version: ok(await api('ec', statePath)).plan.version, comment }));
  const throughState = async (pillar, des, dir, comment = '') => { await stateStep(des, 'submit', pillar, comment); await stateStep(dir, 'endorse', pillar); await stateStep('chair', 'forward', pillar); };
  const act = async (who, action, extra = {}) => {
    const current = ok(await api('ec', path));
    return api(who, path, { action, version: current.plan.version, ...(current.round ? { roundId: current.round.id } : {}), ...extra });
  };

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
  assert.equal(first.round.number, 1); assert.equal(first.round.snapshot.sports.length, 1); assert.equal(first.round.snapshot.monitoring.length, 1);
  const frozen = JSON.stringify(first.round.snapshot);
  assert.equal((await api('desA', sports, budget)).status, 409, 'The plan is locked during UBEC review');
  assert.equal((await api('audit', path)).status, 404, 'Reviewers see only rounds assigned to their department');
  assert.equal((await act('es', 'approve', { comment: 'Too early' })).status, 409);
  assert.equal((await act('es', 'assign', { assignments: [{ pillar: 'sports', department: 'academic' }] })).status, 400, 'Every populated component needs a department');
  assert.equal((await act('physical', 'assign', { assignments: [{ pillar: 'sports', department: 'academic' }, { pillar: 'monitoring', department: 'physical' }] })).status, 403);
  ok(await act('es', 'assign', { assignments: [{ pillar: 'monitoring', department: 'physical' }, { pillar: 'sports', department: 'academic' }] }));
  const physical = ok(await api('physical', path)), academic = ok(await api('academic', path));
  assert.equal(physical.round.snapshot.sports.length, 0); assert.equal(physical.round.snapshot.monitoring.length, 1);
  assert.equal(academic.round.snapshot.monitoring.length, 0); assert.equal(academic.round.snapshot.sports.length, 1);
  assert.equal(physical.assignments.length, 1);
  assert.equal(ok(await api('ec', path)).assignments.length, 0, 'Unreleased feedback stays internal');
  assert.equal((await act('physical', 'feedback', { assignmentId: academic.assignments[0].id, recommendation: 'endorse', comment: 'Wrong assignment' })).status, 403);
  ok(await act('physical', 'feedback', { assignmentId: physical.assignments[0].id, recommendation: 'endorse', comment: 'Monitoring checked' }));
  assert.equal((await act('physical', 'feedback', { assignmentId: physical.assignments[0].id, recommendation: 'endorse', comment: 'Again' })).status, 409);
  assert.equal((await act('es', 'approve', { comment: 'Still waiting' })).status, 409);
  ok(await act('academic', 'feedback', { assignmentId: academic.assignments[0].id, recommendation: 'changes', comment: 'Revise equipment quantity' }));
  assert.equal((await act('academic', 'return', { comment: 'No authority' })).status, 403);
  assert.equal((await act('es', 'return', { comment: '' })).status, 400);
  ok(await act('es', 'return', { comment: 'Revise sports equipment and resubmit.' }));
  const returned = ok(await api('desA', statePath));
  assert.equal(returned.plan.status, 'changes_requested');
  for (const pillar of ['sports', 'monitoring']) assert.equal(ok(await api('ec', statePath)).pillarReviews.find(r => r.pillar === pillar).status, 'changes_requested', `${pillar} is back with Data Entry`);
  assert.equal(ok(await api('ec', path)).assignments.length, 2, 'Feedback is released with the decision');
  ok(await api('desA', sports, { ...budget, action: 'update', id: lineId, quantity: 6, description: 'Revised equipment specification' }));
  assert.equal((await act('ec', 'submit', { comment: 'Cannot skip state review' })).status, 409);
  await throughState('sports', 'desA', 'dirA', 'Quantity revised.');
  assert.equal((await act('ec', 'submit')).status, 400, 'A resubmission explains how the feedback was addressed');
  ok(await act('ec', 'submit', { comment: 'Addressed equipment feedback.' }));
  assert.equal(JSON.stringify(ok(await api('es', `${path}&round=${first.round.id}`)).round.snapshot), frozen, 'Earlier rounds stay unchanged');
  const second = ok(await api('es', path));
  assert.equal(second.round.number, 2); assert.equal(second.round.snapshot.sports[0].quantity, 6);
  assert.equal(second.round.snapshot.monitoring.length, 0, 'Components that did not reach the Executive Chairman are left out');
  ok(await act('es', 'assign', { assignments: [{ pillar: 'sports', department: 'academic' }] }));
  assert.equal(ok(await api('physical', path)).round.number, 1, 'Reviewers only see rounds assigned to them');
  ok(await act('academic', 'feedback', { assignmentId: ok(await api('academic', path)).assignments[0].id, recommendation: 'endorse', comment: 'Revision checked and endorsed' }));
  const ready = ok(await api('es', path));
  const decision = { action: 'approve', version: ready.plan.version, roundId: ready.round.id, comment: 'All departmental reviews complete.' };
  const results = await Promise.all([api('es', path, decision), api('es', path, decision)]);
  assert.deepEqual(results.map(r => r.status).sort(), [200, 409]);
  assert.equal(ok(await api('ec', path)).plan.status, 'ubec_approved');
  const national = ok(await api('es', '/api/ubec/dashboard')).items.find(p => p.planId === planId);
  assert.equal(national.budget, 600); assert.equal(national.schools.length, 1); assert.equal(national.status, 'approved');
  assert.equal(ok(await api('academic', '/api/ubec/dashboard')).items.find(p => p.planId === planId).budget, 600);
  assert.equal(ok(await api('audit', '/api/ubec/dashboard')).items.some(p => p.planId === planId), false);
  // The local database is shared, so plans may change elsewhere meanwhile; check none moved into this test's states.
  for (const row of (await db.query('SELECT id, state_code FROM action_plans WHERE id = ANY($1::int[])', [original.map(p => p.id)])).rows) assert.equal(row.state_code, original.find(p => p.id === row.id).state_code, 'Existing plans must be preserved');
  console.log('PASS: Executive Chairman-only submission; UBEC assignment; department isolation; feedback; return, state re-review and resubmission; frozen rounds; final approval; concurrent protection; dashboard figures; existing plans preserved.');
} finally {
  if (settings) await db.query("UPDATE state_workflow_settings SET beap_chair_submission_mode=$1, ubec_submission_mode=$2 WHERE state_code='GLOBAL'", [settings.beap_chair_submission_mode, settings.ubec_submission_mode]);
  const plans = 'SELECT id FROM action_plans WHERE state_code = ANY($1::text[])';
  await db.query(`DELETE FROM plan_comments WHERE plan_id IN (${plans})`, [states]);
  await db.query(`DELETE FROM ubec_events WHERE plan_id IN (${plans})`, [states]);
  await db.query(`DELETE FROM ubec_assignments WHERE round_id IN (SELECT id FROM ubec_rounds WHERE plan_id IN (${plans}))`, [states]);
  for (const table of ['ubec_rounds', 'plan_notifications', 'plan_review_events', 'plan_submissions', 'plan_pillar_reviews', 'activity_plan_lines']) await db.query(`DELETE FROM ${table} WHERE plan_id IN (${plans})`, [states]);
  await db.query('DELETE FROM sports_allocations WHERE line_id IN (SELECT id FROM sports_budget_lines WHERE state_code=ANY($1::text[]))', [states]);
  for (const table of ['sports_budget_lines', 'action_plans', 'schools']) await db.query(`DELETE FROM ${table} WHERE state_code=ANY($1::text[])`, [states]);
  if (userIds.length) {
    await db.query('DELETE FROM sessions WHERE user_id=ANY($1::int[])', [userIds]);
    await db.query('DELETE FROM users WHERE id=ANY($1::int[])', [userIds]);
  }
  await db.end();
}
