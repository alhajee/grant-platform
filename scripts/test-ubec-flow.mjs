// UBEC review flow end to end (docs/ubec-flow.md, migration 055): SUBEB submission → UBEC BEAP Chair release →
// component Directors assign Assessment Officers → item Accept/Reject and Complete assessment → Director sends for
// oversight → Audit, Procurement and Finance "Observations done" → BEAP Chair returns (whole plan, shared comments,
// state notifications and results) → resubmission with previous decisions → approval. Also the permission matrix:
// the ES is read-only, oversight cannot accept/reject, officers act only on assigned components, stage gating.
// Usage: node --env-file=.env scripts/test-ubec-flow.mjs [baseUrl]   (local only; throwaway states, users and plan; cleans up)
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { hashSync } from 'bcryptjs';
import ExcelJS from 'exceljs';

const base = process.argv[2] ?? process.env.TEST_BASE_URL ?? process.env.UBEC_TEST_URL ?? 'http://localhost:5173';
assert.match(base, /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/, 'Run this test against a local server only.');
assert.ok(['localhost', '127.0.0.1'].includes(new URL(process.env.DATABASE_URL).hostname), 'Use a local database only.');
const marker = `UX${randomUUID().slice(0, 8).toUpperCase()}`, password = randomUUID();
const db = new Client({ connectionString: process.env.DATABASE_URL });
const cookies = {}, users = {};
let settings, savedDefaults, planId, passed = 0;
const step = message => { passed++; console.log('✓', message); };

async function api(who, path, body, method = body ? 'POST' : 'GET', origin = true) {
  const isForm = body instanceof FormData;
  const response = await fetch(base + path, { method, headers: { ...(origin ? { Origin: base } : {}), ...(body && !isForm ? { 'Content-Type': 'application/json' } : {}), ...(cookies[who] ? { Cookie: cookies[who] } : {}) }, ...(body ? { body: isForm ? body : JSON.stringify(body) } : {}) });
  const text = await response.text(); let data; try { data = JSON.parse(text); } catch { data = { error: text.slice(0, 200) }; }
  if (path === '/api/auth/login' && response.ok) cookies[who] = response.headers.get('set-cookie').split(';')[0];
  return { status: response.status, data, text };
}
const ok = (r, status = 200) => { assert.equal(r.status, status, JSON.stringify(r.data)); return r.data; };
const fails = (r, status, pattern) => { assert.equal(r.status, status, JSON.stringify(r.data)); if (pattern instanceof RegExp) assert.match(r.data.error ?? '', pattern); return r.data; };
async function user(who, role, departments, { state = marker, chair = false } = {}) {
  const email = `${who}.${marker}@ubec-flow.test`.toLowerCase();
  const id = (await db.query('INSERT INTO users(email,full_name,role,department,state_code,password_hash,is_beap_chair) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id', [email, `QA ${who}`, role, departments[0] ?? null, state, hashSync(password, 4), chair])).rows[0].id;
  users[who] = id;
  for (const department of departments) await db.query('INSERT INTO user_departments(user_id,department) VALUES($1,$2)', [id, department]);
  ok(await api(who, '/api/auth/login', { email, password }));
}
const notified = async (who, action) => (await db.query('SELECT 1 FROM plan_notifications n LEFT JOIN ubec_events u ON u.id=n.ubec_event_id LEFT JOIN plan_review_events e ON e.id=n.event_id WHERE n.user_id=$1 AND n.plan_id=$2 AND COALESCE(u.action,e.action)=$3', [users[who], planId, action])).rowCount > 0;

