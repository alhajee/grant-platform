// UBEC79 (migration 076): with "Full use of allocations" on, a component is sent only once its items use its whole
// allocation (guide shares such as Curriculum's 60/20/10/10 need not be used in full, UBEC162); with it off, as before.
// The checks run at every send step; the plan page reads the same rule (`fullAllocation` in GET /api/plans/review).
// Usage: node --env-file=.env scripts/test-full-allocation.mjs [baseUrl]   (local only; throwaway state, users and plan; cleans up)
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { hashSync } from 'bcryptjs';
import ExcelJS from 'exceljs';

const base = process.argv[2] ?? process.env.TEST_BASE_URL ?? process.env.UBEC_TEST_URL ?? 'http://localhost:5173';
assert.match(base, /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/, 'Run this test against a local server only.');
assert.ok(['localhost', '127.0.0.1'].includes(new URL(process.env.DATABASE_URL).hostname), 'Use a local database only.');
const state = `FA${randomUUID().slice(0, 6).toUpperCase()}`, password = randomUUID();
const db = new Client({ connectionString: process.env.DATABASE_URL });
const cookies = {}, users = {};
let planId, setting, passed = 0;
const step = message => { passed++; console.log('✓', message); };

async function api(who, path, body, method = body ? 'POST' : 'GET') {
  const isForm = body instanceof FormData;
  const response = await fetch(base + path, { method, headers: { Origin: base, ...(body && !isForm ? { 'Content-Type': 'application/json' } : {}), ...(cookies[who] ? { Cookie: cookies[who] } : {}) }, ...(body ? { body: isForm ? body : JSON.stringify(body) } : {}) });
  const data = await response.json().catch(() => ({}));
  if (path === '/api/auth/login' && response.ok) cookies[who] = response.headers.get('set-cookie').split(';')[0];
  return { status: response.status, data };
}
const ok = (r, status = 200) => { assert.equal(r.status, status, JSON.stringify(r.data)); return r.data; };
const fails = (r, status, pattern) => { assert.equal(r.status, status, JSON.stringify(r.data)); if (pattern) assert.match(r.data.error ?? '', pattern); return r.data; };
async function user(who, role, departments) {
  const email = `${who}.${state}@full-allocation.test`.toLowerCase();
  users[who] = (await db.query('INSERT INTO users(email,full_name,role,department,state_code,password_hash) VALUES($1,$2,$3,$4,$5,$6) RETURNING id', [email, `QA ${who}`, role, departments[0] ?? null, state, hashSync(password, 4)])).rows[0].id;
  for (const department of departments) await db.query('INSERT INTO user_departments(user_id,department) VALUES($1,$2)', [users[who], department]);
  ok(await api(who, '/api/auth/login', { email, password }));
}
/** "… so ₦1,234.5600 is left" → "1234.56" */
const leftOf = message => (message.match(/so ₦([\d,]+\.\d{2})\d* is left/) ?? [])[1]?.replace(/,/g, '');

