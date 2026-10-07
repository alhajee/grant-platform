// API test for the Teacher Development component (pillar 'teachers', migration 040) and its budget split with ICT.
// Creates a throwaway state with its own users, schools and plan, and removes them all afterwards.
// Usage: node --env-file=.env scripts/test-teacher-development.mjs [baseUrl]
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { hashSync } from 'bcryptjs';
import ExcelJS from 'exceljs';

const base = process.argv[2] ?? process.env.UBEC_TEST_URL ?? 'http://localhost:5173';
assert.ok(['localhost', '127.0.0.1'].includes(new URL(base).hostname), 'Run this test against a local server only.');
assert.ok(['localhost', '127.0.0.1'].includes(new URL(process.env.DATABASE_URL).hostname), 'Use a local database only.');
const tag = randomUUID().slice(0, 8).toUpperCase(), state = `TD${tag}`, password = randomUUID();
const db = new Client({ connectionString: process.env.DATABASE_URL });
const jars = {}, userIds = [];
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
  const email = `${key}.${tag}@teacher-development.test`.toLowerCase();
  const id = (await db.query('INSERT INTO users(email,full_name,role,department,state_code,password_hash,is_beap_chair) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id', [email, `TD ${key}`, role, departments[0] ?? null, stateCode, hashSync(password, 4), chair])).rows[0].id;
  userIds.push(id);
  for (const department of departments) await db.query('INSERT INTO user_departments(user_id,department) VALUES($1,$2)', [id, department]);
  ok(await api(key, '/api/auth/login', { email, password }));
}
const url = workstream => `/api/activities?plan=${planId}&workstream=${workstream}`;
const training = (activity, unitCost, extra = {}) => ({ workstream: 'teachers', entity: 'line', action: 'create', activity, description: 'TD training', quantity: 50, unitCost, trainingProvider: 'Special training provider approved by UBEC', targetParticipants: 'Teachers', schoolLevels: ['Primary', 'JSS'], trainingDays: 5, venueType: 'Hall', schoolIds: [], ...extra });
const ictLine = (activity, unitCost, extra = {}) => ({ workstream: 'ict', entity: 'line', action: 'create', activity, description: `TD ict ${activity}`, quantity: 1, unitCost, strategy: 'Request for quotation', targetGroup: 'Schools', ...extra });
const split = (who, side, amount) => api(who, `/api/activities/ict-allocation?plan=${planId}`, { amount, side }, { method: 'PATCH' });
const review = async (who, body) => api(who, `/api/plans/review?plan=${planId}`, { ...body, version: ok(await api(who, `/api/plans/review?plan=${planId}`)).plan.version });
const upload = async (who, lineId, name, bytes, workstream = 'teachers') => { const form = new FormData(); form.set('workstream', workstream); form.set('lineId', String(lineId)); form.set('file', new Blob([bytes]), name); return api(who, `/api/activities/line-documents?plan=${planId}`, form); };
const allocation = async () => (await db.query('SELECT ict_allocation::text AS v FROM action_plans WHERE id=$1', [planId])).rows[0].v;

const pdf = Buffer.from('%PDF-1.4\n% TD MoU\n%%EOF\n');
const workbook = new ExcelJS.Workbook(); workbook.addWorksheet('Budget').addRow(['Item', 'Cost']);
const xlsx = Buffer.from(await workbook.xlsx.writeBuffer());
const png = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');

