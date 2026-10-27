// UBEC56/UBEC95 (migration 071): Audit, Procurement and Finance have Assessment Officers. Their Oversight Director
// assigns them to a component with oversight (with a comment; a single officer is pre-ticked); they see it and comment
// on its items but never accept, reject or complete; their open comments (and their Director's) block the UBEC BEAP
// Chair's approval until resolved. Oversight Directors add officers on the Officers page with no limit.
// Usage: node --env-file=.env scripts/test-ubec-oversight-officers.mjs [baseUrl]   (local only; throwaway state, users and plan; cleans up)
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { hashSync } from 'bcryptjs';
import ExcelJS from 'exceljs';

const base = process.argv[2] ?? process.env.TEST_BASE_URL ?? process.env.UBEC_TEST_URL ?? 'http://localhost:5173';
assert.match(base, /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/, 'Run this test against a local server only.');
assert.ok(['localhost', '127.0.0.1'].includes(new URL(process.env.DATABASE_URL).hostname), 'Use a local database only.');
const marker = `UO${randomUUID().slice(0, 8).toUpperCase()}`, password = randomUUID();
const db = new Client({ connectionString: process.env.DATABASE_URL });
const cookies = {}, users = {};
let settings, savedDefaults, planId, passed = 0;
const step = message => { passed++; console.log('✓', message); };

async function api(who, path, body, method = body ? 'POST' : 'GET') {
  const isForm = body instanceof FormData;
  const response = await fetch(base + path, { method, headers: { Origin: base, ...(body && !isForm ? { 'Content-Type': 'application/json' } : {}), ...(cookies[who] ? { Cookie: cookies[who] } : {}) }, ...(body ? { body: isForm ? body : JSON.stringify(body) } : {}) });
  const text = await response.text(); let data; try { data = JSON.parse(text); } catch { data = { error: text.slice(0, 200) }; }
  if (path === '/api/auth/login' && response.ok) cookies[who] = response.headers.get('set-cookie').split(';')[0];
  return { status: response.status, data };
}
const ok = (r, status = 200) => { assert.equal(r.status, status, JSON.stringify(r.data)); return r.data; };
const fails = (r, status, pattern) => { assert.equal(r.status, status, JSON.stringify(r.data)); if (pattern) assert.match(r.data.error ?? '', pattern); return r.data; };
async function user(who, role, departments, { state = marker, chair = false } = {}) {
  const email = `${who}.${marker}@ubec-oversight.test`.toLowerCase();
  const id = (await db.query('INSERT INTO users(email,full_name,role,department,state_code,password_hash,is_beap_chair) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id', [email, `QA ${who}`, role, departments[0] ?? null, state, hashSync(password, 4), chair])).rows[0].id;
  users[who] = id;
  for (const department of departments) await db.query('INSERT INTO user_departments(user_id,department) VALUES($1,$2)', [id, department]);
  ok(await api(who, '/api/auth/login', { email, password }));
}
const notified = async (who, action) => (await db.query('SELECT 1 FROM plan_notifications n JOIN ubec_events u ON u.id=n.ubec_event_id WHERE n.user_id=$1 AND n.plan_id=$2 AND u.action=$3', [users[who], planId, action])).rowCount > 0;

