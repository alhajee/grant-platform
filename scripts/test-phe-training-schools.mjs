// UBEC74 (migration 079): Training of PHE Officers lines need a distribution list of schools (like TLM's) before Sports,
// Quiz & Debate is sent; the list is in the snapshot and the workbook, other states' schools are refused.
// Usage: node --env-file=.env scripts/test-phe-training-schools.mjs [baseUrl]   (local only; throwaway state, users and plan; cleans up)
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { hashSync } from 'bcryptjs';
import ExcelJS from 'exceljs';

const base = process.argv[2] ?? process.env.TEST_BASE_URL ?? process.env.UBEC_TEST_URL ?? 'http://localhost:5173';
assert.match(base, /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/, 'Run this test against a local server only.');
assert.ok(['localhost', '127.0.0.1'].includes(new URL(process.env.DATABASE_URL).hostname), 'Use a local database only.');
const state = `PH${randomUUID().slice(0, 6).toUpperCase()}`, password = randomUUID();
const db = new Client({ connectionString: process.env.DATABASE_URL });
const cookies = {}, users = {};
let planId, foreignSchool, passed = 0;
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
  const email = `${who}.${state}@phe-training.test`.toLowerCase();
  users[who] = (await db.query('INSERT INTO users(email,full_name,role,department,state_code,password_hash) VALUES($1,$2,$3,$4,$5,$6) RETURNING id', [email, `QA ${who}`, role, departments[0] ?? null, state, hashSync(password, 4)])).rows[0].id;
  for (const department of departments) await db.query('INSERT INTO user_departments(user_id,department) VALUES($1,$2)', [users[who], department]);
  ok(await api(who, '/api/auth/login', { email, password }));
}

await db.connect();
try {
  await user('academic', 'Data Entry Staff', ['academic']); await user('academicDirector', 'Director', ['academic']); await user('ec', 'Executive Chairman', []);
  const book = new ExcelJS.Workbook(); book.addWorksheet('RAT').addRow(['QA']);
  const form = new FormData(); form.set('setup', JSON.stringify({ planningYear: 2019, implementationYear: 2019, quarters: [1], stateLodgment: '1000000000', fundingSources: [] }));
  form.append('rat', new Blob([await book.xlsx.writeBuffer()]), 'rat.xlsx');
  planId = ok(await api('ec', '/api/plans', form), 201).plan.id;
  // UBEC167: Sports is sent only once its Debate amount is set (₦0 here).
  await db.query('UPDATE action_plans SET debate_allocation=0 WHERE id=$1', [planId]);
  const q = `?plan=${planId}`, review = `/api/plans/review${q}`, list = `/api/sports/training-schools${q}`;
  const [school, other] = (await db.query("INSERT INTO schools(state_code,name,lga,level,location) VALUES($1,'PHE School A','QA','Primary','Rural'),($1,'PHE School B','QA','JSS','Rural') RETURNING id", [state])).rows.map(r => r.id);
  const foreign = (await db.query("INSERT INTO schools(state_code,name,lga,level,location) VALUES('YO','PHE foreign school','QA','Primary','Rural') RETURNING id")).rows[0].id;
  foreignSchool = foreign;
  ok(await api('academic', `/api/sports${q}`, { entity: 'budget', action: 'create', section: 'equipment', activityType: 'Training of PHE Officers', description: 'Train PHE officers', quantity: 10, unitCost: 1000 }), 201);
  const send = async () => api('academic', review, { action: 'submit', pillar: 'sports', version: ok(await api('ec', review)).plan.version });
  fails(await send(), 409, /PHE training distribution list/);
  step('Sports with Training of PHE Officers lines is not sent without PHE training schools');

  fails(await api('academic', list, { action: 'add', schoolIds: [foreign] }), 404);
  assert.deepEqual(ok(await api('academic', list, { action: 'add', schoolIds: [school, other, school] })), { ok: true, added: 2, skipped: 0 });
  assert.equal(ok(await api('academic', list, { action: 'add', schoolIds: [school] })).skipped, 1);
  ok(await api('academic', list, { action: 'remove', schoolId: other }));
  assert.deepEqual(ok(await api('academic', `/api/sports${q}`)).trainingSchools.map(s => s.id), [school]);
  assert.deepEqual(ok(await api('academic', review)).snapshot.pheDistribution.map(s => s.id), [school]);
  step('schools are added (several at once, duplicates skipped, other states refused) and removed; the list is in the editor and the snapshot');

  ok(await send());
  step('with a training school listed, Sports is sent');
  console.log(`\nPASS: ${passed} PHE training school checks`);
} finally {
  if (planId) {
    for (const t of ['plan_notifications', 'plan_review_events', 'plan_submissions', 'plan_pillar_reviews', 'tlm_distribution', 'plan_documents', 'plan_quarters']) await db.query(`DELETE FROM ${t} WHERE plan_id=$1`, [planId]);
    await db.query('DELETE FROM sports_budget_lines WHERE plan_id=$1', [planId]);
    await db.query('DELETE FROM action_plans WHERE id=$1', [planId]);
  }
  await db.query('DELETE FROM schools WHERE state_code=$1', [state]);
  if (foreignSchool) await db.query('DELETE FROM schools WHERE id=$1', [foreignSchool]);
  const ids = Object.values(users);
  if (ids.length) { await db.query('DELETE FROM sessions WHERE user_id=ANY($1::int[])', [ids]); await db.query('DELETE FROM user_departments WHERE user_id=ANY($1::int[])', [ids]); await db.query('DELETE FROM users WHERE id=ANY($1::int[])', [ids]); }
  await db.end();
}