await db.connect();
try {
  settings = (await db.query("SELECT beap_chair_submission_mode, ubec_submission_mode, component_documents_required FROM state_workflow_settings WHERE state_code='GLOBAL'")).rows[0];
  // This test checks the document refusals, so supporting documents are required for its run (migration 052).
  await db.query("UPDATE state_workflow_settings SET component_documents_required=TRUE WHERE state_code='GLOBAL'");
  await user('tpd', 'Data Entry Staff', ['teachers']);
  await user('ict', 'Data Entry Staff', ['ict']);
  await user('academic', 'Data Entry Staff', ['academic']);
  await user('tpdDirector', 'Director', ['teachers']);
  await user('chair', 'Director', ['physical'], true);
  await user('ec', 'Executive Chairman', []);
  await user('es', 'UBEC Executive Secretary', [], false, 'UBEC');
  await user('revTeachers', 'UBEC Department Reviewer', ['teachers'], false, 'UBEC');
  await user('revQuality', 'UBEC Department Reviewer', ['quality'], false, 'UBEC');
  // State contribution ₦400,000,000 → shared ₦800,000,000 → Teacher Development & ICT share ₦40,000,000 (5%).
  planId = (await db.query("INSERT INTO action_plans(state_code,start_year,end_year,implementation_year,funding_quarters,state_lodgment,other_funding,funding_policy_id) VALUES($1,2032,2032,2032,'{1}',400000000,0,(SELECT id FROM funding_policies ORDER BY id DESC LIMIT 1)) RETURNING id", [state])).rows[0].id;
  await db.query("INSERT INTO plan_quarters(plan_id,state_code,planning_year,quarter) VALUES($1,$2,2032,1)", [planId, state]);

  // Department permissions: Teacher Development belongs to the 'teachers' department.
  fails(await api('academic', url('teachers')), 403);
  fails(await api('ict', url('teachers'), training(0, 100)), 403);
  fails(await split('ict', 'teachers', '30000000'), 403);
  fails(await split('tpd', 'ict', '10000000'), 403);
  const first = ok(await api('tpd', url('teachers')));
  assert.equal(first.canEdit, true); assert.equal(first.plan.ictAllocation, null); assert.equal(Number(first.partnerProposed), 0);
  step('Department access: only Teacher Development staff edit it and its side of the split');

  // The split comes first; either side sets it and the other keeps the rest.
  fails(await api('tpd', url('teachers'), training(0, 100)), 400, /Teacher Development will use before adding Teacher Development items/);
  fails(await split('tpd', 'teachers', '0'), 409, /greater than zero/);
  fails(await split('tpd', 'teachers', '40000000.01'), 409, /up to the shared Teacher Development & ICT budget of ₦40,000,000\.00/);
  assert.equal(ok(await split('tpd', 'teachers', '30000000')).ictAllocation, '10000000.00');
  assert.equal(ok(await api('ict', url('ict'))).plan.ictAllocation, '10000000.00');
  ok(await split('ict', 'ict', '12000000'));
  assert.equal(await allocation(), '12000000.00');
  // Teacher Development may take everything while ICT has no lines; ICT is then left ₦0.
  assert.equal(ok(await split('tpd', 'teachers', '40000000')).ictAllocation, '0.00');
  fails(await api('ict', url('ict'), ictLine(1, 100)), 400, /exceeded the ICT allocation \(₦0\.00\)/);
  ok(await split('ict', 'ict', '10000000'));
  step('Split from the Teacher Development side updates ICT and vice versa; ICT may be left ₦0 only without lines');

  // Line validation: training details replace description, strategy and target group.
  fails(await api('tpd', url('teachers'), training(19, 100)), 400, /valid allowable activity/);
  fails(await api('tpd', url('teachers'), training(0, 100, { trainingProvider: '' })), 400, /training provider/);
  fails(await api('tpd', url('teachers'), training(0, 100, { trainingProvider: 'Anyone' })), 400, /training provider/);
  fails(await api('tpd', url('teachers'), training(0, 100, { targetParticipants: 'Pupils' })), 400, /target participants/);
  fails(await api('tpd', url('teachers'), training(0, 100, { schoolLevels: [] })), 400, /at least one school level/);
  fails(await api('tpd', url('teachers'), training(0, 100, { schoolLevels: ['SSS'] })), 400);
  const subeb = ok(await api('tpd', url('teachers'), training(1, 100, { schoolLevels: ['SUBEB'] })));
  ok(await api('tpd', url('teachers'), { workstream: 'teachers', entity: 'line', action: 'delete', id: subeb.id }));
  fails(await api('tpd', url('teachers'), training(0, 100, { schoolLevels: ['JSS', 'JSS'] })), 400, /each school level once/);
  fails(await api('tpd', url('teachers'), training(0, 100, { trainingDays: 2 })), 400, /at least 3 days/);
  fails(await api('tpd', url('teachers'), training(0, 100, { trainingDays: 3.5 })), 400);
  fails(await api('tpd', url('teachers'), training(0, 100, { trainingDays: null })), 400, /number of training days/);
  fails(await api('tpd', url('teachers'), training(0, 100, { venueType: 'Stadium' })), 400, /venue type/);
  fails(await api('tpd', url('teachers'), training(0, 100, { strategy: 'NCB' })), 400, /do not apply to Teacher Development/);
  fails(await api('tpd', url('teachers'), training(0, 100, { description: '   ' })), 400, /Enter a description/);
  fails(await api('tpd', url('teachers'), training(18, 100)), 400, /Enter the activity name/);
  fails(await api('ict', url('ict'), ictLine(1, 100, { trainingProvider: 'International Development Partners' })), 400, /only apply to Teacher Development/);
  const literacy = ok(await api('tpd', url('teachers'), training(0, 100000, { trainingDays: 3, description: 'Early grade reading' })));
  const others = ok(await api('tpd', url('teachers'), training(18, 200000, { customActivity: 'Peer coaching circles', description: 'Peer coaching circles', schoolLevels: ['ECCDE'], venueType: 'Classroom', targetParticipants: 'Headteachers/Principals' })));
  ok(await api('tpd', url('teachers'), { ...training(10, 100000, { trainingProvider: 'International Development Partners' }), action: 'update', id: literacy.id, activity: 10, trainingDays: 4 }));
  let tpd = ok(await api('tpd', url('teachers')));
  const saved = tpd.lines.find(l => l.id === literacy.id);
  assert.deepEqual([saved.activity, saved.trainingProvider, saved.targetParticipants, saved.schoolLevels, saved.trainingDays, saved.venueType, saved.description, saved.strategy, saved.targetGroup],
    [10, 'International Development Partners', 'Teachers', ['Primary', 'JSS'], 4, 'Hall', 'TD training', '', '']);
  assert.equal(tpd.lines.find(l => l.id === others.id).customActivity, 'Peer coaching circles');
  // Teacher Development keeps ₦30,000,000 (₦40M shared − ₦10M ICT); 50 × ₦100,000 + 50 × ₦200,000 = ₦15M is used.
  fails(await api('tpd', url('teachers'), training(3, 300000.01)), 400, /exceeded the Teacher Development allocation \(₦30,000,000\.00\) by ₦0\.50/);
  step('Line validation: provider, participants, school levels, days ≥ 3, venue, Others needs a name; ceiling from the split');

  // Bounds: neither side may drop below what its own lines, or the other side's lines, propose.
  ok(await api('ict', url('ict'), ictLine(1, 5000000)));
  fails(await split('tpd', 'teachers', '14999999'), 409, /Teacher Development lines already propose ₦15,000,000\.00/);
  fails(await split('tpd', 'teachers', '36000000'), 409, /ICT lines already propose ₦5,000,000\.00, so Teacher Development can use up to ₦35,000,000\.00/);
  fails(await split('ict', 'ict', '25000001'), 409, /Teacher Development lines already propose ₦15,000,000\.00, so ICT can use up to ₦25,000,000\.00/);
  fails(await split('ict', 'ict', '4999999'), 409, /ICT lines already propose/);
  assert.equal(ok(await split('tpd', 'teachers', '35000000')).ictAllocation, '5000000.00');
  assert.equal(Number(ok(await api('tpd', url('teachers'))).partnerProposed), 5000000);
  ok(await split('ict', 'ict', '10000000'));
  step('Split bounds protect both sides’ saved lines');

  // Supporting documents: PDF or Excel only, every line, attached by Teacher Development staff.
  fails(await upload('tpd', literacy.id, 'photo.png', png), 400, /PDF or Excel/);
  fails(await upload('tpd', literacy.id, 'fake.pdf', Buffer.from('not a pdf')), 400, /PDF or Excel/);
  fails(await upload('ict', literacy.id, 'mou.pdf', pdf), 403);
  const mou = ok(await upload('tpd', literacy.id, 'mou.pdf', pdf));
  ok(await upload('tpd', literacy.id, 'budget.xlsx', xlsx));
  tpd = ok(await api('tpd', url('teachers')));
  assert.deepEqual(tpd.lines.find(l => l.id === literacy.id).documents.map(d => d.name), ['mou.pdf', 'budget.xlsx']);
  const download = await api('tpd', `/api/activities/line-documents?id=${mou.id}`);
  assert.equal(download.status, 200); assert.deepEqual(download.bytes, pdf);
  fails(await api('ict', `/api/activities/line-documents?id=${mou.id}`), 404);
  step('Supporting documents: PDF/Excel only, signature-checked, visible to the component');

  // Sending needs documents on every line.
  fails(await review('tpd', { action: 'submit', pillar: 'teachers' }), 409, /supporting documents for “Peer coaching circles”/);
  ok(await upload('tpd', others.id, 'list.pdf', pdf));
  fails(await review('ict', { action: 'submit', pillar: 'teachers' }), 403);
  const chairView = ok(await api('chair', `/api/plans/review?plan=${planId}`));
  assert.ok(chairView.visiblePillars.includes('teachers'));
  const snapLine = chairView.snapshot.teachers.find(l => l.id === literacy.id);
  assert.deepEqual([snapLine.training_provider, snapLine.school_levels, snapLine.training_days, snapLine.venue_type, snapLine.documents.length], ['International Development Partners', ['Primary', 'JSS'], 4, 'Hall', 2]);
  const ictView = ok(await api('ict', `/api/plans/review?plan=${planId}`));
  assert.equal(ictView.snapshot.teachers, undefined);
  assert.equal(ok(await api('tpd', `/api/beap?plan=${planId}`)).teachers.budget, 15000000);
  assert.equal(ok(await api('ec', '/api/plans')).plans.find(p => p.id === planId).teachersBudget, 15000000);
  step('Send blocked until every line has documents; snapshots, visibility and totals include Teacher Development');

  // Review chain: Data Entry → Teacher Development Director → BEAP Chair → Executive Chairman → UBEC (lead: teachers).
  await db.query("UPDATE state_workflow_settings SET beap_chair_submission_mode='individual_components', ubec_submission_mode='reviewed_components' WHERE state_code='GLOBAL'");
  ok(await review('tpd', { action: 'submit', pillar: 'teachers' }));
  fails(await api('tpd', url('teachers'), training(3, 100)), 409);
  fails(await split('tpd', 'teachers', '30000000'), 409);
  const comment = ok(await api('tpdDirector', `/api/plans/comments?plan=${planId}`, { sheet: 'teachers', rowRef: String(literacy.id), columnId: 'provider', body: 'Confirm the provider MoU.' }), 201);
  assert.ok(comment.id);
  ok(await review('tpdDirector', { action: 'endorse', pillar: 'teachers' }));
  ok(await review('chair', { action: 'forward', pillar: 'teachers' }));
  assert.equal(ok(await api('ec', `/api/plans/review?plan=${planId}`)).pillarReviews.find(r => r.pillar === 'teachers').status, 'chairman_ready');
  const ubecPath = `/api/ubec/review?plan=${planId}`;
  ok(await api('ec', ubecPath, { action: 'submit', version: ok(await api('ec', ubecPath)).plan.version }));
  const esView = ok(await api('es', ubecPath));
  assert.equal(esView.round.snapshot.teachers.length, 2); assert.deepEqual(esView.round.snapshot.ict, []);
  ok(await api('es', ubecPath, { action: 'assign', version: esView.plan.version, roundId: esView.round.id, assignments: [{ pillar: 'teachers', department: 'teachers' }] }));
  assert.equal(ok(await api('revTeachers', ubecPath)).round.snapshot.teachers.length, 2);
  ok(await api('revTeachers', `/api/activities/line-documents?id=${mou.id}`));
  fails(await api('revQuality', `/api/activities/line-documents?id=${mou.id}`), 404);
  fails(await upload('tpd', literacy.id, 'late.pdf', pdf), 409);
  step('Teacher Development flows Director → BEAP Chair → Executive Chairman → UBEC with the teachers department');
  console.log(`PASS: ${passed} teacher-development checks.`);
} finally {
  if (settings) await db.query("UPDATE state_workflow_settings SET beap_chair_submission_mode=$1, ubec_submission_mode=$2, component_documents_required=$3 WHERE state_code='GLOBAL'", [settings.beap_chair_submission_mode, settings.ubec_submission_mode, settings.component_documents_required]);
  if (planId) { await db.query('DELETE FROM ubec_events WHERE plan_id=$1', [planId]); await db.query('DELETE FROM ubec_assignments WHERE round_id IN (SELECT id FROM ubec_rounds WHERE plan_id=$1)', [planId]); await db.query('DELETE FROM ubec_rounds WHERE plan_id=$1', [planId]); }
  if (planId) for (const t of ['plan_comments', 'plan_notifications', 'plan_review_events', 'plan_submissions', 'plan_pillar_reviews', 'activity_line_documents', 'activity_plan_lines', 'plan_quarters']) await db.query(`DELETE FROM ${t} WHERE plan_id=$1`, [planId]);
  if (planId) await db.query('DELETE FROM action_plans WHERE id=$1', [planId]);
  if (userIds.length) await db.query('DELETE FROM users WHERE id=ANY($1::int[])', [userIds]);
  await db.end();
}
