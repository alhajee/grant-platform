// API test for idempotent creates (migration 058): a create repeated with the same client key returns the row already saved
// (200, replayed: true) instead of inserting it again or re-checking the caps against a total that already includes it.
// Covers activity lines, sports budget lines and allocations, infrastructure packages and distribution-list school adds,
// and reproduces the Jigawa report (Curriculum ₦280M, "Distribution of curriculum to schools" capped at 10% = ₦28M).
// Creates a throwaway state with its own users, schools and plan, and removes them all afterwards.
// Usage: node --env-file=.env scripts/test-idempotent-saves.mjs [baseUrl]
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { hashSync } from 'bcryptjs';

const base = process.argv[2] ?? process.env.TEST_BASE_URL ?? process.env.UBEC_TEST_URL ?? 'http://localhost:5173';
assert.ok(['localhost', '127.0.0.1'].includes(new URL(base).hostname), 'Run this test against a local server only.');
assert.ok(['localhost', '127.0.0.1'].includes(new URL(process.env.DATABASE_URL).hostname), 'Use a local database only.');
const tag = randomUUID().slice(0, 8).toUpperCase(), state = `ID${tag}`, password = randomUUID();
const db = new Client({ connectionString: process.env.DATABASE_URL });
const jars = {}, userIds = [], schoolIds = [];
let planId, passed = 0;
const step = message => { passed++; console.log('✓', message); };

