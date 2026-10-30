// Observations before sending to UBEC (bug sheet row 156, migration 075; UBEC168/194, migration 085): the Executive
// Chairman may ask any of the SUBEB's own Audit, Procurement, Finance and Special Programmes for observations; they see the
// whole working plan, comment per activity (tagged with their department) and their Director sends them back; the SUBEB
// sees a department's comments only once sent back, replies to them (the department resolves them, UBEC193), and cannot
// send to UBEC while a department asked has not replied or an observation is open. Requests can be repeated (earlier
// comments stay); other states and UBEC do not see them; the formal UBEC review never shows them.
// Usage: node --env-file=.env scripts/test-observation-requests.mjs [baseUrl]   (local only; throwaway state, users and plan; cleans up)
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { hashSync } from 'bcryptjs';
import ExcelJS from 'exceljs';

const base = process.argv[2] ?? process.env.TEST_BASE_URL ?? process.env.UBEC_TEST_URL ?? 'http://localhost:5173';
assert.match(base, /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/, 'Run this test against a local server only.');
assert.ok(['localhost', '127.0.0.1'].includes(new URL(process.env.DATABASE_URL).hostname), 'Use a local database only.');
const marker = `OB${randomUUID().slice(0, 8).toUpperCase()}`, password = randomUUID();
const db = new Client({ connectionString: process.env.DATABASE_URL });
const cookies = {}, users = {};
let settings, planId, passed = 0;
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
  const email = `${who}.${marker}@observations.test`.toLowerCase();
  const id = (await db.query('INSERT INTO users(email,full_name,role,department,state_code,password_hash,is_beap_chair) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id', [email, `QA ${who}`, role, departments[0] ?? null, state, hashSync(password, 4), chair])).rows[0].id;
  users[who] = id;
  for (const department of departments) await db.query('INSERT INTO user_departments(user_id,department) VALUES($1,$2)', [id, department]);
  ok(await api(who, '/api/auth/login', { email, password }));
}
const notified = async (who, action) => (await db.query('SELECT 1 FROM plan_notifications n JOIN plan_review_events e ON e.id=n.event_id WHERE n.user_id=$1 AND n.plan_id=$2 AND e.action=$3', [users[who], planId, action])).rowCount > 0;

