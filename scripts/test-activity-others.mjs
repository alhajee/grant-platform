// API and database test for the "Others (specify)" activity of every activity-line component (migration 047).
// Creates a throwaway state with its own users and plan, and removes them all afterwards.
// Usage: node --env-file=.env scripts/test-activity-others.mjs [baseUrl]
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { hashSync } from 'bcryptjs';

const base = process.argv[2] ?? process.env.UBEC_TEST_URL ?? 'http://localhost:5173';
assert.ok(['localhost', '127.0.0.1'].includes(new URL(base).hostname), 'Run this test against a local server only.');
assert.ok(['localhost', '127.0.0.1'].includes(new URL(process.env.DATABASE_URL).hostname), 'Use a local database only.');
const tag = randomUUID().slice(0, 8).toUpperCase(), state = `OT${tag}`, password = randomUUID();
const db = new Client({ connectionString: process.env.DATABASE_URL });
const jars = {}, userIds = [];
let planId, passed = 0;
const step = message => { passed++; console.log('✓', message); };

async function api(who, path, body) {
  const jar = jars[who] ??= {};
  const headers = { Cookie: Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; '), Origin: base, ...(body ? { 'Content-Type': 'application/json' } : {}) };
  const response = await fetch(base + path, { method: body ? 'POST' : 'GET', headers, ...(body ? { body: JSON.stringify(body) } : {}) });
  for (const cookie of response.headers.getSetCookie()) { const pair = cookie.split(';')[0], i = pair.indexOf('='); jar[pair.slice(0, i)] = pair.slice(i + 1); }
  const text = await response.text(); let data; try { data = JSON.parse(text); } catch { data = { error: text.slice(0, 200) }; }
  return { status: response.status, data };
}
const ok = (result, status = 200) => { assert.equal(result.status, status, JSON.stringify(result.data)); return result.data; };
const fails = (result, status, pattern) => { assert.equal(result.status, status, JSON.stringify(result.data)); if (pattern) assert.match(result.data.error ?? '', pattern); return result.data; };
async function user(key, role, departments, chair = false) {
  const email = `${key}.${tag}@others.test`.toLowerCase();
  const id = (await db.query('INSERT INTO users(email,full_name,role,department,state_code,password_hash,is_beap_chair) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id', [email, `OT ${key}`, role, departments[0] ?? null, state, hashSync(password, 4), chair])).rows[0].id;
  userIds.push(id);
  for (const department of departments) await db.query('INSERT INTO user_departments(user_id,department) VALUES($1,$2)', [id, department]);
  ok(await api(key, '/api/auth/login', { email, password }));
}

// Each component: who edits it, its Others index (always the last activity) and an ordinary activity.
const components = [
  { workstream: 'sbmc', who: 'social', others: 16, plain: 0 },
  { workstream: 'tlm', who: 'academic', others: 22, plain: 6 },
  { workstream: 'monitoring', who: 'physical', others: 4, plain: 0 },
  { workstream: 'gscci', who: 'academic', others: 9, plain: 0 },
  { workstream: 'curriculum', who: 'academic', others: 4, plain: 1 },
  { workstream: 'quality', who: 'me', others: 11, plain: 4 },
  { workstream: 'ict', who: 'ict', others: 9, plain: 1 },
  { workstream: 'planning', who: 'prs', others: 6, plain: 1 },
];
const url = workstream => `/api/activities?plan=${planId}&workstream=${workstream}`;
const line = (workstream, activity, unitCost, extra = {}) => ({
  workstream, entity: 'line', action: 'create', activity, description: `OT ${workstream} ${activity}`, quantity: 1, unitCost,
  strategy: 'Request for quotation', targetGroup: 'State level', schoolIds: [],
  ...(workstream === 'sbmc' ? { rationale: 'Reach more families', implementationApproach: 'Community meetings' } : {}), ...extra,
});
const review = async (who, body) => api(who, `/api/plans/review?plan=${planId}`, { ...body, version: ok(await api(who, `/api/plans/review?plan=${planId}`)).plan.version });

await db.connect();
try {
  await user('social', 'Data Entry Staff', ['social']);
  await user('academic', 'Data Entry Staff', ['academic']);
  await user('physical', 'Data Entry Staff', ['physical']);
  await user('me', 'Data Entry Staff', ['me']);
  await user('ict', 'Data Entry Staff', ['ict']);
  await user('prs', 'Data Entry Staff', ['planning']);
  await user('meDirector', 'Director', ['me']);
  await user('prsDirector', 'Director', ['planning']);
  await user('chair', 'Director', ['physical'], true);
  // State contribution ₦400,000,000 → shared ₦800,000,000: Curriculum ₦16,000,000 (2%); ICT gets ₦10,000,000 of Teacher Development & ICT.
  planId = (await db.query("INSERT INTO action_plans(state_code,start_year,end_year,implementation_year,funding_quarters,state_lodgment,other_funding,ict_allocation,funding_policy_id) VALUES($1,2033,2033,2033,'{1}',400000000,0,10000000,(SELECT id FROM funding_policies ORDER BY id DESC LIMIT 1)) RETURNING id", [state])).rows[0].id;
  await db.query('INSERT INTO plan_quarters(plan_id,state_code,planning_year,quarter) VALUES($1,$2,2033,1)', [planId, state]);

  const saved = {};
  for (const { workstream, who, others, plain } of components) {
    fails(await api(who, url(workstream), line(workstream, others + 1, 100)), 400, /valid allowable activity/);
    fails(await api(who, url(workstream), line(workstream, others, 100)), 400, /Enter the activity name/);
    fails(await api(who, url(workstream), line(workstream, others, 100, { customActivity: '   ' })), 400, /Enter the activity name/);
    fails(await api(who, url(workstream), line(workstream, others, 100, { customActivity: 'x'.repeat(161) })), 400, /160 characters/);
    fails(await api(who, url(workstream), line(workstream, plain, 100, { customActivity: 'Not allowed here' })), 400, /Others \(specify\)/);
    const name = `  Local ${workstream} initiative ${tag}  `;
    const created = ok(await api(who, url(workstream), line(workstream, others, 1000, { customActivity: name })));
    const back = ok(await api(who, url(workstream))).lines.find(l => l.id === created.id);
    assert.equal(back.activity, others); assert.equal(back.customActivity, name.trim());
    // Renaming works; moving the line to a listed activity needs the name cleared.
    ok(await api(who, url(workstream), { ...line(workstream, others, 1000, { customActivity: `Renamed ${workstream} ${tag}` }), action: 'update', id: created.id }));
    fails(await api(who, url(workstream), { ...line(workstream, plain, 1000, { customActivity: `Renamed ${workstream} ${tag}` }), action: 'update', id: created.id }), 400, /Others \(specify\)/);
    saved[workstream] = created.id;
  }
  step('Every component: Others (specify) is the last activity, needs a trimmed name of up to 160 characters, and no other activity takes one');

  // The database enforces the same rule.
  const insert = (workstream, activity, custom) => db.query("INSERT INTO activity_plan_lines(plan_id,workstream,activity,custom_activity,description,quantity,unit_cost,strategy,target_group) VALUES($1,$2,$3,$4,'OT raw',1,1,'NCB','Schools')", [planId, workstream, activity, custom]);
  await assert.rejects(insert('gscci', 9, ''), /activity_plan_lines_custom_activity_check/);
  await assert.rejects(insert('gscci', 0, 'Named'), /activity_plan_lines_custom_activity_check/);
  await assert.rejects(insert('planning', 6, ' padded '), /activity_plan_lines_custom_activity_check/);
  await assert.rejects(insert('quality', 11, 'y'.repeat(161)), /activity_plan_lines_custom_activity_check/);
  await assert.rejects(insert('teachers', 18, ''), /activity_plan_lines_custom_activity_check/);
  await assert.rejects(insert('sbmc', 17, 'Too far'), /activity_plan_lines_activity_check/);
  step('Database CHECKs: Others lines need a trimmed name, other lines none, and indexes stop after Others');

  // Curriculum: Others has no share of the 60/20/10/10 split, only the ₦16,000,000 component ceiling.
  ok(await api('academic', url('curriculum'), { ...line('curriculum', 4, 15000000, { customActivity: `Renamed curriculum ${tag}` }), action: 'update', id: saved.curriculum }));
  fails(await api('academic', url('curriculum'), line('curriculum', 1, 1000000.01)), 400, /exceeded the Curriculum allocation \(₦16,000,000\.00\) by ₦0\.01/);
  step('Curriculum Others counts toward the component ceiling without an activity cap');

  // Others never counts toward compulsory activities.
  const missing = fails(await review('me', { action: 'submit', pillar: 'quality' }), 409, /compulsory activity/);
  assert.match(missing.error, /Capacity strengthening for Principals and Headteachers/);
  fails(await review('prs', { action: 'submit', pillar: 'planning' }), 409, /Conduct annual school census/);
  step('Others lines do not satisfy compulsory activities');

  // The name travels with the plan snapshot the workbook and UBEC review read.
  // Read through each component's Data Entry Staff: the drafts have not been sent on yet (stage-gated visibility).
  for (const { workstream, who } of components) {
    const snap = ok(await api(who, `/api/plans/review?plan=${planId}`)).snapshot[workstream].find(l => l.id === saved[workstream]);
    assert.equal(snap.custom_activity, `Renamed ${workstream} ${tag}`, workstream);
  }
  step('Plan snapshot carries the activity name for every component');
  console.log(`PASS: ${passed} Others (specify) checks.`);
} finally {
  if (planId) for (const t of ['plan_comments', 'plan_notifications', 'plan_review_events', 'plan_submissions', 'plan_pillar_reviews', 'activity_plan_lines', 'tlm_distribution', 'plan_quarters']) await db.query(`DELETE FROM ${t} WHERE plan_id=$1`, [planId]);
  if (planId) await db.query('DELETE FROM action_plans WHERE id=$1', [planId]);
  if (userIds.length) await db.query('DELETE FROM users WHERE id=ANY($1::int[])', [userIds]);
  await db.end();
}
