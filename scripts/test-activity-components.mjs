// API test for the Supervision & Monitoring, Greening/Safeguards and Curriculum components (migration 036).
// Creates a throwaway state with its own users, schools and plan, and removes them all afterwards.
// Usage: set -a; . ./.env; set +a; node scripts/test-activity-components.mjs [baseUrl]
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { hashSync } from 'bcryptjs';

const base = process.argv[2] ?? process.env.TEST_BASE_URL ?? process.env.UBEC_TEST_URL ?? 'http://localhost:5173';
assert.ok(['localhost', '127.0.0.1'].includes(new URL(base).hostname), 'Run this test against a local server only.');
assert.ok(['localhost', '127.0.0.1'].includes(new URL(process.env.DATABASE_URL).hostname), 'Use a local database only.');
const tag = randomUUID().slice(0, 8).toUpperCase(), state = `AC${tag}`, password = randomUUID();
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
  const email = `${key}.${tag}@components.test`.toLowerCase();
  const id = (await db.query('INSERT INTO users(email,full_name,role,department,state_code,password_hash,is_beap_chair) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id', [email, `QA ${key}`, role, departments[0] ?? null, stateCode, hashSync(password, 4), chair])).rows[0].id;
  userIds.push(id);
  for (const department of departments) await db.query('INSERT INTO user_departments(user_id,department) VALUES($1,$2)', [id, department]);
  ok(await api(key, '/api/auth/login', { email, password }));
}
const url = workstream => `/api/activities?plan=${planId}&workstream=${workstream}`;
const line = (workstream, activity, unitCost, extra = {}) => ({ workstream, entity: 'line', action: 'create', activity, description: `QA ${workstream} item`, quantity: 1, unitCost, strategy: 'Request for quotation', targetGroup: 'Schools', ...extra });
const review = async (who, body) => api(who, `/api/plans/review?plan=${planId}`, { ...body, version: ok(await api(who, `/api/plans/review?plan=${planId}`)).plan.version });

