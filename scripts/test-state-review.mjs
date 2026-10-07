// SUBEB component review (app/api/plans/review): Data Entry Staff → department Director → BEAP Chair → Executive
// Chairman for one component (Sports), with returns, stale/concurrent protection, write locks, frozen submissions,
// notifications, state and role isolation, fresh role checks and a state with no Director. Runs with the BEAP Chair
// handoff set to individual_components and restores the global workflow settings afterwards.
// Usage: node --env-file=.env scripts/test-state-review.mjs [baseUrl]   (local only; throwaway states, users and plans; cleans up)
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { hashSync } from 'bcryptjs';
import ExcelJS from 'exceljs';

const base = process.argv[2] ?? process.env.TEST_BASE_URL ?? process.env.UBEC_TEST_URL ?? 'http://localhost:5173';
assert.match(base, /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/, 'Run this test against a local server only.');
assert.ok(['localhost', '127.0.0.1'].includes(new URL(process.env.DATABASE_URL).hostname), 'Use a local database only.');
const marker = `SR${randomUUID().slice(0, 8).toUpperCase()}`;
const states = [marker, `${marker}F`, `${marker}N`];
const password = randomUUID();
const db = new Client({ connectionString: process.env.DATABASE_URL });
const cookies = {}, emails = {}, userIds = [];
let settings;
async function api(who, path, body, method = body ? 'POST' : 'GET') {
  const isForm = body instanceof FormData;
  const response = await fetch(base + path, { method, headers: { Origin: base, ...(body && !isForm ? { 'Content-Type': 'application/json' } : {}), ...(cookies[who] ? { Cookie: cookies[who] } : {}) }, ...(body ? { body: isForm ? body : JSON.stringify(body) } : {}) });
  const text = await response.text(); let data; try { data = JSON.parse(text); } catch { data = { error: text.slice(0, 200) }; }
  if (path === '/api/auth/login' && response.ok) cookies[who] = response.headers.get('set-cookie').split(';')[0];
  return { status: response.status, data };
}
const ok = (result, status = 200) => { assert.equal(result.status, status, JSON.stringify(result.data)); return result.data; };
async function user(who, role, departments, state = marker, chair = false) {
  emails[who] = `${who}.${marker.toLowerCase()}@review.test`;
  const id = (await db.query('INSERT INTO users(email,full_name,role,department,state_code,password_hash,is_beap_chair) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id', [emails[who], `QA ${who}`, role, departments[0] ?? null, state, hashSync(password, 4), chair])).rows[0].id;
  userIds.push(id);
  for (const department of departments) await db.query('INSERT INTO user_departments(user_id,department) VALUES($1,$2)', [id, department]);
  ok(await api(who, '/api/auth/login', { email: emails[who], password }));
}
const ratWorkbook = new ExcelJS.Workbook(); ratWorkbook.addWorksheet('RAT').addRow(['State review QA']);
const rat = Buffer.from(await ratWorkbook.xlsx.writeBuffer());
async function createPlan(who, planningYear) {
  const form = new FormData();
  form.set('setup', JSON.stringify({ planningYear, implementationYear: planningYear, quarters: [1, 2, 3, 4], stateLodgment: '100000000', fundingSources: [] }));
  form.append('rat', new Blob([rat]), 'rat.xlsx');
  return ok(await api(who, '/api/plans', form), 201).plan;
}

