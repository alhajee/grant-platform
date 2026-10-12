// Test for the expected start and due dates of component lines (migration 059) on activity lines, sports budget
// lines and infrastructure packages: inside the line's timeline quarters in the plan's implementation year.
// Creates a throwaway state with its own users and plan, and removes them all afterwards.
// Usage: node --env-file=.env scripts/test-line-dates.mjs [baseUrl]
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { hashSync } from 'bcryptjs';
import { formatLineDates, isIsoDate, keepDatesInWindow, lineDatesProblem, quarterWindow, resolveLineDates } from '../lib/line-dates.ts';

const base = process.argv[2] ?? process.env.TEST_BASE_URL ?? process.env.UBEC_TEST_URL ?? 'http://localhost:5173';
assert.ok(['localhost', '127.0.0.1'].includes(new URL(base).hostname), 'Run this test against a local server only.');
assert.ok(['localhost', '127.0.0.1'].includes(new URL(process.env.DATABASE_URL).hostname), 'Use a local database only.');
const tag = randomUUID().slice(0, 8).toUpperCase(), state = `LD${tag}`, password = randomUUID();
const db = new Client({ connectionString: process.env.DATABASE_URL });
const jars = {}, userIds = [], schoolIds = [];
let planId, passed = 0;
const step = message => { passed++; console.log('✓', message); };

