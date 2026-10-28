// UBEC130 (migration 073): SUBEB Procurement and Finance departments, and the plan's Finance documents. Finance uploads
// the bank statement, notification of lodgement and 50% utilisation report, then submits them to the BEAP Chair (who is
// notified); the BEAP Chair and Executive Chairman can read them; nobody else at the SUBEB can. At UBEC only the Finance
// Oversight Director and Finance Assessment Officers see them. Finance can still upload once the plan is with UBEC.
// Usage: node --env-file=.env scripts/test-finance-documents.mjs [baseUrl]   (local only; throwaway state, users and plan; cleans up)
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { hashSync } from 'bcryptjs';
import ExcelJS from 'exceljs';

const base = process.argv[2] ?? process.env.TEST_BASE_URL ?? process.env.UBEC_TEST_URL ?? 'http://localhost:5173';
assert.match(base, /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/, 'Run this test against a local server only.');
assert.ok(['localhost', '127.0.0.1'].includes(new URL(process.env.DATABASE_URL).hostname), 'Use a local database only.');
const marker = `FD${randomUUID().slice(0, 8).toUpperCase()}`, password = randomUUID();
const db = new Client({ connectionString: process.env.DATABASE_URL });
const cookies = {}, users = {}, created = [];
let planId, passed = 0;
const step = message => { passed++; console.log('✓', message); };
const email = who => `${who}.${marker}@finance.test`.toLowerCase();

