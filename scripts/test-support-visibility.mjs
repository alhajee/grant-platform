// UBEC217/218/234: the SUBEB support departments (Audit, Procurement, Finance, Special Programmes) see every component
// of their state's plans in real time (no stage gate) and read-only: no edits, no send steps, no comments. Their
// dashboard shows the plan's figures. The plan's schools list (GET /api/plans/schools) follows the same visibility.
// Usage: node --env-file=.env scripts/test-support-visibility.mjs [baseUrl]   (local only; throwaway state, users and plan; cleans up)
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { withProformas } from './test-support/proformas.mjs';
import { hashSync } from 'bcryptjs';
import ExcelJS from 'exceljs';

const base = process.argv[2] ?? process.env.TEST_BASE_URL ?? process.env.UBEC_TEST_URL ?? 'http://localhost:5173';
assert.match(base, /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/, 'Run this test against a local server only.');
assert.ok(['localhost', '127.0.0.1'].includes(new URL(process.env.DATABASE_URL).hostname), 'Use a local database only.');
const marker = `SV${randomUUID().slice(0, 8).toUpperCase()}`, password = randomUUID();
const db = new Client({ connectionString: process.env.DATABASE_URL });
const cookies = {}, users = {};
let planId, schoolId, fullAllocation, passed = 0;
const step = message => { passed++; console.log('✓', message); };
const email = who => `${who}.${marker}@support.test`.toLowerCase();

async function api(who, path, body, method = body ? 'POST' : 'GET') {
  await withProformas(db, path, body);
  const isForm = body instanceof FormData;
  const response = await fetch(base + path, { method, headers: { Origin: base, ...(body && !isForm ? { 'Content-Type': 'application/json' } : {}), ...(cookies[who] ? { Cookie: cookies[who] } : {}) }, ...(body ? { body: isForm ? body : JSON.stringify(body) } : {}) });
  const data = (response.headers.get('content-type') ?? '').includes('json') ? await response.json() : {};
  if (path === '/api/auth/login' && response.ok) cookies[who] = response.headers.get('set-cookie').split(';')[0];
  return { status: response.status, data };
}
const ok = (r, status = 200) => { assert.equal(r.status, status, JSON.stringify(r.data)); return r.data; };
const fails = (r, status, pattern) => { assert.equal(r.status, status, JSON.stringify(r.data)); if (pattern) assert.match(r.data.error ?? '', pattern); return r.data; };
async function user(who, role, departments, { state = marker, chair = false } = {}) {
  const id = (await db.query('INSERT INTO users(email,full_name,role,department,state_code,password_hash,is_beap_chair) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id', [email(who), `QA ${who}`, role, departments[0] ?? null, state, hashSync(password, 4), chair])).rows[0].id;
  users[who] = id;
  for (const department of departments) await db.query('INSERT INTO user_departments(user_id,department) VALUES($1,$2)', [id, department]);
  ok(await api(who, '/api/auth/login', { email: email(who), password }));
}

