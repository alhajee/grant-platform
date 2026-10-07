// UBEC Assessment Officer limits and default officers (migration 056): default limits per department; the limit is
// enforced on the UBEC Officers page and on Admin > Users (create, reactivate, move department); raising and lowering
// (with the over-limit warning); default officers assigned automatically on release and notified; the Director can
// still change them; the Super Admin opens the UBEC plan page and assigns/removes officers with the Director's rules;
// permissions (non-admin 403, cross-origin 403, Super Admin cannot take other workflow steps).
// Usage: node --env-file=.env scripts/test-ubec-officers.mjs [baseUrl]   (local only; throwaway users and plan; restores settings)
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { hashSync } from 'bcryptjs';
import ExcelJS from 'exceljs';

const base = process.argv[2] ?? process.env.TEST_BASE_URL ?? process.env.UBEC_TEST_URL ?? 'http://localhost:5173';
assert.match(base, /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/, 'Run this test against a local server only.');
assert.ok(['localhost', '127.0.0.1'].includes(new URL(process.env.DATABASE_URL).hostname), 'Use a local database only.');
const marker = `UO${randomUUID().slice(0, 8).toUpperCase()}`, password = randomUUID();
const db = new Client({ connectionString: process.env.DATABASE_URL });
const jars = {}, users = {}, created = [];
let settings, savedLimits, savedDefaults, planId, passed = 0;
const step = message => { passed++; console.log('✓', message); };

async function api(who, path, body, method = body ? 'POST' : 'GET', origin = true) {
  const jar = jars[who] ?? {};
  const cookie = Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ');
  const response = await fetch(base + path, { method, redirect: 'manual', headers: { ...(origin ? { Origin: base } : {}), ...(body && !(body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}) }, ...(body ? { body: body instanceof FormData ? body : JSON.stringify(body) } : {}) });
  for (const set of response.headers.getSetCookie()) { const pair = set.split(';')[0], i = pair.indexOf('='); jar[pair.slice(0, i)] = pair.slice(i + 1); }
  jars[who] = jar;
  const text = await response.text(); let data; try { data = JSON.parse(text); } catch { data = { error: text.slice(0, 200) }; }
  return { status: response.status, data };
}
const ok = (r, status = 200) => { assert.equal(r.status, status, JSON.stringify(r.data)); return r.data; };
const fails = (r, status, pattern) => { assert.equal(r.status, status, JSON.stringify(r.data)); if (pattern) assert.match(r.data.error ?? '', pattern); return r.data; };
async function user(who, role, departments, { state = marker, chair = false, login = true, active = true } = {}) {
  const email = `${who}.${marker}@ubec-officers.test`.toLowerCase();
  const id = (await db.query('INSERT INTO users(email,full_name,role,department,state_code,password_hash,is_beap_chair,active) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id', [email, `QA ${who} ${marker}`, role, departments[0] ?? null, state, hashSync(password, 4), chair, active])).rows[0].id;
  users[who] = id;
  for (const department of departments) await db.query('INSERT INTO user_departments(user_id,department) VALUES($1,$2)', [id, department]);
  if (login) ok(await api(who, '/api/auth/login', { email, password }));
  return id;
}
const activeOfficers = async department => (await db.query("SELECT COUNT(*)::int AS n FROM users WHERE role='UBEC Assessment Officer' AND active AND department=$1", [department])).rows[0].n;
const notified = async (who, action) => (await db.query('SELECT 1 FROM plan_notifications n JOIN ubec_events u ON u.id=n.ubec_event_id WHERE n.user_id=$1 AND n.plan_id=$2 AND u.action=$3', [users[who], planId, action])).rowCount > 0;
const adminSettings = async () => ok(await api('admin', '/api/admin/ubec-officers'));
const setLimit = async (department, limit) => ok(await api('admin', '/api/admin/ubec-officers', { limits: [{ department, limit }] }, 'PUT'));
const department = (data, id) => data.departments.find(d => d.department === id);