await db.connect();
const extraOfficers = [];
try {
  settings = (await db.query("SELECT beap_chair_submission_mode, ubec_submission_mode FROM state_workflow_settings WHERE state_code='GLOBAL'")).rows[0];
  await db.query("UPDATE state_workflow_settings SET beap_chair_submission_mode='individual_components', ubec_submission_mode='reviewed_components' WHERE state_code='GLOBAL'");
  savedDefaults = (await db.query('SELECT * FROM ubec_default_officers')).rows;
  await db.query('DELETE FROM ubec_default_officers');
  await user('desP', 'Data Entry Staff', ['physical']); await user('dirP', 'Director', ['physical']);
  await user('subebChair', 'Director', ['planning'], { chair: true }); await user('ec', 'Executive Chairman', []);
  const u = { state: 'UBEC' };
  await user('chair', 'UBEC BEAP Chair', [], u); await user('dpp', 'UBEC Director', ['physical'], u); await user('offP', 'UBEC Assessment Officer', ['physical'], u);
  for (const d of ['audit', 'procurement', 'finance']) await user(d, 'UBEC Oversight Director', [d], u);
  await user('auditOff1', 'UBEC Assessment Officer', ['audit'], u); await user('auditOff2', 'UBEC Assessment Officer', ['audit'], u);
  await user('finOff', 'UBEC Assessment Officer', ['finance'], u);

  const rat = new ExcelJS.Workbook(); rat.addWorksheet('RAT').addRow(['UBEC oversight QA']);
  const form = new FormData();
  form.set('setup', JSON.stringify({ planningYear: 2026, implementationYear: 2026, quarters: [1, 2, 3, 4], stateLodgment: '100000000', fundingSources: [] }));
  form.append('rat', new Blob([await rat.xlsx.writeBuffer()]), 'rat.xlsx');
  planId = ok(await api('ec', '/api/plans', form), 201).plan.id;
  const q = `?plan=${planId}`, statePath = `/api/plans/review${q}`, path = `/api/ubec/review${q}`, components = `/api/ubec/components${q}`, comments = `/api/ubec/comments${q}`;
  ok(await api('desP', `/api/activities${q}&workstream=monitoring`, { workstream: 'monitoring', entity: 'line', action: 'create', activity: 0, description: 'QA monitoring visit', quantity: 1, unitCost: 1000, strategy: 'Request for quotation', targetGroup: 'Schools' }));
  const line = String((await db.query("SELECT id FROM activity_plan_lines WHERE plan_id=$1 AND workstream='monitoring'", [planId])).rows[0].id);
  const stateStep = async (who, action) => { const version = ok(await api('ec', statePath)).plan.version; ok(await api(who, statePath, { action, pillar: 'monitoring', version })); };
  await stateStep('desP', 'submit'); await stateStep('dirP', 'endorse'); await stateStep('subebChair', 'forward');
  ok(await api('ec', path, { action: 'submit', version: ok(await api('ec', path)).plan.version }));
  const view = async who => ok(await api(who, path));
  const act = async (who, action, extra = {}) => { const v = await view('chair'); return api(who, path, { action, version: v.plan.version, roundId: v.round.id, ...extra }); };
  const step2 = async (who, action, extra = {}) => api(who, components, { action, roundId: (await view('chair')).round.id, pillar: 'monitoring', ...extra });
  ok(await act('chair', 'release', { comment: 'Please assess.' }));
  ok(await step2('dpp', 'assign_officers', { officerIds: [users.offP], comment: 'Assess monitoring.' }));
  ok(await api('offP', `/api/ubec/decisions${q}`, { roundId: (await view('chair')).round.id, pillar: 'monitoring', rowRef: line, decision: 'accept', note: '' }, 'PUT'));
  ok(await step2('offP', 'complete_assessment', { note: 'Done.' }));
  fails(await step2('audit', 'assign_observers', { officerIds: [users.auditOff1], comment: 'early' }), 409, /not been sent for oversight/);
  ok(await step2('dpp', 'send_oversight', { comment: 'Assessed.' }));
  step('a plan reaches oversight (assigning oversight officers before then is refused)');

  assert.notEqual((await api('auditOff1', path)).status, 200, 'an unassigned oversight officer cannot open the plan');
  fails(await step2('dpp', 'assign_observers', { officerIds: [users.auditOff1], comment: 'x' }), 403);
  fails(await step2('procurement', 'assign_observers', { officerIds: [users.auditOff1], comment: 'x' }), 400, /Procurement/);
  fails(await step2('audit', 'assign_observers', { officerIds: [users.offP], comment: 'x' }), 400, /Audit/);
  fails(await step2('audit', 'assign_observers', { officerIds: [users.auditOff1] }), 400, /comment/);
  const auditView = (await view('audit')).flow;
  assert.deepEqual(auditView.abilities.assignObservers, ['monitoring']);
  assert.deepEqual(auditView.officers.map(o => o.id).sort(), [users.auditOff1, users.auditOff2].sort(), 'the Oversight Director picks from their own officers');
  assert.equal(auditView.defaultOfficers.monitoring, undefined, 'two officers: nobody is pre-ticked');
  assert.deepEqual((await view('finance')).flow.defaultOfficers.monitoring, [users.finOff], 'one officer per unit is pre-ticked by default');
  ok(await step2('audit', 'assign_observers', { officerIds: [users.auditOff1, users.auditOff2], comment: 'Check the receipts.' }));
  fails(await step2('audit', 'assign_observers', { officerIds: [users.auditOff1], comment: 'again' }), 409, /already assigned/);
  assert.ok(await notified('auditOff1', 'assign_observer') && await notified('auditOff2', 'assign_observer'), 'assigned officers are notified');
  step('only the Oversight Director assigns, only their own department\'s officers, with a comment; a single officer is pre-ticked; officers are notified');

  const officerView = await view('auditOff1');
  assert.deepEqual(officerView.flow.abilities.comment, ['monitoring']);
  assert.deepEqual(officerView.flow.abilities.assess, []);
  assert.equal(officerView.flow.components[0].observers.length, 2);
  fails(await api('auditOff1', `/api/ubec/decisions${q}`, { roundId: officerView.round.id, pillar: 'monitoring', rowRef: line, decision: 'reject', note: '' }, 'PUT'), 403);
  fails(await step2('auditOff1', 'complete_assessment', { note: 'x' }), 409);
  fails(await step2('auditOff1', 'observations_done', { note: 'x' }), 403);
  const thread = ok(await api('auditOff1', comments, { sheet: 'monitoring', rowRef: line, columnId: 'amount', body: 'AUDIT OFFICER: where are the receipts?' }), 201).id;
  assert.ok(ok(await api('auditOff1', '/api/ubec/dashboard')).queue.some(i => i.planId === planId && i.kind === 'observe'), 'the officer has the component in their queue');
  step('oversight officers see the component and comment, but cannot accept, reject, complete or finish observations');

  const auditOff2Assignment = (await view('audit')).flow.components[0].observers.find(o => o.officerId === users.auditOff2).id;
  fails(await step2('finance', 'unassign_observer', { assignmentId: auditOff2Assignment }), 404);
  ok(await step2('audit', 'unassign_observer', { assignmentId: auditOff2Assignment }));
  assert.notEqual((await api('auditOff2', path)).status, 200, 'a removed officer no longer sees the plan');
  step('the Oversight Director removes their own officer (not another department\'s); the officer loses access');

  for (const who of ['audit', 'procurement', 'finance']) ok(await step2(who, 'observations_done', { note: `${who} observed` }));
  fails(await step2('audit', 'assign_observers', { officerIds: [users.auditOff2], comment: 'late' }), 409, /reached the UBEC BEAP Chair/);
  const ready = await view('chair');
  assert.equal(ready.flow.openOversightComments, 1); assert.equal(ready.flow.approvable, false);
  fails(await act('chair', 'approve', { comment: 'Approve' }), 409, /Resolve the 1 open comment from Audit, Procurement and Finance/);
  step('with the component at the UBEC BEAP Chair, an open oversight comment blocks approval');

  ok(await api('dpp', comments, { id: thread, action: 'resolve' }, 'PATCH'));
  assert.equal((await view('chair')).flow.approvable, true);
  ok(await act('chair', 'approve', { comment: 'Approved by UBEC.' }));
  step('once the comment is resolved the plan is approved');

  const team = ok(await api('audit', '/api/ubec/officers'));
  assert.deepEqual(team.departments, ['audit']); assert.equal(team.officers.length, 2);
  for (const n of [1, 2]) {
    const email = `extra${n}.${marker}@ubec.gov.ng`.toLowerCase();
    extraOfficers.push(ok(await api('audit', '/api/ubec/officers', { name: `QA extra ${n}`, roleTitle: `QA Audit Officer ${n}`, email }), 201).id);
  }
  fails(await api('audit', '/api/ubec/officers', { name: 'Wrong department', roleTitle: 'QA wrong', email: `wrong.${marker}@ubec.gov.ng`.toLowerCase(), department: 'finance' }), 403);
  step('Oversight Directors add officers to their own department on the Officers page, with no limit');
  console.log(`\nPASS: ${passed} UBEC oversight officer checks`);
} finally {
  if (settings) await db.query("UPDATE state_workflow_settings SET beap_chair_submission_mode=$1, ubec_submission_mode=$2 WHERE state_code='GLOBAL'", [settings.beap_chair_submission_mode, settings.ubec_submission_mode]);
  for (const r of savedDefaults ?? []) await db.query('INSERT INTO ubec_default_officers(pillar,officer_id,updated_by_name,updated_at) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING', [r.pillar, r.officer_id, r.updated_by_name, r.updated_at]);
  if (planId) {
    await db.query('DELETE FROM plan_comments WHERE plan_id=$1', [planId]);
    await db.query('DELETE FROM plan_notifications WHERE plan_id=$1', [planId]);
    await db.query('DELETE FROM ubec_events WHERE plan_id=$1', [planId]);
    await db.query('DELETE FROM ubec_rounds WHERE plan_id=$1', [planId]);
    for (const t of ['plan_review_events', 'plan_submissions', 'plan_pillar_reviews', 'activity_plan_lines']) await db.query(`DELETE FROM ${t} WHERE plan_id=$1`, [planId]);
    await db.query('DELETE FROM action_plans WHERE id=$1', [planId]);
  }
  const ids = [...Object.values(users), ...extraOfficers];
  if (ids.length) {
    await db.query('DELETE FROM user_management_events WHERE actor_id=ANY($1::int[]) OR target_id=ANY($1::int[])', [ids]);
    await db.query('DELETE FROM sessions WHERE user_id=ANY($1::int[])', [ids]);
    await db.query('DELETE FROM user_departments WHERE user_id=ANY($1::int[])', [ids]);
    await db.query('DELETE FROM users WHERE id=ANY($1::int[])', [ids]);
  }
  await db.end();
}