async function api(who, path, body) {
  const jar = jars[who] ??= {};
  const headers = { Cookie: Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; '), Origin: base, ...(body ? { 'Content-Type': 'application/json' } : {}) };
  const response = await fetch(base + path, { method: body ? 'POST' : 'GET', headers, ...(body ? { body: JSON.stringify(body) } : {}) });
  for (const cookie of response.headers.getSetCookie()) { const pair = cookie.split(';')[0], i = pair.indexOf('='); jars[who][pair.slice(0, i)] = pair.slice(i + 1); }
  const text = await response.text(); let data; try { data = JSON.parse(text); } catch { data = { error: text.slice(0, 200) }; }
  return { status: response.status, data };
}
const ok = (result, status = 200) => { assert.equal(result.status, status, JSON.stringify(result.data)); return result.data; };
const fails = (result, status, pattern) => { assert.equal(result.status, status, JSON.stringify(result.data)); if (pattern) assert.match(result.data.error ?? '', pattern); return result.data; };
async function user(key, role, departments) {
  const email = `${key}.${tag}@idempotent.test`.toLowerCase();
  const id = (await db.query('INSERT INTO users(email,full_name,role,department,state_code,password_hash) VALUES($1,$2,$3,$4,$5,$6) RETURNING id', [email, `ID ${key}`, role, departments[0] ?? null, state, hashSync(password, 4)])).rows[0].id;
  userIds.push(id);
  for (const department of departments) await db.query('INSERT INTO user_departments(user_id,department) VALUES($1,$2)', [id, department]);
  ok(await api(key, '/api/auth/login', { email, password }));
  return id;
}
const count = async (sql, params) => (await db.query(sql, params)).rows[0].n;
const activities = workstream => `/api/activities?plan=${planId}&workstream=${workstream}`;
const sportsUrl = () => `/api/sports?plan=${planId}`;
const infraUrl = () => `/api/infrastructure/packages?plan=${planId}`;
const curriculumLine = (activity, quantity, unitCost, clientKey) => ({ workstream: 'curriculum', entity: 'line', action: 'create', activity, description: 'Curriculum distribution', quantity, unitCost, strategy: 'Request for quotation', targetGroup: 'Schools', ...(clientKey ? { clientKey } : {}) });

await db.connect();
try {
  const academic = await user('academic', 'Data Entry Staff', ['academic']);
  await user('physical', 'Data Entry Staff', ['physical']);
  for (const name of ['A', 'B']) schoolIds.push((await db.query("INSERT INTO schools(state_code,name,lga,level,location,enrolment_male,enrolment_female) VALUES($1,$2,'QA','Primary','Rural',100,100) RETURNING id", [state, `Idempotent ${tag} ${name}`])).rows[0].id);
  // No state contribution; each component's ceiling is its own funding source: Curriculum ₦280,000,000 (as in Jigawa plan 55).
  // TLM's part of the Infrastructure & TLM pool is ₦0 (split mode), so Infrastructure has the whole ₦10,000,000 in either mode.
  planId = (await db.query("INSERT INTO action_plans(state_code,start_year,end_year,implementation_year,funding_quarters,state_lodgment,other_funding,tlm_allocation,funding_policy_id) VALUES($1,2033,2033,2033,'{1}',0,0,0,(SELECT id FROM funding_policies ORDER BY id DESC LIMIT 1)) RETURNING id", [state])).rows[0].id;
  await db.query('INSERT INTO plan_quarters(plan_id,state_code,planning_year,quarter) VALUES($1,$2,2033,1)', [planId, state]);
  for (const [component, amount] of [['curriculum', 280000000], ['sports', 1000000], ['infrastructure', 10000000]]) await db.query('INSERT INTO plan_funding_sources(plan_id,component,funder,amount,created_by) VALUES($1,$2,$3,$4,$5)', [planId, component, 'QA funder', amount, academic]);

  // Activity lines: the same create twice with one key is stored once; the second reply is the same line, replayed.
  const jigawa = randomUUID();
  const first = ok(await api('academic', activities('curriculum'), curriculumLine(2, 168, 166666, jigawa)));
  assert.ok(Number.isInteger(first.id)); assert.equal(first.replayed, undefined);
  // The Jigawa scenario: ₦27,999,888 of a ₦28,000,000 cap is used by the saved line; the retry must not be counted again.
  const again = ok(await api('academic', activities('curriculum'), curriculumLine(2, 168, 166666, jigawa)));
  assert.deepEqual([again.id, again.replayed], [first.id, true]);
  assert.equal(await count('SELECT count(*)::int AS n FROM activity_plan_lines WHERE plan_id=$1 AND activity=2', [planId]), 1);
  const listed = ok(await api('academic', activities('curriculum')));
  assert.equal(listed.lines.find(l => l.id === first.id).clientKey, jigawa, 'The editor finds a landed save by its key.');
  step('activity line: same key twice → one row; the retry returns the same id with replayed (Jigawa: no cap error on the retry)');

  // Without a key (old clients) a second create is checked as a new line, with the clearer cap message.
  fails(await api('academic', activities('curriculum'), curriculumLine(2, 168, 166666)), 400,
    /^‘Distribution of curriculum to schools’ can use up to ₦28,000,000\.00 \(10% of the Curriculum allocation\)\. With this item it would come to ₦55,999,776\.00, which is ₦27,999,776\.00 over\.$/);
  step('without a key the old behaviour stays; the cap message names the cap, the total with this item and the excess');

  const concurrentKey = randomUUID();
  const replies = await Promise.all(Array.from({ length: 5 }, () => api('academic', activities('curriculum'), curriculumLine(1, 2, 1000, concurrentKey))));
  const ids = new Set(replies.map(reply => ok(reply).id));
  assert.equal(ids.size, 1, 'Concurrent duplicates resolve to one line.');
  assert.equal(replies.filter(reply => reply.data.replayed).length, 4);
  assert.equal(await count('SELECT count(*)::int AS n FROM activity_plan_lines WHERE plan_id=$1 AND client_key=$2', [planId, concurrentKey]), 1);
  step('activity line: five concurrent creates with one key → one row, four replays');

  const a = ok(await api('academic', activities('curriculum'), curriculumLine(3, 1, 500, randomUUID())));
  const b = ok(await api('academic', activities('curriculum'), curriculumLine(3, 1, 500, randomUUID())));
  assert.notEqual(a.id, b.id);
  assert.equal(await count('SELECT count(*)::int AS n FROM activity_plan_lines WHERE plan_id=$1 AND activity=3', [planId]), 2);
  ok(await api('academic', activities('curriculum'), curriculumLine(3, 1, 500)));
  fails(await api('academic', activities('curriculum'), curriculumLine(3, 1, 500, 'not-a-uuid')), 400);
  // A key belongs to the component it was made for.
  fails(await api('academic', activities('gscci'), { ...curriculumLine(0, 1, 1, jigawa), workstream: 'gscci' }), 409, /already used/);
  // Updates stay idempotent by id; a key sent with an update is ignored.
  ok(await api('academic', activities('curriculum'), { ...curriculumLine(3, 1, 400, randomUUID()), action: 'update', id: a.id }));
  ok(await api('academic', activities('curriculum'), { ...curriculumLine(3, 1, 400), action: 'update', id: a.id }));
  assert.equal(await count('SELECT count(*)::int AS n FROM activity_plan_lines WHERE plan_id=$1 AND activity=3', [planId]), 3);
  step('activity line: different keys → separate rows; no key → created; invalid key 400; key from another component 409; updates unchanged');

  // Distribution list: adding a listed school again is a no-op, not an error.
  const added = ok(await api('academic', activities('curriculum'), { workstream: 'curriculum', entity: 'school', action: 'create', schoolId: schoolIds[0] }));
  const repeated = ok(await api('academic', activities('curriculum'), { workstream: 'curriculum', entity: 'school', action: 'create', schoolId: schoolIds[0] }));
  assert.deepEqual([added.added, repeated.added, repeated.skipped], [1, 0, 1]);
  ok(await api('academic', activities('curriculum'), { workstream: 'curriculum', entity: 'school', action: 'create', schoolIds: [schoolIds[0], schoolIds[1]] }));
  assert.equal(await count("SELECT count(*)::int AS n FROM tlm_distribution WHERE plan_id=$1 AND workstream='curriculum'", [planId]), 2);
  step('distribution list: single and bulk school adds are idempotent');

  // Sports budget lines and allocations.
  const sportsLine = clientKey => ({ entity: 'budget', action: 'create', section: 'equipment', activityType: "Children's football", description: 'Training balls', quantity: 10, unitCost: 1000, ...(clientKey ? { clientKey } : {}) });
  const sportsKey = randomUUID();
  const created = ok(await api('academic', sportsUrl(), sportsLine(sportsKey)), 201);
  const replayed = ok(await api('academic', sportsUrl(), sportsLine(sportsKey)), 200);
  assert.deepEqual([replayed.id, replayed.code, replayed.replayed], [created.id, created.code, true]);
  const sportsConcurrent = randomUUID();
  const sportsReplies = await Promise.all(Array.from({ length: 4 }, () => api('academic', sportsUrl(), sportsLine(sportsConcurrent))));
  assert.equal(new Set(sportsReplies.map(reply => reply.data.id)).size, 1);
  assert.deepEqual(sportsReplies.map(reply => reply.status).sort(), [200, 200, 200, 201]);
  ok(await api('academic', sportsUrl(), sportsLine(randomUUID())), 201);
  assert.equal(await count('SELECT count(*)::int AS n FROM sports_budget_lines WHERE plan_id=$1', [planId]), 3);
  const sportsListed = ok(await api('academic', sportsUrl()));
  assert.equal(sportsListed.lines.find(l => l.id === created.id).clientKey, sportsKey);
  const allocationKey = randomUUID();
  const allocation = { entity: 'allocation', action: 'create', lineId: created.id, schoolId: schoolIds[0], quantity: 3, longitude: '11.04', latitude: '12.87', clientKey: allocationKey };
  const allocated = ok(await api('academic', sportsUrl(), allocation), 201);
  const allocatedAgain = ok(await api('academic', sportsUrl(), allocation), 200);
  assert.deepEqual([allocatedAgain.id, allocatedAgain.replayed], [allocated.id, true]);
  assert.equal(await count('SELECT count(*)::int AS n FROM sports_allocations WHERE line_id=$1', [created.id]), 1);
  // Without a key the same allocation is refused as a duplicate, as before.
  fails(await api('academic', sportsUrl(), { ...allocation, clientKey: undefined }), 409, /already has an allocation/);
  step('sports: budget lines and allocations replay by key (one row each, same id and code); concurrent duplicates → one line');

  // Sports section cap message: Procurement & Training of PHE Officers may use 60% of ₦1,000,000; ₦30,000 is used, so ₦600,000 more is ₦30,000 over.
  fails(await api('academic', sportsUrl(), { ...sportsLine(randomUUID()), quantity: 1, unitCost: 600000 }), 409,
    /^‘Procurement & Training of PHE Officers’ can use up to ₦600,000\.00 \(60% of the Sports allocation\)\. With this item it would come to ₦630,000\.00, which is ₦30,000\.00 over\.$/);
  step('sports: the section cap message says what the section may use and how far this item takes it over');

  // Infrastructure packages.
  const furniture = (cost, clientKey) => ({ action: 'save', input: { kind: 'furniture', schoolId: schoolIds[0], components: ['Primary'], furniture: [{ description: 'Desks', quantity: 1, cost }], documentIds: [] }, ...(clientKey ? { clientKey } : {}) });
  const infraKey = randomUUID();
  const pkg = ok(await api('physical', infraUrl(), furniture(1000, infraKey)));
  assert.ok(Number.isInteger(pkg.id));
  const pkgAgain = ok(await api('physical', infraUrl(), furniture(1000, infraKey)));
  assert.deepEqual([pkgAgain.id, pkgAgain.replayed], [pkg.id, true]);
  const infraConcurrent = randomUUID();
  const infraReplies = await Promise.all(Array.from({ length: 4 }, () => api('physical', infraUrl(), furniture(500, infraConcurrent))));
  assert.equal(new Set(infraReplies.map(reply => ok(reply).id)).size, 1);
  ok(await api('physical', infraUrl(), furniture(250, randomUUID())));
  assert.equal(await count('SELECT count(*)::int AS n FROM infrastructure_packages WHERE plan_id=$1', [planId]), 3);
  const infraListed = ok(await api('physical', infraUrl()));
  assert.equal(infraListed.packages.find(p => p.id === pkg.id).client_key, infraKey);
  // A replay never re-checks the pool: fill the pool to the kobo, then repeat the first create.
  const pool = 10000000 - 1000 - 500 - 250;
  ok(await api('physical', infraUrl(), furniture(pool, randomUUID())));
  assert.equal(ok(await api('physical', infraUrl(), furniture(1000, infraKey))).replayed, true);
  fails(await api('physical', infraUrl(), furniture(1000, randomUUID())), 409);
  step('infrastructure packages: replay by key (one row, same id), concurrent duplicates → one, a replay is not re-checked against the pool');
  console.log(`\n${passed} idempotent save checks passed.`);
} finally {
  if (planId) {
    await db.query('DELETE FROM sports_allocations WHERE line_id IN (SELECT id FROM sports_budget_lines WHERE plan_id=$1)', [planId]);
    for (const t of ['sports_budget_lines', 'infrastructure_packages', 'tlm_distribution', 'activity_plan_lines', 'plan_funding_sources', 'plan_comments', 'plan_notifications', 'plan_review_events', 'plan_submissions', 'plan_pillar_reviews', 'plan_quarters']) await db.query(`DELETE FROM ${t} WHERE plan_id=$1`, [planId]);
    await db.query('DELETE FROM action_plans WHERE id=$1', [planId]);
  }
  if (schoolIds.length) await db.query('DELETE FROM schools WHERE id=ANY($1::int[]) AND state_code=$2', [schoolIds, state]);
  if (userIds.length) await db.query('DELETE FROM users WHERE id=ANY($1::int[])', [userIds]);
  await db.end();
}
