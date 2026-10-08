// API test for UBEC review comments (migrations 029, 055): app/api/ubec/comments, sharing on the UBEC BEAP Chair's
// return in app/api/ubec/review and shared threads in app/api/plans/comments. Assessment Officers comment on the
// components their Director assigned; the UBEC ES reads every thread but cannot write. Creates two throwaway states, throwaway
// SUBEB and UBEC users and one temporary plan, and removes them all afterwards.
// Usage: set -a; . ./.env; set +a; node scripts/test-ubec-comments.mjs [baseUrl]
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import ExcelJS from 'exceljs';
import { hashSync } from 'bcryptjs';

const base = process.argv[2] ?? process.env.TEST_BASE_URL ?? process.env.UBEC_TEST_URL ?? 'http://localhost:5173';
assert.match(base, /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/, 'Run this test against a local server only.');
const tag = randomUUID().slice(0, 8).toUpperCase();
const state = `UQ${tag}`, foreign = `UF${tag}`, password = randomUUID();
const db = new Client({ connectionString: process.env.DATABASE_URL });
const jars = {}, userIds = [], ids = {};
let planId, settings, passed = 0;
const step = message => { passed++; console.log('✓', message); };

async function api(who, path, body, { method = body ? 'POST' : 'GET', origin = true } = {}) {
  const jar = jars[who] ??= {}, isForm = body instanceof FormData;
  const headers = { Cookie: Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; '), ...(origin ? { Origin: base } : {}), ...(body && !isForm ? { 'Content-Type': 'application/json' } : {}) };
  const response = await fetch(base + path, { method, headers, ...(body ? { body: isForm ? body : JSON.stringify(body) } : {}) });
  for (const cookie of response.headers.getSetCookie()) { const pair = cookie.split(';')[0], i = pair.indexOf('='); jar[pair.slice(0, i)] = pair.slice(i + 1); }
  const text = await response.text(); let data; try { data = JSON.parse(text); } catch { data = { error: text.slice(0, 200) }; }
  return { status: response.status, data, text };
}
const ok = (result, status = 200) => { assert.equal(result.status, status, JSON.stringify(result.data)); return result.data; };
const expect = (result, status, pattern) => { assert.equal(result.status, status, JSON.stringify(result.data)); if (pattern) assert.match(result.data.error ?? '', pattern); return result.data; };
async function user(key, role, departments, { stateCode = state, chair = false } = {}) {
  const email = `${key}.${tag}@ubec-comments.test`.toLowerCase();
  const id = (await db.query('INSERT INTO users(email,full_name,role,department,state_code,password_hash,is_beap_chair) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id', [email, `QA ${key}`, role, departments[0] ?? null, stateCode, hashSync(password, 4), chair])).rows[0].id;
  userIds.push(id); ids[key] = id;
  if (!role.startsWith('UBEC')) for (const department of departments) await db.query('INSERT INTO user_departments(user_id,department) VALUES($1,$2)', [id, department]);
  ok(await api(key, '/api/auth/login', { email, password }));
}

await db.connect();
// Default officers configured on Admin would auto-assign on release; this test assigns officers itself, so it runs
// without them and puts them back afterwards (as scripts/test-ubec-flow.mjs does).
const savedDefaults = (await db.query('SELECT * FROM ubec_default_officers')).rows;
await db.query('DELETE FROM ubec_default_officers');
try {
  settings = (await db.query("SELECT beap_chair_submission_mode, ubec_submission_mode FROM state_workflow_settings WHERE state_code='GLOBAL'")).rows[0];
  await db.query("UPDATE state_workflow_settings SET beap_chair_submission_mode='individual_components', ubec_submission_mode='reviewed_components' WHERE state_code='GLOBAL'");
  await user('des', 'Data Entry Staff', ['academic', 'social']);
  await user('desSocial', 'Data Entry Staff', ['social']);
  await user('dir', 'Director', ['academic', 'social']);
  await user('dirSocial', 'Director', ['social']);
  await user('chair', 'Director', ['physical'], { chair: true });
  await user('ec', 'Executive Chairman', []);
  await user('foreignDir', 'Director', ['academic', 'social'], { stateCode: foreign });
  await user('es', 'UBEC Executive Secretary', [], { stateCode: 'UBEC' });
  await user('uchair', 'UBEC BEAP Chair', [], { stateCode: 'UBEC' });
  await user('dacs', 'UBEC Director', ['academic'], { stateCode: 'UBEC' });
  await user('dsm', 'UBEC Director', ['social'], { stateCode: 'UBEC' });
  // Two Academic Services officers share Sports; one Social Mobilisation officer has SBMC.
  await user('revA', 'UBEC Assessment Officer', ['academic'], { stateCode: 'UBEC' });
  await user('revP', 'UBEC Assessment Officer', ['academic'], { stateCode: 'UBEC' });
  await user('revS', 'UBEC Assessment Officer', ['social'], { stateCode: 'UBEC' });
  for (const department of ['audit', 'procurement', 'finance']) await user(department, 'UBEC Oversight Director', [department], { stateCode: 'UBEC' });

  const rat = new ExcelJS.Workbook(); rat.addWorksheet('RAT').addRow(['UBEC comments QA']);
  const form = new FormData();
  form.set('setup', JSON.stringify({ planningYear: 2031, implementationYear: 2031, quarters: [1, 2, 3, 4], stateLodgment: '500000000', otherFunding: '0' }));
  form.append('rat', new Blob([await rat.xlsx.writeBuffer()]), 'rat.xlsx');
  planId = ok(await api('ec', '/api/plans', form), 201).plan.id;
  const q = `?plan=${planId}`, ubec = `/api/ubec/comments${q}`, stateComments = `/api/plans/comments${q}`, reviewPath = `/api/plans/review${q}`, ubecReview = `/api/ubec/review${q}`;
  const review = async (who, action, pillar, comment = '') => ok(await api(who, reviewPath, { action, pillar, version: ok(await api(who, reviewPath)).plan.version, comment }));
  const decide = async (action, extra = {}) => { const d = ok(await api('uchair', ubecReview)); return api('uchair', ubecReview, { action, version: d.plan.version, roundId: d.round.id, comment: 'Consolidated UBEC feedback.', ...extra }); };
  const balls = String(ok(await api('des', `/api/sports${q}`, { entity: 'budget', action: 'create', section: 'equipment', activityType: 'Football', description: 'Match balls', quantity: 10, unitCost: 15000 }), 201).id);
  const kits = String(ok(await api('des', `/api/sports${q}`, { entity: 'budget', action: 'create', section: 'competitions', activityType: 'Inter School Competition', description: 'Inter-school finals', quantity: 1, unitCost: 900000 }), 201).id);
  ok(await api('des', `/api/activities${q}`, { workstream: 'sbmc', entity: 'line', action: 'create', activity: 1, description: 'Rehabilitate ECCDE centres', rationale: 'Collapsed roofs', implementationApproach: 'Community labour', quantity: 100, unitCost: 500000, strategy: 'Credit SBMC school account', targetGroup: 'Community level', location: 'Rural' }));
  const sbmcLine = String((await db.query("SELECT id FROM activity_plan_lines WHERE plan_id=$1 AND workstream='sbmc'", [planId])).rows[0].id);
  for (const pillar of ['sports', 'sbmc']) await review('des', 'submit', pillar);
  const stateThread = ok(await api('dir', stateComments, { sheet: 'sports', rowRef: balls, columnId: 'unitCost', body: 'STATE-INTERNAL: director note on unit cost' }), 201).id;
  for (const pillar of ['sports', 'sbmc']) { await review(pillar === 'sbmc' ? 'dirSocial' : 'dir', 'endorse', pillar); await review('chair', 'forward', pillar); }
  ok(await api('ec', ubecReview, { action: 'submit', version: ok(await api('ec', ubecReview)).plan.version }));
  const round1 = ok(await api('uchair', ubecReview)).round.id;
  const components = `/api/ubec/components${q}`;
  // Every visible line accepted, assessment complete, sent for oversight and observed by Audit, Procurement and Finance.
  async function assess(round, pillar, director, officers) {
    const rows = ok(await api(officers[0], ubecReview)).round.snapshot[pillar].map(line => String(line.id));
    for (const rowRef of rows) ok(await api(officers[0], `/api/ubec/decisions${q}`, { roundId: round, pillar, rowRef, decision: 'accept', note: '' }, { method: 'PUT' }));
    for (const officer of officers) ok(await api(officer, components, { action: 'complete_assessment', roundId: round, pillar }));
    ok(await api(director, components, { action: 'send_oversight', roundId: round, pillar, comment: 'Assessed.' }));
    for (const who of ['audit', 'procurement', 'finance']) ok(await api(who, components, { action: 'observations_done', roundId: round, pillar }));
  }
  async function release(round, assignments) {
    ok(await decide('release', { comment: 'Released to the departments.' }));
    for (const [pillar, director, officers] of assignments) ok(await api(director, components, { action: 'assign_officers', roundId: round, pillar, officerIds: officers.map(o => ids[o]), comment: 'Please assess.' }));
  }
  step(`plan ${planId} (Sports + SBMC) went through the state chain and was sent to UBEC as round ${round1}`);

  // Before release only the UBEC BEAP Chair can comment; officers have no round yet; the ES reads but never writes.
  const cell = (who, rowRef, columnId, body, sheet = 'sports') => api(who, ubec, { sheet, rowRef, columnId, body });
  expect(await cell('es', sbmcLine, null, 'ES cannot write', 'sbmc'), 403, /read-only/);
  const esSbmc = ok(await cell('uchair', sbmcLine, null, 'ES-SHARED: the SBMC line needs a community needs assessment.', 'sbmc'), 201).id;
  expect(await api('revA', ubec), 404); expect(await cell('revA', balls, 'amount', 'too early'), 404);
  await release(round1, [['sports', 'dacs', ['revA', 'revP']], ['sbmc', 'dsm', ['revS']]]);
  step('received round: the UBEC BEAP Chair starts a thread on any component; the ES cannot write (403); unassigned officers see no round (404)');

  const t1 = ok(await cell('revA', balls, 'unitCost', 'REV-A-SHARED: unit cost is above the national benchmark.'), 201).id;
  const t3 = ok(await cell('revP', kits, null, 'REV-P-INTERNAL: draft thought, do not send.'), 201).id;
  const t4 = ok(await cell('revP', balls, 'quantity', 'REV-P-RESOLVED: quantity checked.'), 201).id;
  const t5 = ok(await cell('uchair', kits, 'amount', 'ES-SHARED-2: finals amount should be split by zone.'), 201).id;
  expect(await cell('revA', sbmcLine, 'rationale', 'not mine', 'sbmc'), 403, /not assigned/);
  expect(await cell('revS', balls, 'code', 'not mine'), 403, /not assigned/);
  ok(await cell('revS', sbmcLine, 'rationale', 'REV-S-INTERNAL: rationale is thin.', 'sbmc'), 201);
  expect(await cell('revP', balls, 'unitCost', 'second thread'), 409, /already has an open comment/);
  step('officers start threads only on assigned components (403 otherwise); one open UBEC thread per cell (409)');

  expect(await cell('uchair', '987654321', 'amount', 'x'), 400, /no longer in the plan/); expect(await cell('uchair', balls, 'rationale', 'x'), 400, /no longer in the plan/);
  expect(await cell('uchair', balls, 'amount', '   '), 400, /Write a comment/); expect(await cell('uchair', balls, 'amount', 'x'.repeat(2001)), 400, /2,000/);
  expect(await cell('uchair', balls, 'amount', 'x', 'tlm'), 400); expect(await api('uchair', ubec, { sheet: 'sports', rowRef: balls, columnId: 'amount', body: 'x', extra: 1 }), 400);
  expect(await api('uchair', ubec, { sheet: 'sports', rowRef: balls, columnId: 'amount', body: 'x' }, { origin: false }), 403, /portal/);
  expect(await api('es', `/api/ubec/comments?plan=abc`), 400); expect(await api('es', `/api/ubec/comments?plan=999999999`), 404);
  for (const who of ['ec', 'des', 'dir']) { expect(await api(who, ubec), 403); expect(await cell(who, balls, 'amount', 'x'), 403); }
  expect(await api('anonymous', ubec), 401);
  step('validation against the round snapshot (400), same origin (403), state roles refused (403), anonymous (401), unknown plan (404)');

  const visible = async who => ok(await api(who, ubec)).threads;
  const bodies = threads => threads.map(t => t.body);
  const esView = await visible('es'), revAView = await visible('revA'), revSView = await visible('revS');
  assert.equal(esView.length, 6); assert.ok(esView.every(t => t.scope === 'ubec' && t.sharedAt === null));
  assert.deepEqual(new Set(revAView.map(t => t.id)), new Set([t1, t3, t4, t5])); assert.deepEqual(new Set(bodies(revSView)), new Set(['ES-SHARED: the SBMC line needs a community needs assessment.', 'REV-S-INTERNAL: rationale is thin.']));
  for (const view of [esView, revAView, revSView]) assert.ok(!JSON.stringify(view).includes('STATE-INTERNAL'), 'UBEC must never see state-scope comments');
  assert.equal(ok(await api('revA', ubec)).abilities.sbmc, undefined); assert.equal(ok(await api('revA', ubec)).abilities.sports.start, true);
  assert.equal(ok(await api('uchair', ubec)).threads.length, 6);
  assert.deepEqual(ok(await api('es', ubec)).abilities.sports, { start: false, reply: false, resolveAny: false, reopen: false }, 'the ES is read-only');
  step('visibility: the ES and UBEC BEAP Chair see all 6 threads; officers see every thread on their components (other reviewers and ES too), nothing else; no state-scope text');

  ok(await api('revA', ubec, { parentId: t5, body: 'REV-A-REPLY: agreed with the ES.' }), 201);
  ok(await api('revA', ubec, { parentId: t1, body: 'REV-A-REPLY-BEFORE-SHARE: please attach quotations.' }), 201);
  expect(await api('revA', ubec, { parentId: esSbmc, body: 'x' }), 404); expect(await api('revA', ubec, { parentId: stateThread, body: 'x' }), 404);
  ok(await api('revA', ubec, { id: t4, action: 'resolve' }, { method: 'PATCH' }));
  expect(await api('revA', ubec, { parentId: t4, body: 'x' }), 409, /Reopen/);
  expect(await api('es', ubec, { id: t4, action: 'resolve' }, { method: 'PATCH' }), 403, /read-only/);
  expect(await api('es', ubec, { parentId: t5, body: 'ES reply' }), 403, /read-only/);
  ok(await api('revP', ubec, { id: t4, action: 'reopen' }, { method: 'PATCH' })); ok(await api('uchair', ubec, { id: t4, action: 'resolve' }, { method: 'PATCH' }));
  expect(await api('revS', ubec, { id: t1, action: 'resolve' }, { method: 'PATCH' }), 404);
  step('replies, resolve and reopen by any UBEC reviewer who can see the thread (the ES 403); other components and state threads are 404');

  // Nothing UBEC wrote reaches the state while it is internal.
  const secrets = ['ES-SHARED', 'REV-A-SHARED', 'REV-P-INTERNAL', 'REV-P-RESOLVED', 'REV-S-INTERNAL', 'REV-A-REPLY'];
  const stateEndpoints = [stateComments, reviewPath, ubecReview, '/api/plans', '/api/beap' + q, '/api/plans/notifications', `/api/sports${q}`, `/api/activities${q}&workstream=sbmc`];
  async function assertStateSees(allowed) {
    for (const who of ['ec', 'des', 'dir', 'dirSocial', 'chair', 'desSocial']) for (const path of stateEndpoints) {
      const result = await api(who, path);
      assert.ok(result.status < 500, `${who} ${path} failed: ${result.status}`);
      for (const secret of secrets.filter(s => !allowed.some(a => a.startsWith(s) || s === a))) assert.ok(!result.text.includes(secret), `${who} ${path} leaked ${secret}`);
    }
  }
  await assertStateSees([]);
  assert.ok(ok(await api('ec', stateComments)).threads.every(t => t.scope === 'state'));
  step(`no UBEC text in ${stateEndpoints.length} state APIs (comments, review, UBEC review, plans dashboard, BEAP, notifications, editors) for six state roles`);

  // Both components finish assessment and oversight, so the UBEC BEAP Chair can decide.
  await assess(round1, 'sports', 'dacs', ['revA', 'revP']); await assess(round1, 'sbmc', 'dsm', ['revS']);
  // Sharing on return: validated ids only.
  expect(await decide('return', { shareCommentIds: [999999999] }), 400, /no longer open/);
  expect(await decide('return', { shareCommentIds: [stateThread] }), 400, /no longer open/);
  expect(await decide('return', { shareCommentIds: [t4] }), 400, /no longer open/);
  expect(await decide('return', { shareCommentIds: [t1, t1] }), 400);
  expect(await decide('return', { shareCommentIds: ['1'] }), 400);
  expect(await decide('approve', { shareCommentIds: [t1] }), 400, /returning/);
  expect(await decide('release', { shareCommentIds: [t1] }), 400, /returning/);
  assert.equal(Number((await db.query('SELECT COUNT(*) FROM plan_comments WHERE plan_id=$1 AND shared_at IS NOT NULL', [planId])).rows[0].count), 0);
  ok(await decide('return', { shareCommentIds: [t1, t5, esSbmc] }));
  const shared = (await db.query('SELECT id FROM plan_comments WHERE plan_id=$1 AND shared_at IS NOT NULL AND shared_by_name IS NOT NULL ORDER BY id', [planId])).rows.map(r => Number(r.id));
  assert.deepEqual(shared, [esSbmc, t1, t5].sort((a, b) => a - b));
  step('return: unknown, state, resolved, duplicate and malformed ids are rejected (400); share only on return; exactly the 3 ticked threads are shared');

  const stateView = ok(await api('des', stateComments));
  const ubecThreads = stateView.threads.filter(t => t.scope === 'ubec');
  assert.deepEqual(new Set(ubecThreads.map(t => t.id)), new Set([t1, t5, esSbmc]));
  assert.deepEqual(ubecThreads.find(t => t.id === t1).replies.map(r => r.body), ['REV-A-REPLY-BEFORE-SHARE: please attach quotations.']);
  assert.ok(ubecThreads.every(t => t.roundNumber === 1 && t.sharedAt === undefined), 'state view carries the round number but not sharing internals');
  assert.deepEqual(stateView.otherAbilities.sports, { start: false, reply: true, resolveAny: true, reopen: false });
  await assertStateSees(['ES-SHARED', 'REV-A-SHARED', 'REV-A-REPLY']);
  for (const path of stateEndpoints) for (const who of ['ec', 'des', 'dir']) { const text = (await api(who, path)).text; for (const secret of ['REV-P-INTERNAL', 'REV-P-RESOLVED', 'REV-S-INTERNAL']) assert.ok(!text.includes(secret), `${path} leaked ${secret}`); }
  assert.ok(!ok(await api('dirSocial', stateComments)).threads.some(t => t.pillar === 'sports'), 'other department sees no Sports UBEC thread');
  step('state view: only the 3 shared threads (with the UBEC reply written before sharing), tagged scope ubec; unticked and resolved threads stay invisible everywhere');

  // State replies and resolves; only UBEC reopens.
  ok(await api('des', stateComments, { parentId: t1, body: 'STATE-REPLY-1: quotations attached to the dossier.' }), 201);
  ok(await api('ec', stateComments, { parentId: t5, body: 'STATE-REPLY-2: split into three zonal finals.' }), 201);
  expect(await api('dirSocial', stateComments, { parentId: t1, body: 'x' }), 404);
  expect(await api('des', stateComments, { parentId: t3, body: 'x' }), 404); expect(await api('des', stateComments, { id: t3, action: 'resolve' }, { method: 'PATCH' }), 404);
  expect(await api('foreignDir', stateComments), 404); expect(await api('foreignDir', stateComments, { parentId: t1, body: 'x' }), 404);
  expect(await api('dir', stateComments, { id: t5, action: 'resolve' }, { method: 'PATCH' }), 403, /UBEC comment/);
  ok(await api('desSocial', stateComments, { id: esSbmc, action: 'resolve' }, { method: 'PATCH' }));
  expect(await api('desSocial', stateComments, { parentId: esSbmc, body: 'x' }), 409, /Only UBEC can reopen/);
  for (const who of ['ec', 'dirSocial', 'desSocial']) expect(await api(who, stateComments, { id: esSbmc, action: 'reopen' }, { method: 'PATCH' }), 403, /Only UBEC/);
  expect(await api('dir', stateComments, { sheet: 'sports', rowRef: balls, columnId: 'amount', body: 'x' }), 403, /holding/);
  expect(await api('es', stateComments, { parentId: t1, body: 'x' }), 403);
  step('state: department Data Entry and the Executive Chairman reply; other department, unshared ids and other states 404; non-holder Director cannot resolve (403); Data Entry resolves; only UBEC reopens (403)');

  // Returned round: UBEC reads it but writes are refused, and the state's new replies are not shown yet.
  expect(await cell('uchair', balls, 'code', 'late'), 409, /read-only/); expect(await api('revA', ubec, { parentId: t1, body: 'late' }), 409, /read-only/);
  let esRound = ok(await api('es', ubec)); assert.equal(esRound.locked, true);
  assert.ok(!JSON.stringify(esRound).includes('STATE-REPLY'), 'UBEC must not see state replies before resubmission');
  assert.equal(esRound.threads.find(t => t.id === esSbmc).resolvedAt, null, 'a state resolution waits for resubmission too');
  step('returned round: UBEC writes 409; state replies and resolutions are hidden from UBEC until resubmission');

  // The state resubmits; the Sports kits line is deleted first.
  await review('des', 'submit', 'sports', 'Quotations attached; finals split.'); await review('des', 'submit', 'sbmc', 'Needs assessment attached.');
  ok(await api('dir', stateComments, { sheet: 'sports', rowRef: balls, columnId: 'section', body: 'Director thread during the return' }), 201);
  const sameCell = (await db.query("SELECT COUNT(*)::int AS n FROM plan_comments WHERE plan_id=$1 AND sheet='sports' AND row_ref=$2 AND column_id='unitCost' AND parent_id IS NULL AND resolved_at IS NULL", [planId, balls])).rows[0].n;
  assert.equal(sameCell, 2, 'a state thread and a UBEC thread can both be open on one cell');
  ok(await api('dir', stateComments, { id: t5, action: 'resolve' }, { method: 'PATCH' }));
  await review('dir', 'request_changes', 'sports', 'Remove the finals line.');
  ok(await api('des', `/api/sports${q}`, { entity: 'budget', action: 'delete', id: Number(kits) }));
  await review('des', 'submit', 'sports', 'Finals line removed.');
  for (const pillar of ['sports', 'sbmc']) { await review(pillar === 'sbmc' ? 'dirSocial' : 'dir', 'endorse', pillar); await review('chair', 'forward', pillar); }
  ok(await api('ec', ubecReview, { action: 'submit', version: ok(await api('ec', ubecReview)).plan.version, comment: 'All UBEC comments addressed.' }));
  const round2 = ok(await api('uchair', ubecReview)).round.id;
  step('state: holder Director resolves a shared thread; a state and a UBEC thread stay open on the same cell (one per scope); the plan is resubmitted as round 2');

  esRound = ok(await api('es', ubec));
  assert.equal(esRound.roundId, round2); assert.equal(esRound.locked, false);
  assert.deepEqual(new Set(esRound.threads.map(t => t.id)), new Set([t1, t5, esSbmc]), 'round 2 carries the shared threads only');
  assert.deepEqual(esRound.threads.find(t => t.id === t1).replies.map(r => r.body), ['REV-A-REPLY-BEFORE-SHARE: please attach quotations.', 'STATE-REPLY-1: quotations attached to the dossier.']);
  assert.ok(esRound.threads.find(t => t.id === t5).resolvedAt && esRound.threads.find(t => t.id === esSbmc).resolvedAt);
  assert.ok(esRound.threads.find(t => t.id === t5).orphaned, 'thread on the deleted line is orphaned');
  assert.ok(!JSON.stringify(esRound).includes('Director thread') && !JSON.stringify(esRound).includes('STATE-INTERNAL'));
  const history = ok(await api('es', `${ubec}&round=${round1}`));
  assert.equal(history.locked, true); assert.equal(history.threads.length, 6);
  assert.ok(!JSON.stringify(history).includes('STATE-REPLY'), 'round 1 history shows the round as it was decided');
  expect(await api('uchair', `${ubec}&round=${round1}`, { parentId: t1, body: 'x' }), 409, /read-only/);
  expect(await cell('uchair', kits, 'amount', 'deleted line'), 400, /no longer in the plan/);
  step('round 2: UBEC sees the carried shared threads with the state replies and resolutions, orphaned rows flagged; round 1 history is read-only and unchanged');

  expect(await api('revA', ubec, { parentId: t1, body: 'x' }), 404, /Submission not found/);
  await release(round2, [['sports', 'dacs', ['revA']], ['sbmc', 'dsm', ['revS']]]);
  const revRound = ok(await api('revA', ubec)); assert.equal(revRound.roundId, round2);
  assert.ok(revRound.threads.some(t => t.id === t1 && t.replies.some(r => r.body.startsWith('STATE-REPLY-1'))));
  ok(await api('revA', ubec, { parentId: t1, body: 'REV-A-ROUND2-INTERNAL: thanks, the quotations look fine.' }), 201);
  ok(await api('revA', ubec, { id: t1, action: 'resolve' }, { method: 'PATCH' }));
  const r2 = ok(await cell('uchair', balls, 'unitCost', 'ROUND2-INTERNAL: approve as is.'), 201).id;
  expect(await api('revA', ubec, { id: t1, action: 'reopen' }, { method: 'PATCH' }), 409, /Another open comment/);
  ok(await api('revA', ubec, { id: t5, action: 'reopen' }, { method: 'PATCH' }));
  ok(await api('uchair', ubec, { id: esSbmc, action: 'reopen' }, { method: 'PATCH' }));
  expect(await api('revS', ubec, { id: t5, action: 'resolve' }, { method: 'PATCH' }), 404);
  step('round 2 officers see the state replies; a reopen that would duplicate an open cell thread is refused (409); UBEC reopens threads the state resolved');

  // Approval never shares.
  await assess(round2, 'sports', 'dacs', ['revA']); await assess(round2, 'sbmc', 'dsm', ['revS']);
  ok(await decide('approve'));
  assert.equal((await db.query('SELECT shared_at FROM plan_comments WHERE id=$1', [r2])).rows[0].shared_at, null);
  const finalState = ok(await api('ec', stateComments));
  assert.ok(!JSON.stringify(finalState).includes('ROUND2-INTERNAL') && !JSON.stringify(finalState).includes('REV-A-ROUND2-INTERNAL'), 'approval must not share new UBEC text');
  assert.equal(finalState.locked, true);
  expect(await api('des', stateComments, { parentId: t1, body: 'after approval' }), 409, /locked/);
  expect(await cell('uchair', balls, 'code', 'after approval'), 409, /read-only/);
  step('approve shares nothing: new round-2 UBEC text stays internal; state writes on the approved plan 409; UBEC writes 409');

  // The state scope rules are unchanged: request_changes still counts only state threads.
  const counts = (await db.query("SELECT scope, COUNT(*)::int AS n FROM plan_comments WHERE plan_id=$1 GROUP BY scope ORDER BY scope", [planId])).rows;
  assert.deepEqual(counts.map(r => r.scope), ['state', 'ubec']);
  const scopes = (await db.query("SELECT COUNT(*)::int AS n FROM plan_comments c JOIN plan_comments r ON r.id=c.parent_id WHERE c.plan_id=$1 AND c.scope<>r.scope", [planId])).rows[0].n;
  assert.equal(scopes, 0, 'replies share their thread scope');
  step('database: replies keep their thread scope; state and UBEC rows coexist on one plan');
  console.log(`\nPASS: ${passed} UBEC comment checks.`);
} finally {
  for (const r of savedDefaults) await db.query('INSERT INTO ubec_default_officers(pillar,officer_id,updated_by_name,updated_at) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING', [r.pillar, r.officer_id, r.updated_by_name, r.updated_at]).catch(() => undefined);
  if (settings) await db.query("UPDATE state_workflow_settings SET beap_chair_submission_mode=$1, ubec_submission_mode=$2 WHERE state_code='GLOBAL'", [settings.beap_chair_submission_mode, settings.ubec_submission_mode]);
  if (planId) {
    await db.query('DELETE FROM plan_comments WHERE plan_id=$1', [planId]);
    await db.query('DELETE FROM ubec_events WHERE plan_id=$1', [planId]);
    await db.query('DELETE FROM ubec_assignments WHERE round_id IN (SELECT id FROM ubec_rounds WHERE plan_id=$1)', [planId]);
    await db.query('DELETE FROM ubec_rounds WHERE plan_id=$1', [planId]);
    for (const t of ['plan_notifications', 'plan_review_events', 'plan_submissions', 'plan_pillar_reviews', 'tlm_distribution', 'activity_plan_lines']) await db.query(`DELETE FROM ${t} WHERE plan_id=$1`, [planId]);
    await db.query('DELETE FROM sports_allocations WHERE line_id IN (SELECT id FROM sports_budget_lines WHERE plan_id=$1)', [planId]);
    await db.query('DELETE FROM sports_budget_lines WHERE plan_id=$1', [planId]);
    await db.query('DELETE FROM action_plans WHERE id=$1', [planId]);
  }
  if (userIds.length) await db.query('DELETE FROM users WHERE id=ANY($1::int[])', [userIds]);
  const left = (await db.query('SELECT (SELECT COUNT(*) FROM users WHERE email LIKE $1)::int AS users, (SELECT COUNT(*) FROM action_plans WHERE state_code IN ($2,$3))::int AS plans', [`%.${tag.toLowerCase()}@ubec-comments.test`, state, foreign])).rows[0];
  console.log(`cleaned up: plan ${planId ?? '-'}, ${userIds.length} users (left behind: ${left.users} users, ${left.plans} plans)`);
  await db.end();
}