await db.connect();
try {
  settings = (await db.query("SELECT beap_chair_submission_mode, ubec_submission_mode FROM state_workflow_settings WHERE state_code='GLOBAL'")).rows[0];
  await db.query("UPDATE state_workflow_settings SET beap_chair_submission_mode='individual_components', ubec_submission_mode='reviewed_components' WHERE state_code='GLOBAL'");
  await user('desP', 'Data Entry Staff', ['physical']); await user('dirP', 'Director', ['physical']);
  await user('subebChair', 'Director', ['planning'], { chair: true }); await user('ec', 'Executive Chairman', []);
  const u = { state: 'UBEC' };
  await user('chair', 'UBEC BEAP Chair', [], u); await user('dpp', 'UBEC Director', ['physical'], u);
  await user('ubecAudit', 'UBEC Oversight Director', ['audit'], u);
  // The SUBEB's own oversight departments (UBEC168): a Director each, and a Data Entry Officer in Audit.
  for (const d of ['audit', 'procurement', 'finance']) await user(d, 'Director', [d]);
  await user('auditOff', 'Data Entry Staff', ['audit']);
  await user('otherAudit', 'Director', ['audit'], { state: `${marker.slice(0, 9)}Y` });

  const rat = new ExcelJS.Workbook(); rat.addWorksheet('RAT').addRow(['Observation QA']);
  const form = new FormData();
  form.set('setup', JSON.stringify({ planningYear: 2026, implementationYear: 2026, quarters: [1, 2, 3, 4], stateLodgment: '100000000', fundingSources: [] }));
  form.append('rat', new Blob([await rat.xlsx.writeBuffer()]), 'rat.xlsx');
  planId = ok(await api('ec', '/api/plans', form), 201).plan.id;
  const q = `?plan=${planId}`, statePath = `/api/plans/review${q}`, requestPath = `/api/plans/observations${q}`, ubecPath = `/api/ubec/observations${q}`, ubecComments = `/api/ubec/observations/comments${q}`, stateComments = `/api/plans/comments${q}`;
  ok(await api('desP', `/api/activities${q}&workstream=monitoring`, { workstream: 'monitoring', entity: 'line', action: 'create', activity: 0, description: 'QA monitoring visit', quantity: 1, unitCost: 1000, strategy: 'Request for quotation', targetGroup: 'Schools' }));
  const line = String((await db.query("SELECT id FROM activity_plan_lines WHERE plan_id=$1 AND workstream='monitoring'", [planId])).rows[0].id);
  const version = async () => ok(await api('ec', statePath)).plan.version;
  const ask = async (who, departments, comment = '') => api(who, requestPath, { action: 'request', departments, comment, version: await version() });

  fails(await ask('ec', ['audit']), 409, /BEAP Chair has sent the plan/);
  for (const [who, action] of [['desP', 'submit'], ['dirP', 'endorse'], ['subebChair', 'forward']]) ok(await api(who, statePath, { action, pillar: 'monitoring', version: await version() }));
  let status = ok(await api('ec', requestPath));
  assert.equal(status.canRequest, true); assert.equal(status.problem, null);
  assert.equal(ok(await api('ec', `/api/ubec/review${q}`)).canSubmit, true, 'asking is optional: the plan can go straight to UBEC');
  fails(await ask('subebChair', ['audit']), 403);
  fails(await ask('ec', []), 400);
  step('the request is optional, only the Executive Chairman asks, and only once the plan has reached them');

  ok(await ask('ec', ['audit', 'finance'], 'Please check the costs'), 201);
  for (const who of ['audit', 'finance', 'auditOff']) assert.ok(await notified(who, 'observation_request'), `${who} is notified`);
  for (const who of ['procurement', 'chair', 'ubecAudit', 'otherAudit']) assert.equal(await notified(who, 'observation_request'), false, `${who} is not asked`);
  fails(await ask('ec', ['special']), 409, /not sent back/);
  fails(await ask('ec', ['procurement']), 409, /not sent back/);
  status = ok(await api('ec', requestPath));
  assert.match(status.problem, /Waiting for observations from SUBEB Audit and Finance/);
  assert.equal(ok(await api('ec', statePath)).observationProblem, status.problem);
  assert.equal(ok(await api('ec', `/api/ubec/review${q}`)).canSubmit, false);
  fails(await api('ec', `/api/ubec/review${q}`, { action: 'submit', version: await version() }), 409, /Waiting for observations/);
  step('the Executive Chairman picks the SUBEB departments; those asked are notified (not UBEC, not other states); sending to UBEC waits for them');

  const detail = ok(await api('audit', ubecPath));
  assert.ok(detail.snapshot.monitoring.length === 1, 'they see the whole working plan');
  assert.deepEqual(detail.abilities, { comment: true, sendBack: true });
  assert.deepEqual(ok(await api('auditOff', ubecPath)).abilities, { comment: true, sendBack: false });
  fails(await api('chair', ubecPath), 404); fails(await api('ubecAudit', ubecPath), 404); fails(await api('otherAudit', ubecPath), 404);
  fails(await api('procurement', ubecPath), 404);
  fails(await api('dpp', ubecPath), 403); fails(await api('desP', ubecPath), 403);
  assert.ok(ok(await api('finance', '/api/ubec/observations')).plans.some(p => p.planId === planId));
  step('the SUBEB departments asked see the whole plan; Data Entry comments, only the Director sends back; UBEC, other states and other departments cannot');

  const auditThread = ok(await api('auditOff', ubecComments, { sheet: 'monitoring', rowRef: line, columnId: null, body: 'AUDIT: receipts for this visit?' }), 201).id;
  fails(await api('audit', ubecComments, { sheet: 'monitoring', rowRef: line, columnId: null, body: 'second' }), 409, /already has an open comment/);
  ok(await api('finance', ubecComments, { sheet: 'monitoring', rowRef: line, columnId: null, body: 'FINANCE: unit cost looks high' }), 201);
  fails(await api('chair', ubecComments, { sheet: 'monitoring', rowRef: line, columnId: null, body: 'x' }), 404);
  fails(await api('otherAudit', ubecComments, { sheet: 'monitoring', rowRef: line, columnId: null, body: 'x' }), 404);
  assert.equal(ok(await api('audit', ubecComments)).threads.length, 1, 'each department reads its own observations');
  fails(await api('chair', ubecComments), 404);
  assert.equal(ok(await api('ec', stateComments)).threads.filter(t => t.scope === 'observation').length, 0, 'the SUBEB sees nothing until a department sends back');
  step('each department comments per activity (one open thread per department per row); the SUBEB does not see them yet');

  fails(await api('auditOff', ubecPath, { action: 'done', note: '' }), 403);
  ok(await api('audit', ubecPath, { action: 'done', note: 'One question on receipts' }));
  fails(await api('audit', ubecPath, { action: 'done', note: '' }), 409, /already sent/);
  fails(await api('auditOff', ubecComments, { sheet: 'monitoring', rowRef: line, columnId: 'amount', body: 'late' }), 409, /no open request/);
  ok(await api('auditOff', ubecComments, { parentId: auditThread, body: 'Replying after sending back' }), 201); // UBEC193: answers continue
  assert.ok(await notified('ec', 'observation_return'));
  let threads = ok(await api('ec', stateComments)).threads.filter(t => t.scope === 'observation');
  assert.deepEqual(threads.map(t => t.department), ['audit'], 'Audit’s observations reach the plan; Finance’s are still with Finance');
  assert.match(ok(await api('ec', requestPath)).problem, /Waiting for observations from SUBEB Finance/);
  ok(await api('finance', ubecPath, { action: 'done', note: '' }));
  status = ok(await api('ec', requestPath));
  assert.equal(status.openComments, 2); assert.match(status.problem, /Resolve the 2 open observations/);
  fails(await api('ec', `/api/ubec/review${q}`, { action: 'submit', version: await version() }), 409, /Resolve the 2 open observations/);
  step('the department Director sends back; the Executive Chairman is notified; open observations then block sending to UBEC');

  threads = ok(await api('ec', stateComments)).threads.filter(t => t.scope === 'observation');
  ok(await api('desP', stateComments, { parentId: threads[0].id, body: 'Receipts are attached' }), 201);
  // UBEC193: the SUBEB replies; only the Oversight Department that made an observation resolves it.
  for (const who of ['desP', 'ec']) fails(await api(who, stateComments, { id: threads[0].id, action: 'resolve' }, 'PATCH'), 403, /made this observation resolves it/);
  fails(await api('ec', stateComments, { id: threads[0].id, action: 'reopen' }, 'PATCH'), 403, /Only UBEC/);
  for (const thread of threads) ok(await api(thread.department, ubecComments, { id: thread.id, action: 'resolve' }, 'PATCH'));
  assert.equal(ok(await api('ec', requestPath)).problem, null);
  step('the SUBEB replies but cannot resolve; the department resolves its observations after sending them back (UBEC193)');

  ok(await ask('ec', ['procurement'], 'One more look, please'), 201);
  status = ok(await api('ec', requestPath));
  assert.equal(status.requests.length, 2); assert.equal(ok(await api('ec', stateComments)).threads.filter(t => t.scope === 'observation').length, 2, 'earlier observations stay visible');
  ok(await api('procurement', ubecPath, { action: 'done', note: 'Nothing further' }));
  assert.equal(ok(await api('ec', requestPath)).problem, null);
  ok(await api('ec', `/api/ubec/review${q}`, { action: 'submit', version: await version() }));
  step('the Executive Chairman can ask again; earlier observations stay; once all is in and resolved the plan goes to UBEC');

  fails(await api('audit', ubecPath), 409, /sent to UBEC/);
  assert.ok(!ok(await api('audit', '/api/ubec/observations')).plans.some(p => p.planId === planId));
  assert.equal(ok(await api('audit', '/api/ubec/observations')).audience, 'subeb');
  ok(await api('chair', `/api/ubec/review${q}`, { action: 'release', version: await version(), roundId: ok(await api('chair', `/api/ubec/review${q}`)).round.id, comment: 'Please assess.' }));
  assert.equal(ok(await api('chair', `/api/ubec/comments${q}`)).threads.length, 0, 'the observations are not part of the UBEC review');
  step('once sent, the observations are not part of the UBEC review');
  console.log(`\nPASS: ${passed} observation request checks`);
} finally {
  if (settings) await db.query("UPDATE state_workflow_settings SET beap_chair_submission_mode=$1, ubec_submission_mode=$2 WHERE state_code='GLOBAL'", [settings.beap_chair_submission_mode, settings.ubec_submission_mode]);
  if (planId) {
    await db.query('DELETE FROM plan_comments WHERE plan_id=$1', [planId]);
    await db.query('DELETE FROM plan_notifications WHERE plan_id=$1', [planId]);
    await db.query('DELETE FROM ubec_round_components WHERE round_id IN (SELECT id FROM ubec_rounds WHERE plan_id=$1)', [planId]);
    await db.query('DELETE FROM ubec_events WHERE plan_id=$1', [planId]);
    await db.query('DELETE FROM ubec_rounds WHERE plan_id=$1', [planId]);
    for (const t of ['plan_observation_requests', 'plan_review_events', 'plan_submissions', 'plan_pillar_reviews', 'activity_plan_lines', 'plan_documents']) await db.query(`DELETE FROM ${t} WHERE plan_id=$1`, [planId]);
    await db.query('DELETE FROM action_plans WHERE id=$1', [planId]);
  }
  const ids = Object.values(users);
  if (ids.length) {
    await db.query('DELETE FROM sessions WHERE user_id=ANY($1::int[])', [ids]);
    await db.query('DELETE FROM user_departments WHERE user_id=ANY($1::int[])', [ids]);
    await db.query('DELETE FROM users WHERE id=ANY($1::int[])', [ids]);
  }
  await db.end();
}
