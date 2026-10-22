// Infrastructure Validation Reports (migration 069): the assigned Assessment Officer uploads one before Complete
// assessment; others cannot upload; the Director downloads it; it cannot be removed once the assessment is complete.
// A released Infrastructure round is set up directly in the database (throwaway state, users and plan; cleans up).
// Usage: node --env-file=.env scripts/test-ubec-validation-reports.mjs [baseUrl]
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { hashSync } from 'bcryptjs';

const base = process.argv[2] ?? process.env.TEST_BASE_URL ?? process.env.UBEC_TEST_URL ?? 'http://localhost:5173';
assert.match(base, /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/, 'Run this test against a local server only.');
assert.ok(['localhost', '127.0.0.1'].includes(new URL(process.env.DATABASE_URL).hostname), 'Use a local database only.');
const marker = `VR${randomUUID().slice(0, 8).toUpperCase()}`, password = randomUUID();
const db = new Client({ connectionString: process.env.DATABASE_URL });
const cookies = {}, users = {};
let planId;
const step = message => console.log('✓', message);

async function api(who, path, body, method = body ? 'POST' : 'GET') {
  const isForm = body instanceof FormData;
  const response = await fetch(base + path, { method, headers: { Origin: base, ...(body && !isForm ? { 'Content-Type': 'application/json' } : {}), ...(cookies[who] ? { Cookie: cookies[who] } : {}) }, ...(body ? { body: isForm ? body : JSON.stringify(body) } : {}) });
  const type = response.headers.get('content-type') ?? '', text = type.includes('json') ? await response.text() : '';
  let data = {}; try { data = text ? JSON.parse(text) : {}; } catch { data = { error: text.slice(0, 200) }; }
  if (path === '/api/auth/login' && response.ok) cookies[who] = response.headers.get('set-cookie').split(';')[0];
  return { status: response.status, data, type };
}
const ok = (r, status = 200) => { assert.equal(r.status, status, JSON.stringify(r.data)); return r.data; };
const fails = (r, status, pattern) => { assert.equal(r.status, status, JSON.stringify(r.data)); if (pattern) assert.match(r.data.error ?? '', pattern); };
async function user(who, role, department) {
  const email = `${who}.${marker}@ubec-validation.test`.toLowerCase();
  users[who] = (await db.query('INSERT INTO users(email,full_name,role,department,state_code,password_hash) VALUES($1,$2,$3,$4,$5,$6) RETURNING id', [email, `QA ${who}`, role, department, role.startsWith('UBEC') ? 'UBEC' : marker, hashSync(password, 4)])).rows[0].id;
  if (department && !role.startsWith('UBEC')) await db.query('INSERT INTO user_departments(user_id,department) VALUES($1,$2)', [users[who], department]);
  ok(await api(who, '/api/auth/login', { email, password }));
}
const pdf = (name = 'validation.pdf') => new File([`%PDF-1.4\n${name}\n%%EOF`], name, { type: 'application/pdf' });

async function cleanUp(plan, ids) {
  if (plan) {
    await db.query('DELETE FROM plan_notifications WHERE plan_id=$1', [plan]);
    await db.query('DELETE FROM ubec_events WHERE plan_id=$1', [plan]);
    await db.query('DELETE FROM ubec_rounds WHERE plan_id=$1', [plan]);
    await db.query('DELETE FROM action_plans WHERE id=$1', [plan]);
  }
  if (ids.length) await db.query('DELETE FROM users WHERE id=ANY($1::int[])', [ids]);
}

await db.connect();
try {
  await user('ec', 'Executive Chairman', null);
  await user('dpp', 'UBEC Director', 'physical'); await user('officer', 'UBEC Assessment Officer', 'physical'); await user('other', 'UBEC Assessment Officer', 'physical');
  planId = (await db.query("INSERT INTO action_plans(state_code,start_year,end_year,implementation_year,funding_quarters,status,submission_number) VALUES($1,2025,2025,2025,'{1,2,3,4}','ubec_review',1) RETURNING id", [marker])).rows[0].id;
  const snapshot = { infrastructure: [{ id: -1, school: { id: 1, name: 'QA School' }, construction: { name: 'New Construction' }, quantity: 1, unit_cost: '1000.00' }], sports: [] };
  const roundId = (await db.query("INSERT INTO ubec_rounds(plan_id,number,state_submission,snapshot,status,submitted_by,released_at,released_by_name) VALUES($1,1,1,$2,'reviewing',$3,NOW(),'QA chair') RETURNING id", [planId, JSON.stringify(snapshot), users.ec])).rows[0].id;
  const componentId = (await db.query("INSERT INTO ubec_round_components(round_id,pillar,department,stage,released_at) VALUES($1,'infrastructure','physical','director',NOW()) RETURNING id", [roundId])).rows[0].id;
  await db.query("INSERT INTO ubec_officer_assignments(round_component_id,officer_id,officer_name,assigned_by_id,assigned_by_name,comment) VALUES($1,$2,'QA officer',$3,'QA dpp','Please assess.')", [componentId, users.officer, users.dpp]);
  await db.query("INSERT INTO ubec_item_decisions(round_id,pillar,row_ref,decision,officer_id,officer_name) VALUES($1,'infrastructure','-1','accept',$2,'QA officer')", [roundId, users.officer]);
  const reports = `/api/ubec/validation-reports?plan=${planId}`, components = `/api/ubec/components?plan=${planId}`;
  const upload = (who, file = pdf(), pillar = 'infrastructure') => { const form = new FormData(); form.set('roundId', String(roundId)); form.set('pillar', pillar); form.set('file', file); return api(who, reports, form); };

  fails(await api('officer', components, { action: 'complete_assessment', roundId, pillar: 'infrastructure' }), 409, /Validation Report/);
  step('Complete assessment on Infrastructure is refused without a Validation Report');

  fails(await upload('other'), 403, /not assigned/);
  fails(await upload('dpp'), 403, /Assessment Officer/);
  fails(await upload('officer', new File(['not a pdf'], 'report.pdf', { type: 'application/pdf' })), 400, /valid PDF/);
  fails(await upload('officer', pdf(), 'sports'), 400, /does not take/);
  const first = ok(await upload('officer'));
  const second = ok(await upload('officer', pdf('photos.pdf')));
  step('only the assigned officer uploads, files are checked, Infrastructure only');

  const flow = ok(await api('dpp', `/api/ubec/review?plan=${planId}`)).flow;
  const listed = flow.components.find(c => c.pillar === 'infrastructure').validationReports;
  assert.deepEqual(listed.map(r => r.id).sort(), [first.id, second.id].sort()); assert.equal(listed[0].officerId, users.officer);
  const download = await api('dpp', `${reports}&id=${first.id}`);
  assert.equal(download.status, 200); assert.match(download.type, /application\/pdf/);
  fails(await api('ec', `${reports}&id=${first.id}`), 404);
  step('the Director sees and downloads the reports; a state user cannot');

  fails(await api('other', `${reports}&id=${second.id}`, undefined, 'DELETE'), 404);
  ok(await api('officer', `${reports}&id=${second.id}`, undefined, 'DELETE'));
  ok(await api('officer', components, { action: 'complete_assessment', roundId, pillar: 'infrastructure' }));
  fails(await api('officer', `${reports}&id=${first.id}`, undefined, 'DELETE'), 409, /already completed/);
  fails(await upload('officer'), 409, /already completed/);
  step('the officer removes their own report, completes with one, and nothing changes afterwards');
  console.log('PASS: Infrastructure Validation Reports.');
} finally {
  await cleanUp(planId, Object.values(users));
  await db.end();
}
