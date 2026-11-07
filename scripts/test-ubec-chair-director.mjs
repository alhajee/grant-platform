// UBEC241/242 (migration 094): a UBEC Director may also hold the UBEC BEAP Chair duty (users.is_ubec_beap_chair), set and
// removed by the Super Admin on Admin > Users; at most two chair holders in all (the UBEC BEAP Chair role plus flagged
// Directors). The flagged Director releases, approves and returns like the chair and keeps every Director ability
// (assign officers, change decisions, send to oversight); every chair holder is notified; unflagging removes the chair
// abilities at once. Also checks the refusals (non-Director, SUBEB, a third holder).
// Usage: node --env-file=.env scripts/test-ubec-chair-director.mjs [baseUrl]   (local only; throwaway users and plan)
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { hashSync } from 'bcryptjs';
import ExcelJS from 'exceljs';
import { signForUbec } from './test-support/sign-for-ubec.mjs';
import { withProformas } from './test-support/proformas.mjs';

const base = process.argv[2] ?? process.env.TEST_BASE_URL ?? process.env.UBEC_TEST_URL ?? 'http://localhost:5173';
assert.match(base, /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/, 'Run this test against a local server only.');
assert.ok(['localhost', '127.0.0.1'].includes(new URL(process.env.DATABASE_URL).hostname), 'Use a local database only.');
const marker = `UC${randomUUID().slice(0, 6).toUpperCase()}`, password = randomUUID();
const db = new Client({ connectionString: process.env.DATABASE_URL });
const jars = {}, users = {}, emails = {};
let settings, savedDefaults, planId, passed = 0;
const step = message => { passed++; console.log('✓', message); };

async function api(who, path, body, method = body ? 'POST' : 'GET') {
  await withProformas(db, path, body);
  const jar = jars[who] ?? {};
  const cookie = Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ');
  const response = await fetch(base + path, { method, redirect: 'manual', headers: { Origin: base, ...(body && !(body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}) }, ...(body ? { body: body instanceof FormData ? body : JSON.stringify(body) } : {}) });
  for (const set of response.headers.getSetCookie()) { const pair = set.split(';')[0], i = pair.indexOf('='); jar[pair.slice(0, i)] = pair.slice(i + 1); }
  jars[who] = jar;
  const text = await response.text(); let data; try { data = JSON.parse(text); } catch { data = { error: text.slice(0, 200) }; }
  return { status: response.status, data };
}
const ok = (r, status = 200) => { assert.equal(r.status, status, JSON.stringify(r.data)); return r.data; };
const fails = (r, status, pattern) => { assert.equal(r.status, status, JSON.stringify(r.data)); if (pattern) assert.match(r.data.error ?? '', pattern); return r.data; };
const login = async who => { jars[who] = {}; ok(await api(who, '/api/auth/login', { email: emails[who], password })); };
async function user(who, role, departments, { state = marker, chair = false } = {}) {
  emails[who] = `${who}.${marker}@ubec-chair.test`.toLowerCase();
  const id = (await db.query('INSERT INTO users(email,full_name,role,department,state_code,password_hash,is_beap_chair) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id', [emails[who], `QA ${who} ${marker}`, role, departments[0] ?? null, state, hashSync(password, 4), chair])).rows[0].id;
  users[who] = id;
  for (const department of departments) await db.query('INSERT INTO user_departments(user_id,department) VALUES($1,$2)', [id, department]);
  await login(who);
  return id;
}
const holders = async () => (await db.query("SELECT id FROM users WHERE active AND deleted_at IS NULL AND (role='UBEC BEAP Chair' OR (role='UBEC Director' AND is_ubec_beap_chair))")).rows.map(r => r.id);
const notifiedIds = async action => (await db.query('SELECT n.user_id FROM plan_notifications n JOIN ubec_events u ON u.id=n.ubec_event_id WHERE n.plan_id=$1 AND u.action=$2', [planId, action])).rows.map(r => r.user_id);
const profile = (who, role, department, extra = {}) => ({ id: users[who], name: `QA ${who} ${marker}`, role, stateCode: 'UBEC', departments: [department], active: true, ...extra });
const flag = async (who, department, on) => { const r = await api('admin', '/api/admin/users', profile(who, 'UBEC Director', department, { isUbecBeapChair: on }), 'PATCH'); if (r.status === 200) await login(who); return r; };