await db.connect();
try {
  // Full use of allocations (UBEC79) is switched off for the run: the test sends a small line.
  fullAllocation = (await db.query("SELECT full_allocation_required FROM state_workflow_settings WHERE state_code='GLOBAL'")).rows[0]?.full_allocation_required;
  await db.query("UPDATE state_workflow_settings SET full_allocation_required=FALSE WHERE state_code='GLOBAL'");
  await user('ec', 'Executive Chairman', []); await user('chair', 'Director', ['planning'], { chair: true });
  await user('desM', 'Data Entry Staff', ['physical']); await user('dirM', 'Director', ['physical']);
  await user('finance', 'Data Entry Staff', ['finance']); await user('procurement', 'Director', ['procurement']);
  await user('audit', 'Data Entry Staff', ['audit']); await user('special', 'Director', ['special']);
  await user('desMfinance', 'Data Entry Staff', ['physical', 'finance']);
  await user('otherFinance', 'Data Entry Staff', ['finance'], { state: `${marker.slice(0, 9)}Y` });
  await user('ubecFinance', 'UBEC Oversight Director', ['finance'], { state: 'UBEC' });

  const rat = new ExcelJS.Workbook(); rat.addWorksheet('RAT').addRow(['Support QA']);
  const form = new FormData();
  form.set('setup', JSON.stringify({ planningYear: 2026, implementationYear: 2026, quarters: [1, 2, 3, 4], stateLodgment: '100000000', fundingSources: [] }));
  form.append('rat', new Blob([await rat.xlsx.writeBuffer()]), 'rat.xlsx');
  planId = ok(await api('ec', '/api/plans', form), 201).plan.id;
  const q = `?plan=${planId}`, reviewPath = `/api/plans/review${q}`, comments = `/api/plans/comments${q}`;
  const lineBody = { workstream: 'monitoring', entity: 'line', action: 'create', activity: 0, description: 'QA monitoring visit', quantity: 2, unitCost: 1000, strategy: 'Request for quotation', targetGroup: 'Schools' };
  ok(await api('desM', `/api/activities${q}&workstream=monitoring`, lineBody));
  const line = String((await db.query("SELECT id FROM activity_plan_lines WHERE plan_id=$1 AND workstream='monitoring'", [planId])).rows[0].id);

  // Real time: a draft line is visible to every support department at once; the BEAP Chair waits for the send.
  for (const who of ['finance', 'procurement', 'audit', 'special']) {
    const view = ok(await api(who, reviewPath));
    assert.equal(view.pillarReviews.length, 11, `${who} sees every component card`);
    assert.ok(view.visiblePillars.includes('monitoring'), `${who} sees the draft Monitoring line`);
    assert.equal(view.snapshot.monitoring.length, 1);
  }
  const chairView = ok(await api('chair', reviewPath));
  assert.ok(!chairView.visiblePillars.includes('monitoring'), 'the BEAP Chair still waits for the send');
  assert.ok(chairView.snapshot.setup, 'the plan setup (allocations, UBEC235) still reaches the BEAP Chair');
  fails(await api('otherFinance', reviewPath), 404);
  step('support departments see every component of their state in real time (other states do not; the BEAP Chair still waits)');

  const dashboard = ok(await api('finance', '/api/plans')).plans.find(p => p.id === planId);
  assert.equal(dashboard.budget, 2000); assert.equal(dashboard.monitoringBudget, 2000); assert.equal(dashboard.lineCount, 1);
  assert.equal(ok(await api('chair', '/api/plans')).plans.find(p => p.id === planId).budget, 0);
  step('the support departments’ dashboard shows the plan’s figures (UBEC218)');

  const editor = ok(await api('finance', `/api/activities${q}&workstream=monitoring`));
  assert.equal(editor.canEdit, false); assert.equal(editor.lines.length, 1);
  fails(await api('finance', `/api/activities${q}&workstream=monitoring`, lineBody), 403);
  fails(await api('procurement', reviewPath, { action: 'submit', pillar: 'monitoring', version: chairView.plan.version }), 403);
  assert.equal(ok(await api('desMfinance', `/api/activities${q}&workstream=monitoring`)).canEdit, true, 'a user also holding the component keeps editing it');
  step('read-only: the editor opens with canEdit false, saves and send steps are refused');

  ok(await api('desM', reviewPath, { action: 'submit', pillar: 'monitoring', version: ok(await api('ec', reviewPath)).plan.version }));
  const thread = ok(await api('dirM', comments, { sheet: 'monitoring', rowRef: line, columnId: null, body: 'Attach the quotation' }), 201).id;
  const read = ok(await api('finance', comments));
  assert.ok(read.threads.some(t => t.id === thread), 'they read the threads');
  assert.deepEqual(read.abilities.monitoring, { start: false, reply: false, resolveAny: false, reopen: false });
  for (const who of ['finance', 'procurement']) {
    fails(await api(who, comments, { sheet: 'monitoring', rowRef: line, columnId: 'quantity', body: 'x' }), 403);
    fails(await api(who, comments, { parentId: thread, body: 'x' }), 403);
    fails(await api(who, comments, { id: thread, action: 'resolve' }, 'PATCH'), 403);
  }
  ok(await api('desMfinance', comments, { parentId: thread, body: 'Done' }), 201);
  step('they read comments but never start, reply to or resolve them');

  schoolId = (await db.query("INSERT INTO schools(name,lga,level,location,state_code) VALUES($1,'QA LGA','JSS','Urban',$2) RETURNING id", [`QA Support School ${marker}`, marker])).rows[0].id;
  await db.query("INSERT INTO tlm_distribution(plan_id,school_id,workstream) VALUES($1,$2,'tlm')", [planId, schoolId]);
  const list = ok(await api('finance', `/api/plans/schools?plans=${planId}`));
  assert.equal(list.schools.length, 1); assert.deepEqual(list.schools[0].uses, [{ kind: 'beneficiary', label: 'TLM distribution' }]);
  assert.equal(list.schools[0].intervened, false);
  assert.equal(ok(await api('chair', `/api/plans/schools?plans=${planId}`)).schools.length, 0, 'TLM has not reached the BEAP Chair');
  assert.equal(ok(await api('ec', '/api/plans/schools')).plans >= 1, true);
  fails(await api('finance', '/api/plans/schools?plans=abc'), 400);
  fails(await api('ubecFinance', '/api/plans/schools'), 403);
  assert.equal(ok(await api('otherFinance', `/api/plans/schools?plans=${planId}`)).plans, 0, 'another state reads none of this plan');
  step('the dashboard schools list (UBEC234) follows the same visibility and stays within the state');
  console.log(`\nPASS: ${passed} support department checks`);
} finally {
  if (fullAllocation !== undefined) await db.query("UPDATE state_workflow_settings SET full_allocation_required=$1 WHERE state_code='GLOBAL'", [fullAllocation]);
  if (planId) {
    await db.query('DELETE FROM plan_comments WHERE plan_id=$1', [planId]);
    await db.query('DELETE FROM plan_notifications WHERE plan_id=$1', [planId]);
    for (const t of ['tlm_distribution', 'plan_review_events', 'plan_submissions', 'plan_pillar_reviews', 'activity_plan_lines', 'plan_documents']) await db.query(`DELETE FROM ${t} WHERE plan_id=$1`, [planId]);
    await db.query('DELETE FROM action_plans WHERE id=$1', [planId]);
  }
  if (schoolId) await db.query('DELETE FROM schools WHERE id=$1', [schoolId]);
  const ids = Object.values(users);
  if (ids.length) {
    await db.query('DELETE FROM sessions WHERE user_id=ANY($1::int[])', [ids]);
    await db.query('DELETE FROM user_departments WHERE user_id=ANY($1::int[])', [ids]);
    await db.query('DELETE FROM users WHERE id=ANY($1::int[])', [ids]);
  }
  await db.end();
}