async function api(who, path, body, { method = body ? 'POST' : 'GET' } = {}) {
  const jar = jars[who] ??= {};
  const headers = { Cookie: Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; '), Origin: base, ...(body ? { 'Content-Type': 'application/json' } : {}) };
  const response = await fetch(base + path, { method, headers, ...(body ? { body: JSON.stringify(body) } : {}) });
  for (const cookie of response.headers.getSetCookie()) { const pair = cookie.split(';')[0], i = pair.indexOf('='); jars[who][pair.slice(0, i)] = pair.slice(i + 1); }
  const text = await response.text(); let data; try { data = JSON.parse(text); } catch { data = { error: text.slice(0, 200) }; }
  return { status: response.status, data };
}
const ok = (result, status = 200) => { assert.equal(result.status, status, JSON.stringify(result.data)); return result.data; };
const fails = (result, status, pattern) => { assert.equal(result.status, status, JSON.stringify(result.data)); if (pattern) assert.match(result.data.error ?? '', pattern); return result.data; };
async function user(key, role, departments) {
  const email = `${key}.${tag}@dates.test`.toLowerCase();
  const id = (await db.query('INSERT INTO users(email,full_name,role,department,state_code,password_hash) VALUES($1,$2,$3,$4,$5,$6) RETURNING id', [email, `LD ${key}`, role, departments[0] ?? null, state, hashSync(password, 4)])).rows[0].id;
  userIds.push(id);
  for (const department of departments) await db.query('INSERT INTO user_departments(user_id,department) VALUES($1,$2)', [id, department]);
  ok(await api(key, '/api/auth/login', { email, password }));
}

// Unit: windows, validation, clamping and the save-time rules.
assert.deepEqual(quarterWindow(2028, [1]), { min: '2028-01-01', max: '2028-03-31' });
assert.deepEqual(quarterWindow(2028, [1, 2]), { min: '2028-01-01', max: '2028-06-30' });
assert.deepEqual(quarterWindow(2027, [3, 4]), { min: '2027-07-01', max: '2027-12-31' });
assert.equal(quarterWindow(2028, []), null);
assert.equal(quarterWindow(null, [1]), null);
assert.ok(isIsoDate('2028-02-29') && !isIsoDate('2027-02-29') && !isIsoDate('2027-13-01') && !isIsoDate('3 Feb 2027'));
assert.equal(formatLineDates({ startDate: '2027-02-03', dueDate: '2027-06-28' }), '3 Feb 2027 – 28 Jun 2027');
assert.equal(formatLineDates({ startDate: null, dueDate: null }), '');
assert.equal(lineDatesProblem({ startDate: '2027-02-03', dueDate: '2027-06-28' }, [1, 2], 2027), null);
assert.match(lineDatesProblem({ startDate: null, dueDate: '2027-06-28' }, [1, 2], 2027), /expected start date/);
assert.match(lineDatesProblem({ startDate: '2027-02-03', dueDate: null }, [1, 2], 2027), /due date/);
assert.match(lineDatesProblem({ startDate: '2027-07-01', dueDate: '2027-07-02' }, [1, 2], 2027), /start date must fall within the timeline \(1 Jan 2027 – 30 Jun 2027\)/);
assert.match(lineDatesProblem({ startDate: '2027-02-03', dueDate: '2028-01-01' }, [1, 2], 2027), /due date must fall within/);
assert.match(lineDatesProblem({ startDate: '2027-05-01', dueDate: '2027-04-01' }, [1, 2], 2027), /cannot be before/);
assert.deepEqual(keepDatesInWindow({ startDate: '2027-02-03', dueDate: '2027-06-28' }, [2], 2027), { startDate: null, dueDate: '2027-06-28' });
assert.deepEqual(keepDatesInWindow({ startDate: '2027-02-03', dueDate: '2027-03-28' }, [1, 2], 2027), { startDate: '2027-02-03', dueDate: '2027-03-28' });
assert.deepEqual(resolveLineDates({}, null, [2, 3], 2027), { dates: { startDate: '2027-04-01', dueDate: '2027-09-30' }, problem: null }, 'none sent on a new line: the whole timeline');
assert.deepEqual(resolveLineDates({}, { startDate: '2027-05-01', dueDate: '2027-05-09' }, [2], 2027).dates, { startDate: '2027-05-01', dueDate: '2027-05-09' }, 'none sent: stored dates that still fit are kept');
assert.deepEqual(resolveLineDates({}, { startDate: '2027-05-01', dueDate: '2027-05-09' }, [3], 2027).dates, { startDate: '2027-07-01', dueDate: '2027-09-30' }, 'none sent: stored dates outside the new timeline give way to it');
assert.match(resolveLineDates({ startDate: '2027-05-01' }, null, [2], 2027).problem, /due date/);
step('date windows, validation, clamping and save rules (unit)');

await db.connect();
try {
  await user('prs', 'Data Entry Staff', ['planning']);
  await user('physical', 'Data Entry Staff', ['physical']);
  await user('academic', 'Data Entry Staff', ['academic']);
  await user('ec', 'Executive Chairman', []);
  // A Q1–Q3 2038 plan implemented in 2039: ₦400,000,000 state counterpart fund, so every component has room.
  planId = (await db.query("INSERT INTO action_plans(state_code,start_year,end_year,implementation_year,funding_quarters,state_lodgment,other_funding,funding_policy_id) VALUES($1,2038,2038,2039,'{1,2,3}',400000000,0,(SELECT id FROM funding_policies ORDER BY id DESC LIMIT 1)) RETURNING id", [state])).rows[0].id;
  for (const q of [1, 2, 3]) await db.query('INSERT INTO plan_quarters(plan_id,state_code,planning_year,quarter) VALUES($1,$2,2038,$3)', [planId, state, q]);
  await db.query('UPDATE action_plans SET tlm_allocation=0 WHERE id=$1', [planId]);
  schoolIds.push((await db.query("INSERT INTO schools(state_code,name,lga,level,location,enrolment_male,enrolment_female) VALUES($1,'Dates QA School','QA','Primary','Rural',100,100) RETURNING id", [state])).rows[0].id);

  // Activity lines.
  const url = `/api/activities?plan=${planId}&workstream=planning`;
  const line = (activity, extra = {}) => ({ workstream: 'planning', entity: 'line', action: 'create', activity, description: `LD activity ${activity}`, quantity: 1, unitCost: 1000, strategy: 'Request for quotation', targetGroup: 'State level', schoolIds: [], ...extra });
  fails(await api('prs', url, line(0, { quarters: [1, 2], startDate: '2038-02-01', dueDate: '2038-03-01' })), 400, /within the timeline \(1 Jan 2039 – 30 Jun 2039\)/);
  fails(await api('prs', url, line(0, { quarters: [1], startDate: '2039-02-01', dueDate: '2039-04-01' })), 400, /due date must fall within/);
  fails(await api('prs', url, line(0, { quarters: [1], startDate: '2039-03-01', dueDate: '2039-02-01' })), 400, /cannot be before/);
  fails(await api('prs', url, line(0, { quarters: [1], startDate: '2039-02-01' })), 400, /due date/);
  fails(await api('prs', url, line(0, { quarters: [1], startDate: '1 Feb 2039', dueDate: '2039-02-02' })), 400, /YYYY-MM-DD/);
  const dated = ok(await api('prs', url, line(0, { quarters: [1, 2], startDate: '2039-02-03', dueDate: '2039-06-28' })));
  const plain = ok(await api('prs', url, line(1, { quarters: [2] })));
  let lines = ok(await api('prs', url)).lines;
  assert.deepEqual([lines.find(l => l.id === dated.id).startDate, lines.find(l => l.id === dated.id).dueDate], ['2039-02-03', '2039-06-28']);
  assert.deepEqual([lines.find(l => l.id === plain.id).startDate, lines.find(l => l.id === plain.id).dueDate], ['2039-04-01', '2039-06-30'], 'none sent: the whole timeline');
  // An update without dates (inline cell edit, older client) keeps dates that still fit; a narrower timeline resets them.
  ok(await api('prs', url, { ...line(0, { quarters: [1, 2], quantity: 3 }), action: 'update', id: dated.id }));
  ok(await api('prs', url, { ...line(1, { quarters: [3] }), action: 'update', id: plain.id }));
  lines = ok(await api('prs', url)).lines;
  assert.deepEqual([lines.find(l => l.id === dated.id).startDate, lines.find(l => l.id === dated.id).dueDate], ['2039-02-03', '2039-06-28']);
  assert.deepEqual([lines.find(l => l.id === plain.id).startDate, lines.find(l => l.id === plain.id).dueDate], ['2039-07-01', '2039-09-30']);
  step('activity lines: dates inside the timeline in the implementation year; omitted = kept or the whole timeline');

  // Sports budget lines.
  const sportsUrl = `/api/sports?plan=${planId}`;
  const sports = extra => ({ entity: 'budget', action: 'create', section: 'publicity', activityType: 'Electronic Media', description: 'Radio jingles', quantity: 1, unitCost: 5000, quarters: [2], ...extra });
  fails(await api('academic', sportsUrl, sports({ startDate: '2039-03-31', dueDate: '2039-04-30' })), 400, /start date must fall within/);
  const sportsLine = ok(await api('academic', sportsUrl, sports({ startDate: '2039-04-10', dueDate: '2039-05-20' })), 201);
  let sportsRow = ok(await api('academic', sportsUrl)).lines.find(l => l.id === sportsLine.id);
  assert.deepEqual([sportsRow.startDate, sportsRow.dueDate], ['2039-04-10', '2039-05-20']);
  ok(await api('academic', sportsUrl, { ...sports({ quantity: 2 }), action: 'update', id: sportsLine.id }));
  sportsRow = ok(await api('academic', sportsUrl)).lines.find(l => l.id === sportsLine.id);
  assert.deepEqual([sportsRow.startDate, sportsRow.dueDate], ['2039-04-10', '2039-05-20'], 'kept on an update without dates');
  step('sports budget lines: dates inside the timeline, kept on updates without dates');

  // Infrastructure packages.
  const infraUrl = `/api/infrastructure/packages?plan=${planId}`;
  const furniture = extra => ({ action: 'save', input: { kind: 'furniture', schoolId: schoolIds[0], components: ['Primary'], furniture: [{ description: 'Desks', quantity: 2, cost: 100 }], documentIds: [], quarters: [3], ...extra } });
  fails(await api('physical', infraUrl, furniture({ startDate: '2039-06-30', dueDate: '2039-08-01' })), 400, /start date must fall within/);
  ok(await api('physical', infraUrl, furniture({ startDate: '2039-07-15', dueDate: '2039-09-15' })));
  let [pkg] = ok(await api('physical', infraUrl)).packages;
  assert.deepEqual([pkg.start_date, pkg.due_date], ['2039-07-15', '2039-09-15']);
  step('infrastructure packages: dates inside the timeline, stored on the package');

  // The database keeps both dates together and in order.
  await assert.rejects(db.query("UPDATE activity_plan_lines SET start_date='2039-02-01', due_date=NULL WHERE id=$1", [dated.id]), /dates_check/);
  await assert.rejects(db.query("UPDATE sports_budget_lines SET start_date='2039-05-01', due_date='2039-04-01' WHERE id=$1", [sportsLine.id]), /dates_check/);
  step('database CHECK keeps start and due dates together and in order');

  // A new implementation year moves every line's dates with it.
  const setup = ok(await api('ec', `/api/plans/setup?plan=${planId}`));
  ok(await api('ec', '/api/plans/setup', { plan: planId, version: setup.plan.version, planningYear: 2038, implementationYear: 2040, quarters: [1, 2, 3], stateLodgment: '400000000', fundingSources: [] }, { method: 'PATCH' }));
  lines = ok(await api('prs', url)).lines;
  assert.deepEqual([lines.find(l => l.id === dated.id).startDate, lines.find(l => l.id === dated.id).dueDate], ['2040-02-03', '2040-06-28']);
  sportsRow = ok(await api('academic', sportsUrl)).lines.find(l => l.id === sportsLine.id);
  assert.deepEqual([sportsRow.startDate, sportsRow.dueDate], ['2040-04-10', '2040-05-20']);
  [pkg] = ok(await api('physical', infraUrl)).packages;
  assert.deepEqual([pkg.start_date, pkg.due_date], ['2040-07-15', '2040-09-15']);
  step('changing the implementation year moves line dates to the new year');

  // Snapshots carry the dates for the workbook.
  const planning = ok(await api('prs', `/api/plans/review?plan=${planId}`)).snapshot;
  const row = planning.planning.find(l => l.id === dated.id);
  assert.deepEqual([row.start_date, row.due_date], ['2040-02-03', '2040-06-28']);
  const physical = ok(await api('physical', `/api/plans/review?plan=${planId}`)).snapshot;
  const infraRow = physical.infrastructure.find(l => l.id === -pkg.id);
  assert.deepEqual([infraRow.start_date, infraRow.due_date], ['2040-07-15', '2040-09-15']);
  step('plan snapshot carries line dates');
  console.log(`PASS: ${passed} line date checks.`);
} finally {
  if (planId) for (const t of ['plan_review_events', 'plan_notifications', 'plan_submissions', 'plan_pillar_reviews', 'activity_plan_lines', 'infrastructure_packages', 'infrastructure_documents', 'plan_funding_sources', 'plan_quarters']) await db.query(`DELETE FROM ${t} WHERE plan_id=$1`, [planId]);
  if (planId) await db.query('DELETE FROM sports_allocations WHERE line_id IN (SELECT id FROM sports_budget_lines WHERE plan_id=$1)', [planId]);
  if (planId) await db.query('DELETE FROM sports_budget_lines WHERE plan_id=$1', [planId]);
  if (planId) await db.query('DELETE FROM action_plans WHERE id=$1', [planId]);
  if (schoolIds.length) await db.query('DELETE FROM schools WHERE id=ANY($1::int[])', [schoolIds]);
  if (userIds.length) await db.query('DELETE FROM users WHERE id=ANY($1::int[])', [userIds]);
  await db.end();
}