await db.connect();
try {
  const original = (await db.query('SELECT id, state_code FROM action_plans p ORDER BY id')).rows;
  settings = (await db.query("SELECT beap_chair_submission_mode, ubec_submission_mode FROM state_workflow_settings WHERE state_code='GLOBAL'")).rows[0];
  assert.ok(settings, 'The GLOBAL workflow settings row is missing.');
  await db.query("UPDATE state_workflow_settings SET beap_chair_submission_mode='individual_components' WHERE state_code='GLOBAL'");
  await user('des', 'Data Entry Staff', ['academic']);
  await user('dir', 'Director', ['academic']);
  await user('chair', 'Director', ['physical'], marker, true);
  await user('ec', 'Executive Chairman', []);
  await user('foreign', 'Director', ['academic'], states[1]);
  await user('nodir', 'Data Entry Staff', ['academic'], states[2]);

  const plan = await createPlan('ec', 2033);
  const path = `/api/plans/review?plan=${plan.id}`, sports = `/api/sports?plan=${plan.id}`;
  const version = async () => ok(await api('ec', path)).plan.version;
  const review = async (who, action, extra = {}) => api(who, path, { action, pillar: 'sports', version: await version(), ...extra });
  const school = (await db.query("INSERT INTO schools (name,lga,level,location,state_code) VALUES ($1,'QA','Primary','Urban',$1) RETURNING id", [marker])).rows[0].id;
  const budgetBody = { entity: 'budget', action: 'create', section: 'equipment', activityType: 'Football', description: 'QA balls', quantity: 5, unitCost: 100.25 };
  assert.equal((await api('anonymous', path)).status, 401);
  assert.equal((await api('foreign', path)).status, 404);
  assert.equal((await review('des', 'submit')).status, 400, 'An empty component cannot be sent');
  assert.equal((await api('ec', sports, budgetBody)).status, 403, 'The Executive Chairman does not edit components');
  const budgetId = ok(await api('des', sports, budgetBody), 201).id;
  const allocationBody = { entity: 'allocation', action: 'create', lineId: budgetId, schoolId: school, quantity: 5 };
  const allocationId = ok(await api('des', sports, allocationBody), 201).id;
  for (const who of ['dir', 'chair', 'ec']) assert.equal((await review(who, 'submit')).status, 403, `${who} cannot send for Data Entry`);
  const stale = await version();
  ok(await api('des', sports, { ...budgetBody, action: 'update', id: budgetId, description: 'QA balls (submitted)' }));
  assert.equal((await api('des', path, { action: 'submit', pillar: 'sports', version: stale })).status, 409, 'A stale version is refused');
  const current = await version();
  const concurrent = await Promise.all([api('des', path, { action: 'submit', pillar: 'sports', version: current }), api('des', path, { action: 'submit', pillar: 'sports', version: current })]);
  assert.deepEqual(concurrent.map(r => r.status).sort(), [200, 409]);

  const first = ok(await api('dir', path));
  assert.equal(first.plan.status, 'awaiting_review');
  assert.equal(first.pillarReviews.find(r => r.pillar === 'sports').status, 'director_review');
  assert.equal(first.snapshot.sports[0].description, 'QA balls (submitted)');
  assert.equal(first.snapshot.sports[0].allocations[0].school.name, marker);
  const firstSubmission = first.plan.submissionNumber;
  const frozen = JSON.stringify(ok(await api('dir', `${path}&submission=${firstSubmission}`)).snapshot);
  assert.equal(ok(await api('des', sports)).canEdit, false);
  for (const body of [budgetBody, { ...budgetBody, action: 'update', id: budgetId }, { entity: 'budget', action: 'delete', id: budgetId }, { ...allocationBody, schoolId: school }, { ...allocationBody, action: 'update', id: allocationId }, { entity: 'allocation', action: 'delete', id: allocationId }]) assert.equal((await api('des', sports, body)).status, 409, `locked: ${JSON.stringify(body)}`);
  assert.equal((await review('des', 'request_changes', { comment: 'No authority' })).status, 403);
  assert.equal((await review('chair', 'request_changes', { comment: 'Not yet mine' })).status, 403);
  assert.equal((await review('foreign', 'request_changes', { comment: 'Other state' })).status, 404);
  assert.equal((await review('dir', 'request_changes', { comment: '   ' })).status, 400, 'A return needs a note when there are no cell comments');
  const directorBell = ok(await api('dir', '/api/notifications'));
  assert.ok(directorBell.notifications.some(n => n.planId === plan.id && n.action === 'submit'), 'The Director is notified');
  assert.ok(!ok(await api('foreign', '/api/notifications')).notifications.some(n => n.planId === plan.id), 'Other states are not notified');

  ok(await review('dir', 'request_changes', { comment: 'Explain the quantity.' }));
  const returned = ok(await api('des', path));
  assert.equal(returned.plan.status, 'changes_requested');
  assert.equal(returned.pillarReviews.find(r => r.pillar === 'sports').status, 'changes_requested');
  assert.equal(ok(await api('des', sports)).canEdit, true);
  assert.ok(ok(await api('des', '/api/notifications')).notifications.some(n => n.planId === plan.id && n.action === 'request_changes'));
  ok(await api('des', sports, { ...budgetBody, action: 'update', id: budgetId, description: 'QA balls (revised)', quantity: 6 }));
  assert.equal((await review('des', 'submit')).status, 400, 'Resubmission needs a response');
  assert.equal(JSON.stringify(ok(await api('dir', `${path}&submission=${firstSubmission}`)).snapshot), frozen, 'Earlier submissions stay unchanged');
  assert.equal((await api('dir', `${path}&submission=999`)).status, 404);
  ok(await review('des', 'submit', { comment: 'Quantity explained and corrected.' }));
  assert.equal(ok(await api('dir', path)).snapshot.sports[0].quantity, 6);

  ok(await review('dir', 'endorse'));
  assert.equal(ok(await api('chair', path)).pillarReviews.find(r => r.pillar === 'sports').status, 'beap_review');
  assert.equal((await review('dir', 'endorse')).status, 409, 'Already sent on');
  assert.equal((await review('ec', 'request_changes', { comment: 'Too early' })).status, 403, 'Only the BEAP Chair returns a component they hold');
  const chairVersion = await version();
  const decisions = await Promise.all([api('chair', path, { action: 'forward', pillar: 'sports', version: chairVersion }), api('chair', path, { action: 'request_changes', pillar: 'sports', version: chairVersion, comment: 'Duplicate decision' })]);
  assert.deepEqual(decisions.map(r => r.status).sort(), [200, 409]);
  if (ok(await api('chair', path)).pillarReviews.find(r => r.pillar === 'sports').status === 'director_review') { ok(await review('dir', 'endorse')); ok(await review('chair', 'forward')); }
  const atChairman = ok(await api('ec', path));
  assert.equal(atChairman.pillarReviews.find(r => r.pillar === 'sports').status, 'chairman_ready');
  assert.ok(atChairman.snapshot.sports.length > 0, 'The Executive Chairman sees the component once it reaches them');
  assert.equal((await api('des', sports, budgetBody)).status, 409);
  assert.equal((await review('des', 'submit')).status, 409);
  ok(await review('ec', 'request_changes', { comment: 'Check the unit cost.' }));
  assert.equal(ok(await api('chair', path)).pillarReviews.find(r => r.pillar === 'sports').status, 'beap_review', 'The Executive Chairman returns to the BEAP Chair');
  ok(await review('chair', 'forward', { comment: 'Unit cost confirmed.' }));
  const events = ok(await api('ec', path)).events.filter(e => e.scope === 'sports').map(e => e.action);
  assert.deepEqual(events.slice(0, 2), ['forward', 'request_changes']);

  // A content write racing a submission: exactly one wins, and the submitted version never changes afterwards.
  const racePlan = await createPlan('ec', 2034);
  const raceSports = `/api/sports?plan=${racePlan.id}`, raceReview = `/api/plans/review?plan=${racePlan.id}`;
  const raceLine = ok(await api('des', raceSports, budgetBody), 201).id;
  const raceVersion = ok(await api('des', raceReview)).plan.version;
  const race = await Promise.all([api('des', raceReview, { action: 'submit', pillar: 'sports', version: raceVersion }), api('des', raceSports, { ...budgetBody, id: raceLine, action: 'update', quantity: 8 })]);
  assert.deepEqual(race.map(r => r.status).sort(), [200, 409]);
  const raceResult = ok(await api('des', raceReview));
  const submittedFirst = race[0].status === 200;
  assert.equal(raceResult.plan.status, submittedFirst ? 'awaiting_review' : 'draft');
  if (submittedFirst) assert.equal(ok(await api('des', `${raceReview}&submission=${raceResult.plan.submissionNumber}`)).snapshot.sports[0].quantity, 5, 'No content change can leak into a submitted version');
  else assert.equal(raceResult.snapshot.sports[0].quantity, 8);

  // Fresh role checks: a changed role in the database overrides a still-valid session.
  await db.query("UPDATE users SET role='Executive Chairman' WHERE email=$1", [emails.des]);
  assert.equal((await api('des', `/api/sports?plan=${plan.id}`, budgetBody)).status, 403);
  assert.equal((await api('des', raceReview, { action: 'submit', pillar: 'sports', version: ok(await api('ec', raceReview)).plan.version })).status, 403);

  // A state without a department Director cannot send a component on.
  const noDirPlan = (await db.query('INSERT INTO action_plans(state_code,start_year,end_year,state_lodgment,other_funding) VALUES($1,2033,2033,100000000,0) RETURNING id', [states[2]])).rows[0].id;
  ok(await api('nodir', `/api/sports?plan=${noDirPlan}`, budgetBody), 201);
  const noDirVersion = ok(await api('nodir', `/api/plans/review?plan=${noDirPlan}`)).plan.version;
  const noDir = await api('nodir', `/api/plans/review?plan=${noDirPlan}`, { action: 'submit', pillar: 'sports', version: noDirVersion });
  assert.equal(noDir.status, 409); assert.match(noDir.data.error, /No active department Director/);
  // The local database is shared, so plans may change elsewhere meanwhile; check none moved into this test's states.
  for (const row of (await db.query('SELECT id, state_code FROM action_plans WHERE id = ANY($1::int[])', [original.map(p => p.id)])).rows) assert.equal(row.state_code, original.find(p => p.id === row.id).state_code, 'Existing plans must be preserved');
  console.log('PASS: component submission, Director, BEAP Chair and Executive Chairman steps with returns, frozen submissions, notifications, state and role isolation, fresh role checks, editor write locks, stale/duplicate/concurrent protection, missing Director, preserved existing plans.');
} finally {
  if (settings) await db.query("UPDATE state_workflow_settings SET beap_chair_submission_mode=$1, ubec_submission_mode=$2 WHERE state_code='GLOBAL'", [settings.beap_chair_submission_mode, settings.ubec_submission_mode]);
  const plans = `SELECT id FROM action_plans WHERE state_code = ANY($1::text[])`;
  for (const table of ['plan_notifications', 'plan_comments', 'plan_review_events', 'plan_submissions', 'plan_pillar_reviews']) await db.query(`DELETE FROM ${table} WHERE plan_id IN (${plans})`, [states]);
  await db.query('DELETE FROM sports_allocations WHERE line_id IN (SELECT id FROM sports_budget_lines WHERE state_code = ANY($1::text[]))', [states]);
  for (const table of ['sports_budget_lines', 'action_plans', 'schools']) await db.query(`DELETE FROM ${table} WHERE state_code = ANY($1::text[])`, [states]);
  if (userIds.length) {
    await db.query('DELETE FROM sessions WHERE user_id = ANY($1::int[])', [userIds]);
    await db.query('DELETE FROM users WHERE id = ANY($1::int[])', [userIds]);
  }
  await db.end();
}
