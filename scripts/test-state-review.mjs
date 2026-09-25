import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { hashSync } from 'bcryptjs';

const base = process.env.UBEC_TEST_URL ?? 'http://localhost:5174';
assert.match(base, /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/);
const marker = `REVIEW-QA-${randomUUID()}`;
const states = [marker, marker + '-FOREIGN', marker + '-NO-ES'];
const password = randomUUID();
const db = new Client({ connectionString: process.env.DATABASE_URL });
const cookies = {};
async function api(role, path, body, method = body ? 'POST' : 'GET') {
  const response = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(cookies[role] ? { Cookie: cookies[role] } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  return { status: response.status, data: await response.json(), response };
}
const ok = (result, status = 200) => { assert.equal(result.status, status, JSON.stringify(result.data)); return result.data; };
await db.connect();
try {
  const original = (await db.query('SELECT id, row_to_json(p)::text AS snapshot FROM action_plans p ORDER BY id')).rows;
  for (const [key, role, state] of [['officer', 'Data Entry Officer', marker], ['es', 'Executive Secretary', marker], ['reviewer', 'Reviewer', marker], ['foreign', 'Executive Secretary', states[1]], ['noes', 'Data Entry Officer', states[2]]]) {
    const email = `${key}.${marker.toLowerCase()}@ubec.test`;
    await db.query('INSERT INTO users (email, full_name, role, password_hash, state_code) VALUES ($1,$2,$3,$4,$5)', [email, 'QA ' + key, role, hashSync(password, 4), state]);
    const login = await api(key, '/api/auth/login', { email, password }); ok(login);
    cookies[key] = login.response.headers.get('set-cookie').split(';')[0];
  }
  const plan = ok(await api('officer', '/api/plans', { startYear: 2026, endYear: 2026 }), 201).plan;
  const path = `/api/plans/review?plan=${plan.id}`;
  const sports = `/api/sports?plan=${plan.id}`, infra = `/api/infrastructure?plan=${plan.id}`;
  const school = (await db.query("INSERT INTO schools (name,lga,level,location,state_code) VALUES ($1,'QA','Primary','Urban',$1) RETURNING id", [marker])).rows[0].id;
  const type = ok(await api('officer', '/api/construction-types', { classrooms: 1, playroomsLabs: 0, libraries: 0, toilets: 0, officesStores: 0, duration: 20, unitCost: 500.25 }), 201).constructionType.id;
  const projectBody = { schoolId: school, projectType: type, quantity: 2, strategy: 'NCB', rationale: 'QA original' };
  const budgetBody = { entity: 'budget', action: 'create', section: 'equipment', activityType: 'Football', description: 'QA balls', quantity: 5, unitCost: 100.25 };
  const submit = async (actor, extra = {}) => api(actor, path, { action: 'submit', version: ok(await api('officer', path)).plan.version, ...extra });
  assert.equal((await api('anonymous', path)).status, 401);
  assert.equal((await api('foreign', path)).status, 404);
  assert.equal((await submit('officer')).status, 400, 'Empty plans cannot submit');
  for (const actor of ['es', 'reviewer']) {
    assert.equal((await api(actor, '/api/plans', { startYear: 2027, endYear: 2027 })).status, 403);
    assert.equal((await api(actor, infra, projectBody)).status, 403);
    assert.equal((await api(actor, sports, budgetBody)).status, 403);
    assert.equal((await submit(actor)).status, 403);
  }
  const projectId = ok(await api('officer', infra, projectBody), 201).id;
  const budgetId = ok(await api('officer', sports, budgetBody), 201).id;
  const allocationBody = { entity: 'allocation', action: 'create', lineId: budgetId, schoolId: school, quantity: 5 };
  const allocationId = ok(await api('officer', sports, allocationBody), 201).id;
  const stale = ok(await api('officer', path)).plan.version;
  ok(await api('officer', infra, { ...projectBody, action: 'update', id: projectId, rationale: 'QA submitted' }));
  assert.equal((await api('officer', path, { action: 'submit', version: stale })).status, 409);
  const version = ok(await api('officer', path)).plan.version;
  const concurrent = await Promise.all([api('officer', path, { action: 'submit', version }), api('officer', path, { action: 'submit', version })]);
  assert.deepEqual(concurrent.map(r => r.status).sort(), [200, 409]);
  const first = ok(await api('es', path));
  assert.equal(first.plan.status, 'awaiting_review'); assert.equal(first.plan.submissionNumber, 1);
  assert.equal(first.snapshot.infrastructure[0].rationale, 'QA submitted');
  assert.equal(first.snapshot.sports[0].allocations[0].school.name, marker);
  const frozen = JSON.stringify(first.snapshot);
  assert.equal(ok(await api('officer', infra)).canEdit, false);
  assert.equal(ok(await api('es', sports)).canEdit, false);
  for (const body of [projectBody, { ...projectBody, action: 'update', id: projectId }, { action: 'delete', id: projectId }]) assert.equal((await api('officer', infra, body)).status, 409);
  assert.equal((await api('officer', infra + `&id=${projectId}`, undefined, 'DELETE')).status, 409);
  assert.equal((await api('officer', infra, { ...projectBody, id: projectId }, 'PATCH')).status, 409);
  for (const body of [budgetBody, { ...budgetBody, action: 'update', id: budgetId }, { entity: 'budget', action: 'delete', id: budgetId }, allocationBody, { ...allocationBody, action: 'update', id: allocationId }, { entity: 'allocation', action: 'delete', id: allocationId }]) assert.equal((await api('officer', sports, body)).status, 409);
  assert.equal((await api('officer', path, { action: 'approve', version: first.plan.version })).status, 403);
  assert.equal((await api('reviewer', path, { action: 'request_changes', version: first.plan.version, comment: 'No authority' })).status, 403);
  assert.equal((await api('foreign', path, { action: 'approve', version: first.plan.version })).status, 404);
  assert.equal((await api('es', path, { action: 'request_changes', version: first.plan.version, comment: '   ' })).status, 400);
  assert.equal((await api('es', path, { action: 'request_changes', version: first.plan.version, comment: 'Fix', scope: 'sports:999999999' })).status, 400);
  const notice = ok(await api('es', '/api/plans/notifications')).notifications;
  assert.equal(notice.length, 1); assert.equal(notice[0].planId, plan.id);
  assert.equal(ok(await api('foreign', '/api/plans/notifications')).notifications.length, 0);
  ok(await api('foreign', '/api/plans/notifications', { planId: plan.id }));
  assert.equal(ok(await api('es', '/api/plans/notifications')).notifications.length, 1);
  ok(await api('es', '/api/plans/notifications', { planId: plan.id }));
  assert.equal(ok(await api('es', '/api/plans/notifications')).notifications.length, 0);
  ok(await api('es', path, { action: 'request_changes', version: first.plan.version, comment: 'Explain the additional classrooms.', scope: `infrastructure:${projectId}` }));
  assert.equal(ok(await api('officer', path)).plan.status, 'changes_requested');
  assert.equal(ok(await api('officer', infra)).canEdit, true);
  assert.equal(ok(await api('officer', '/api/plans/notifications')).notifications[0].action, 'request_changes');
  ok(await api('officer', infra, { ...projectBody, action: 'update', id: projectId, rationale: 'Revised to address classroom demand.', quantity: 3 }));
  assert.equal((await submit('officer')).status, 400, 'Resubmission needs a response');
  assert.equal(JSON.stringify(ok(await api('officer', path + '&submission=1')).snapshot), frozen, 'Prior submissions remain unchanged');
  assert.equal((await api('officer', path + '&submission=999')).status, 404);
  ok(await submit('officer', { comment: 'Explained classroom demand and corrected quantity.' }));
  const second = ok(await api('es', path));
  assert.equal(second.plan.submissionNumber, 2); assert.equal(second.snapshot.infrastructure[0].quantity, 3);
  assert.equal(second.events.length, 3);
  assert.equal((await api('es', path, { action: 'approve', version: first.plan.version })).status, 409);
  const decisions = await Promise.all([api('es', path, { action: 'approve', version: second.plan.version, comment: 'Reviewed and approved.' }), api('es', path, { action: 'request_changes', version: second.plan.version, comment: 'Duplicate decision' })]);
  assert.deepEqual(decisions.map(r => r.status).sort(), [200, 409]);
  let decided = ok(await api('officer', path));
  if (decided.plan.status === 'changes_requested') { ok(await submit('officer', { comment: 'Ready for final review.' })); const next = ok(await api('es', path)); ok(await api('es', path, { action: 'approve', version: next.plan.version })); decided = ok(await api('es', path)); }
  assert.equal(decided.plan.status, 'approved');
  assert.equal((await api('officer', infra, projectBody)).status, 409);
  assert.equal((await submit('officer')).status, 409);
  for (const actor of ['officer', 'es', 'reviewer']) assert.equal((await api(actor, path, { action: 'submit_to_ubec', version: decided.plan.version })).status, 400, 'UBEC stage must not be available');
  assert.equal(ok(await api('es', '/api/plans')).plans[0].status, 'approved');
  const racePlan = ok(await api('officer', '/api/plans', { startYear: 2028, endYear: 2028 }), 201).plan;
  const raceSports = `/api/sports?plan=${racePlan.id}`, raceReview = `/api/plans/review?plan=${racePlan.id}`;
  const raceLine = ok(await api('officer', raceSports, budgetBody), 201).id;
  const raceVersion = ok(await api('officer', raceReview)).plan.version;
  const race = await Promise.all([api('officer', raceReview, { action: 'submit', version: raceVersion }), api('officer', raceSports, { ...budgetBody, id: raceLine, action: 'update', quantity: 8 })]);
  assert.deepEqual(race.map(r => r.status).sort(), [200, 409]);
  const raceResult = ok(await api('officer', raceReview));
  assert.equal(raceResult.plan.status, race[0].status === 200 ? 'awaiting_review' : 'draft');
  assert.equal(raceResult.snapshot.sports[0].quantity, race[0].status === 200 ? 5 : 8, 'No content change can leak into a submitted version');
  // Fresh DB role checks override a still-valid session after role revocation.
  await db.query("UPDATE users SET role = 'Reviewer' WHERE email = $1", [`officer.${marker.toLowerCase()}@ubec.test`]);
  assert.equal((await api('officer', '/api/plans', { startYear: 2030, endYear: 2030 })).status, 403);
  const noEsPlan = ok(await api('noes', '/api/plans', { startYear: 2026, endYear: 2026 }), 201).plan;
  assert.equal((await api('noes', `/api/plans/review?plan=${noEsPlan.id}`, { action: 'submit', version: 0 })).status, 409);
  assert.deepEqual((await db.query('SELECT id, row_to_json(p)::text AS snapshot FROM action_plans p WHERE id = ANY($1::int[]) ORDER BY id', [original.map(p => p.id)])).rows, original);
  console.log('PASS: submission, feedback, revisions, approval, immutable snapshots, notifications, state and role isolation, fresh role revocation, all editor write locks, stale/duplicate/concurrent review protection, missing ES, no UBEC transition, preserved existing plans.');
} finally {
  for (const table of ['plan_notifications', 'plan_review_events', 'plan_submissions', 'infrastructure_lines']) await db.query(`DELETE FROM ${table} WHERE plan_id IN (SELECT id FROM action_plans WHERE state_code = ANY($1::text[]))`, [states]);
  await db.query('DELETE FROM sports_allocations WHERE line_id IN (SELECT id FROM sports_budget_lines WHERE state_code = ANY($1::text[]))', [states]);
  for (const table of ['sports_budget_lines', 'construction_types', 'action_plans', 'schools', 'users']) await db.query(`DELETE FROM ${table} WHERE state_code = ANY($1::text[])`, [states]);
  await db.end();
}