async function api(who, path, body, method = body ? 'POST' : 'GET') {
  const isForm = body instanceof FormData;
  const response = await fetch(base + path, { method, headers: { Origin: base, ...(body && !isForm ? { 'Content-Type': 'application/json' } : {}), ...(cookies[who] ? { Cookie: cookies[who] } : {}) }, ...(body ? { body: isForm ? body : JSON.stringify(body) } : {}) });
  const type = response.headers.get('content-type') ?? '';
  const data = type.includes('json') ? await response.json() : { bytes: (await response.arrayBuffer()).byteLength, type };
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
const pdf = (name, text = 'QA') => { const form = new FormData(); form.set('file', new Blob([`%PDF-1.4\n${text}\n%%EOF`], { type: 'application/pdf' }), name); return form; };
const upload = (who, kind, name = `${kind}.pdf`) => { const form = pdf(name); form.set('kind', kind); return api(who, `/api/plans/finance?plan=${planId}`, form); };

await db.connect();
try {
  await user('ec', 'Executive Chairman', []); await user('beapChair', 'Director', ['planning'], { chair: true });
  await user('finance', 'Data Entry Staff', ['finance']); await user('physical', 'Data Entry Staff', ['physical']);
  const u = { state: 'UBEC' };
  await user('ubecFinance', 'UBEC Oversight Director', ['finance'], u); await user('financeOfficer', 'UBEC Assessment Officer', ['finance'], u);
  await user('auditOfficer', 'UBEC Assessment Officer', ['audit'], u); await user('ubecChair', 'UBEC BEAP Chair', [], u);

  // Users: Procurement and Finance are departments with no components; one Director each per state.
  const procurementDes = ok(await api('ec', '/api/users', { name: 'QA procurement', email: email('procurementDes'), role: 'Data Entry Staff', departments: ['procurement'], active: true }), 201);
  created.push(procurementDes.id ?? (await db.query('SELECT id FROM users WHERE email=$1', [email('procurementDes')])).rows[0].id);
  ok(await api('ec', '/api/users', { name: 'QA finance director', email: email('financeDirector'), role: 'Director', departments: ['finance'], active: true }), 201);
  created.push((await db.query('SELECT id FROM users WHERE email=$1', [email('financeDirector')])).rows[0].id);
  assert.equal((await api('ec', '/api/users', { name: 'QA second', email: email('financeDirector2'), role: 'Director', departments: ['finance'], active: true })).status, 409, 'one Finance Director per state');
  fails(await api('ec', '/api/users', { name: 'QA bad', email: email('bad'), role: 'Data Entry Staff', departments: ['finance/bank'], active: true }), 400);
  const listed = ok(await api('ec', '/api/users')).users.find(x => x.email === email('procurementDes'));
  assert.deepEqual(listed.departments, ['procurement']);
  step('the Executive Chairman adds Procurement and Finance staff (whole departments, one Director each)');

  const rat = new ExcelJS.Workbook(); rat.addWorksheet('RAT').addRow(['Finance QA']);
  const form = new FormData();
  form.set('setup', JSON.stringify({ planningYear: 2026, implementationYear: 2026, quarters: [1, 2, 3, 4], stateLodgment: '100000000', fundingSources: [] }));
  form.append('rat', new Blob([await rat.xlsx.writeBuffer()]), 'rat.xlsx');
  planId = ok(await api('ec', '/api/plans', form), 201).plan.id;
  const path = `/api/plans/finance?plan=${planId}`;

  fails(await api('physical', path), 403);
  const start = ok(await api('finance', path));
  assert.equal(start.canEdit, true); assert.deepEqual(start.missing, ['Bank statement', 'Notification of lodgement', '50% utilisation report']);
  fails(await upload('physical', 'bank_statement'), 403);
  fails(await upload('finance', 'payroll'), 400, /which Finance document/);
  const bad = new FormData(); bad.set('kind', 'bank_statement'); bad.set('file', new Blob(['not a pdf']), 'statement.pdf');
  fails(await api('finance', path, bad), 400);
  ok(await upload('finance', 'bank_statement')); ok(await upload('finance', 'lodgement_notification'));
  fails(await api('finance', path, { action: 'submit' }), 409, /50% utilisation report/);
  ok(await upload('finance', 'utilisation_report'));
  ok(await upload('finance', 'bank_statement', 'statement-v2.pdf'));
  const full = ok(await api('finance', path));
  assert.equal(full.documents.length, 3, 'a new upload replaces the earlier file of that kind');
  assert.ok(full.documents.some(d => d.name === 'statement-v2.pdf'));
  step('only Finance uploads; one file per kind (PDF/Excel/Word/images checked); submitting needs all three');

  ok(await api('finance', path, { action: 'submit' }));
  const notice = (await db.query("SELECT 1 FROM plan_notifications n JOIN plan_review_events e ON e.id=n.event_id WHERE n.user_id=$1 AND n.plan_id=$2 AND e.action='finance_submit'", [users.beapChair, planId])).rowCount;
  assert.equal(notice, 1, 'the BEAP Chair is notified');
  const chairView = ok(await api('beapChair', path));
  assert.equal(chairView.canEdit, false); assert.ok(chairView.submittedAt); assert.deepEqual(chairView.missing, []);
  const doc = chairView.documents[0];
  assert.equal(ok(await api('ec', `${path}&id=${doc.id}`)).type, 'application/pdf');
  fails(await api('physical', `${path}&id=${doc.id}`), 403);
  ok(await upload('finance', 'utilisation_report', 'utilisation-v2.pdf'));
  assert.equal(ok(await api('ec', path)).submittedAt, null, 'a change after submitting needs submitting again');
  ok(await api('finance', path, { action: 'submit' }));
  step('submitted to the BEAP Chair (notified, review history); the BEAP Chair and Executive Chairman read them; others cannot');

  fails(await api('ubecFinance', path), 403);
  await db.query("UPDATE action_plans SET status='submitted_ubec' WHERE id=$1", [planId]);
  await db.query("INSERT INTO ubec_rounds(plan_id,number,state_submission,snapshot,status,submitted_by,submitted_at) VALUES($1,1,1,'{}'::jsonb,'received',$2,NOW())", [planId, users.ec]);
  assert.equal(ok(await api('ubecFinance', path)).documents.length, 3);
  assert.equal(ok(await api('financeOfficer', path)).canEdit, false);
  assert.equal(ok(await api('financeOfficer', `${path}&id=${doc.id}`)).type, 'application/pdf');
  fails(await api('auditOfficer', path), 403); fails(await api('ubecChair', path), 403);
  // UBEC94: like the RAT tools, UBEC Finance lists every plan sent to UBEC with its Finance documents.
  const overview = ok(await api('financeOfficer', '/api/ubec/finance-documents')).plans.find(p => p.planId === planId);
  assert.deepEqual(overview.documents.map(d => d.kind).sort(), ['bank_statement', 'lodgement_notification', 'utilisation_report']); assert.deepEqual(overview.missing, []);
  fails(await api('auditOfficer', '/api/ubec/finance-documents'), 403);
  ok(await upload('finance', 'lodgement_notification', 'lodgement-v2.pdf'));
  step('at UBEC only the Finance Oversight Director and Finance Assessment Officers see them; Finance can still upload while the plan is with UBEC');
  console.log(`\nPASS: ${passed} Finance document checks`);
} finally {
  if (planId) {
    await db.query('DELETE FROM plan_notifications WHERE plan_id=$1', [planId]);
    await db.query('DELETE FROM ubec_rounds WHERE plan_id=$1', [planId]);
    for (const t of ['plan_review_events', 'plan_submissions', 'plan_pillar_reviews', 'plan_finance_documents']) await db.query(`DELETE FROM ${t} WHERE plan_id=$1`, [planId]);
    await db.query('DELETE FROM action_plans WHERE id=$1', [planId]);
  }
  const ids = [...Object.values(users), ...created];
  if (ids.length) {
    await db.query('DELETE FROM user_management_events WHERE actor_id=ANY($1::int[]) OR target_id=ANY($1::int[])', [ids]);
    await db.query('DELETE FROM sessions WHERE user_id=ANY($1::int[])', [ids]);
    await db.query('DELETE FROM user_departments WHERE user_id=ANY($1::int[])', [ids]);
    await db.query('DELETE FROM users WHERE id=ANY($1::int[])', [ids]);
  }
  await db.end();
}
