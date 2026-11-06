// UBEC231 / V2 UBEC05 (migration 092): with "ECCDE share" on, the BEAP Chair sends to the Executive Chairman (one component,
// several, or the complete plan) only while ECCDE is at least 15% of the whole working plan, counted as in Spending by school
// level (lines whose target group names ECCDE learners count as ECCDE). GET /api/plans/review returns the share and the reason.
// Usage: node --env-file=.env scripts/test-eccde-share.mjs [baseUrl]   (local only; throwaway state, users and plan; cleans up)
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { withProformas } from './test-support/proformas.mjs';
import { hashSync } from 'bcryptjs';
import ExcelJS from 'exceljs';

const base = process.argv[2] ?? process.env.TEST_BASE_URL ?? process.env.UBEC_TEST_URL ?? 'http://localhost:5173';
assert.match(base, /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/, 'Run this test against a local server only.');
assert.ok(['localhost', '127.0.0.1'].includes(new URL(process.env.DATABASE_URL).hostname), 'Use a local database only.');
const state = `EC${randomUUID().slice(0, 6).toUpperCase()}`, password = randomUUID();
const db = new Client({ connectionString: process.env.DATABASE_URL });
const cookies = {}, users = {};
let planId, saved = null;
const step = message => console.log('✓', message);

async function api(who, path, body, method = body ? 'POST' : 'GET', origin = base) {
  await withProformas(db, path, body);
  const isForm = body instanceof FormData;
  const response = await fetch(base + path, { method, headers: { ...(origin ? { Origin: origin } : {}), ...(body && !isForm ? { 'Content-Type': 'application/json' } : {}), ...(cookies[who] ? { Cookie: cookies[who] } : {}) }, ...(body ? { body: isForm ? body : JSON.stringify(body) } : {}) });
  const data = await response.json().catch(() => ({}));
  if (path === '/api/auth/login' && response.ok) cookies[who] = response.headers.get('set-cookie').split(';')[0];
  return { status: response.status, data };
}
const ok = (r, status = 200) => { assert.equal(r.status, status, JSON.stringify(r.data)); return r.data; };
const fails = (r, status, pattern) => { assert.equal(r.status, status, JSON.stringify(r.data)); if (pattern) assert.match(r.data.error ?? '', pattern); return r.data; };
async function user(who, role, departments, extra = {}) {
  const email = `${who}.${state}@eccde-share.test`.toLowerCase();
  users[who] = (await db.query('INSERT INTO users(email,full_name,role,department,state_code,password_hash,is_beap_chair) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id', [email, `QA ${who}`, role, departments[0] ?? null, extra.state ?? state, hashSync(password, 4), !!extra.chair])).rows[0].id;
  for (const department of departments) await db.query('INSERT INTO user_departments(user_id,department) VALUES($1,$2)', [users[who], department]);
  ok(await api(who, '/api/auth/login', { email, password }));
}
const setting = (column, value) => db.query(`UPDATE state_workflow_settings SET ${column}=$1 WHERE state_code='GLOBAL'`, [value]);

