// API test for plan workbook comments (migration 028, app/api/plans/comments/route.ts).
// Creates two throwaway states with their own users, one temporary plan and one school, and removes
// them all afterwards. Usage: set -a; . ./.env; set +a; node scripts/test-plan-comments.mjs [baseUrl]
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import ExcelJS from 'exceljs';
import { Client } from 'pg';
import { hashSync } from 'bcryptjs';

const base = process.argv[2] ?? process.env.UBEC_TEST_URL ?? 'http://127.0.0.1:5174';
assert.match(base, /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/, 'Run this test against a local server only.');
const tag = randomUUID().slice(0, 8).toUpperCase();
const state = `CQ${tag}`, foreign = `CF${tag}`, password = randomUUID();
const db = new Client({ connectionString: process.env.DATABASE_URL });
const jars = {}, userIds = [];
let planId, schoolId, settings, passed = 0;
const step = message => { passed++; console.log('✓', message); };

async function api(who, path, body, { method = body ? 'POST' : 'GET', origin = true } = {}) {
  const jar = jars[who] ??= {}, isForm = body instanceof FormData;
  const headers = { Cookie: Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; '), ...(origin ? { Origin: base } : {}), ...(body && !isForm ? { 'Content-Type': 'application/json' } : {}) };
  const response = await fetch(base + path, { method, headers, ...(body ? { body: isForm ? body : JSON.stringify(body) } : {}) });
  for (const cookie of response.headers.getSetCookie()) { const pair = cookie.split(';')[0], i = pair.indexOf('='); jar[pair.slice(0, i)] = pair.slice(i + 1); }
  const text = await response.text(); let data; try { data = JSON.parse(text); } catch { data = { error: text.slice(0, 200) }; }
  return { status: response.status, data, text, headers: response.headers };
}
const ok = (result, status = 200) => { assert.equal(result.status, status, JSON.stringify(result.data)); return result.data; };
const expect = (result, status, pattern) => { assert.equal(result.status, status, JSON.stringify(result.data)); if (pattern) assert.match(result.data.error ?? '', pattern); return result.data; };
async function user(key, role, departments, { stateCode = state, chair = false } = {}) {
  const email = `${key}.${tag}@comments.test`.toLowerCase();
  const id = (await db.query('INSERT INTO users(email,full_name,role,department,state_code,password_hash,is_beap_chair) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id', [email, `QA ${key}`, role, departments[0] ?? null, stateCode, hashSync(password, 4), chair])).rows[0].id;
  userIds.push(id);
  for (const department of departments) await db.query('INSERT INTO user_departments(user_id,department) VALUES($1,$2)', [id, department]);
  ok(await api(key, '/api/auth/login', { email, password }));
}

// Column ids/headers in lib/plan-comments.ts must match the workbook sheets (detail export sheets excluded).
function columnDrift() {
  const sheets = readFileSync(new URL('../components/plan-workbook/sheets.tsx', import.meta.url), 'utf8').split('export function detailExportSheets')[0];
  const lib = readFileSync(new URL('../lib/plan-comments.ts', import.meta.url), 'utf8');
  const used = [...sheets.matchAll(/\b(?:text|amount|qty)\('(\w+)', '([^']+)'/g)].map(m => `${m[1]}: '${m[2]}'`).concat("quantity: 'Qty.'");
  for (const pair of used) assert.ok(lib.includes(pair), `lib/plan-comments.ts is missing workbook column ${pair}`);
}

await db.connect();
try {
  columnDrift(); step('comment column map matches the workbook sheet columns');
  settings = (await db.query("SELECT beap_chair_submission_mode, ubec_submission_mode FROM state_workflow_settings WHERE state_code='GLOBAL'")).rows[0];
  await db.query("UPDATE state_workflow_settings SET beap_chair_submission_mode='individual_components', ubec_submission_mode='reviewed_components' WHERE state_code='GLOBAL'");
  await user('des', 'Data Entry Staff', ['physical', 'academic', 'social']);
  await user('desSocial', 'Data Entry Staff', ['social']);
  await user('dir', 'Director', ['academic', 'physical', 'social']);
  await user('dirSocial', 'Director', ['social']);
  await user('chair', 'Director', ['physical'], { chair: true });
  await user('ec', 'Executive Chairman', []);
  await user('foreignDir', 'Director', ['academic', 'physical', 'social'], { stateCode: foreign });
  await user('ubec', 'UBEC Executive Secretary', [], { stateCode: 'UBEC' });

  const rat = new ExcelJS.Workbook(); rat.addWorksheet('RAT').addRow(['Comments QA']);
  const form = new FormData();
  form.set('setup', JSON.stringify({ planningYear: 2031, implementationYear: 2031, quarters: [1, 2, 3, 4], stateLodgment: '500000000', otherFunding: '0' }));
  form.append('rat', new Blob([await rat.xlsx.writeBuffer()]), 'rat.xlsx');
  planId = ok(await api('ec', '/api/plans', form), 201).plan.id;
  const q = `?plan=${planId}`, comments = `/api/plans/comments${q}`, reviewPath = `/api/plans/review${q}`;
  const review = async (who, action, pillar, comment = '') => api(who, reviewPath, { action, pillar, version: ok(await api(who, reviewPath)).plan.version, comment });
  const balls = ok(await api('des', `/api/sports${q}`, { entity: 'budget', action: 'create', section: 'equipment', activityType: 'Football', description: 'Match balls', quantity: 10, unitCost: 15000 }), 201).id;
  const kits = ok(await api('des', `/api/sports${q}`, { entity: 'budget', action: 'create', section: 'competitions', activityType: 'Inter School Competition', description: 'Inter-school finals', quantity: 1, unitCost: 900000 }), 201).id;
  ok(await api('des', `/api/activities${q}`, { workstream: 'sbmc', entity: 'line', action: 'create', activity: 1, description: 'Rehabilitate ECCDE centres', rationale: 'Collapsed roofs', implementationApproach: 'Community labour', quantity: 100, unitCost: 500000, strategy: 'Credit SBMC school account', targetGroup: 'Community level', location: 'Rural' }));
  const sbmcLine = String((await db.query('SELECT id FROM activity_plan_lines WHERE plan_id=$1 AND workstream=$2', [planId, 'sbmc'])).rows[0].id);
  schoolId = (await db.query("INSERT INTO schools(name,lga,level,location,state_code) VALUES($1,'QA LGA','Primary','Urban',$2) RETURNING id", [`QA School ${tag}`, state])).rows[0].id;
  step(`temporary plan ${planId} created with Sports and SBMC lines in throwaway state ${state}`);

  // Draft: nobody holds the component yet.
  let data = ok(await api('des', comments));
  assert.deepEqual(data.threads, []); assert.equal(data.locked, false); assert.equal(data.abilities.sports.start, false); assert.equal(data.abilities.sports.reply, true);
  assert.equal(ok(await api('des', comments)).abilities.sports.reopen, false);
  const cell = (who, rowRef, columnId, body, sheet = 'sports') => api(who, comments, { sheet, rowRef: String(rowRef), columnId, body });
  for (const who of ['des', 'dir', 'chair', 'ec']) expect(await cell(who, balls, 'unitCost', 'Too early'), 403, /holding this component/);
  step('draft component: no role may start a thread (403 for Data Entry, Director, BEAP Chair, Executive Chairman)');

  // With the Director.
  ok(await review('des', 'submit', 'sports'));
  const root = ok(await cell('dir', balls, 'unitCost', '  Unit cost looks high — please attach three quotations.  '), 201).id;
  const rowThread = ok(await cell('dir', kits, null, 'Split this into zonal and state finals.'), 201).id;
  expect(await cell('chair', balls, 'quantity', 'x'), 403, /holding/); expect(await cell('ec', balls, 'quantity', 'x'), 403, /holding/);
  expect(await cell('des', balls, 'quantity', 'x'), 403, /holding/);
  expect(await cell('dirSocial', balls, 'quantity', 'x'), 403, /not assigned/);
  step('director_review: department Director starts cell and row threads (201); BEAP Chair, Executive Chairman, Data Entry and other-department Director refused (403)');
  data = ok(await api('dir', comments));
  const thread = data.threads.find(t => t.id === root);
  assert.equal(thread.body, 'Unit cost looks high — please attach three quotations.'); assert.equal(thread.targetLabel, 'Unit cost · Match balls');
  assert.equal(thread.authorRole, 'Director'); assert.equal(thread.mine, true); assert.equal(thread.orphaned, false); assert.equal(thread.submissionNumber, 1);
  assert.equal(data.threads.find(t => t.id === rowThread).targetLabel, 'Row · Inter-school finals');
  assert.equal(data.threads.find(t => t.id === rowThread).columnId, null);
  assert.match((await api('dir', comments)).headers.get('cache-control') ?? '', /no-store/);
  step('threads are returned trimmed with target label, author role, submission number and Cache-Control: no-store');

  expect(await cell('dir', balls, 'unitCost', ''), 400, /Write a comment/); expect(await cell('dir', balls, 'unitCost', '   '), 400, /Write a comment/);
  expect(await cell('dir', balls, 'unitCost', 'x'.repeat(2001)), 400, /2,000/);
  ok(await cell('dir', balls, 'code', 'y'.repeat(2000)), 201);
  expect(await cell('dir', balls, 'unitCost', 'ok', 'payroll'), 400);
  expect(await cell('dir', 987654321, 'unitCost', 'ok'), 400, /no longer in the plan/);
  expect(await cell('dir', balls, 'rationale', 'ok'), 400, /no longer in the plan/);
  expect(await cell('dir', balls, 'unit-cost', 'ok'), 400);
  expect(await cell('dir', 'abc', 'unitCost', 'ok'), 400);
  expect(await api('dir', comments, { sheet: 'sports', rowRef: String(balls), columnId: 'unitCost', body: 'ok', extra: 1 }), 400);
  expect(await cell('dir', balls, 'unitCost', 'Second thread'), 409, /already has an open comment/);
  step('validation: empty, blank and 2,001-character bodies, unknown sheet/row/column, extra fields (400); duplicate open thread (409)');

  expect(await api('dir', comments, { sheet: 'sports', rowRef: String(balls), columnId: 'amount', body: 'no origin' }, { origin: false }), 403, /portal/);
  expect(await api('foreignDir', comments), 404); expect(await cell('foreignDir', balls, 'amount', 'x'), 404);
  expect(await api('ubec', comments), 403); expect(await api('ubec', comments, { parentId: root, body: 'x' }), 403);
  expect(await api('anonymous', comments), 401);
  data = ok(await api('dirSocial', comments));
  assert.ok(data.threads.every(t => t.pillar === 'sbmc'), 'other-department Director must not see Sports threads'); assert.equal(data.abilities.sports, undefined);
  expect(await api('dirSocial', comments, { parentId: root, body: 'x' }), 404); expect(await api('dirSocial', comments, { id: root, action: 'resolve' }, { method: 'PATCH' }), 404);
  expect(await api('desSocial', comments, { id: root, action: 'resolve' }, { method: 'PATCH' }), 404);
  step('isolation: cross-origin (403), other state (404), UBEC (403), anonymous (401), other department sees and touches nothing (404)');

  ok(await api('des', comments, { parentId: root, body: 'Quotations uploaded to the dossier.' }), 201);
  ok(await api('chair', comments, { parentId: root, body: 'Noted.' }), 201);
  expect(await api('des', comments, { parentId: 999999999, body: 'x' }), 404);
  data = ok(await api('des', comments));
  assert.deepEqual(data.threads.find(t => t.id === root).replies.map(r => [r.authorRole, r.mine]), [['Data Entry Staff', true], ['BEAP Chair', false]]);
  step('replies: Data Entry Staff and BEAP Chair (anyone who can view) reply; replies carry role and ownership');

  expect(await api('chair', comments, { id: rowThread, action: 'resolve' }, { method: 'PATCH' }), 403, /Data Entry Staff/);
  ok(await api('des', comments, { id: rowThread, action: 'resolve' }, { method: 'PATCH' }));
  expect(await api('des', comments, { id: rowThread, action: 'resolve' }, { method: 'PATCH' }), 409, /already resolved/);
  expect(await api('des', comments, { parentId: rowThread, body: 'x' }), 409, /Reopen/);
  expect(await api('des', comments, { id: rowThread, action: 'reopen' }, { method: 'PATCH' }), 403, /reopen/);
  ok(await api('chair', comments, { id: rowThread, action: 'reopen' }, { method: 'PATCH' }));
  ok(await api('dir', comments, { id: rowThread, action: 'resolve' }, { method: 'PATCH' }));
  ok(await api('ec', comments, { id: rowThread, action: 'reopen' }, { method: 'PATCH' }));
  data = ok(await api('dir', comments)); assert.equal(data.threads.find(t => t.id === rowThread).resolvedAt, null);
  step('resolve/reopen: Data Entry and holder resolve, non-holder non-author refused (403); reopen only by reviewers (Data Entry 403); double resolve 409; reply to resolved 409');

  // Request changes: comments stand in for the note.
  ok(await review('dir', 'request_changes', 'sports'));
  const event = (await db.query("SELECT comment FROM plan_review_events WHERE plan_id=$1 AND action='request_changes' ORDER BY id DESC LIMIT 1", [planId])).rows[0];
  assert.equal(event.comment, '3 comments on specific cells');
  expect(await review('des', 'submit', 'sports'), 400, /Describe/);
  ok(await review('des', 'submit', 'sports', 'Quotations attached; finals split.'));
  step('request_changes without a note succeeds when open comments exist (event: "3 comments on specific cells"); re-sending with comments still open is allowed');
  for (const t of ok(await api('dir', comments)).threads.filter(t => !t.resolvedAt && t.pillar === 'sports')) ok(await api('dir', comments, { id: t.id, action: 'resolve' }, { method: 'PATCH' }));
  expect(await review('dir', 'request_changes', 'sports'), 400, /leave comments on specific cells/);
  step('request_changes without a note and without open comments is rejected (400)');

  // Other department and later holders.
  ok(await review('des', 'submit', 'sbmc'));
  ok(await cell('dirSocial', sbmcLine, 'rationale', 'Attach the community needs assessment.', 'sbmc'), 201);
  expect(await cell('dirSocial', sbmcLine, 'material', 'TLM-only column', 'sbmc'), 400, /no longer in the plan/);
  expect(await cell('dirSocial', sbmcLine, 'rationale', 'wrong sheet', 'sports'), 403);
  ok(await review('dirSocial', 'request_changes', 'sbmc'));
  step('SBMC Director comments on their own component and requests changes without a note');

  ok(await review('dir', 'endorse', 'sports'));
  const chairRoot = ok(await cell('chair', balls, 'amount', 'Amount exceeds the equipment benchmark.'), 201).id;
  expect(await cell('dir', balls, 'quantity', 'x'), 403, /holding/);
  ok(await api('chair', comments, { id: chairRoot, action: 'resolve' }, { method: 'PATCH' }));
  ok(await review('chair', 'forward', 'sports'));
  const ecRoot = ok(await cell('ec', balls, 'quantity', 'Reduce to 8 balls.'), 201).id;
  expect(await cell('chair', balls, 'section', 'x'), 403, /holding/);
  ok(await review('ec', 'request_changes', 'sports'));
  ok(await review('chair', 'forward', 'sports'));
  step('beap_review: BEAP Chair starts threads, Director no longer can; chairman_ready: Executive Chairman starts threads and requests changes without a note');

  // Locked during UBEC review.
  const ubecPath = `/api/ubec/review${q}`;
  ok(await api('ec', ubecPath, { action: 'submit', version: ok(await api('ec', ubecPath)).plan.version }));
  expect(await cell('ec', kits, 'amount', 'late'), 409, /locked/);
  expect(await api('des', comments, { parentId: ecRoot, body: 'late' }), 409, /locked/);
  expect(await api('ec', comments, { id: ecRoot, action: 'resolve' }, { method: 'PATCH' }), 409, /locked/);
  data = ok(await api('ec', comments)); assert.equal(data.locked, true); assert.ok(data.threads.length >= 4);
  step('after sending to UBEC the plan is locked: create, reply and resolve return 409; threads stay readable');

  const bodies = (await db.query('SELECT body FROM plan_comments WHERE plan_id=$1', [planId])).rows.map(r => r.body);
  for (const path of [ubecPath, '/api/ubec/dashboard']) {
    const result = await api('ubec', path);
    assert.ok(result.status < 500, `${path} failed`);
    for (const body of bodies) assert.ok(!result.text.includes(body.slice(0, 40)), `${path} leaked a state comment`);
    assert.ok(!/plan_comments|"threads"/.test(result.text));
  }
  assert.ok(ok(await api('ubec', ubecPath)).round, 'UBEC can see the submitted plan');
  step('UBEC review and dashboard APIs never include state comments');

  // Orphans: a deleted row keeps its thread, marked as no longer in the plan.
  await db.query("UPDATE action_plans SET status='draft' WHERE id=$1", [planId]);
  await db.query('DELETE FROM sports_budget_lines WHERE id=$1', [balls]).catch(() => {});
  data = ok(await api('ec', comments));
  assert.ok(data.threads.filter(t => t.rowRef === String(balls)).every(t => t.orphaned), 'threads on a deleted line are orphaned');
  step('threads on a deleted line are returned with orphaned: true');
  console.log(`\nPASS: ${passed} plan comment checks.`);
} finally {
  if (settings) await db.query("UPDATE state_workflow_settings SET beap_chair_submission_mode=$1, ubec_submission_mode=$2 WHERE state_code='GLOBAL'", [settings.beap_chair_submission_mode, settings.ubec_submission_mode]);
  if (planId) {
    await db.query('DELETE FROM ubec_events WHERE plan_id=$1', [planId]).catch(() => {});
    await db.query('DELETE FROM ubec_assignments WHERE round_id IN (SELECT id FROM ubec_rounds WHERE plan_id=$1)', [planId]).catch(() => {});
    await db.query('DELETE FROM ubec_rounds WHERE plan_id=$1', [planId]).catch(() => {});
    for (const t of ['plan_notifications', 'plan_review_events', 'plan_submissions', 'plan_pillar_reviews', 'tlm_distribution', 'activity_plan_lines']) await db.query(`DELETE FROM ${t} WHERE plan_id=$1`, [planId]);
    await db.query('DELETE FROM sports_allocations WHERE line_id IN (SELECT id FROM sports_budget_lines WHERE plan_id=$1)', [planId]);
    await db.query('DELETE FROM sports_budget_lines WHERE plan_id=$1', [planId]);
    await db.query('DELETE FROM action_plans WHERE id=$1', [planId]);
  }
  if (schoolId) await db.query('DELETE FROM schools WHERE id=$1', [schoolId]);
  if (userIds.length) await db.query('DELETE FROM users WHERE id=ANY($1::int[])', [userIds]);
  const left = (await db.query('SELECT (SELECT COUNT(*) FROM users WHERE state_code IN ($1,$2) OR email LIKE $3)::int AS users, (SELECT COUNT(*) FROM action_plans WHERE state_code=$1)::int AS plans', [state, foreign, `%.${tag.toLowerCase()}@comments.test`])).rows[0];
  console.log(`cleaned up: plan ${planId ?? '-'}, ${userIds.length} users (left behind: ${left.users} users, ${left.plans} plans)`);
  await db.end();
}
