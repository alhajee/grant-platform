// UBEC139: UBEC Planning (DPRS) Assessment Officers and their Director list every plan sent to UBEC with its RAT tool and
// download it, whether or not they are assigned to the plan; other UBEC officers still need a visible component.
// Usage: node --env-file=.env scripts/test-rat-tools.mjs [baseUrl]   (local only; throwaway state, users and plan; cleans up)
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { hashSync } from 'bcryptjs';
import ExcelJS from 'exceljs';

const base = process.argv[2] ?? process.env.TEST_BASE_URL ?? process.env.UBEC_TEST_URL ?? 'http://localhost:5173';
assert.match(base, /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/, 'Run this test against a local server only.');
assert.ok(['localhost', '127.0.0.1'].includes(new URL(process.env.DATABASE_URL).hostname), 'Use a local database only.');
const marker = `RT${randomUUID().slice(0, 8).toUpperCase()}`, password = randomUUID();
const db = new Client({ connectionString: process.env.DATABASE_URL });
const cookies = {}, users = {};
let planId;

async function api(who, path, body) {
  const response = await fetch(base + path, { method: body ? 'POST' : 'GET', headers: { Origin: base, ...(cookies[who] ? { Cookie: cookies[who] } : {}) }, ...(body ? { body } : {}) });
  const type = response.headers.get('content-type') ?? '';
  const data = type.includes('json') ? await response.json() : { bytes: (await response.arrayBuffer()).byteLength };
  if (path === '/api/auth/login' && response.ok) cookies[who] = response.headers.get('set-cookie').split(';')[0];
  return { status: response.status, data };
}
const ok = (r, status = 200) => { assert.equal(r.status, status, JSON.stringify(r.data)); return r.data; };
async function user(who, role, department, state = 'UBEC') {
  const email = `${who}.${marker}@rat.test`.toLowerCase();
  users[who] = (await db.query('INSERT INTO users(email,full_name,role,department,state_code,password_hash) VALUES($1,$2,$3,$4,$5,$6) RETURNING id', [email, `QA ${who}`, role, department, state, hashSync(password, 4)])).rows[0].id;
  if (department) await db.query('INSERT INTO user_departments(user_id,department) VALUES($1,$2)', [users[who], department]);
  const r = await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base }, body: JSON.stringify({ email, password }) });
  assert.equal(r.status, 200); cookies[who] = r.headers.get('set-cookie').split(';')[0];
}

await db.connect();
try {
  await user('ec', 'Executive Chairman', null, marker);
  await user('planningOfficer', 'UBEC Assessment Officer', 'planning'); await user('dprs', 'UBEC Director', 'planning');
  await user('physicalOfficer', 'UBEC Assessment Officer', 'physical');
  const rat = new ExcelJS.Workbook(); rat.addWorksheet('RAT').addRow(['RAT QA']);
  const form = new FormData();
  form.set('setup', JSON.stringify({ planningYear: 2026, implementationYear: 2026, quarters: [1, 2, 3, 4], stateLodgment: '100000000', fundingSources: [] }));
  form.append('rat', new Blob([await rat.xlsx.writeBuffer()]), 'rat-tool.xlsx');
  planId = ok(await api('ec', '/api/plans', form), 201).plan.id;
  const doc = (await db.query('SELECT id FROM plan_documents WHERE plan_id=$1', [planId])).rows[0].id;

  assert.ok(!ok(await api('planningOfficer', '/api/ubec/rat-tools')).plans.some(p => p.planId === planId), 'a plan not sent to UBEC is not listed');
  assert.equal((await api('planningOfficer', `/api/plans/documents?id=${doc}`)).status, 404);
  await db.query("INSERT INTO ubec_rounds(plan_id,number,state_submission,snapshot,status,submitted_by,submitted_at) VALUES($1,1,1,'{}'::jsonb,'received',$2,NOW())", [planId, users.ec]);
  for (const who of ['planningOfficer', 'dprs']) {
    const listed = ok(await api(who, '/api/ubec/rat-tools')).plans.find(p => p.planId === planId);
    assert.ok(listed, `${who} lists the plan`); assert.deepEqual(listed.documents.map(d => d.name), ['rat-tool.xlsx']);
    assert.ok(ok(await api(who, `/api/plans/documents?id=${doc}`)).bytes > 0, `${who} downloads the RAT`);
  }
  assert.equal((await api('physicalOfficer', '/api/ubec/rat-tools')).status, 403);
  assert.equal((await api('physicalOfficer', `/api/plans/documents?id=${doc}`)).status, 404, 'other unassigned officers cannot download it');
  console.log('PASS: UBEC Planning lists and downloads the RAT tool of every plan sent to UBEC');
} finally {
  if (planId) {
    await db.query('DELETE FROM ubec_rounds WHERE plan_id=$1', [planId]);
    for (const t of ['plan_review_events', 'plan_documents', 'plan_quarters', 'plan_funding_sources']) await db.query(`DELETE FROM ${t} WHERE plan_id=$1`, [planId]).catch(() => {});
    await db.query('DELETE FROM action_plans WHERE id=$1', [planId]);
  }
  const ids = Object.values(users);
  if (ids.length) { await db.query('DELETE FROM sessions WHERE user_id=ANY($1::int[])', [ids]); await db.query('DELETE FROM user_departments WHERE user_id=ANY($1::int[])', [ids]); await db.query('DELETE FROM users WHERE id=ANY($1::int[])', [ids]); }
  await db.end();
}