await db.connect();
try {
  saved = (await db.query("SELECT eccde_share_required, full_allocation_required, beap_chair_submission_mode FROM state_workflow_settings WHERE state_code='GLOBAL'")).rows[0];
  assert.ok(saved, 'The GLOBAL workflow settings row is missing');
  await setting('full_allocation_required', false);
  await user('physical', 'Data Entry Staff', ['physical']); await user('ec', 'Executive Chairman', []);
  await user('chair', 'Director', ['physical'], { chair: true }); await user('admin', 'Super Admin', [], { state: 'UBEC' });

  // The Super Admin setting: GET/PUT, same origin, Super Admin only.
  ok(await api('ec', '/api/admin/eccde-share'), 403);
  fails(await api('admin', '/api/admin/eccde-share', { required: true }, 'PUT', null), 403);
  fails(await api('admin', '/api/admin/eccde-share', { required: 'yes' }, 'PUT'), 400);
  assert.equal(ok(await api('admin', '/api/admin/eccde-share', { required: true }, 'PUT')).required, true);
  assert.equal(ok(await api('admin', '/api/admin/eccde-share')).required, true);
  step('Super Admin reads and sets the ECCDE share (same origin only)');

  const book = new ExcelJS.Workbook(); book.addWorksheet('RAT').addRow(['QA']);
  const form = new FormData(); form.set('setup', JSON.stringify({ planningYear: 2018, implementationYear: 2018, quarters: [1], stateLodgment: '100000', fundingSources: [] }));
  form.append('rat', new Blob([await book.xlsx.writeBuffer()]), 'rat.xlsx');
  planId = ok(await api('ec', '/api/plans', form), 201).plan.id;
  const q = `?plan=${planId}`, review = `/api/plans/review${q}`, url = `/api/activities${q}&workstream=monitoring`;
  const line = (activity, unitCost, targetGroup) => ({ workstream: 'monitoring', entity: 'line', action: 'create', activity, description: `QA ${targetGroup}`, quantity: 1, unitCost, strategy: 'Request for quotation', targetGroup });
  ok(await api('physical', url, line(0, 900, 'Schools')));
  const eccdeLine = ok(await api('physical', url, line(1, 100, ['ECCDE Learners', 'Teachers']))).id;
  // Straight to the BEAP Chair (the earlier steps are covered elsewhere).
  await db.query("INSERT INTO plan_pillar_reviews(plan_id,pillar,status) VALUES($1,'monitoring','beap_review') ON CONFLICT(plan_id,pillar) DO UPDATE SET status='beap_review'", [planId]);
  const version = async () => ok(await api('chair', review)).plan.version;

  await setting('beap_chair_submission_mode', 'individual_components');
  const shown = ok(await api('chair', review));
  assert.equal(shown.eccdeShare.percent, 10); assert.equal(shown.eccdeShare.met, false);
  assert.match(shown.eccdeShareProblem, /^ECCDE must be at least 15% of the plan before it goes to the Executive Chairman: it is ₦100\.0000 \(10%\), ₦50\.0000 short/);
  assert.equal(ok(await api('ec', review)).eccdeShareProblem, null, 'only the BEAP Chair is told to fix it');
  assert.equal(ok(await api('physical', review)).eccdeShare, null, 'Data Entry does not see the whole-plan share');
  fails(await api('chair', review, { action: 'forward', pillar: 'monitoring', version: await version() }), 409, /ECCDE must be at least 15% .* ₦50\.0000 short/);
  step('one component: refused below 15%, with the amount short (target group ECCDE Learners counts)');

  await setting('beap_chair_submission_mode', 'complete_plan');
  assert.match(ok(await api('chair', review)).executiveChairmanProblem ?? '', /./, 'the bar explains why the collated send is disabled');
  fails(await api('chair', review, { action: 'forward', version: await version() }), 409, /ECCDE must be at least 15%/);
  step('complete plan: the collated send is refused below 15%');

  await setting('eccde_share_required', false);
  assert.equal(ok(await api('chair', review)).eccdeShare, null);
  const collated = await api('chair', review, { action: 'forward', version: await version() });
  assert.doesNotMatch(collated.data.error ?? '', /ECCDE/, 'off: no ECCDE rule');
  await setting('eccde_share_required', true);
  step('with the setting off nothing is checked');

  await setting('beap_chair_submission_mode', 'individual_components');
  // The line is read-only at the BEAP Chair, so the figure is raised in the database.
  await db.query('UPDATE activity_plan_lines SET unit_cost=160 WHERE id=$1', [eccdeLine]);
  // ₦160 of ₦1,060 = 15.09%.
  const met = ok(await api('chair', review));
  assert.equal(met.eccdeShare.met, true); assert.equal(met.eccdeShareProblem, null);
  ok(await api('chair', review, { action: 'forward', pillar: 'monitoring', version: await version(), comment: '' }));
  assert.equal((await db.query("SELECT status FROM plan_pillar_reviews WHERE plan_id=$1 AND pillar='monitoring'", [planId])).rows[0].status, 'chairman_ready');
  step('at 15% or more the BEAP Chair sends to the Executive Chairman');
  console.log('PASS: ECCDE share (UBEC231)');
} finally {
  if (saved) await db.query("UPDATE state_workflow_settings SET eccde_share_required=$1, full_allocation_required=$2, beap_chair_submission_mode=$3 WHERE state_code='GLOBAL'", [saved.eccde_share_required, saved.full_allocation_required, saved.beap_chair_submission_mode]);
  if (planId) {
    for (const table of ['plan_notifications', 'plan_review_events', 'plan_submissions', 'plan_pillar_reviews', 'activity_plan_lines']) await db.query(`DELETE FROM ${table} WHERE plan_id=$1`, [planId]);
    await db.query('DELETE FROM action_plans WHERE id=$1', [planId]);
  }
  const ids = Object.values(users);
  await db.query('DELETE FROM sessions WHERE user_id=ANY($1::int[])', [ids]).catch(() => {});
  await db.query('DELETE FROM user_departments WHERE user_id=ANY($1::int[])', [ids]);
  await db.query('DELETE FROM users WHERE id=ANY($1::int[])', [ids]);
  await db.end();
}
