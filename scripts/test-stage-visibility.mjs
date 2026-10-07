// API test for stage-gated visibility (lib/stage-visibility.ts): a reviewer sees a component's details only once it
// has been sent to them, and keeps seeing them after a return for changes. Walks Sports through Data Entry → Director →
// BEAP Chair → Executive Chairman with returns, and Supervision & Monitoring (the BEAP Chair's own department) to its Director.
// Creates a throwaway state with its own users and plan, and removes them all afterwards.
// Usage: node --env-file=.env scripts/test-stage-visibility.mjs [baseUrl]
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { hashSync } from 'bcryptjs';

const base = process.argv[2] ?? process.env.UBEC_TEST_URL ?? 'http://127.0.0.1:5174';
assert.ok(['localhost', '127.0.0.1'].includes(new URL(base).hostname), 'Run this test against a local server only.');
assert.ok(['localhost', '127.0.0.1'].includes(new URL(process.env.DATABASE_URL).hostname), 'Use a local database only.');
const tag = randomUUID().slice(0, 8).toUpperCase(), state = `SV${tag}`, password = randomUUID();
const db = new Client({ connectionString: process.env.DATABASE_URL });
const jars = {}, userIds = [];
let planId, settings, passed = 0;
const step = message => { passed++; console.log('✓', message); };

