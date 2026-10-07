// API test for the notification bell (migration 031, app/api/notifications/route.ts).
// Creates a throwaway state with its own users, a UBEC ES and reviewer, and one temporary plan, walks it
// from Data Entry to UBEC and back, and removes everything afterwards.
// Usage: set -a; . ./.env; set +a; node scripts/test-notifications.mjs [baseUrl]
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import ExcelJS from 'exceljs';
import { Client } from 'pg';
import { hashSync } from 'bcryptjs';

const base = process.argv[2] ?? process.env.TEST_BASE_URL ?? process.env.UBEC_TEST_URL ?? 'http://localhost:5173';
assert.match(base, /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/, 'Run this test against a local server only.');
const tag = randomUUID().slice(0, 8).toUpperCase();
const state = `NQ${tag}`, foreign = `NF${tag}`, password = randomUUID();
const db = new Client({ connectionString: process.env.DATABASE_URL });
const jars = {}, userIds = [];
let planId, settings, passed = 0;
const step = message => { passed++; console.log('✓', message); };

async function api(who, path, body, { method = body ? 'POST' : 'GET', origin = true } = {}) {
  const jar = jars[who] ??= {}, isForm = body instanceof FormData;
  const headers = { Cookie: Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; '), ...(origin ? { Origin: base } : {}), ...(body && !isForm ? { 'Content-Type': 'application/json' } : {}) };
  const response = await fetch(base + path, { method, headers, ...(body ? { body: isForm ? body : JSON.stringify(body) } : {}) });
  for (const cookie of response.headers.getSetCookie()) { const pair = cookie.split(';')[0], i = pair.indexOf('='); jar[pair.slice(0, i)] = pair.slice(i + 1); }
  const text = await response.text(); let data; try { data = JSON.parse(text); } catch { data = { error: text.slice(0, 200) }; }
  return { status: response.status, data, headers: response.headers };
}
const ok = (result, status = 200) => { assert.equal(result.status, status, JSON.stringify(result.data)); return result.data; };
async function user(key, role, departments, { stateCode = state, chair = false, department = departments[0] ?? null } = {}) {
  const email = `${key}.${tag}@notifications.test`.toLowerCase();
  const id = (await db.query('INSERT INTO users(email,full_name,role,department,state_code,password_hash,is_beap_chair) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id', [email, `QA ${key}`, role, department, stateCode, hashSync(password, 4), chair])).rows[0].id;
  userIds.push(id);
  for (const d of departments) await db.query('INSERT INTO user_departments(user_id,department) VALUES($1,$2)', [id, d]);
  ok(await api(key, '/api/auth/login', { email, password }));
}
const feed = who => api(who, '/api/notifications').then(ok);
const mine = async who => (await feed(who)).notifications.filter(n => n.planId === planId);
const markRead = (who, body, options) => api(who, '/api/notifications', body, { method: 'PATCH', ...options });

await db.connect();
try {
  settings = (await db.query("SELECT beap_chair_submission_mode, ubec_submission_mode FROM state_workflow_settings WHERE state_code='GLOBAL'")).rows[0];
  await db.query("UPDATE state_workflow_settings SET beap_chair_submission_mode='individual_components', ubec_submission_mode='reviewed_components' WHERE state_code='GLOBAL'");
  await user('des', 'Data Entry Staff', ['academic']);
  await user('dir', 'Director', ['academic']);
  await user('chair', 'Director', ['physical'], { chair: true });
  await user('ec', 'Executive Chairman', []);
  await user('foreignDir', 'Director', ['academic'], { stateCode: foreign });
  await user('es', 'UBEC Executive Secretary', [], { stateCode: 'UBEC' });
  await user('ubecChair', 'UBEC BEAP Chair', [], { stateCode: 'UBEC' });
  await user('dacs', 'UBEC Director', ['academic'], { stateCode: 'UBEC' });
  await user('reviewer', 'UBEC Assessment Officer', ['academic'], { stateCode: 'UBEC' });
  const officerId = userIds.at(-1);
  for (const department of ['audit', 'procurement', 'finance']) await user(department, 'UBEC Oversight Director', [department], { stateCode: 'UBEC' });

  const rat = new ExcelJS.Workbook(); rat.addWorksheet('RAT').addRow(['Notifications QA']);
  const form = new FormData();
  form.set('setup', JSON.stringify({ planningYear: 2031, implementationYear: 2031, quarters: [1, 2, 3, 4], stateLodgment: '500000000', otherFunding: '0' }));
  form.append('rat', new Blob([await rat.xlsx.writeBuffer()]), 'rat.xlsx');
  planId = ok(await api('ec', '/api/plans', form), 201).plan.id;
  const q = `?plan=${planId}`, reviewPath = `/api/plans/review${q}`, ubecPath = `/api/ubec/review${q}`;
  const review = async (who, action, pillar, comment = '') => ok(await api(who, reviewPath, { action, pillar, version: ok(await api(who, reviewPath)).plan.version, comment }));
  ok(await api('des', `/api/sports${q}`, { entity: 'budget', action: 'create', section: 'equipment', activityType: 'Football', description: 'Match balls', quantity: 10, unitCost: 15000 }), 201);
  step(`temporary plan ${planId} created with a Sports line in throwaway state ${state}`);

  let data = await feed('des');
  assert.deepEqual(Object.keys(data).sort(), ['notifications', 'todos', 'unreadCount']);
  assert.ok(data.todos.some(t => t.planId === planId && t.label === 'Complete Sports Activities' && t.href === `/beap/sports?plan=${planId}` && t.period === '2031 · Q1–Q4 BEAP'), JSON.stringify(data.todos));
  assert.match((await api('des', '/api/notifications')).headers.get('cache-control') ?? '', /no-store/);
  step('Data Entry Staff: "Complete Sports Activities" is listed under To do, response is no-store');

  await review('des', 'submit', 'sports');
  let items = await mine('dir');
  assert.equal(items.length, 1); assert.equal(items[0].source, 'state'); assert.equal(items[0].action, 'submit'); assert.equal(items[0].scope, 'sports'); assert.equal(items[0].readAt, null);
  data = await feed('dir');
  assert.ok(data.unreadCount >= 1); assert.ok(data.todos.some(t => t.label === 'Review Sports Activities'));
  assert.equal((await mine('foreignDir')).length, 0); assert.equal((await mine('chair')).length, 0);
  step('submit notifies the department Director (unread, with a Review to-do); other states and the BEAP Chair see nothing');

  assert.equal((await markRead('dir', { ids: [items[0].id] }, { origin: false })).status, 403);
  assert.equal((await markRead('dir', { ids: [] })).status, 400);
  assert.equal((await markRead('dir', { ids: [1], all: true })).status, 400);
  assert.equal((await api('dir', '/api/notifications', { all: true }, { method: 'PATCH' })).status, 200);
  await review('dir', 'endorse', 'sports');
  const chairItem = (await mine('chair'))[0];
  ok(await markRead('dir', { ids: [chairItem.id] }));
  assert.equal((await mine('chair'))[0].readAt, null, 'a user cannot mark another user\'s notification read');
  ok(await markRead('chair', { ids: [chairItem.id] }));
  assert.ok((await mine('chair'))[0].readAt);
  assert.equal((await api('anonymous', '/api/notifications')).status, 401);
  step('PATCH: cross-origin 403, invalid body 400, own ids only, all:true marks everything; anonymous GET 401');

  await review('chair', 'forward', 'sports');
  items = await mine('ec');
  assert.ok(items.some(n => n.action === 'forward' && n.scope === 'sports'));
  assert.ok((await feed('ec')).todos.some(t => t.planId === planId && t.label === 'Review components from BEAP Chair'));
  step('BEAP Chair forward notifies the Executive Chairman, who gets a "Review components from BEAP Chair" to-do');

  let ubec = ok(await api('ec', ubecPath));
  ok(await api('ec', ubecPath, { action: 'submit', version: ubec.plan.version }));
  items = await mine('es');
  assert.equal(items.length, 1); assert.equal(items[0].source, 'ubec'); assert.equal(items[0].action, 'submit'); assert.equal(items[0].stateCode, state); assert.equal(items[0].actorRole, 'Executive Chairman');
  assert.ok((await mine('ubecChair')).some(n => n.action === 'submit' && n.source === 'ubec'), 'the UBEC BEAP Chair hears about the submission');
  assert.deepEqual((await feed('es')).todos, []);
  assert.equal((await feed('ec')).todos.filter(t => t.planId === planId).length, 0, 'no state to-dos while the plan is with UBEC');
  step('submission to UBEC notifies the UBEC BEAP Chair and ES (source ubec); state to-dos clear while the plan is with UBEC');

  const components = `/api/ubec/components${q}`;
  ubec = ok(await api('ubecChair', ubecPath));
  ok(await api('ubecChair', ubecPath, { action: 'release', version: ubec.plan.version, roundId: ubec.round.id, comment: 'Please assess.' }));
  items = await mine('dacs');
  assert.equal(items.length, 1); assert.equal(items[0].action, 'release'); assert.equal(items[0].source, 'ubec');
  ok(await api('dacs', components, { action: 'assign_officers', roundId: ubec.round.id, pillar: 'sports', officerIds: [officerId], comment: 'Check quotations.' }));
  items = await mine('reviewer');
  assert.equal(items.length, 1); assert.equal(items[0].action, 'assign_officer'); assert.equal(items[0].scope, 'sports');
  step('release notifies the Director of the department; officer assignment notifies the officer with the component');

  for (const line of ok(await api('reviewer', ubecPath)).round.snapshot.sports) ok(await api('reviewer', `/api/ubec/decisions${q}`, { roundId: ubec.round.id, pillar: 'sports', rowRef: String(line.id), decision: 'reject', note: 'Quotations needed.' }, { method: 'PUT' }));
  ok(await api('reviewer', components, { action: 'complete_assessment', roundId: ubec.round.id, pillar: 'sports', note: 'Quotations needed.' }));
  assert.ok((await mine('dacs')).some(n => n.action === 'complete_assessment' && n.comment === 'Quotations needed.'));
  ok(await api('dacs', components, { action: 'send_oversight', roundId: ubec.round.id, pillar: 'sports', comment: 'Rejected pending quotations.' }));
  assert.ok((await mine('audit')).some(n => n.action === 'send_oversight'));
  for (const who of ['audit', 'procurement', 'finance']) ok(await api(who, components, { action: 'observations_done', roundId: ubec.round.id, pillar: 'sports', note: '' }));
  assert.ok((await mine('ubecChair')).some(n => n.action === 'ready_for_chair' && n.scope === 'sports'));
  step('completed assessment notifies the Director with the note; oversight is notified; the third observation notifies the UBEC BEAP Chair');

  ubec = ok(await api('ubecChair', ubecPath));
  ok(await api('ubecChair', ubecPath, { action: 'return', version: ubec.plan.version, roundId: ubec.round.id, comment: 'Please attach quotations.' }));
  for (const who of ['des', 'dir', 'ec', 'chair']) assert.ok((await mine(who)).some(n => n.source === 'state' && n.action === 'request_changes' && n.actorRole === 'UBEC BEAP Chair'), who);
  const returned = (await mine('dir')).find(n => n.action === 'request_changes');
  assert.ok(Number.isInteger(returned.eventId) && returned.comment === 'Please attach quotations.', 'the return note carries its review event id for the history link');
  assert.ok((await mine('es')).some(n => n.action === 'return'), 'the ES is told about the decision');
  ok(await markRead('es', { all: true }));
  assert.ok((await mine('es')).every(n => n.readAt));
  step('the UBEC BEAP Chair\'s return notifies the state team (incl. its BEAP Chair) with the note and its review event id; the ES can mark all as read');

  console.log(`\nPASS: ${passed} notification checks.`);
} finally {
  if (settings) await db.query("UPDATE state_workflow_settings SET beap_chair_submission_mode=$1, ubec_submission_mode=$2 WHERE state_code='GLOBAL'", [settings.beap_chair_submission_mode, settings.ubec_submission_mode]);
  if (planId) {
    await db.query('DELETE FROM plan_notifications WHERE plan_id=$1', [planId]);
    await db.query('DELETE FROM ubec_events WHERE plan_id=$1', [planId]);
    await db.query('DELETE FROM ubec_assignments WHERE round_id IN (SELECT id FROM ubec_rounds WHERE plan_id=$1)', [planId]);
    await db.query('DELETE FROM ubec_rounds WHERE plan_id=$1', [planId]);
    for (const t of ['plan_comments', 'plan_review_events', 'plan_submissions', 'plan_pillar_reviews', 'tlm_distribution', 'activity_plan_lines']) await db.query(`DELETE FROM ${t} WHERE plan_id=$1`, [planId]);
    await db.query('DELETE FROM sports_allocations WHERE line_id IN (SELECT id FROM sports_budget_lines WHERE plan_id=$1)', [planId]);
    await db.query('DELETE FROM sports_budget_lines WHERE plan_id=$1', [planId]);
    await db.query('DELETE FROM action_plans WHERE id=$1', [planId]);
  }
  if (userIds.length) await db.query('DELETE FROM users WHERE id=ANY($1::int[])', [userIds]);
  const left = (await db.query('SELECT (SELECT COUNT(*) FROM users WHERE email LIKE $1)::int AS users, (SELECT COUNT(*) FROM action_plans WHERE state_code=$2)::int AS plans', [`%.${tag.toLowerCase()}@notifications.test`, state])).rows[0];
  console.log(`cleaned up: plan ${planId ?? '-'}, ${userIds.length} users (left behind: ${left.users} users, ${left.plans} plans)`);
  await db.end();
}
