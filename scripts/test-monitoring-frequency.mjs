// UBEC164 (migration 078): "Allowances for monitoring officers" lines record the frequency (number of visits); the line's
// quantity is officers × visits, so its amount is officers × visits × unit cost. Other lines take no frequency.
// Usage: node --env-file=.env scripts/test-monitoring-frequency.mjs [baseUrl]   (local only; throwaway state, users and plan; cleans up)
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { hashSync } from 'bcryptjs';
import ExcelJS from 'exceljs';

const base = process.argv[2] ?? process.env.TEST_BASE_URL ?? process.env.UBEC_TEST_URL ?? 'http://localhost:5173';
assert.match(base, /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/, 'Run this test against a local server only.');
assert.ok(['localhost', '127.0.0.1'].includes(new URL(process.env.DATABASE_URL).hostname), 'Use a local database only.');
const state = `MF${randomUUID().slice(0, 6).toUpperCase()}`, password = randomUUID();
const db = new Client({ connectionString: process.env.DATABASE_URL });
const cookies = {}, users = {};
let planId, passed = 0;
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
  const email = `${who}.${state}@monitoring-frequency.test`.toLowerCase();
  users[who] = (await db.query('INSERT INTO users(email,full_name,role,department,state_code,password_hash) VALUES($1,$2,$3,$4,$5,$6) RETURNING id', [email, `QA ${who}`, role, departments[0] ?? null, state, hashSync(password, 4)])).rows[0].id;
  for (const department of departments) await db.query('INSERT INTO user_departments(user_id,department) VALUES($1,$2)', [users[who], department]);
  ok(await api(who, '/api/auth/login', { email, password }));
}

await db.connect();
try {
  await user('physical', 'Data Entry Staff', ['physical']); await user('ec', 'Executive Chairman', []);
  const book = new ExcelJS.Workbook(); book.addWorksheet('RAT').addRow(['QA']);
  const form = new FormData(); form.set('setup', JSON.stringify({ planningYear: 2019, implementationYear: 2019, quarters: [1], stateLodgment: '1000000000', fundingSources: [] }));
  form.append('rat', new Blob([await book.xlsx.writeBuffer()]), 'rat.xlsx');
  planId = ok(await api('ec', '/api/plans', form), 201).plan.id;
  const url = `/api/activities?plan=${planId}&workstream=monitoring`;
  const line = (activity, extra = {}) => ({ workstream: 'monitoring', entity: 'line', action: 'create', activity, description: 'QA allowance', quantity: 2500, unitCost: 1000, strategy: 'Request for quotation', targetGroup: 'Schools', ...extra });

  // 50 officers × 50 visits × ₦1,000 = ₦2,500,000.
  const id = ok(await api('physical', url, line(2, { frequency: 50 }))).id;
  const saved = ok(await api('physical', url)).lines.find(l => l.id === id);
  assert.equal(saved.frequency, 50); assert.equal(saved.quantity, 2500);
  assert.equal((await db.query('SELECT quantity*unit_cost AS total FROM activity_plan_lines WHERE id=$1', [id])).rows[0].total, '2500000.00');
  step('an officer allowance saves its visits; the amount is officers × visits × unit cost');

  fails(await api('physical', url, line(2, { quantity: 2501, frequency: 50 })), 400);
  fails(await api('physical', url, line(0, { frequency: 3 })), 400);
  const legacy = ok(await api('physical', url, line(2, { quantity: 4 }))).id;
  assert.equal((await db.query('SELECT frequency FROM activity_plan_lines WHERE id=$1', [legacy])).rows[0].frequency, 1);
  const other = ok(await api('physical', url, line(0, { quantity: 4 }))).id;
  assert.equal((await db.query('SELECT frequency FROM activity_plan_lines WHERE id=$1', [other])).rows[0].frequency, null);
  step('a quantity that is not officers × visits, or a frequency on another activity, is refused; a save without one is one visit');
  console.log(`\nPASS: ${passed} monitoring frequency checks`);
} finally {
  if (planId) {
    for (const t of ['plan_notifications', 'plan_review_events', 'plan_submissions', 'plan_pillar_reviews', 'activity_plan_lines', 'plan_documents', 'plan_quarters']) await db.query(`DELETE FROM ${t} WHERE plan_id=$1`, [planId]);
    await db.query('DELETE FROM action_plans WHERE id=$1', [planId]);
  }
  const ids = Object.values(users);
  if (ids.length) { await db.query('DELETE FROM sessions WHERE user_id=ANY($1::int[])', [ids]); await db.query('DELETE FROM user_departments WHERE user_id=ANY($1::int[])', [ids]); await db.query('DELETE FROM users WHERE id=ANY($1::int[])', [ids]); }
  await db.end();
}