async function api(who, path, body, { method = body ? 'POST' : 'GET' } = {}) {
  const jar = jars[who] ??= {}, isForm = body instanceof FormData;
  const headers = { Cookie: Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; '), Origin: base, ...(body && !isForm ? { 'Content-Type': 'application/json' } : {}) };
  const response = await fetch(base + path, { method, headers, ...(body ? { body: isForm ? body : JSON.stringify(body) } : {}) });
  for (const cookie of response.headers.getSetCookie()) { const pair = cookie.split(';')[0], i = pair.indexOf('='); jar[pair.slice(0, i)] = pair.slice(i + 1); }
  const bytes = Buffer.from(await response.arrayBuffer()); let data; try { data = JSON.parse(bytes.toString()); } catch { data = { error: bytes.toString().slice(0, 200) }; }
  return { status: response.status, data, text: bytes.toString(), headers: response.headers };
}
const ok = (result, status = 200) => { assert.equal(result.status, status, JSON.stringify(result.data)); return result.data; };
const fails = (result, status, pattern) => { assert.equal(result.status, status, JSON.stringify(result.data)); if (pattern) assert.match(result.data.error ?? '', pattern); return result.data; };
async function user(key, role, departments, chair = false) {
  const email = `${key}.${tag}@stage.test`.toLowerCase();
  const id = (await db.query('INSERT INTO users(email,full_name,role,department,state_code,password_hash,is_beap_chair) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id', [email, `QA ${key}`, role, departments[0] ?? null, state, hashSync(password, 4), chair])).rows[0].id;
  userIds.push(id);
  for (const department of departments) await db.query('INSERT INTO user_departments(user_id,department) VALUES($1,$2)', [id, department]);
  ok(await api(key, '/api/auth/login', { email, password }));
}

await db.connect();
try {
  settings = (await db.query("SELECT beap_chair_submission_mode, ubec_submission_mode FROM state_workflow_settings WHERE state_code='GLOBAL'")).rows[0];
  await db.query("UPDATE state_workflow_settings SET beap_chair_submission_mode='individual_components' WHERE state_code='GLOBAL'");
  await user('des', 'Data Entry Staff', ['academic']);
  await user('desPhysical', 'Data Entry Staff', ['physical']);
  await user('dir', 'Director', ['academic']);
  await user('dirPhysical', 'Director', ['physical']);
  await user('dirSocial', 'Director', ['social']);
  await user('chair', 'Director', ['physical'], true);
  await user('ec', 'Executive Chairman', []);
  planId = (await db.query('INSERT INTO action_plans(state_code,start_year,end_year,state_lodgment,other_funding) VALUES($1,2032,2032,500000000,0) RETURNING id', [state])).rows[0].id;
  const q = `?plan=${planId}`, reviewPath = `/api/plans/review${q}`, comments = `/api/plans/comments${q}`;
  const review = async (who, action, pillar, comment = '') => api(who, reviewPath, { action, pillar, version: ok(await api(who, reviewPath)).plan.version, comment });
  const balls = ok(await api('des', `/api/sports${q}`, { entity: 'budget', action: 'create', section: 'equipment', activityType: 'Football', description: 'Match balls', quantity: 10, unitCost: 15000 }), 201).id;
  ok(await api('des', `/api/sports${q}`, { entity: 'budget', action: 'create', section: 'competitions', activityType: 'Inter School Competition', description: 'Inter-school finals', quantity: 1, unitCost: 900000 }), 201);
  ok(await api('desPhysical', `/api/activities${q}&workstream=monitoring`, { workstream: 'monitoring', entity: 'line', action: 'create', activity: 0, description: 'QA monitoring visit', quantity: 1, unitCost: 1000, strategy: 'Request for quotation', targetGroup: 'Schools' }));
  const form = new FormData(); form.set('workstream', 'monitoring'); form.set('file', new Blob([Buffer.from('%PDF-1.4 QA proforma')]), 'proforma.pdf');
  const documentId = ok(await api('desPhysical', `/api/activities/documents${q}`, form)).id;
  step(`plan ${planId} in throwaway state ${state}: Sports lines (Academic) and a Monitoring line with a proforma invoice (Physical Planning)`);

  // What each role sees of Sports, through every read path.
  async function sees(who, visible, label) {
    const editor = await api(who, `/api/sports${q}`);
    assert.equal(editor.status, visible ? 200 : 403, `${who} Sports editor at ${label}: ${JSON.stringify(editor.data).slice(0, 200)}`);
    if (!visible) assert.match(editor.data.error, /not been sent to you/);
    const plan = ok(await api(who, reviewPath));
    assert.equal(plan.visiblePillars.includes('sports'), visible, `${who} review visiblePillars at ${label}`);
    assert.equal(plan.snapshot.sports.length > 0, visible, `${who} review snapshot at ${label}`);
    assert.ok(plan.pillarReviews.some(r => r.pillar === 'sports'), `${who} still sees the Sports status at ${label}`);
    if (!visible) assert.ok(!plan.events.some(e => e.scope === 'sports'), `${who} sees no Sports history at ${label}`);
    const dashboard = ok(await api(who, '/api/plans')).plans.find(p => p.id === planId);
    assert.equal(dashboard.sportsBudget > 0, visible, `${who} dashboard sportsBudget at ${label}`);
    if (!visible) assert.ok(!ok(await api(who, '/api/plans')).recentActivity.some(a => a.planId === planId && a.scope === 'sports'), `${who} recent activity at ${label}`);
    const summary = ok(await api(who, `/api/beap${q}`));
    assert.equal(summary.sports.budget > 0, visible, `${who} /api/beap at ${label}`);
    const threads = ok(await api(who, comments)).threads.filter(t => t.pillar === 'sports');
    if (!visible) assert.equal(threads.length, 0, `${who} sees no Sports comments at ${label}`);
    return threads;
  }
  const check = async (label, expected) => { for (const [who, visible] of Object.entries(expected)) await sees(who, visible, label); step(`${label}: ${Object.entries(expected).map(([who, v]) => `${who} ${v ? 'sees' : 'hidden'}`).join(', ')}`); };

  await check('draft', { des: true, dir: false, chair: false, ec: false });
  const ecPlan = ok(await api('ec', reviewPath));
  assert.deepEqual(ecPlan.visiblePillars, []); assert.equal(ecPlan.pillarReviews.length, 11); assert.ok(ecPlan.plan.id === planId && ecPlan.snapshot.setup);
  fails(await api('dirSocial', `/api/sports${q}`), 403, /another department/);
  step('Executive Chairman still opens the plan (setup, 11 component statuses) with no component details; other department refused by the role ceiling');

  ok(await review('des', 'submit', 'sports'));
  const submitted = ok(await api('dir', reviewPath)).plan.submissionNumber;
  await check('with the Director', { des: true, dir: true, chair: false, ec: false });
  const thread = ok(await api('dir', comments, { sheet: 'sports', rowRef: String(balls), columnId: 'unitCost', body: 'Attach quotations.' }), 201).id;
  fails(await api('chair', comments, { parentId: thread, body: 'early' }), 404);
  fails(await api('ec', comments, { id: thread, action: 'resolve' }, { method: 'PATCH' }), 404);
  step('Director thread on Sports: the BEAP Chair and Executive Chairman can neither read, reply to nor resolve it (404)');

  ok(await review('dir', 'request_changes', 'sports'));
  await check('returned to Data Entry after reaching the Director', { des: true, dir: true, chair: false, ec: false });
  ok(await review('des', 'submit', 'sports', 'Quotations attached.'));
  ok(await review('dir', 'endorse', 'sports'));
  const endorsed = ok(await api('chair', reviewPath)).plan.submissionNumber;
  const chairThreads = await sees('chair', true, 'with the BEAP Chair');
  assert.ok(chairThreads.some(t => t.id === thread), 'the Director thread reaches the BEAP Chair with the component');
  await check('with the BEAP Chair', { des: true, dir: true, chair: true, ec: false });

  // Saved submissions: only what had reached the viewer by then.
  const chairList = ok(await api('chair', reviewPath)).submissions.map(s => s.number);
  assert.ok(chairList.includes(endorsed) && !chairList.includes(submitted), `BEAP Chair submissions ${chairList}`);
  fails(await api('chair', `${reviewPath}&submission=${submitted}`), 404);
  assert.ok(ok(await api('chair', `${reviewPath}&submission=${endorsed}`)).snapshot.sports.length > 0);
  assert.ok(ok(await api('dir', `${reviewPath}&submission=${submitted}`)).snapshot.sports.length > 0);
  step('saved submissions: the BEAP Chair gets the one where Sports reached them, not the earlier one sent to the Director (404); the Director gets both');

  ok(await review('chair', 'forward', 'sports'));
  await check('with the Executive Chairman', { des: true, dir: true, chair: true, ec: true });
  ok(await review('ec', 'request_changes', 'sports', 'Reduce the balls.'));
  ok(await review('chair', 'request_changes', 'sports', 'Reduce the balls.'));
  ok(await review('dir', 'request_changes', 'sports', 'Reduce the balls.'));
  await check('returned all the way to Data Entry', { des: true, dir: true, chair: true, ec: true });

  // Monitoring belongs to the BEAP Chair's own department: they see it with its Director, the Executive Chairman does not.
  const proforma = `/api/activities/documents?id=${documentId}`;
  const monitoring = `/api/activities${q}&workstream=monitoring`;
  ok(await api('desPhysical', proforma)); fails(await api('chair', proforma), 404); fails(await api('dirPhysical', proforma), 404); fails(await api('ec', proforma), 404);
  fails(await api('chair', monitoring), 403, /not been sent/); fails(await api('dirPhysical', monitoring), 403, /not been sent/);
  ok(await review('desPhysical', 'submit', 'monitoring'));
  ok(await api('chair', proforma)); ok(await api('dirPhysical', proforma)); fails(await api('ec', proforma), 404);
  ok(await api('chair', monitoring)); fails(await api('ec', monitoring), 403, /not been sent/);
  const chairView = ok(await api('chair', reviewPath));
  assert.ok(chairView.visiblePillars.includes('monitoring') && chairView.snapshot.monitoring.length > 0 && chairView.snapshot.componentDocuments.length === 1);
  assert.equal(ok(await api('ec', reviewPath)).snapshot.componentDocuments.length, 0);
  step('Monitoring proforma and lines: hidden from its Director and the BEAP Chair in draft; at director_review the BEAP Chair (own department) and Director see them, the Executive Chairman still does not');

  const setup = ok(await api('ec', `/api/plans/setup${q}`));
  assert.ok(setup.proposed.sports && !setup.proposed.monitoring, `setup proposed: ${JSON.stringify(setup.proposed)}`);
  step('plan setup GET reports proposed amounts only for components that reached the viewer');
  console.log(`\nPASS: ${passed} stage visibility checks.`);
} finally {
  if (settings) await db.query("UPDATE state_workflow_settings SET beap_chair_submission_mode=$1, ubec_submission_mode=$2 WHERE state_code='GLOBAL'", [settings.beap_chair_submission_mode, settings.ubec_submission_mode]);
  if (planId) {
    for (const t of ['plan_notifications', 'plan_comments', 'plan_review_events', 'plan_submissions', 'plan_pillar_reviews', 'component_documents', 'activity_plan_lines']) await db.query(`DELETE FROM ${t} WHERE plan_id=$1`, [planId]);
    await db.query('DELETE FROM sports_allocations WHERE line_id IN (SELECT id FROM sports_budget_lines WHERE plan_id=$1)', [planId]);
    await db.query('DELETE FROM sports_budget_lines WHERE plan_id=$1', [planId]);
    await db.query('DELETE FROM action_plans WHERE id=$1', [planId]);
  }
  if (userIds.length) await db.query('DELETE FROM users WHERE id=ANY($1::int[])', [userIds]);
  const left = (await db.query('SELECT (SELECT COUNT(*) FROM users WHERE state_code=$1)::int AS users, (SELECT COUNT(*) FROM action_plans WHERE state_code=$1)::int AS plans', [state])).rows[0];
  console.log(`cleaned up: plan ${planId ?? '-'}, ${userIds.length} users (left behind: ${left.users} users, ${left.plans} plans)`);
  await db.end();
}