await db.connect();
try {
  settings = (await db.query("SELECT beap_chair_submission_mode, ubec_submission_mode FROM state_workflow_settings WHERE state_code='GLOBAL'")).rows[0];
  await user('physical', 'Data Entry Staff', ['physical']);
  await user('academic', 'Data Entry Staff', ['academic']);
  await user('physicalDirector', 'Director', ['physical']);
  await user('academicDirector', 'Director', ['academic']);
  await user('chair', 'Director', ['physical'], true);
  await user('ec', 'Executive Chairman', []);
  await user('es', 'UBEC Executive Secretary', [], false, 'UBEC');
  await user('revPhysical', 'UBEC Department Reviewer', ['physical'], false, 'UBEC');
  await user('revAcademic', 'UBEC Department Reviewer', ['academic'], false, 'UBEC');
  // State contribution 100,000 → shared envelope 200,000 → each 2% component gets ₦4,000.00 under the default policy.
  planId = (await db.query('INSERT INTO action_plans(state_code,start_year,end_year,state_lodgment,other_funding) VALUES($1,2029,2029,100000,0) RETURNING id', [state])).rows[0].id;
  for (const [name, male, female] of [['QA Curriculum School A', 60, 40], ['QA Curriculum School B', 150, 150]]) schoolIds.push((await db.query("INSERT INTO schools(state_code,name,lga,level,location,enrolment_male,enrolment_female) VALUES($1,$2,'QA LGA','Primary','Rural',$3,$4) RETURNING id", [state, name, male, female])).rows[0].id);

  // Supervision & Monitoring: Physical Planning, four activities, envelope ceiling.
  fails(await api('academic', url('monitoring')), 403);
  fails(await api('academic', url('monitoring'), line('monitoring', 0, 100)), 403);
  fails(await api('physical', url('monitoring'), line('monitoring', 5, 100)), 400, /valid allowable activity/);
  fails(await api('physical', url('monitoring'), line('monitoring', 0, 100, { description: '' })), 400);
  fails(await api('physical', url('monitoring'), line('monitoring', 0, 100, { strategy: '' })), 400);
  ok(await api('physical', url('monitoring'), line('monitoring', 0, 1500, { quantity: 2 })));
  ok(await api('physical', url('monitoring'), line('monitoring', 2, 500)));
  let monitoring = ok(await api('physical', url('monitoring')));
  assert.equal(monitoring.lines.length, 2); assert.deepEqual(monitoring.documents, []); assert.deepEqual(monitoring.schools, []);
  fails(await api('physical', url('monitoring'), line('monitoring', 3, 500.01)), 400, /exceeded the Supervision & Monitoring allocation \(₦4,000\.00\) by ₦0\.01/);
  const first = monitoring.lines.find(l => l.activity === 0);
  fails(await api('physical', url('monitoring'), { ...line('monitoring', 0, 1750.01, { quantity: 2 }), action: 'update', id: first.id }), 400, /exceeded/);
  ok(await api('physical', url('monitoring'), { ...line('monitoring', 1, 1700, { quantity: 2 }), action: 'update', id: first.id }));
  monitoring = ok(await api('physical', url('monitoring')));
  assert.equal(monitoring.lines.find(l => l.id === first.id).activity, 1);
  ok(await api('physical', url('monitoring'), line('monitoring', 3, 0.5)));
  const extra = ok(await api('physical', url('monitoring'))).lines.find(l => l.activity === 3);
  ok(await api('physical', url('monitoring'), { workstream: 'monitoring', entity: 'line', action: 'delete', id: extra.id }));
  fails(await api('physical', url('monitoring'), { workstream: 'monitoring', entity: 'school', action: 'create', schoolIds }), 400, /distribution/);
  step('Supervision & Monitoring lines: create, edit, delete, validation, department isolation and ₦ ceiling');

  // Proforma invoices: optional, multiple files, Supervision & Monitoring only.
  const upload = async (who, name, bytes, workstream = 'monitoring') => { const form = new FormData(); form.set('workstream', workstream); form.set('file', new Blob([bytes]), name); return api(who, `/api/activities/documents?plan=${planId}`, form); };
  const pdf = Buffer.from('%PDF-1.4\n% QA proforma invoice\n');
  const firstDoc = ok(await upload('physical', 'invoice-1.pdf', pdf));
  ok(await upload('physical', 'invoice-2.pdf', pdf));
  fails(await upload('physical', 'invoice.txt', Buffer.from('plain text')), 400, /valid PDF/);
  fails(await upload('physical', 'fake.pdf', Buffer.from('not a pdf')), 400, /valid PDF/);
  fails(await upload('physical', 'invoice.pdf', pdf, 'gscci'), 400, /accepts documents/);
  fails(await upload('academic', 'invoice.pdf', pdf), 403);
  monitoring = ok(await api('physical', url('monitoring')));
  assert.deepEqual(monitoring.documents.map(d => d.name), ['invoice-1.pdf', 'invoice-2.pdf']);
  const download = await api('physical', `/api/activities/documents?id=${firstDoc.id}`);
  assert.equal(download.status, 200); assert.equal(download.headers.get('content-type'), 'application/pdf'); assert.deepEqual(download.bytes, pdf);
  fails(await api('academic', `/api/activities/documents?id=${firstDoc.id}`), 404);
  // Stage-gated visibility: a draft's documents stay with its Data Entry Staff (the Executive Chairman downloads after Monitoring reaches them, below).
  fails(await api('ec', `/api/activities/documents?id=${firstDoc.id}`), 404);
  fails(await api('physicalDirector', `/api/activities/documents?id=${firstDoc.id}`), 404);
  ok(await api('physical', `/api/activities/documents?plan=${planId}&workstream=monitoring&id=${firstDoc.id}`, undefined, { method: 'DELETE' }));
  fails(await api('physical', `/api/activities/documents?plan=${planId}&workstream=monitoring&id=${firstDoc.id}`, undefined, { method: 'DELETE' }), 404);
  monitoring = ok(await api('physical', url('monitoring')));
  assert.deepEqual(monitoring.documents.map(d => d.name), ['invoice-2.pdf']);
  step('Proforma invoices: multiple uploads, type checks, download access, removal');

  // Greening Schools, Climate Change & Safeguards: Academic Services, nine activities (migration 039), no upload.
  fails(await api('physical', url('gscci'), line('gscci', 0, 100)), 403);
  fails(await api('academic', url('gscci'), line('gscci', 10, 100)), 400, /valid allowable activity/);
  await assert.rejects(db.query("INSERT INTO activity_plan_lines(plan_id,workstream,activity,description,quantity,unit_cost,strategy,target_group) VALUES($1,'gscci',10,'QA',1,1,'NCB','Schools')", [planId]), /activity_plan_lines_activity_check/);
  for (const activity of [0, 1, 2, 3, 4, 5, 6, 7, 8]) ok(await api('academic', url('gscci'), line('gscci', activity, 100)));
  const gscci = ok(await api('academic', url('gscci')));
  assert.equal(gscci.lines.length, 9); assert.deepEqual(gscci.documents, []); assert.equal(gscci.schools.length, 2); assert.deepEqual(gscci.distribution, []);
  ok(await api('academic', url('gscci'), { ...line('gscci', 8, 250, { quantity: 3 }), action: 'update', id: gscci.lines[8].id }));
  ok(await api('academic', url('gscci'), { workstream: 'gscci', entity: 'line', action: 'delete', id: gscci.lines[0].id }));
  assert.equal(ok(await api('academic', url('gscci'))).lines.length, 8);
  fails(await api('academic', url('gscci'), line('gscci', 1, 3000)), 400, /exceeded the Greening/);
  // The distribution list is required: GSCCI cannot reach the Director without at least one school.
  fails(await review('academic', { action: 'submit', pillar: 'gscci' }), 400, /Greening distribution list/);
  step('Greening & Safeguards lines: nine activities (8 accepted, 9 refused), edit, delete, ₦ ceiling, distribution required');

  // Curriculum: each activity limited to its share (60/20/10/10%) of the ₦4,000.00 envelope.
  ok(await api('academic', url('curriculum'), line('curriculum', 1, 800)));
  fails(await api('academic', url('curriculum'), line('curriculum', 1, 0.01)), 400, /may use up to 20% of the Curriculum allocation \(₦800\.00\)\. Its items exceed this by ₦0\.01/);
  ok(await api('academic', url('curriculum'), line('curriculum', 0, 1200, { quantity: 2 })));
  fails(await api('academic', url('curriculum'), line('curriculum', 0, 0.01)), 400, /60%/);
  ok(await api('academic', url('curriculum'), line('curriculum', 3, 400)));
  let curriculum = ok(await api('academic', url('curriculum')));
  const capped = curriculum.lines.find(l => l.activity === 1);
  fails(await api('academic', url('curriculum'), { ...line('curriculum', 1, 801), action: 'update', id: capped.id }), 400, /20%/);
  ok(await api('academic', url('curriculum'), { ...line('curriculum', 2, 400), action: 'update', id: capped.id }));
  ok(await api('academic', url('curriculum'), line('curriculum', 1, 800)));
  curriculum = ok(await api('academic', url('curriculum')));
  assert.deepEqual(curriculum.lines.map(l => l.activity), [0, 1, 2, 3]);
  step('Curriculum activity caps: 60/20/10/10% shares enforced on create and update');

  // Curriculum distribution list: multi-select add, duplicates skipped, separate from the TLM list.
  assert.equal(curriculum.schools.length, 2);
  fails(await review('academic', { action: 'submit', pillar: 'curriculum' }), 400, /Curriculum distribution list/);
  fails(await api('academic', url('curriculum'), { workstream: 'curriculum', entity: 'school', action: 'create', schoolIds: [schoolIds[0], 999999999] }), 404);
  const added = ok(await api('academic', url('curriculum'), { workstream: 'curriculum', entity: 'school', action: 'create', schoolIds: [schoolIds[0], schoolIds[1], schoolIds[1]] }));
  assert.equal(added.added, 2); assert.equal(added.skipped, 0);
  const again = ok(await api('academic', url('curriculum'), { workstream: 'curriculum', entity: 'school', action: 'create', schoolIds }));
  assert.equal(again.added, 0); assert.equal(again.skipped, 2);
  fails(await api('academic', url('curriculum'), { workstream: 'curriculum', entity: 'school', action: 'create', schoolId: schoolIds[0] }), 409);
  ok(await api('academic', url('curriculum'), { workstream: 'curriculum', entity: 'school', action: 'delete', id: schoolIds[1] }));
  ok(await api('academic', url('curriculum'), { workstream: 'curriculum', entity: 'school', action: 'create', schoolId: schoolIds[1] }));
  curriculum = ok(await api('academic', url('curriculum')));
  assert.deepEqual(curriculum.distribution.map(s => [s.id, s.enrolment]), [[schoolIds[0], 100], [schoolIds[1], 300]]);
  assert.equal(ok(await api('academic', url('tlm'))).distribution.length, 0);
  step('Curriculum distribution: bulk add, duplicate skip, single add/remove, kept apart from TLM');

  // TLM has no fixed share: it shares the 75% pool with Infrastructure (₦150,000 under the default policy). In split mode
  // (the default platform setting, migration 051) TLM first sets its part; scripts/test-infrastructure-tlm-split.mjs covers the rest.
  const tlmLine = line('tlm', 6, 100000), split = `/api/activities/budget-split?plan=${planId}`;
  fails(await api('academic', url('tlm'), tlmLine), 409, /Set how much of the shared Infrastructure & TLM budget TLM will use/);
  ok(await api('academic', split, { amount: '100000', side: 'tlm' }, { method: 'PATCH' }));
  const fullTlm = ok(await api('academic', url('tlm'), tlmLine));
  assert.equal(ok(await api('academic', url('tlm'))).partnerProposed, '0');
  fails(await api('academic', url('tlm'), line('tlm', 6, 0.01)), 409, /exceeded the Teaching & Learning Materials allocation \(₦100,000\.00\) by ₦0\.01/);
  // Infrastructure's packages protect its part (a package written directly, as the infrastructure API needs documents).
  const packageId = (await db.query("INSERT INTO infrastructure_packages(plan_id,school_id,kind,input,result,total_cost) VALUES($1,$2,'furniture','{}'::jsonb,'{}'::jsonb,1000) RETURNING id", [planId, schoolIds[0]])).rows[0].id;
  assert.equal(Number(ok(await api('academic', url('tlm'))).partnerProposed), 1000);
  fails(await api('academic', split, { amount: '149000.01', side: 'tlm' }, { method: 'PATCH' }), 409, /Infrastructure packages already propose ₦1,000\.00, so TLM can use up to ₦149,000\.00/);
  await db.query('DELETE FROM infrastructure_packages WHERE id=$1', [packageId]);
  ok(await api('academic', url('tlm'), { ...tlmLine, action: 'delete', id: fullTlm.id }));
  step('TLM shares the infrastructure pool: its lines wait for the split and stay within its part (409); Infrastructure keeps its packages');

  // GSCCI distribution list: the schools that get the interventions, kept apart from Curriculum and TLM.
  const greened = ok(await api('academic', url('gscci'), { workstream: 'gscci', entity: 'school', action: 'create', schoolIds: [schoolIds[1], schoolIds[1]] }));
  assert.equal(greened.added, 1); assert.equal(greened.skipped, 0);
  fails(await api('academic', url('gscci'), { workstream: 'gscci', entity: 'school', action: 'create', schoolId: schoolIds[1] }), 409);
  fails(await api('physical', url('gscci'), { workstream: 'gscci', entity: 'school', action: 'create', schoolId: schoolIds[0] }), 403);
  assert.deepEqual(ok(await api('academic', url('gscci'))).distribution.map(s => [s.id, s.enrolment]), [[schoolIds[1], 300]]);
  assert.equal(ok(await api('academic', url('curriculum'))).distribution.length, 2);
  step('GSCCI distribution: add, duplicate refused, department access, kept apart from Curriculum');

  // Snapshot, visibility and overview totals.
  // Stage-gated visibility: nothing has been sent yet, so the BEAP Chair sees statuses only; each Data Entry Staff sees their own drafts.
  const chairView = ok(await api('chair', `/api/plans/review?plan=${planId}`));
  assert.ok(['monitoring', 'gscci', 'curriculum'].every(p => !chairView.visiblePillars.includes(p) && chairView.pillarReviews.some(r => r.pillar === p)));
  assert.equal(chairView.snapshot.curriculum, undefined); assert.deepEqual(chairView.snapshot.componentDocuments, []);
  const physicalView = ok(await api('physical', `/api/plans/review?plan=${planId}`));
  assert.equal(physicalView.snapshot.componentDocuments.length, 1); assert.equal(physicalView.snapshot.monitoring.length, 2);
  const academicView = ok(await api('academic', `/api/plans/review?plan=${planId}`));
  assert.equal(academicView.snapshot.curriculum.length, 4); assert.equal(academicView.snapshot.curriculumDistribution.length, 2); assert.equal(academicView.snapshot.tlmDistribution.length, 0);
  assert.equal(academicView.snapshot.gscci.length, 8); assert.deepEqual(academicView.snapshot.gscciDistribution.map(s => s.id), [schoolIds[1]]);
  assert.equal(academicView.snapshot.monitoring, undefined); assert.equal(academicView.snapshot.gscciDistribution.length, 1); assert.deepEqual(academicView.snapshot.componentDocuments, []);
  assert.deepEqual(academicView.visiblePillars, ['sports', 'tlm', 'gscci', 'curriculum']);
  const overview = ok(await api('physical', `/api/beap?plan=${planId}`));
  assert.equal(overview.monitoring.budget, 3900); assert.ok(overview.editablePillars.includes('monitoring'));
  const academicOverview = ok(await api('academic', `/api/beap?plan=${planId}`));
  assert.equal(academicOverview.curriculum.budget, 4000); assert.equal(academicOverview.curriculum.schoolCount, 2); assert.equal(academicOverview.gscci.budget, 1450); assert.equal(academicOverview.gscci.schoolCount, 1);
  step('Snapshots, department visibility, proforma documents and overview totals');

  // Workflow: Data Entry → department Director → BEAP Chair → Executive Chairman, for Curriculum.
  await db.query("UPDATE state_workflow_settings SET beap_chair_submission_mode='individual_components' WHERE state_code='GLOBAL'");
  ok(await review('academic', { action: 'submit', pillar: 'curriculum' }));
  fails(await api('academic', url('curriculum'), line('curriculum', 3, 1)), 409);
  fails(await review('physicalDirector', { action: 'endorse', pillar: 'curriculum' }), 403);
  ok(await api('academicDirector', url('curriculum'), { ...line('curriculum', 3, 300), action: 'update', id: curriculum.lines.find(l => l.activity === 3).id }));
  ok(await review('academicDirector', { action: 'endorse', pillar: 'curriculum' }));
  fails(await api('academicDirector', url('curriculum'), line('curriculum', 3, 1)), 409);
  ok(await review('chair', { action: 'forward', pillar: 'curriculum' }));
  const ecView = ok(await api('ec', `/api/plans/review?plan=${planId}`));
  assert.equal(ecView.pillarReviews.find(r => r.pillar === 'curriculum').status, 'chairman_ready');
  assert.equal(ecView.pillarReviews.find(r => r.pillar === 'monitoring').status, 'draft');
  ok(await review('ec', { action: 'request_changes', pillar: 'curriculum', comment: 'QA: check the monitoring line.' }));
  assert.equal(ok(await api('chair', `/api/plans/review?plan=${planId}`)).pillarReviews.find(r => r.pillar === 'curriculum').status, 'beap_review');
  // Monitoring without a remaining proforma invoice still goes to its Director (the upload is optional).
  ok(await api('physical', `/api/activities/documents?plan=${planId}&workstream=monitoring&id=${monitoring.documents[0].id}`, undefined, { method: 'DELETE' }));
  ok(await review('physical', { action: 'submit', pillar: 'monitoring' }));
  assert.equal(ok(await api('physicalDirector', `/api/plans/review?plan=${planId}`)).pillarReviews.find(r => r.pillar === 'monitoring').status, 'director_review');
  // A component above its ceiling cannot be sent (e.g. after the envelope shrinks).
  await db.query("UPDATE activity_plan_lines SET unit_cost=5000 WHERE plan_id=$1 AND workstream='gscci' AND activity=1", [planId]);
  fails(await review('academic', { action: 'submit', pillar: 'gscci' }), 400, /exceeded the Greening/);
  step('Curriculum review chain to the Executive Chairman and back; Monitoring submit; ceiling enforced on send');

  // complete_plan: the BEAP Chair cannot send the whole plan while the new components are not all reviewed.
  await db.query("UPDATE state_workflow_settings SET beap_chair_submission_mode='complete_plan' WHERE state_code='GLOBAL'");
  fails(await review('chair', { action: 'forward' }), 409, /Every implemented component/);
  const pending = ok(await api('academic', '/api/plans')).plans.find(p => p.id === planId);
  assert.ok(pending, 'plan listed on the dashboard');
  step('complete_plan blocks the collated send until every implemented component is reviewed');

  // UBEC: reviewed components travel in the round snapshot with their distribution list and proforma invoices.
  await db.query("UPDATE state_workflow_settings SET beap_chair_submission_mode='individual_components', ubec_submission_mode='reviewed_components' WHERE state_code='GLOBAL'");
  const kept = ok(await upload('physicalDirector', 'invoice-3.pdf', pdf));
  ok(await review('physicalDirector', { action: 'endorse', pillar: 'monitoring' }));
  for (const pillar of ['monitoring', 'curriculum']) ok(await review('chair', { action: 'forward', pillar }));
  ok(await api('ec', `/api/activities/documents?id=${kept.id}`));
  const ubecPath = `/api/ubec/review?plan=${planId}`;
  ok(await api('ec', ubecPath, { action: 'submit', version: ok(await api('ec', ubecPath)).plan.version }));
  const esView = ok(await api('es', ubecPath));
  assert.equal(esView.round.snapshot.monitoring.length, 2); assert.equal(esView.round.snapshot.curriculum.length, 4);
  assert.equal(esView.round.snapshot.curriculumDistribution.length, 2); assert.deepEqual(esView.round.snapshot.gscci, []); assert.deepEqual(esView.round.snapshot.gscciDistribution, []);
  assert.deepEqual(esView.round.snapshot.componentDocuments.map(d => d.id), [kept.id]);
  ok(await api('es', `/api/activities/documents?id=${kept.id}`));
  ok(await api('es', ubecPath, { action: 'assign', version: esView.plan.version, roundId: esView.round.id, assignments: [{ pillar: 'monitoring', department: 'physical' }, { pillar: 'curriculum', department: 'academic' }] }));
  const physicalReview = ok(await api('revPhysical', ubecPath));
  assert.equal(physicalReview.round.snapshot.monitoring.length, 2); assert.deepEqual(physicalReview.round.snapshot.curriculum, []);
  assert.equal(physicalReview.round.snapshot.componentDocuments.length, 1);
  ok(await api('revPhysical', `/api/activities/documents?id=${kept.id}`));
  const academicReview = ok(await api('revAcademic', ubecPath));
  assert.equal(academicReview.round.snapshot.curriculumDistribution.length, 2); assert.deepEqual(academicReview.round.snapshot.componentDocuments, []);
  fails(await api('revAcademic', `/api/activities/documents?id=${kept.id}`), 404);
  fails(await upload('physical', 'late.pdf', pdf), 409);
  step('UBEC round: Monitoring and Curriculum sent with distribution and proforma; assignment and reviewer isolation');
  console.log(`PASS: ${passed} activity-component checks.`);
} finally {
  if (settings) await db.query("UPDATE state_workflow_settings SET beap_chair_submission_mode=$1, ubec_submission_mode=$2 WHERE state_code='GLOBAL'", [settings.beap_chair_submission_mode, settings.ubec_submission_mode]);
  if (planId) { await db.query('DELETE FROM ubec_events WHERE plan_id=$1', [planId]); await db.query('DELETE FROM ubec_assignments WHERE round_id IN (SELECT id FROM ubec_rounds WHERE plan_id=$1)', [planId]); await db.query('DELETE FROM ubec_rounds WHERE plan_id=$1', [planId]); }
  if (planId) for (const t of ['plan_comments', 'plan_notifications', 'plan_review_events', 'plan_submissions', 'plan_pillar_reviews', 'tlm_distribution', 'activity_plan_lines', 'component_documents']) await db.query(`DELETE FROM ${t} WHERE plan_id=$1`, [planId]);
  if (planId) await db.query('DELETE FROM action_plans WHERE id=$1', [planId]);
  if (schoolIds.length) await db.query('DELETE FROM schools WHERE id=ANY($1::int[])', [schoolIds]);
  if (userIds.length) await db.query('DELETE FROM users WHERE id=ANY($1::int[])', [userIds]);
  await db.end();
}