await db.connect();
try {
  setting = (await db.query("SELECT full_allocation_required FROM state_workflow_settings WHERE state_code='GLOBAL'")).rows[0]?.full_allocation_required ?? true;
  await db.query("UPDATE state_workflow_settings SET full_allocation_required=TRUE WHERE state_code='GLOBAL'");
  await user('physical', 'Data Entry Staff', ['physical']); await user('academic', 'Data Entry Staff', ['academic']); await user('ec', 'Executive Chairman', []);
  for (const d of ['physical', 'academic']) await user(`${d}Director`, 'Director', [d]);
  const book = new ExcelJS.Workbook(); book.addWorksheet('RAT').addRow(['QA']);
  const form = new FormData(); form.set('setup', JSON.stringify({ planningYear: 2019, implementationYear: 2019, quarters: [1], stateLodgment: '10000', fundingSources: [] }));
  form.append('rat', new Blob([await book.xlsx.writeBuffer()]), 'rat.xlsx');
  planId = ok(await api('ec', '/api/plans', form), 201).plan.id;
  const q = `?plan=${planId}`, review = `/api/plans/review${q}`, url = w => `/api/activities${q}&workstream=${w}`;
  const line = (workstream, activity, unitCost) => ({ workstream, entity: 'line', action: 'create', activity, description: `QA ${workstream}`, quantity: 1, unitCost: Number(unitCost), strategy: 'Request for quotation', targetGroup: 'Schools' });
  const send = async (who, pillar) => api(who, review, { action: 'submit', pillar, version: ok(await api('ec', review)).plan.version });
  assert.equal(ok(await api('ec', review)).fullAllocation, true);

  // Monitoring: one allocation, no shares inside it.
  ok(await api('physical', url('monitoring'), line('monitoring', 0, 100)));
  const short = fails(await send('physical', 'monitoring'), 409, /Use the whole Supervision & Monitoring allocation \(₦[\d,.]+\) before sending\. The items come to ₦100\.0000, so ₦[\d,.]+ is left/);
  ok(await api('physical', url('monitoring'), line('monitoring', 1, leftOf(short.error))));
  ok(await send('physical', 'monitoring'));
  step('a component is sent only once its items use its whole allocation');

  // Curriculum: its 60/20/10/10 shares are a guide (UBEC162), so only the whole allocation must be used, by any activity.
  const schoolId = (await db.query("INSERT INTO schools(state_code,name,lga,level,location,enrolment_male,enrolment_female) VALUES($1,'QA Full School','QA LGA','Primary','Rural',10,10) RETURNING id", [state])).rows[0].id;
  ok(await api('academic', url('curriculum'), { workstream: 'curriculum', entity: 'school', action: 'create', schoolIds: [schoolId] }));
  ok(await api('academic', url('curriculum'), line('curriculum', 0, 50)));
  const left = fails(await send('academic', 'curriculum'), 409, /Use the whole Curriculum allocation/).error;
  ok(await api('academic', url('curriculum'), line('curriculum', 1, leftOf(left))));
  ok(await send('academic', 'curriculum'));
  step('guide shares (Curriculum) are not required in full; the whole allocation is');

  await db.query("UPDATE state_workflow_settings SET full_allocation_required=FALSE WHERE state_code='GLOBAL'");
  assert.equal(ok(await api('ec', review)).fullAllocation, false);
  // Monitoring back to draft with only its first ₦100 item: it can now be sent with most of its allocation unused.
  await db.query("DELETE FROM activity_plan_lines WHERE plan_id=$1 AND workstream='monitoring' AND activity=1", [planId]);
  await db.query("UPDATE plan_pillar_reviews SET status='draft' WHERE plan_id=$1 AND pillar='monitoring'", [planId]);
  ok(await send('physical', 'monitoring'));
  step('with the Super Admin setting off, components can be sent before the allocation is used up');
  console.log(`\nPASS: ${passed} full allocation checks`);
} finally {
  await db.query("UPDATE state_workflow_settings SET full_allocation_required=$1 WHERE state_code='GLOBAL'", [setting ?? true]);
  if (planId) {
    for (const t of ['plan_notifications', 'plan_review_events', 'plan_submissions', 'plan_pillar_reviews', 'activity_plan_lines', 'tlm_distribution', 'plan_documents', 'plan_quarters']) await db.query(`DELETE FROM ${t} WHERE plan_id=$1`, [planId]);
    await db.query('DELETE FROM action_plans WHERE id=$1', [planId]);
  }
  await db.query('DELETE FROM schools WHERE state_code=$1', [state]);
  const ids = Object.values(users);
  if (ids.length) { await db.query('DELETE FROM sessions WHERE user_id=ANY($1::int[])', [ids]); await db.query('DELETE FROM user_departments WHERE user_id=ANY($1::int[])', [ids]); await db.query('DELETE FROM users WHERE id=ANY($1::int[])', [ids]); }
  await db.end();
}
