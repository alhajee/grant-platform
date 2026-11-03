// UBEC161/163: the items bought for schools are shared out across the distribution list by quantity (activity_line_schools),
// replacing the share by enrolment. Every item is shared in full and every listed school gets items before sending.
// Creates a throwaway state with its own users, schools and plan, and removes them all afterwards.
// Usage: node --env-file=.env scripts/test-distribution-allocations.mjs [baseUrl]  (run through scripts/run-tests.mjs: it
// switches off the full-allocation setting)
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { hashSync } from 'bcryptjs';

const base = process.argv[2] ?? process.env.TEST_BASE_URL ?? process.env.UBEC_TEST_URL ?? 'http://localhost:5173';
assert.ok(['localhost', '127.0.0.1'].includes(new URL(base).hostname), 'Run this test against a local server only.');
assert.ok(['localhost', '127.0.0.1'].includes(new URL(process.env.DATABASE_URL).hostname), 'Use a local database only.');
const tag = randomUUID().slice(0, 8).toUpperCase(), state = `DA${tag}`, password = randomUUID();
const db = new Client({ connectionString: process.env.DATABASE_URL });
const jars = {}, userIds = [], schoolIds = [];
let planId, settings, passed = 0;
const step = message => { passed++; console.log('✓', message); };

async function api(who, path, body, { method = body ? 'POST' : 'GET' } = {}) {
  const jar = jars[who] ??= {}, isForm = body instanceof FormData;
  const headers = { Cookie: Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; '), Origin: base, ...(body && !isForm ? { 'Content-Type': 'application/json' } : {}) };
  const response = await fetch(base + path, { method, headers, ...(body ? { body: isForm ? body : JSON.stringify(body) } : {}) });
  for (const cookie of response.headers.getSetCookie()) { const pair = cookie.split(';')[0], i = pair.indexOf('='); jars[who][pair.slice(0, i)] = pair.slice(i + 1); }
  const bytes = Buffer.from(await response.arrayBuffer()); let data; try { data = JSON.parse(bytes.toString()); } catch { data = { error: bytes.toString().slice(0, 200) }; }
  return { status: response.status, data, bytes, headers: response.headers };
}
const ok = (result, status = 200) => { assert.equal(result.status, status, JSON.stringify(result.data)); return result.data; };
const fails = (result, status, pattern) => { assert.equal(result.status, status, JSON.stringify(result.data)); if (pattern) assert.match(result.data.error ?? '', pattern); return result.data; };
async function user(key, role, departments, chair = false, stateCode = state) {
  const email = `${key}.${tag}@allocations.test`.toLowerCase();
  const id = (await db.query('INSERT INTO users(email,full_name,role,department,state_code,password_hash,is_beap_chair) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id', [email, `QA ${key}`, role, departments[0] ?? null, stateCode, hashSync(password, 4), chair])).rows[0].id;
  userIds.push(id);
  for (const department of departments) await db.query('INSERT INTO user_departments(user_id,department) VALUES($1,$2)', [id, department]);
  ok(await api(key, '/api/auth/login', { email, password }));
}
const url = workstream => `/api/activities?plan=${planId}&workstream=${workstream}`;
const line = (workstream, activity, unitCost, extra = {}) => ({ workstream, entity: 'line', action: 'create', activity, description: `QA ${workstream} item`, quantity: 1, unitCost, strategy: 'Request for quotation', targetGroup: 'Schools', ...(workstream === 'gscci' ? { item: 'Tree seedlings' } : {}), ...extra });
const review = async (who, body) => api(who, `/api/plans/review?plan=${planId}`, { ...body, version: ok(await api(who, `/api/plans/review?plan=${planId}`)).plan.version });

const allocate = (who, id, allocations) => api(who, url('curriculum'), { workstream: 'curriculum', entity: 'allocation', action: 'update', id, allocations });

await db.connect();
try {
  settings = (await db.query("SELECT beap_chair_submission_mode, ubec_submission_mode FROM state_workflow_settings WHERE state_code='GLOBAL'")).rows[0];
  await db.query("UPDATE state_workflow_settings SET beap_chair_submission_mode='individual_components' WHERE state_code='GLOBAL'");
  await user('academic', 'Data Entry Staff', ['academic']);
  await user('physical', 'Data Entry Staff', ['physical']);
  await user('academicDirector', 'Director', ['academic']);
  planId = (await db.query('INSERT INTO action_plans(state_code,start_year,end_year,state_lodgment,other_funding) VALUES($1,2029,2029,100000,0) RETURNING id', [state])).rows[0].id;
  for (const [name, male, female] of [['QA Alloc School A', 60, 40], ['QA Alloc School B', 150, 150], ['QA Alloc School C', 10, 10]]) schoolIds.push((await db.query("INSERT INTO schools(state_code,name,lga,level,location,enrolment_male,enrolment_female) VALUES($1,$2,'QA LGA','Primary','Rural',$3,$4) RETURNING id", [state, name, male, female])).rows[0].id);
  const [a, b, c] = schoolIds;
  ok(await api('academic', url('curriculum'), line('curriculum', 0, 100, { quantity: 10, description: 'Basic science curriculum' })));
  ok(await api('academic', url('curriculum'), line('curriculum', 1, 500, { description: 'Teacher training' })));
  let data = ok(await api('academic', url('curriculum')));
  const item = data.lines.find(l => l.activity === 0), training = data.lines.find(l => l.activity === 1);
  assert.deepEqual(item.allocations, {}); assert.deepEqual(item.schoolIds, []);

  fails(await allocate('academic', item.id, { [a]: 2 }), 409, /distribution list/);
  ok(await api('academic', url('curriculum'), { workstream: 'curriculum', entity: 'school', action: 'create', schoolIds: [a, b, c] }));
  fails(await allocate('academic', item.id, { [a]: 6, [b]: 5 }), 400, /at most 10 items/);
  fails(await allocate('academic', item.id, { [a]: 0 }), 400, /at least 1 item/);
  fails(await allocate('academic', training.id, { [a]: 1 }), 400, /not shared out/);
  fails(await allocate('physical', item.id, { [a]: 1 }), 403);
  step('allocations: listed schools only, at most the item\'s quantity, whole items, only items for schools, only the component\'s staff');

  fails(await review('academic', { action: 'submit', pillar: 'curriculum' }), 409, /Share all 10 items of “Basic science curriculum” across the distribution schools before sending \(0 allocated\)/);
  ok(await allocate('academic', item.id, { [a]: 6, [b]: 4 }));
  fails(await review('academic', { action: 'submit', pillar: 'curriculum' }), 409, /QA Alloc School C has no Curriculum items allocated/);
  step('sending waits until every item is shared in full and every listed school has items (UBEC163)');

  // A line keeps its allocation when saved, and its quantity cannot drop below what is allocated.
  fails(await api('academic', url('curriculum'), { ...line('curriculum', 0, 100, { quantity: 8, description: 'Basic science curriculum' }), action: 'update', id: item.id }), 409, /10 of this item's items are allocated/);
  ok(await api('academic', url('curriculum'), { ...line('curriculum', 0, 120, { quantity: 10, description: 'Basic science curriculum' }), action: 'update', id: item.id }));
  data = ok(await api('academic', url('curriculum')));
  assert.deepEqual(data.lines.find(l => l.id === item.id).allocations, { [a]: 6, [b]: 4 });
  // Taking a school off the list takes its items back.
  ok(await api('academic', url('curriculum'), { workstream: 'curriculum', entity: 'school', action: 'delete', id: b }));
  assert.deepEqual(ok(await api('academic', url('curriculum'))).lines.find(l => l.id === item.id).allocations, { [a]: 6 });
  ok(await api('academic', url('curriculum'), { workstream: 'curriculum', entity: 'school', action: 'delete', id: c }));
  // UBEC216: several schools come off the list at once, with their items.
  ok(await api('academic', url('curriculum'), { workstream: 'curriculum', entity: 'school', action: 'create', schoolIds: [b, c] }));
  ok(await allocate('academic', item.id, { [a]: 6, [b]: 4 }));
  fails(await api('physical', url('curriculum'), { workstream: 'curriculum', entity: 'school', action: 'delete', schoolIds: [b, c] }), 403);
  assert.equal(ok(await api('academic', url('curriculum'), { workstream: 'curriculum', entity: 'school', action: 'delete', schoolIds: [b, c] })).removed, 2);
  data = ok(await api('academic', url('curriculum')));
  assert.deepEqual(data.distribution.map(s => s.id), [a]); assert.deepEqual(data.lines.find(l => l.id === item.id).allocations, { [a]: 6 });
  ok(await allocate('academic', item.id, { [a]: 10 }));
  step('saving the item keeps its allocation; lowering its quantity below it is refused; a school taken off the list loses its items, also when several are removed at once (UBEC216)');

  const snapshot = ok(await api('academic', `/api/plans/review?plan=${planId}`)).snapshot;
  assert.equal(snapshot.distributionAllocations, true);
  assert.deepEqual(snapshot.curriculum.find(l => l.id === item.id).schools.map(s => [s.id, s.quantity]), [[a, 10]]);
  ok(await review('academic', { action: 'submit', pillar: 'curriculum' }));
  step('the snapshot carries each item\'s schools and quantities; once shared out, Curriculum is sent');
  console.log(`\n${passed} distribution allocation checks passed`);
} finally {
  if (settings) await db.query("UPDATE state_workflow_settings SET beap_chair_submission_mode=$1, ubec_submission_mode=$2 WHERE state_code='GLOBAL'", [settings.beap_chair_submission_mode, settings.ubec_submission_mode]);
  if (planId) { await db.query('DELETE FROM ubec_events WHERE plan_id=$1', [planId]); await db.query('DELETE FROM ubec_assignments WHERE round_id IN (SELECT id FROM ubec_rounds WHERE plan_id=$1)', [planId]); await db.query('DELETE FROM ubec_rounds WHERE plan_id=$1', [planId]); }
  if (planId) for (const t of ['plan_comments', 'plan_notifications', 'plan_review_events', 'plan_submissions', 'plan_pillar_reviews', 'tlm_distribution', 'activity_plan_lines', 'component_documents']) await db.query(`DELETE FROM ${t} WHERE plan_id=$1`, [planId]);
  if (planId) await db.query('DELETE FROM action_plans WHERE id=$1', [planId]);
  if (schoolIds.length) await db.query('DELETE FROM schools WHERE id=ANY($1::int[])', [schoolIds]);
  if (userIds.length) await db.query('DELETE FROM users WHERE id=ANY($1::int[])', [userIds]);
  await db.end();
}