await db.connect();
try {
  settings = (await db.query("SELECT beap_chair_submission_mode, ubec_submission_mode FROM state_workflow_settings WHERE state_code='GLOBAL'")).rows[0];
  savedLimits = (await db.query('SELECT * FROM ubec_officer_limits')).rows;
  savedDefaults = (await db.query('SELECT * FROM ubec_default_officers')).rows;
  await db.query('DELETE FROM ubec_officer_limits'); await db.query('DELETE FROM ubec_default_officers');
  await db.query("UPDATE state_workflow_settings SET beap_chair_submission_mode='individual_components', ubec_submission_mode='reviewed_components' WHERE state_code='GLOBAL'");
  await user('admin', 'Super Admin', [], { state: 'ADMIN' });
  const u = { state: 'UBEC' };
  await user('chair', 'UBEC BEAP Chair', [], u); await user('es', 'UBEC Executive Secretary', [], u);
  await user('dpp', 'UBEC Director', ['physical'], u); await user('dme', 'UBEC Director', ['quality'], u);
  await user('offP1', 'UBEC Assessment Officer', ['physical'], u); await user('offP2', 'UBEC Assessment Officer', ['physical'], u);
  await user('offA', 'UBEC Assessment Officer', ['academic'], u); await user('offQ', 'UBEC Assessment Officer', ['quality'], u);
  await user('desP', 'Data Entry Staff', ['physical']); await user('dirP', 'Director', ['physical']);
  await user('subebChair', 'Director', ['planning'], { chair: true }); await user('ec', 'Executive Chairman', []);

  // Defaults: one officer per component of the department.
  const initial = await adminSettings();
  assert.deepEqual(Object.fromEntries(initial.departments.map(d => [d.department, d.defaultLimit])), { physical: 2, planning: 1, academic: 4, teachers: 1, digital: 1, quality: 1, social: 1 });
  assert.ok(initial.departments.every(d => d.limit === d.defaultLimit && !d.custom), 'without a row the limit is the default');
  assert.deepEqual(department(initial, 'physical').components.map(c => c.pillar), ['infrastructure', 'monitoring']);
  assert.deepEqual(department(initial, 'academic').components.map(c => c.pillar).sort(), ['curriculum', 'gscci', 'sports', 'tlm']);
  assert.ok(department(initial, 'quality').officers.some(o => o.id === users.offQ), 'each department lists its active officers');
  step('default limits: Physical Planning 2, Academic Services 4, the others 1; each department lists its components and active officers');

  // Permissions.
  fails(await api('desP', '/api/admin/ubec-officers'), 403); fails(await api('dpp', '/api/admin/ubec-officers', { limits: [{ department: 'quality', limit: 5 }] }, 'PUT'), 403);
  fails(await api('chair', '/api/admin/ubec-officers'), 403);
  fails(await api('admin', '/api/admin/ubec-officers', { limits: [{ department: 'quality', limit: 5 }] }, 'PUT', false), 403, /portal/);
  for (const bad of [{ limits: [{ department: 'quality', limit: 0 }] }, { limits: [{ department: 'quality', limit: 51 }] }, { limits: [{ department: 'audit', limit: 2 }] }, { limits: [{ department: 'quality', limit: 2 }, { department: 'quality', limit: 3 }] }, { other: 1 }])
    fails(await api('admin', '/api/admin/ubec-officers', bad, 'PUT'), 400);
  fails(await api('admin', '/api/admin/ubec-officers', { defaults: [{ pillar: 'monitoring', officerIds: [users.offA] }] }, 'PUT'), 400, /Monitoring|department/);
  fails(await api('admin', '/api/admin/ubec-officers', { defaults: [{ pillar: 'monitoring', officerIds: [users.dpp] }] }, 'PUT'), 400);
  assert.equal((await db.query('SELECT COUNT(*)::int AS n FROM ubec_officer_limits')).rows[0].n, 0, 'refused writes store nothing');
  step('settings API: Super Admin only (state, UBEC roles 403), same origin, limits 1-50 for component departments, default officers must be active officers of the component department');

  // Limit on the UBEC Officers page (Director).
  const n = await activeOfficers('quality');
  await setLimit('quality', n);
  const team = ok(await api('dme', '/api/ubec/officers'));
  assert.deepEqual(team.limits.map(l => [l.department, l.active, l.limit]), [['quality', n, n]]);
  const add = (who, email, extra = {}) => api(who, '/api/ubec/officers', { name: `QA Officer ${email}`, email: `${email}.${marker}@ubec-officers.test`.toLowerCase(), ...extra });
  fails(await add('dme', 'q1'), 409, /already has \d+ of \d+ Assessment Officer/);
  assert.equal(await activeOfficers('quality'), n, 'a refused addition creates nothing');
  await setLimit('quality', n + 1);
  const q1 = ok(await add('dme', 'q1'), 201); created.push(q1.id);
  fails(await add('dme', 'q2'), 409, /Monitoring & Evaluation already has/);
  fails(await add('chair', 'q2', { department: 'quality' }), 409);
  step('UBEC Officers page: Add is refused with 409 at the limit (Director and BEAP Chair), allowed after the Super Admin raises it');

  // Limit on Admin > Users.
  const adminCreate = email => api('admin', '/api/admin/users', { name: `QA Admin Officer ${email}`, email: `${email}.${marker}@ubec-officers.test`.toLowerCase(), role: 'UBEC Assessment Officer', stateCode: 'UBEC', departments: ['quality'], active: true });
  const edit = (id, profile) => api('admin', '/api/admin/users', { id, name: `QA edit ${id}`, stateCode: 'UBEC', ...profile }, 'PATCH');
  fails(await adminCreate('a1'), 409, /already has/);
  ok(await api('admin', '/api/admin/users', { name: 'QA inactive officer', email: `a2.${marker}@ubec-officers.test`.toLowerCase(), role: 'UBEC Assessment Officer', stateCode: 'UBEC', departments: ['quality'], active: false }), 201);
  created.push((await db.query('SELECT id FROM users WHERE email=$1', [`a2.${marker}@ubec-officers.test`.toLowerCase()])).rows[0].id);
  ok(await edit(users.offQ, { role: 'UBEC Assessment Officer', departments: ['quality'], active: true }), 200);
  fails(await edit(users.offP2, { role: 'UBEC Assessment Officer', departments: ['quality'], active: true }), 409, /already has/);
  fails(await edit(users.dme, { role: 'UBEC Assessment Officer', departments: ['quality'], active: true }), 409, /already has/);
  // Lowering below the active count is allowed and warned about.
  const lowered = department(await setLimit('quality', n), 'quality');
  assert.equal(lowered.limit, n); assert.equal(lowered.active, n + 1); assert.match(lowered.warning, new RegExp(`^${n + 1} active, limit ${n}: no new officers until one is deactivated`));
  ok(await edit(users.offQ, { role: 'UBEC Assessment Officer', departments: ['quality'], active: false }));
  fails(await edit(users.offQ, { role: 'UBEC Assessment Officer', departments: ['quality'], active: true }), 409, /already has/);
  await setLimit('quality', n + 1);
  ok(await edit(users.offQ, { role: 'UBEC Assessment Officer', departments: ['quality'], active: true }));
  const reset = department(await setLimit('quality', null), 'quality');
  assert.equal(reset.limit, 1); assert.equal(reset.custom, false);
  step('Admin > Users: create, reactivation, moving department and a role change are refused at the limit; an inactive officer and deactivation always pass; lowering below the active count is allowed with a warning; Reset returns to the default');

  // Default officers on release.
  ok(await api('admin', '/api/admin/ubec-officers', { defaults: [{ pillar: 'monitoring', officerIds: [users.offP1] }] }, 'PUT'));
  assert.deepEqual(department(await adminSettings(), 'physical').components.find(c => c.pillar === 'monitoring').defaults, [users.offP1]);
  const rat = new ExcelJS.Workbook(); rat.addWorksheet('RAT').addRow(['UBEC officers QA']);
  const form = new FormData();
  form.set('setup', JSON.stringify({ planningYear: 2037, implementationYear: 2037, quarters: [1, 2, 3, 4], stateLodgment: '100000000', fundingSources: [] }));
  form.append('rat', new Blob([await rat.xlsx.writeBuffer()]), 'rat.xlsx');
  planId = ok(await api('ec', '/api/plans', form), 201).plan.id;
  const q = `?plan=${planId}`, statePath = `/api/plans/review${q}`, path = `/api/ubec/review${q}`, components = `/api/ubec/components${q}`;
  ok(await api('desP', `/api/activities${q}&workstream=monitoring`, { workstream: 'monitoring', entity: 'line', action: 'create', activity: 0, description: 'QA monitoring visit', quantity: 1, unitCost: 1000, strategy: 'Request for quotation', targetGroup: 'Schools' }));
  const stateStep = async (who, action) => ok(await api(who, statePath, { action, pillar: 'monitoring', version: ok(await api('ec', statePath)).plan.version, comment: '' }));
  await stateStep('desP', 'submit'); await stateStep('dirP', 'endorse'); await stateStep('subebChair', 'forward');
  ok(await api('ec', path, { action: 'submit', version: ok(await api('ec', path)).plan.version }));
  const view = async who => ok(await api(who, path));
  const before = await view('chair');
  fails(await api('offP1', path), 404);
  ok(await api('chair', path, { action: 'release', version: before.plan.version, roundId: before.round.id, comment: 'Please assess.' }));
  const released = (await view('chair')).flow.components.find(c => c.pillar === 'monitoring');
  assert.deepEqual(released.officers.map(o => o.officerId), [users.offP1]);
  assert.equal(released.officers[0].assignedByName, 'Default (Admin)'); assert.equal(released.officers[0].comment, 'Assigned by default (Admin)');
  assert.ok(await notified('offP1', 'default_officers') && await notified('dpp', 'default_officers'), 'the default officer and the Director are notified');
  assert.equal(await notified('offP2', 'default_officers'), false);
  assert.deepEqual((await view('offP1')).flow.abilities.assess, ['monitoring'], 'the default officer can assess straight away');
  const events = (await db.query("SELECT action, comment FROM ubec_events WHERE plan_id=$1 AND action='default_officers'", [planId])).rows;
  assert.equal(events.length, 1); assert.match(events[0].comment, /Assigned by default \(Admin\)/);
  step('release assigns the Admin default officers inside the release, records a default_officers event and notifies the officer and the Director');

  // The Director can still change them.
  const roundId = before.round.id;
  const assign = (who, officerIds, comment = 'Please check unit costs.', origin = true) => api(who, components, { action: 'assign_officers', roundId, pillar: 'monitoring', officerIds, comment }, 'POST', origin);
  const remove = (who, assignmentId) => api(who, components, { action: 'unassign_officer', roundId, pillar: 'monitoring', assignmentId });
  ok(await assign('dpp', [users.offP2]));
  ok(await remove('dpp', released.officers[0].id));
  assert.deepEqual((await view('dpp')).flow.components[0].officers.map(o => o.officerId), [users.offP2]);
  fails(await api('offP1', path), 404, /No assigned submission/);
  step('the Director still adds and removes officers after the default assignment');

  // Super Admin reassign.
  const adminView = await view('admin');
  assert.equal(adminView.role, 'Super Admin'); assert.deepEqual(adminView.flow.abilities.assign, ['monitoring']);
  assert.deepEqual(adminView.flow.abilities.sendOversight, []); assert.equal(adminView.flow.abilities.release, false);
  assert.ok(adminView.flow.officers.some(o => o.id === users.offP1 && o.department === 'physical'), 'the Super Admin chooses among the component department\'s officers');
  assert.ok((await adminSettings()).plans.some(p => p.planId === planId && p.atDirector === 1), 'the admin card lists plans in department assessment');
  fails(await assign('admin', [users.offP1], ''), 400, /comment/);
  fails(await assign('admin', [users.offA]), 400, /Physical Planning/);
  fails(await assign('admin', [users.offP1], 'x', false), 403, /portal/);
  fails(await assign('es', [users.offP1]), 403);
  ok(await assign('admin', [users.offP1], 'Reassigned by the Super Admin.'));
  assert.ok(await notified('offP1', 'assign_officer') && await notified('dpp', 'assign_officer'), 'a Super Admin assignment notifies the officer and the Director');
  const afterAdmin = (await view('admin')).flow.components[0].officers;
  assert.deepEqual(afterAdmin.map(o => o.officerId).sort(), [users.offP1, users.offP2].sort());
  ok(await remove('admin', afterAdmin.find(o => o.officerId === users.offP2).id));
  fails(await api('admin', components, { action: 'send_oversight', roundId, pillar: 'monitoring', comment: 'x' }), 403);
  fails(await api('admin', components, { action: 'complete_assessment', roundId, pillar: 'monitoring', note: '' }), 403);
  const latest = await view('chair');
  fails(await api('admin', path, { action: 'approve', version: latest.plan.version, roundId, comment: 'x' }), 403);
  fails(await api('admin', `/api/ubec/comments${q}`), 403);
  step('the Super Admin opens the UBEC plan page, assigns (comment and department rules, same origin) and removes officers; the Director is notified; other workflow steps and UBEC comments stay closed to the Super Admin');

  // Deactivating an officer drops them from the defaults.
  ok(await edit(users.offP1, { role: 'UBEC Assessment Officer', departments: ['physical'], active: false }));
  assert.equal((await db.query('SELECT 1 FROM ubec_default_officers WHERE officer_id=$1', [users.offP1])).rowCount, 0);
  step('deactivating an officer removes their default assignments');
  console.log(`\nPASS: ${passed} UBEC officer checks.`);
} finally {
  if (settings) await db.query("UPDATE state_workflow_settings SET beap_chair_submission_mode=$1, ubec_submission_mode=$2 WHERE state_code='GLOBAL'", [settings.beap_chair_submission_mode, settings.ubec_submission_mode]);
  if (savedLimits) {
    await db.query('DELETE FROM ubec_officer_limits');
    for (const r of savedLimits) await db.query('INSERT INTO ubec_officer_limits(department,max_officers,updated_by_name,updated_at) VALUES($1,$2,$3,$4)', [r.department, r.max_officers, r.updated_by_name, r.updated_at]);
  }
  if (savedDefaults) {
    await db.query('DELETE FROM ubec_default_officers');
    for (const r of savedDefaults) await db.query('INSERT INTO ubec_default_officers(pillar,officer_id,updated_by_name,updated_at) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING', [r.pillar, r.officer_id, r.updated_by_name, r.updated_at]);
  }
  if (planId) {
    await db.query('DELETE FROM plan_comments WHERE plan_id=$1', [planId]);
    await db.query('DELETE FROM plan_notifications WHERE plan_id=$1', [planId]);
    await db.query('DELETE FROM ubec_events WHERE plan_id=$1', [planId]);
    await db.query('DELETE FROM ubec_rounds WHERE plan_id=$1', [planId]);
    for (const t of ['plan_review_events', 'plan_submissions', 'plan_pillar_reviews', 'activity_plan_lines']) await db.query(`DELETE FROM ${t} WHERE plan_id=$1`, [planId]);
    await db.query('DELETE FROM action_plans WHERE id=$1', [planId]);
  }
  const ids = [...Object.values(users), ...created];
  if (ids.length) {
    await db.query('DELETE FROM user_management_events WHERE actor_id=ANY($1::int[]) OR target_id=ANY($1::int[])', [ids]);
    await db.query('DELETE FROM sessions WHERE user_id=ANY($1::int[])', [ids]);
    await db.query('DELETE FROM users WHERE id=ANY($1::int[])', [ids]);
  }
  await db.end();
}