await db.connect();
try {
  settings = (await db.query("SELECT beap_chair_submission_mode, ubec_submission_mode FROM state_workflow_settings WHERE state_code='GLOBAL'")).rows[0];
  await db.query("UPDATE state_workflow_settings SET beap_chair_submission_mode='individual_components', ubec_submission_mode='reviewed_components' WHERE state_code='GLOBAL'");
  // Admin default officers (migration 056) are only pre-ticked for the Director; cleared for a predictable run (restored below).
  savedDefaults = (await db.query('SELECT * FROM ubec_default_officers')).rows;
  await db.query('DELETE FROM ubec_default_officers');
  await user('desA', 'Data Entry Staff', ['academic']); await user('desP', 'Data Entry Staff', ['physical']); await user('desS', 'Data Entry Staff', ['social']);
  await user('dirA', 'Director', ['academic']); await user('dirP', 'Director', ['physical']);
  await user('subebChair', 'Director', ['planning'], { chair: true }); await user('ec', 'Executive Chairman', []);
  const u = { state: 'UBEC' };
  await user('chair', 'UBEC BEAP Chair', [], u); await user('es', 'UBEC Executive Secretary', [], u);
  await user('dpp', 'UBEC Director', ['physical'], u); await user('dacs', 'UBEC Director', ['academic'], u); await user('dprs', 'UBEC Director', ['planning'], u);
  await user('offP1', 'UBEC Assessment Officer', ['physical'], u); await user('offP2', 'UBEC Assessment Officer', ['physical'], u); await user('offA', 'UBEC Assessment Officer', ['academic'], u);
  await user('audit', 'UBEC Oversight Director', ['audit'], u); await user('procurement', 'UBEC Oversight Director', ['procurement'], u); await user('finance', 'UBEC Oversight Director', ['finance'], u);
  await user('special', 'UBEC Oversight Director', ['special'], u); // UBEC183: the fourth Oversight Department

  const rat = new ExcelJS.Workbook(); rat.addWorksheet('RAT').addRow(['UBEC flow QA']);
  const form = new FormData();
  form.set('setup', JSON.stringify({ planningYear: 2026, implementationYear: 2026, quarters: [1, 2, 3, 4], stateLodgment: '100000000', fundingSources: [] }));
  form.append('rat', new Blob([await rat.xlsx.writeBuffer()]), 'rat.xlsx');
  planId = ok(await api('ec', '/api/plans', form), 201).plan.id;
  // UBEC204: the RAT tool is replaced (not edited in place) through Edit plan while the plan is at the SUBEB.
  const replaceRat = async (who, name) => { const body = new FormData(); const v = ok(await api('ec', `/api/plans/setup?plan=${planId}`)).plan.version; body.set('plan', String(planId)); body.set('version', String(v)); body.append('rat', new Blob([await rat.xlsx.writeBuffer()]), name); return api(who, '/api/plans/rat', body); };
  const ratNames = async () => ok(await api('ec', `/api/plans/setup?plan=${planId}`)).plan.documents.map(d => d.name);
  ok(await replaceRat('ec', 'rat-v2.xlsx'));
  assert.deepEqual(await ratNames(), ['rat-v2.xlsx', 'rat.xlsx'], 'a new RAT is added beside the first one, newest first (UBEC205: never overwritten)');
  const q = `?plan=${planId}`, statePath = `/api/plans/review${q}`, path = `/api/ubec/review${q}`, components = `/api/ubec/components${q}`, decisions = `/api/ubec/decisions${q}`, sports = `/api/sports${q}`;
  const school = (await db.query("INSERT INTO schools(name,lga,level,location,state_code) VALUES($1,'QA','Primary','Urban',$1) RETURNING id", [marker])).rows[0].id;
  const budget = { entity: 'budget', action: 'create', section: 'equipment', activityType: 'Football', description: 'QA equipment', quantity: 5, unitCost: 100 };
  const sportsLine = ok(await api('desA', sports, budget), 201).id;
  ok(await api('desA', sports, { entity: 'allocation', action: 'create', lineId: sportsLine, schoolId: school, quantity: 5 }), 201);
  ok(await api('desP', `/api/activities${q}&workstream=monitoring`, { workstream: 'monitoring', entity: 'line', action: 'create', activity: 0, description: 'QA monitoring visit', quantity: 1, unitCost: 1000, strategy: 'Request for quotation', targetGroup: 'Schools' }));
  const monitoringLine = String((await db.query("SELECT id FROM activity_plan_lines WHERE plan_id=$1 AND workstream='monitoring'", [planId])).rows[0].id);
  // Each send step returns the plan's new version, so several can be sent in a row (BEAP Chair "Send several", V2-04).
  const stateStep = async (who, action, pillar, comment = '') => { const version = ok(await api('ec', statePath)).plan.version; const result = ok(await api(who, statePath, { action, pillar, version, comment })); assert.equal(result.version, version + 1); assert.equal(ok(await api('ec', statePath)).plan.version, result.version); return result; };
  const throughState = async (pillar, des, dir, comment = '') => { await stateStep(des, 'submit', pillar, comment); await stateStep(dir, 'endorse', pillar); await stateStep('subebChair', 'forward', pillar); };
  const view = async who => ok(await api(who, path));
  const act = async (who, action, extra = {}) => { const v = await view('chair'); return api(who, path, { action, version: v.plan.version, roundId: v.round.id, ...extra }); };
  const step2 = async (who, action, pillar, extra = {}) => api(who, components, { action, roundId: (await view('chair')).round.id, pillar, ...extra });
  const decide = async (who, pillar, rowRef, decision, note = '') => api(who, decisions, { roundId: (await view('chair')).round.id, pillar, rowRef, decision, note }, 'PUT');

  await throughState('sports', 'desA', 'dirA'); await throughState('monitoring', 'desP', 'dirP');
  ok(await api('ec', path, { action: 'submit', version: ok(await api('ec', path)).plan.version }));
  assert.ok(await notified('chair', 'submit') && await notified('es', 'submit'), 'the UBEC BEAP Chair and ES hear about the submission');
  { // UBEC205: UBEC Planning accepts or rejects the RAT tool; a rejection needs a comment; only UBEC Planning decides.
    const round1 = (await view('chair')).round.id;
    fails(await api('chair', '/api/ubec/rat-review', { roundId: round1, decision: 'accept' }), 403);
    fails(await api('dprs', '/api/ubec/rat-review', { roundId: round1, decision: 'reject' }), 400, /Say why/);
    ok(await api('dprs', '/api/ubec/rat-review', { roundId: round1, decision: 'reject', comment: 'The LGA totals do not add up.' }));
    const listed = ok(await api('dprs', '/api/ubec/rat-tools')).plans.find(p => p.planId === planId);
    assert.equal(listed.review.decision, 'reject'); assert.deepEqual(listed.documents.map(d => d.name), ['rat-v2.xlsx', 'rat.xlsx']);
    fails(await replaceRat('ec', 'too-late.xlsx'), 409, /back at the SUBEB/);
  }
  step('SUBEB submits Sports + Monitoring; the UBEC BEAP Chair and ES are notified; UBEC Planning rejects the RAT tool with a comment');

  // Before release only the BEAP Chair and the ES see the plan.
  for (const who of ['dpp', 'dacs', 'offP1', 'audit']) fails(await api(who, path), 404, /No assigned submission/);
  const esView = await view('es');
  assert.equal(esView.round.status, 'received'); assert.equal(esView.round.snapshot.sports.length, 1); assert.deepEqual(esView.flow.abilities.release, false);
  assert.equal((await view('chair')).flow.abilities.release, true);
  assert.ok(ok(await api('chair', '/api/ubec/dashboard')).queue.some(i => i.planId === planId && i.kind === 'release'), 'the plan waits for release on the BEAP Chair dashboard');
  fails(await act('es', 'release', { comment: 'x' }), 403, /Executive Secretary/);
  fails(await act('dpp', 'release', { comment: 'x' }), 403);
  fails(await act('chair', 'release'), 400, /comment/);
  fails(await act('chair', 'approve', { comment: 'early' }), 409, /Release/);
  fails(await api('chair', path, { action: 'release', version: esView.plan.version, roundId: esView.round.id, comment: 'x' }, 'POST', false), 403, /portal/);
  ok(await act('chair', 'release', { comment: 'Checked the submission; please assess.' }));
  fails(await act('chair', 'release', { comment: 'again' }), 409);
  assert.ok(await notified('dpp', 'release') && await notified('dacs', 'release') && !(await notified('dprs', 'release')), 'only the Directors of released components are notified');
  step('release: only the UBEC BEAP Chair, with a comment, same origin, once; the ES and Directors cannot; component Directors notified');

  const dppView = await view('dpp');
  // UBEC149: every unit sees every released component, but acts only on its own.
  assert.equal(dppView.round.snapshot.monitoring.length, 1); assert.equal(dppView.round.snapshot.sports.length, 1);
  assert.deepEqual(dppView.flow.components.map(c => c.pillar).sort(), ['monitoring', 'sports']); assert.deepEqual(dppView.flow.abilities.assign, ['monitoring']);
  assert.ok(dppView.flow.officers.some(o => o.id === users.offP1) && !dppView.flow.officers.some(o => o.id === users.offA), 'a Director chooses among their own officers');
  const dprsView = await view('dprs');
  assert.deepEqual(dprsView.flow.abilities.assign, []); assert.deepEqual(dprsView.flow.abilities.assess, []);
  fails(await step2('dprs', 'assign_officers', 'sports', { officerIds: [users.offA], comment: 'x' }), 403);
  const dprsComments = ok(await api('dprs', `/api/ubec/comments${q}`));
  assert.deepEqual(dprsComments.abilities.sports, { start: true, reply: true, resolveAny: false, reopen: false }, 'observers comment but do not resolve others or reopen');
  const observation = ok(await api('dprs', `/api/ubec/comments${q}`, { sheet: 'sports', rowRef: String(sportsLine), columnId: null, body: 'DPRS observation: check the football count against enrolment.' }), 201).id;
  const dacsThread = ok(await api('dacs', `/api/ubec/comments${q}`, { sheet: 'sports', rowRef: String(sportsLine), columnId: 'amount', body: 'DACS note.' }), 201).id;
  fails(await api('dprs', `/api/ubec/comments${q}`, { id: dacsThread, action: 'resolve' }, 'PATCH'), 403, /own unit/);
  ok(await api('dprs', `/api/ubec/comments${q}`, { id: observation, action: 'resolve' }, 'PATCH'));
  ok(await api('dacs', `/api/ubec/comments${q}`, { id: dacsThread, action: 'resolve' }, 'PATCH'));
  assert.ok(!ok(await api('dprs', '/api/ubec/dashboard')).items.some(i => i.planId === planId), 'the dashboard lists only their own work');
  fails(await step2('dpp', 'assign_officers', 'monitoring', { officerIds: [users.offP1] }), 400, /comment/);
  fails(await step2('dacs', 'assign_officers', 'sports', { officerIds: [users.offP1], comment: 'x' }), 400, /your department/);
  fails(await step2('dpp', 'assign_officers', 'sports', { officerIds: [users.offP1], comment: 'x' }), 403, /another department/);
  fails(await step2('es', 'assign_officers', 'monitoring', { officerIds: [users.offP1], comment: 'x' }), 403);
  fails(await step2('audit', 'assign_officers', 'monitoring', { officerIds: [users.offP1], comment: 'x' }), 403, /cannot assign/);
  ok(await step2('dpp', 'assign_officers', 'monitoring', { officerIds: [users.offP1, users.offP2], comment: 'Check unit costs against benchmarks.' }));
  fails(await step2('dpp', 'assign_officers', 'monitoring', { officerIds: [users.offP1], comment: 'again' }), 409);
  ok(await step2('dacs', 'assign_officers', 'sports', { officerIds: [users.offA], comment: 'Verify the equipment list.' }));
  assert.ok(await notified('offP1', 'assign_officer') && await notified('offA', 'assign_officer'));
  step('Directors assign their own officers with a required comment (other departments 403, wrong department officers 400, ES and oversight 403); officers notified');

  const offP1View = await view('offP1');
  // UBEC149: an officer sees the other released components too, but assesses only what is assigned.
  assert.deepEqual(offP1View.flow.components.map(c => c.pillar).sort(), ['monitoring', 'sports']); assert.deepEqual(offP1View.flow.abilities.assess, ['monitoring']);
  fails(await decide('offP1', 'sports', String(sportsLine), 'accept'), 403, /not assigned/);
  fails(await api('audit', path), 404, /No assigned submission/);
  fails(await decide('offA', 'monitoring', monitoringLine, 'accept'), 403, /not assigned/);
  fails(await decide('audit', 'monitoring', monitoringLine, 'accept'), 403, /cannot accept or reject/);
  fails(await decide('es', 'monitoring', monitoringLine, 'accept'), 403);
  fails(await decide('dacs', 'monitoring', monitoringLine, 'accept'), 403, /another department/);
  fails(await decide('offP1', 'monitoring', '987654321', 'accept'), 400, /not in this submission/);
  fails(await step2('offP1', 'complete_assessment', 'monitoring'), 409, /undecided/);
  fails(await decide('offP1', 'monitoring', monitoringLine, 'reject'), 400, /reason/); // UBEC176
  ok(await decide('offP1', 'monitoring', monitoringLine, 'reject', 'too costly'));
  ok(await decide('offP1', 'monitoring', monitoringLine, null));
  ok(await decide('offP1', 'monitoring', monitoringLine, 'accept'));
  ok(await step2('offP1', 'complete_assessment', 'monitoring', { note: 'All good.' }));
  fails(await step2('offP1', 'complete_assessment', 'monitoring'), 409, /already/);
  fails(await decide('offP1', 'monitoring', monitoringLine, 'reject', 'late'), 409, /locked/);
  // UBEC143: the Director changes a decision, or sends a completed assessment back to its officer.
  ok(await decide('dpp', 'monitoring', monitoringLine, 'reject', 'Unit cost too high'));
  assert.match((await view('dpp')).flow.decisions.find(d => d.rowRef === monitoringLine).officerName, /\(Director\)$/);
  ok(await decide('dpp', 'monitoring', monitoringLine, 'accept'));
  const offP1Assignment = (await view('dpp')).flow.components.find(c => c.pillar === 'monitoring').officers.find(o => o.officerId === users.offP1).id;
  const offP2Open = (await view('dpp')).flow.components.find(c => c.pillar === 'monitoring').officers.find(o => o.officerId === users.offP2).id;
  fails(await step2('dpp', 'reopen_assessment', 'monitoring', { assignmentId: offP1Assignment }), 400, /look at again/);
  fails(await step2('dacs', 'reopen_assessment', 'monitoring', { assignmentId: offP1Assignment, comment: 'x' }), 403, /another department/);
  fails(await step2('offP1', 'reopen_assessment', 'monitoring', { assignmentId: offP1Assignment, comment: 'x' }), 403);
  fails(await step2('dpp', 'reopen_assessment', 'monitoring', { assignmentId: offP2Open, comment: 'x' }), 409, /not completed/);
  ok(await step2('dpp', 'reopen_assessment', 'monitoring', { assignmentId: offP1Assignment, comment: 'Recheck the unit cost.' }));
  assert.ok(await notified('offP1', 'reopen_assessment'));
  ok(await decide('offP1', 'monitoring', monitoringLine, 'accept', 'Rechecked'));
  ok(await step2('offP1', 'complete_assessment', 'monitoring', { note: 'Rechecked.' }));
  step('the Director changes a decision (recorded as the Director) and sends a completed assessment back with a comment; the officer is notified and completes again');
  assert.ok(await notified('dpp', 'complete_assessment'));
  fails(await step2('dpp', 'send_oversight', 'monitoring', { comment: 'x' }), 409, /still working/);
  const offP2Assignment = (await view('dpp')).flow.components.find(c => c.pillar === 'monitoring').officers.find(o => o.officerId === users.offP2).id;
  ok(await step2('dpp', 'unassign_officer', 'monitoring', { assignmentId: offP2Assignment }));
  assert.deepEqual(ok(await api('offP2', path)).flow.abilities.assess, [], 'a removed officer can no longer assess (UBEC149: they still observe)');
  fails(await step2('dpp', 'send_oversight', 'monitoring'), 400, /comment/);
  ok(await step2('dpp', 'send_oversight', 'monitoring', { comment: 'Monitoring assessed and endorsed.' }));
  fails(await step2('dpp', 'assign_officers', 'monitoring', { officerIds: [users.offP2], comment: 'late' }), 409, /Oversight Departments/);
  assert.ok(await notified('audit', 'send_oversight') && await notified('finance', 'send_oversight'));
  step('officers decide items only on assigned components (oversight, ES, Directors, others 403); complete needs every item decided and locks decisions; a pending officer can be removed; send for oversight needs all officers done and a comment');

  ok(await decide('offA', 'sports', String(sportsLine), 'reject', 'Quantity is too high.'));
  ok(await step2('offA', 'complete_assessment', 'sports', { note: 'One item rejected.' }));
  ok(await step2('dacs', 'send_oversight', 'sports', { comment: 'Sports needs revision.' }));
  const auditView = await view('audit');
  assert.deepEqual(auditView.flow.components.map(c => c.pillar).sort(), ['monitoring', 'sports']); assert.deepEqual(auditView.flow.abilities.observe.sort(), ['monitoring', 'sports']);
  const auditComment = ok(await api('audit', `/api/ubec/comments${q}`, { sheet: 'monitoring', rowRef: monitoringLine, columnId: 'amount', body: 'AUDIT: keep receipts for this visit.' }), 201).id;
  fails(await api('es', `/api/ubec/comments${q}`, { sheet: 'monitoring', rowRef: monitoringLine, columnId: 'unitCost', body: 'ES cannot write' }), 403, /read-only/);
  assert.ok(ok(await api('es', `/api/ubec/comments${q}`)).threads.some(t => t.id === auditComment), 'the ES reads every comment');
  for (const who of ['audit', 'procurement']) ok(await step2(who, 'observations_done', 'monitoring', { note: `${who} observed` }));
  fails(await step2('audit', 'observations_done', 'monitoring'), 409, /already/);
  fails(await step2('dpp', 'observations_done', 'monitoring'), 403);
  fails(await act('chair', 'approve', { comment: 'early' }), 409, /in progress/);
  assert.equal((await view('chair')).flow.components.find(c => c.pillar === 'monitoring').stage, 'oversight', 'two of three observations keep it in oversight');
  ok(await step2('finance', 'observations_done', 'monitoring')); ok(await step2('special', 'observations_done', 'monitoring'));
  assert.equal((await view('chair')).flow.components.find(c => c.pillar === 'monitoring').stage, 'chair');
  assert.ok(await notified('chair', 'ready_for_chair'));
  for (const who of ['audit', 'procurement', 'finance']) ok(await step2(who, 'observations_done', 'sports'));
  // UBEC183: with an active Special Programmes Oversight Director, the component also waits for Special Programmes.
  assert.equal((await view('chair')).flow.components.find(c => c.pillar === 'sports').stage, 'oversight');
  assert.deepEqual(ok(await step2('special', 'observations_done', 'sports')), { stage: 'chair' });
  step('oversight sees components once sent, comments (the ES reads but cannot write), cannot assign or decide; all three observations move a component to the BEAP Chair automatically and notify her');

  const chairView = await view('chair');
  assert.equal(chairView.flow.allArrived, true); assert.equal(chairView.flow.approvable, false); assert.equal(chairView.flow.abilities.decide, true);
  fails(await act('chair', 'approve', { comment: 'Approve anyway' }), 409, /rejected/);
  fails(await act('es', 'return', { comment: 'x' }), 403);
  fails(await act('chair', 'return'), 400);
  const openThreads = ok(await api('chair', `/api/ubec/comments${q}`)).threads.filter(t => !t.resolvedAt).map(t => t.id);
  ok(await act('chair', 'return', { comment: 'Revise the sports equipment quantity.', shareCommentIds: openThreads }));
  // The return lands with the SUBEB BEAP Chair first (Executive Chairman told too); Directors and Data Entry hear when she returns it to them.
  const afterReturn = ok(await api('ec', statePath));
  for (const pillar of ['sports', 'monitoring']) assert.equal(afterReturn.pillarReviews.find(r => r.pillar === pillar).status, 'beap_review', `${pillar} is back with the SUBEB BEAP Chair`);
  for (const who of ['ec', 'subebChair']) assert.ok(await notified(who, 'request_changes'), `${who} is notified of the return`);
  for (const who of ['dirA', 'desA', 'desS']) assert.equal(await notified(who, 'request_changes'), false, `${who} is not notified until the BEAP Chair returns it`);
  fails(await api('desA', sports, { ...budget, action: 'update', id: sportsLine, quantity: 6 }), 409);
  // UBEC199: neither the Executive Chairman nor the BEAP Chair edits the plan details while it is back for corrections.
  const setup = ok(await api('ec', `/api/plans/setup?plan=${planId}`));
  assert.equal(setup.canEdit, false); assert.match(setup.lockedReason, /back from UBEC/);
  for (const who of ['ec', 'subebChair']) assert.match(fails(await api(who, '/api/plans/setup', { plan: planId, version: setup.plan.version, planningYear: setup.plan.startYear, implementationYear: setup.plan.implementationYear ?? setup.plan.startYear, quarters: setup.plan.fundingQuarters ?? [1, 2, 3, 4], stateLodgment: setup.plan.stateLodgment, fundingSources: setup.plan.fundingSources ?? [] }, 'PATCH'), 409).error, /back from UBEC/);
  await stateStep('subebChair', 'request_changes', 'sports', 'UBEC asked to revise the equipment quantity.');
  await stateStep('dirA', 'request_changes', 'sports', 'Please revise the quantity.');
  assert.ok(await notified('desA', 'request_changes'), 'Data Entry hears once the Director returns it');
  assert.ok((ok(await api('desP', `/api/plans/comments${q}`)).threads).some(t => t.id === auditComment && t.scope === 'ubec'), 'shared UBEC threads reach the state');
  const results = ok(await api('desA', `/api/ubec/results${q}`));
  assert.equal(results.round.status, 'returned'); assert.deepEqual(results.components.map(c => c.pillar), ['sports']);
  assert.equal(results.components[0].items[0].decision, 'reject'); assert.equal(results.components[0].items[0].note, 'Quantity is too high.');
  assert.equal(ok(await api('ec', `/api/ubec/results${q}`)).components.length, 2);
  fails(await api('chair', `/api/ubec/results${q}`), 403);
  step('approval is blocked while an item is rejected; the BEAP Chair returns the whole plan; the return lands with the SUBEB BEAP Chair, who sends it down to the Director and Data Entry; shared threads and item results reach the state by department');

  // UBEC189: the rejected item must be changed (or removed) before Data Entry can send the component on.
  fails(await api('desA', statePath, { action: 'submit', pillar: 'sports', version: ok(await api('desA', statePath)).plan.version, comment: 'Nothing changed.' }), 409, /Correct the item UBEC rejected in Sports, Quiz & Debate Activities first/);
  assert.deepEqual(ok(await api('desA', statePath)).ubecOpenRejections, { sports: [String(sportsLine)] });
  ok(await api('desA', sports, { ...budget, action: 'update', id: sportsLine, quantity: 6, description: 'Revised equipment' }));
  assert.deepEqual(ok(await api('desA', statePath)).ubecOpenRejections, {}, 'a changed item no longer blocks');
  await stateStep('desA', 'submit', 'sports', 'Quantity reduced.'); await stateStep('dirA', 'endorse', 'sports');
  { // UBEC204/205: the SUBEB sees the RAT rejection, cannot resubmit until a new RAT is uploaded, and only the RAT is editable.
    const results = ok(await api('ec', `/api/ubec/results${q}`));
    assert.equal(results.rat.review.decision, 'reject'); assert.equal(results.rat.replacedSince, false);
    assert.match(ok(await api('ec', statePath)).ratProblem, /rejected the RAT tool/);
    const setup = ok(await api('ec', `/api/plans/setup?plan=${planId}`));
    assert.equal(setup.canEdit, false); assert.equal(setup.canReplaceRat, true); assert.equal(setup.ratReview.decision, 'reject');
    // UBEC205: the BEAP Chair cannot send on until a new RAT is uploaded (nor can the Executive Chairman resubmit).
    fails(await api('subebChair', statePath, { action: 'forward', pillar: 'sports', version: ok(await api('ec', statePath)).plan.version, comment: '' }), 409, /Upload a corrected RAT/);
    fails(await replaceRat('desA', 'rat-v3.xlsx'), 403);
    ok(await replaceRat('subebChair', 'rat-v3.xlsx'));
    assert.equal(ok(await api('ec', `/api/plans/setup?plan=${planId}`)).ratReplaced, true);
    assert.equal(ok(await api('ec', statePath)).ratProblem, null);
  }
  await stateStep('subebChair', 'forward', 'sports');
  ok(await api('ec', path, { action: 'submit', version: ok(await api('ec', path)).plan.version, comment: 'Revised the equipment specification.' }));
  const second = await view('chair');
  assert.equal(second.round.number, 2); assert.equal(second.round.status, 'received'); assert.ok(second.flow.previousDecisions.some(d => d.pillar === 'sports' && d.decision === 'reject'));
  assert.deepEqual(second.flow.corrected, { sports: [String(sportsLine)] }, 'UBEC sees the rejected item as corrected (UBEC195)');
  ok(await act('chair', 'release', { comment: 'Resubmission received.' }));
  { const dppRound2 = await view('dpp'); assert.equal(dppRound2.round.number, 2, 'UBEC149: the Physical Planning Director observes round 2 too'); assert.deepEqual(dppRound2.flow.abilities.assign, [], 'but has nothing of their own to assign'); }
  ok(await step2('dacs', 'assign_officers', 'sports', { officerIds: [users.offA], comment: 'Check the revision.' }));
  assert.ok((await view('offA')).flow.previousDecisions.some(d => d.rowRef === String(sportsLine) && d.note === 'Quantity is too high.'), 'officers see the previous round\'s decisions');
  assert.ok(ok(await api('offA', '/api/ubec/dashboard')).queue.some(i => i.kind === 'assess' && i.planId === planId));
  ok(await decide('offA', 'sports', String(sportsLine), 'accept'));
  ok(await step2('offA', 'complete_assessment', 'sports'));
  ok(await step2('dacs', 'send_oversight', 'sports', { comment: 'Revision accepted.' }));
  for (const who of ['audit', 'procurement', 'finance', 'special']) ok(await step2(who, 'observations_done', 'sports'));
  const ready = await view('chair');
  assert.equal(ready.flow.approvable, true);
  // UBEC205: a rejected RAT holds approval until UBEC Planning accepts it.
  ok(await api('dprs', '/api/ubec/rat-review', { roundId: ready.round.id, decision: 'reject', comment: 'Still wrong.' }));
  assert.equal((await view('chair')).flow.approvable, false, 'the chair sees the RAT rejection before approving');
  fails(await act('chair', 'approve', { comment: 'Approve' }), 409, /RAT tool/);
  ok(await api('dprs', '/api/ubec/rat-review', { roundId: ready.round.id, decision: 'accept' }));
  const decision = { action: 'approve', version: ready.plan.version, roundId: ready.round.id, comment: 'Approved by UBEC.' };
  assert.deepEqual((await Promise.all([api('chair', path, decision), api('chair', path, decision)])).map(r => r.status).sort(), [200, 409]);
  assert.equal(ok(await api('ec', statePath)).plan.status, 'ubec_approved');
  fails(await step2('offA', 'complete_assessment', 'sports'), 409);
  const national = ok(await api('es', '/api/ubec/dashboard')).items.find(i => i.planId === planId);
  assert.equal(national.status, 'approved'); assert.equal(national.budget, 600); assert.equal(national.components[0].stage, 'chair');
  assert.equal(ok(await api('dpp', '/api/ubec/dashboard')).items.some(i => i.planId === planId), false, 'the latest round has nothing for Physical Planning');
  step('resubmission opens round 2 with the previous decisions for reference; the plan is approved once nothing is rejected (concurrent approval 200/409); dashboards follow visibility');
  console.log(`\nPASS: ${passed} UBEC flow checks.`);
} finally {
  if (settings) await db.query("UPDATE state_workflow_settings SET beap_chair_submission_mode=$1, ubec_submission_mode=$2 WHERE state_code='GLOBAL'", [settings.beap_chair_submission_mode, settings.ubec_submission_mode]);
  for (const r of savedDefaults ?? []) await db.query('INSERT INTO ubec_default_officers(pillar,officer_id,updated_by_name,updated_at) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING', [r.pillar, r.officer_id, r.updated_by_name, r.updated_at]);
  if (planId) {
    await db.query('DELETE FROM plan_comments WHERE plan_id=$1', [planId]);
    await db.query('DELETE FROM plan_notifications WHERE plan_id=$1', [planId]);
    await db.query('DELETE FROM ubec_events WHERE plan_id=$1', [planId]);
    await db.query('DELETE FROM ubec_assignments WHERE round_id IN (SELECT id FROM ubec_rounds WHERE plan_id=$1)', [planId]);
    await db.query('DELETE FROM ubec_rounds WHERE plan_id=$1', [planId]);
    for (const t of ['plan_review_events', 'plan_submissions', 'plan_pillar_reviews', 'activity_plan_lines']) await db.query(`DELETE FROM ${t} WHERE plan_id=$1`, [planId]);
    await db.query('DELETE FROM sports_allocations WHERE line_id IN (SELECT id FROM sports_budget_lines WHERE plan_id=$1)', [planId]);
    await db.query('DELETE FROM sports_budget_lines WHERE plan_id=$1', [planId]);
    await db.query('DELETE FROM action_plans WHERE id=$1', [planId]);
  }
  await db.query('DELETE FROM schools WHERE state_code=$1', [marker]);
  const ids = Object.values(users);
  if (ids.length) { await db.query('DELETE FROM sessions WHERE user_id=ANY($1::int[])', [ids]); await db.query('DELETE FROM users WHERE id=ANY($1::int[])', [ids]); }
  await db.end();
}