await db.connect();
try {
  settings = (await db.query("SELECT beap_chair_submission_mode, ubec_submission_mode, full_allocation_required, eccde_share_required FROM state_workflow_settings WHERE state_code='GLOBAL'")).rows[0];
  await db.query("UPDATE state_workflow_settings SET beap_chair_submission_mode='individual_components', ubec_submission_mode='reviewed_components', full_allocation_required=FALSE, eccde_share_required=FALSE WHERE state_code='GLOBAL'");
  savedDefaults = (await db.query('SELECT * FROM ubec_default_officers')).rows;
  await db.query('DELETE FROM ubec_default_officers');
  const u = { state: 'UBEC' };
  await user('admin', 'Super Admin', [], { state: 'ADMIN' });
  await user('dpp', 'UBEC Director', ['physical'], u); await user('dacs', 'UBEC Director', ['academic'], u); await user('dme', 'UBEC Director', ['quality'], u);
  await user('offP', 'UBEC Assessment Officer', ['physical'], u); await user('audit', 'UBEC Oversight Director', ['audit'], u); await user('es', 'UBEC Executive Secretary', [], u);
  await user('desP', 'Data Entry Staff', ['physical']); await user('dirP', 'Director', ['physical']);
  await user('subebChair', 'Director', ['planning'], { chair: true }); await user('ec', 'Executive Chairman', []);

  // Only a UBEC Director takes the duty.
  fails(await api('admin', '/api/admin/users', profile('audit', 'UBEC Oversight Director', 'audit', { isUbecBeapChair: true }), 'PATCH'), 400, /UBEC Director/);
  fails(await api('admin', '/api/admin/users', { ...profile('dirP', 'Director', 'physical', { isUbecBeapChair: true }), stateCode: marker }, 'PATCH'), 400, /UBEC Director/);
  fails(await api('dpp', '/api/admin/users', profile('dpp', 'UBEC Director', 'physical', { isUbecBeapChair: true }), 'PATCH'), 403);
  step('only a UBEC Director can be given the UBEC BEAP Chair duty, and only by the Super Admin');

  // UBEC242: at most two holders. Flag Directors until refused; how many pass depends on the holders already there.
  const before = (await holders()).length, room = Math.max(0, 2 - before);
  const tried = [['dpp', 'physical'], ['dacs', 'academic'], ['dme', 'quality']];
  let accepted = 0, refused = null;
  for (const [who, department] of tried) {
    const r = await flag(who, department, true);
    if (r.status === 200) { accepted++; continue; }
    refused = fails(r, 409, /already has 2 BEAP Chairs/); break;
  }
  assert.equal(accepted, room, `with ${before} holder(s) already, ${room} more may be added`);
  assert.ok(refused, 'the holder beyond two is refused');
  assert.ok((await holders()).length <= 2);
  step(`UBEC242: at most two BEAP Chair holders in all (${before} already, ${accepted} Director(s) flagged, the next refused with 409)`);
  // The flow below needs dpp flagged; when the local data already has two holders, set it directly.
  if (!accepted) { await db.query('UPDATE users SET is_ubec_beap_chair=TRUE WHERE id=$1', [users.dpp]); }
  if (accepted === 2) { ok(await flag('dacs', 'academic', false)); }
  const listed = (await api('admin', '/api/admin/impersonation')).data.users.find(x => x.id === users.dpp);
  assert.equal(listed.isUbecBeapChair, true, 'Admin > Users shows the duty');
  // Unflagging frees a place: another Director can take it.
  ok(await flag('dpp', 'physical', false));
  ok(await flag('dme', 'quality', true)); ok(await flag('dme', 'quality', false));
  ok(await flag('dpp', 'physical', true));
  step('removing the duty frees the place for another Director ("unlinked and given to another Director")');

  // A plan sent to UBEC.
  const rat = new ExcelJS.Workbook(); rat.addWorksheet('RAT').addRow(['UBEC chair QA']);
  const form = new FormData();
  form.set('setup', JSON.stringify({ planningYear: 2018, implementationYear: 2018, quarters: [1, 2, 3, 4], stateLodgment: '100000000', fundingSources: [] }));
  form.append('rat', new Blob([await rat.xlsx.writeBuffer()]), 'rat.xlsx');
  planId = ok(await api('ec', '/api/plans', form), 201).plan.id;
  const q = `?plan=${planId}`, statePath = `/api/plans/review${q}`, path = `/api/ubec/review${q}`, components = `/api/ubec/components${q}`, decisions = `/api/ubec/decisions${q}`;
  ok(await api('desP', `/api/activities${q}&workstream=monitoring`, { workstream: 'monitoring', entity: 'line', action: 'create', activity: 0, description: 'QA monitoring visit', quantity: 1, unitCost: 1000, strategy: 'Request for quotation', targetGroup: 'Schools' }));
  const stateStep = async (who, action) => ok(await api(who, statePath, { action, pillar: 'monitoring', version: ok(await api('ec', statePath)).plan.version, comment: '' }));
  await stateStep('desP', 'submit'); await stateStep('dirP', 'endorse'); await stateStep('subebChair', 'forward');
  await signForUbec(db, path);
  ok(await api('ec', path, { action: 'submit', version: ok(await api('ec', path)).plan.version }));
  const submitted = await notifiedIds('submit'), current = await holders();
  assert.ok(current.includes(users.dpp));
  for (const id of current) assert.ok(submitted.includes(id), `chair holder ${id} is notified of the submission`);
  step('submit: every BEAP Chair holder is notified, the flagged Director included');

  // The flagged Director acts as chair.
  const view = async who => ok(await api(who, path));
  let mine = await view('dpp');
  assert.equal(mine.chair, true); assert.equal(mine.user.chair, true);
  assert.equal(mine.flow.abilities.release, true);
  const dash = ok(await api('dpp', '/api/ubec/dashboard'));
  assert.equal(dash.user.chair, true);
  assert.ok(dash.queue.some(i => i.planId === planId && i.kind === 'release'), 'the release is in their queue');
  assert.ok(dash.items.some(i => i.planId === planId));
  fails(await api('dacs', path), 404); // an ordinary Director sees nothing before release
  const roundId = mine.round.id;
  ok(await api('dpp', path, { action: 'release', version: mine.plan.version, roundId, comment: 'Released by the Director-Chair.' }));
  assert.ok((await notifiedIds('release')).every(id => id !== users.dpp), 'the actor is not notified of their own release');
  step('the flagged Director sees the round before release, has it in their queue and releases it');

  // ...and keeps the Director's work on their department.
  mine = await view('dpp');
  assert.deepEqual(mine.flow.abilities.assign, ['monitoring']);
  ok(await api('dpp', components, { action: 'assign_officers', roundId, pillar: 'monitoring', officerIds: [users.offP], comment: 'Please assess.' }));
  const line = String((await db.query("SELECT id FROM activity_plan_lines WHERE plan_id=$1 AND workstream='monitoring'", [planId])).rows[0].id);
  ok(await api('offP', decisions, { roundId, pillar: 'monitoring', rowRef: line, decision: 'accept', note: '' }, 'PUT'));
  ok(await api('offP', components, { action: 'complete_assessment', roundId, pillar: 'monitoring', note: 'Fine.' }));
  ok(await api('dpp', decisions, { roundId, pillar: 'monitoring', rowRef: line, decision: 'accept', note: 'Director check' }, 'PUT'));
  ok(await api('dpp', components, { action: 'send_oversight', roundId, pillar: 'monitoring', comment: 'Assessed.' }));
  ok(await api('dpp', '/api/ubec/officers'));
  step('as Director they still assign officers, change decisions and send to the Oversight Departments; they manage officers');

  // Oversight finished (as if every Oversight Department had recorded its observations).
  await db.query("UPDATE ubec_round_components SET stage='chair', arrived_at=NOW() WHERE round_id=$1", [roundId]);
  assert.equal((await view('dpp')).flow.abilities.decide, true);
  // Unflagging takes the chair abilities away at once.
  ok(await flag('dpp', 'physical', false));
  mine = await view('dpp');
  assert.equal(mine.chair, false); assert.equal(mine.flow.abilities.decide, false);
  fails(await api('dpp', path, { action: 'approve', version: mine.plan.version, roundId, comment: 'x' }), 403);
  assert.equal(ok(await api('dpp', '/api/ubec/dashboard')).user.chair, false);
  step('removing the duty takes away release, approve and return at once (403)');

  ok(await flag('dpp', 'physical', true));
  mine = await view('dpp');
  ok(await api('dpp', path, { action: 'approve', version: mine.plan.version, roundId, comment: 'Approved by the Director-Chair.' }));
  assert.equal((await db.query("SELECT status FROM ubec_rounds WHERE id=$1", [roundId])).rows[0].status, 'approved');
  assert.equal((await db.query("SELECT actor_role FROM plan_review_events WHERE plan_id=$1 AND action='approve' ORDER BY id DESC LIMIT 1", [planId])).rows[0].actor_role, 'UBEC BEAP Chair');
  for (const id of (await holders()).filter(id => id !== users.dpp)) assert.ok((await notifiedIds('approve')).includes(id), 'the other chair hears of the decision');
  step('flagged again, they approve the plan; the SUBEB sees a UBEC BEAP Chair decision and the other chair is notified');

  // A deleted Director loses the duty.
  ok(await api('admin', '/api/admin/users', { id: users.dacs }, 'DELETE'));
  assert.equal((await db.query('SELECT is_ubec_beap_chair FROM users WHERE id=$1', [users.dacs])).rows[0]?.is_ubec_beap_chair ?? false, false);
  step('deleting a Director clears the duty');
  console.log(`\nPASS: ${passed} UBEC chair-director checks.`);
} finally {
  if (settings) await db.query("UPDATE state_workflow_settings SET beap_chair_submission_mode=$1, ubec_submission_mode=$2, full_allocation_required=$3, eccde_share_required=$4 WHERE state_code='GLOBAL'", [settings.beap_chair_submission_mode, settings.ubec_submission_mode, settings.full_allocation_required, settings.eccde_share_required]);
  if (savedDefaults) {
    await db.query('DELETE FROM ubec_default_officers');
    for (const r of savedDefaults) await db.query('INSERT INTO ubec_default_officers(pillar,officer_id,updated_by_name,updated_at) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING', [r.pillar, r.officer_id, r.updated_by_name, r.updated_at]);
  }
  // The Super Admin's plan delete clears the plan, its UBEC rounds and everything that refers to it.
  if (planId) { const r = await api('admin', '/api/admin/plans', { id: planId, confirm: marker }, 'DELETE'); if (r.status !== 200) console.warn('Plan not deleted:', r.data.error); }
  const ids = Object.values(users);
  if (ids.length) {
    await db.query('UPDATE users SET is_ubec_beap_chair=FALSE WHERE id=ANY($1::int[])', [ids]);
    await db.query('DELETE FROM user_management_events WHERE actor_id=ANY($1::int[]) OR target_id=ANY($1::int[])', [ids]);
    await db.query('DELETE FROM sessions WHERE user_id=ANY($1::int[])', [ids]);
    await db.query('DELETE FROM users WHERE id=ANY($1::int[])', [ids]).catch(error => console.warn('Some test users are still referenced:', error.message));
  }
  await db.end();
}
