// API test for the Quality Assurance and ICT components (migration 038).
// Creates a throwaway state with its own users, schools and plan, and removes them all afterwards.
// Usage: node --env-file=.env scripts/test-quality-ict.mjs [baseUrl]
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { hashSync } from 'bcryptjs';
import ExcelJS from 'exceljs';
import JSZip from 'jszip';

const base = process.argv[2] ?? process.env.UBEC_TEST_URL ?? 'http://localhost:5173';
assert.ok(['localhost', '127.0.0.1'].includes(new URL(base).hostname), 'Run this test against a local server only.');
assert.ok(['localhost', '127.0.0.1'].includes(new URL(process.env.DATABASE_URL).hostname), 'Use a local database only.');
const tag = randomUUID().slice(0, 8).toUpperCase(), state = `QI${tag}`, otherState = `QO${tag}`, password = randomUUID();
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
  const email = `${key}.${tag}@quality-ict.test`.toLowerCase();
  const id = (await db.query('INSERT INTO users(email,full_name,role,department,state_code,password_hash,is_beap_chair) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id', [email, `QI ${key}`, role, departments[0] ?? null, stateCode, hashSync(password, 4), chair])).rows[0].id;
  userIds.push(id);
  for (const department of departments) await db.query('INSERT INTO user_departments(user_id,department) VALUES($1,$2)', [id, department]);
  ok(await api(key, '/api/auth/login', { email, password }));
}
const url = workstream => `/api/activities?plan=${planId}&workstream=${workstream}`;
const line = (workstream, activity, unitCost, extra = {}) => ({ workstream, entity: 'line', action: 'create', activity, description: `QI ${workstream} ${activity}`, quantity: 1, unitCost, strategy: 'Request for quotation', targetGroup: 'Schools', ...extra });
const review = async (who, body) => api(who, `/api/plans/review?plan=${planId}`, { ...body, version: ok(await api(who, `/api/plans/review?plan=${planId}`)).plan.version });
const allocate = (who, amount) => api(who, `/api/activities/ict-allocation?plan=${planId}`, { amount }, { method: 'PATCH' });
const upload = async (who, lineId, name, bytes, workstream = 'ict') => { const form = new FormData(); form.set('workstream', workstream); form.set('lineId', String(lineId)); form.set('file', new Blob([bytes]), name); return api(who, `/api/activities/line-documents?plan=${planId}`, form); };
const editPlan = async lodgment => { const setup = ok(await api('ec', `/api/plans/setup?plan=${planId}`)); return api('ec', '/api/plans/setup', { plan: planId, version: setup.plan.version, planningYear: 2031, implementationYear: 2031, quarters: [1], stateLodgment: lodgment, fundingSources: [] }, { method: 'PATCH' }); };

const pdf = Buffer.from('%PDF-1.4\n% QI specification\n%%EOF\n');
const workbook = new ExcelJS.Workbook(); workbook.addWorksheet('BOQ').addRow(['Item', 'Qty']);
const xlsx = Buffer.from(await workbook.xlsx.writeBuffer());
const zip = new JSZip(); zip.file('word/document.xml', '<w:document/>');
const docxAsXlsx = await zip.generateAsync({ type: 'nodebuffer' });
const png = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');

await db.connect();
try {
  settings = (await db.query("SELECT beap_chair_submission_mode, ubec_submission_mode, component_documents_required FROM state_workflow_settings WHERE state_code='GLOBAL'")).rows[0];
  // This test checks the ICT document refusals, so supporting documents are required for its run (migration 052).
  await db.query("UPDATE state_workflow_settings SET component_documents_required=TRUE WHERE state_code='GLOBAL'");
  await user('qa', 'Data Entry Staff', ['me']);
  await user('ict', 'Data Entry Staff', ['ict']);
  await user('academic', 'Data Entry Staff', ['academic']);
  await user('meDirector', 'Director', ['me']);
  await user('ictDirector', 'Director', ['ict']);
  await user('chair', 'Director', ['physical'], true);
  await user('ec', 'Executive Chairman', []);
  await user('es', 'UBEC Executive Secretary', [], false, 'UBEC');
  await user('revQuality', 'UBEC Department Reviewer', ['quality'], false, 'UBEC');
  await user('revTeachers', 'UBEC Department Reviewer', ['teachers'], false, 'UBEC');
  // State contribution ₦400,000,000 → shared ₦800,000,000 → Quality Assurance and Teacher Development & ICT get ₦40,000,000 each (5%).
  planId = (await db.query("INSERT INTO action_plans(state_code,start_year,end_year,implementation_year,funding_quarters,state_lodgment,other_funding,funding_policy_id) VALUES($1,2031,2031,2031,'{1}',400000000,0,(SELECT id FROM funding_policies ORDER BY id DESC LIMIT 1)) RETURNING id", [state])).rows[0].id;
  await db.query("INSERT INTO plan_quarters(plan_id,state_code,planning_year,quarter) VALUES($1,$2,2031,1)", [planId, state]);
  for (const [code, name] of [[state, 'QI Smart School A'], [state, 'QI Smart School B'], [otherState, 'QI Elsewhere School']]) schoolIds.push((await db.query("INSERT INTO schools(state_code,name,lga,level,location,enrolment_male,enrolment_female) VALUES($1,$2,'QI LGA','Primary','Rural',50,50) RETURNING id", [code, name])).rows[0].id);
  const [schoolA, schoolB, foreign] = schoolIds;

  // Quality Assurance: M&E department only, eleven activities, equipment type on activity 0, ₦40M ceiling.
  fails(await api('academic', url('quality')), 403);
  fails(await api('ict', url('quality'), line('quality', 1, 100)), 403);
  fails(await api('qa', url('quality'), line('quality', 12, 100)), 400, /valid allowable activity/);
  fails(await api('qa', url('quality'), line('quality', 0, 100)), 400, /equipment type/);
  // Others (specify): a typed equipment type is kept as typed.
  const typed = ok(await api('qa', url('quality'), line('quality', 0, 100, { equipmentType: ' Bicycles ' })));
  assert.equal(ok(await api('qa', url('quality'))).lines.find(l => l.id === typed.id).equipmentType, 'Bicycles');
  ok(await api('qa', url('quality'), { workstream: 'quality', entity: 'line', action: 'delete', id: typed.id }));
  fails(await api('qa', url('quality'), line('quality', 0, 100, { equipmentType: 'x'.repeat(101) })), 400);
  fails(await api('qa', url('quality'), line('quality', 1, 100, { equipmentType: 'Vehicles' })), 400, /only applies/);
  const equipment = ok(await api('qa', url('quality'), line('quality', 0, 2500000, { equipmentType: 'Motorcycles', quantity: 4 })));
  assert.ok(Number.isInteger(equipment.id));
  ok(await api('qa', url('quality'), { ...line('quality', 0, 2500000, { equipmentType: 'Vehicles', quantity: 4 }), action: 'update', id: equipment.id }));
  ok(await api('qa', url('quality'), line('quality', 2, 1000000)));
  // The editor always sends schoolIds (empty for activities without schools).
  const plain = ok(await api('qa', url('quality'), line('quality', 1, 100, { schoolIds: [], subscriptionTypes: [], equipmentType: '', websiteType: '' })));
  ok(await api('qa', url('quality'), { workstream: 'quality', entity: 'line', action: 'delete', id: plain.id }));
  fails(await api('qa', url('quality'), line('quality', 4, 29000000.01)), 400, /exceeded the Quality Assurance allocation \(₦40,000,000\.00\) by ₦0\.01/);
  let quality = ok(await api('qa', url('quality')));
  assert.equal(quality.lines.find(l => l.id === equipment.id).equipmentType, 'Vehicles');
  assert.deepEqual(quality.schools, []);
  fails(await upload('qa', equipment.id, 'spec.pdf', pdf, 'quality'), 400, /does not take documents/);
  step('Quality Assurance lines: department access, equipment type, edit and ₦ ceiling');

  // Compulsory activities block sending, with the missing list.
  const missing = fails(await review('qa', { action: 'submit', pillar: 'quality' }), 409, /compulsory activity/);
  assert.match(missing.error, /Capacity building for new M&E Officers; Conduct of CQA for 9 weeks/);
  assert.doesNotMatch(missing.error, /Capacity strengthening for Principals/);
  for (const activity of [3, 6, 7, 8, 9]) ok(await api('qa', url('quality'), line('quality', activity, 100000)));
  fails(await review('qa', { action: 'submit', pillar: 'quality' }), 409, /Production of instruments/);
  ok(await api('qa', url('quality'), line('quality', 10, 100000)));
  step('Compulsory Quality Assurance activities block Send to Director until each has a line');

  // ICT: the allocation of the shared Teacher Development & ICT budget comes first and is bounded.
  fails(await api('ict', url('ict'), line('ict', 1, 100)), 400, /shared Teacher Development & ICT budget ICT will use/);
  fails(await allocate('qa', '1000'), 403);
  fails(await allocate('ict', '0'), 409, /greater than zero/);
  fails(await allocate('ict', '40000000.01'), 409, /up to the shared Teacher Development & ICT budget of ₦40,000,000\.00/);
  ok(await allocate('ict', '35000000'));
  assert.equal(ok(await api('ict', url('ict'))).plan.ictAllocation, '35000000.00');
  step('ICT allocation required before lines, within 0 < amount ≤ shared envelope');

  // ICT lines with extras: schools from the register (own state only), subscriptions, website type, documents.
  fails(await api('ict', url('ict'), line('ict', 2, 100)), 400, /at least one school/);
  fails(await api('ict', url('ict'), line('ict', 2, 100, { schoolIds: [schoolA, foreign] })), 404, /not found in your state/);
  fails(await api('ict', url('ict'), line('ict', 1, 100, { schoolIds: [schoolA] })), 400, /Schools only apply/);
  const smart = ok(await api('ict', url('ict'), line('ict', 2, 20000000, { schoolIds: [schoolA, schoolB] })));
  fails(await api('ict', url('ict'), line('ict', 2, 10000000.01, { schoolIds: [schoolA] })), 400, /may use up to ₦30,000,000\.00 in total\. Its items exceed this by ₦0\.01/);
  ok(await api('ict', url('ict'), line('ict', 2, 10000000, { schoolIds: [schoolB] })));
  fails(await api('ict', url('ict'), { ...line('ict', 2, 20000000.5, { schoolIds: [schoolA] }), action: 'update', id: smart.id }), 400, /₦30,000,000\.00/);
  ok(await api('ict', url('ict'), { ...line('ict', 2, 15000000, { schoolIds: [schoolA] }), action: 'update', id: smart.id }));
  fails(await api('ict', url('ict'), line('ict', 5, 100)), 400, /subscription type/);
  fails(await api('ict', url('ict'), line('ict', 5, 100, { subscriptionTypes: ['Starlink', 'Smile', 'Spectranet'] })), 400, /one other subscription/);
  fails(await api('ict', url('ict'), line('ict', 5, 100, { subscriptionTypes: ['Starlink', ' '] })), 400);
  ok(await api('ict', url('ict'), line('ict', 5, 500000, { subscriptionTypes: ['Starlink', 'MTN', 'Fibre', 'Smile'] })));
  fails(await api('ict', url('ict'), line('ict', 6, 100)), 400, /website type/);
  ok(await api('ict', url('ict'), line('ict', 6, 400000, { websiteType: 'Hosting only' })));
  const spec = ok(await api('ict', url('ict'), line('ict', 0, 1000000)));
  const connect = ok(await api('ict', url('ict'), line('ict', 3, 300000)));
  const dlc = ok(await api('ict', url('ict'), line('ict', 4, 2000000, { schoolIds: [schoolB] })));
  ok(await api('ict', url('ict'), line('ict', 8, 100000, { schoolIds: [schoolA, schoolB] })));
  fails(await api('ict', url('ict'), line('ict', 7, 6000000)), 400, /exceeded the ICT allocation \(₦35,000,000\.00\)/);
  let ict = ok(await api('ict', url('ict')));
  assert.equal(ict.lines.length, 8);
  assert.deepEqual(ict.lines.find(l => l.id === smart.id).schools.map(s => s.id), [schoolA]);
  assert.deepEqual(ict.lines.find(l => l.activity === 5).subscriptionTypes, ['Starlink', 'MTN', 'Fibre', 'Smile']);
  assert.equal(ict.lines.find(l => l.activity === 6).websiteType, 'Hosting only');
  assert.ok(ict.schools.some(s => s.id === schoolA) && !ict.schools.some(s => s.id === foreign));
  fails(await allocate('ict', '20000000'), 409, /already propose/);
  step('ICT lines: line schools limited to the state, ₦30M Model Smart Schools cap, subscriptions, website type, ceiling');

  // Uploads: PDF/Excel only, by extension and signature; attached to the line.
  fails(await upload('ict', spec.id, 'photo.png', png), 400, /PDF or Excel/);
  fails(await upload('ict', spec.id, 'fake.pdf', Buffer.from('not a pdf')), 400, /PDF or Excel/);
  fails(await upload('ict', spec.id, 'word.xlsx', docxAsXlsx), 400, /PDF or Excel/);
  fails(await upload('ict', spec.id, 'spec.docx', docxAsXlsx), 400, /PDF or Excel/);
  fails(await upload('ict', ict.lines.find(l => l.activity === 5).id, 'spec.pdf', pdf), 400, /does not take documents/);
  fails(await upload('qa', spec.id, 'spec.pdf', pdf), 403);
  const specDoc = ok(await upload('ict', spec.id, 'specification.pdf', pdf));
  ok(await upload('ict', spec.id, 'specification.xlsx', xlsx));
  ict = ok(await api('ict', url('ict')));
  assert.deepEqual(ict.lines.find(l => l.id === spec.id).documents.map(d => d.name), ['specification.pdf', 'specification.xlsx']);
  const download = await api('ict', `/api/activities/line-documents?id=${specDoc.id}`);
  assert.equal(download.status, 200); assert.equal(download.headers.get('content-type'), 'application/pdf'); assert.deepEqual(download.bytes, pdf);
  fails(await api('qa', `/api/activities/line-documents?id=${specDoc.id}`), 404);
  // Stage-gated visibility: the Executive Chairman downloads only once ICT has been sent to them (checked below).
  fails(await api('ec', `/api/activities/line-documents?id=${specDoc.id}`), 404);
  step('ICT line documents: PDF/XLSX accepted; PNG, fake PDF, non-workbook XLSX and DOCX refused; access by component and workflow stage');

  // Sending ICT: compulsory activities, then their documents, must be in place.
  fails(await review('ict', { action: 'submit', pillar: 'ict' }), 409, /supporting document for “QI ict 3”/);
  ok(await upload('ict', connect.id, 'connect.pdf', pdf));
  fails(await review('ict', { action: 'submit', pillar: 'ict' }), 409, /bill of quantities for “QI ict 4”/);
  const boq = ok(await upload('ict', dlc.id, 'boq.xlsx', xlsx));
  const extraConnect = ok(await api('ict', url('ict'), line('ict', 3, 1000)));
  ok(await api('ict', url('ict'), { workstream: 'ict', entity: 'line', action: 'delete', id: extraConnect.id }));
  step('ICT send blocked until every line that needs a document has one');

  // Teacher Development keeps the remainder: plan edits may not shrink the shared envelope below ICT's allocation.
  fails(await editPlan('349999990'), 409, /ICT has already been allocated ₦35,000,000/);
  ok(await editPlan('350000000'));
  ok(await editPlan('400000000'));
  step('Plan edits refused when the shared Teacher Development & ICT envelope would fall below the ICT allocation');

  // Snapshots, visibility and overview.
  // Stage-gated visibility: neither component has been sent to the BEAP Chair or Executive Chairman yet.
  const draftChairView = ok(await api('chair', `/api/plans/review?plan=${planId}`));
  assert.ok(['quality', 'ict'].every(p => !draftChairView.visiblePillars.includes(p) && draftChairView.pillarReviews.some(r => r.pillar === p)));
  assert.equal(draftChairView.snapshot.ict, undefined); assert.equal(draftChairView.plan.ictAllocation, '35000000.00');
  const qaView = ok(await api('qa', `/api/plans/review?plan=${planId}`));
  assert.deepEqual(qaView.visiblePillars, ['quality']); assert.equal(qaView.snapshot.ict, undefined);
  const overview = ok(await api('ict', `/api/beap?plan=${planId}`));
  assert.equal(overview.ict.schoolCount, 2); assert.ok(overview.editablePillars.includes('ict'));
  const draftPlans = ok(await api('ec', '/api/plans')).plans.find(p => p.id === planId);
  assert.equal(draftPlans.qualityBudget, 0); assert.equal(draftPlans.ictBudget, 0);
  const qaPlans = ok(await api('qa', '/api/plans')).plans.find(p => p.id === planId);
  assert.equal(qaPlans.qualityBudget, 10000000 + 1000000 + 6 * 100000); assert.equal(qaPlans.ictBudget, 0);
  step('Department visibility before sending: Data Entry sees its own component; the BEAP Chair and Executive Chairman see statuses only; overview and dashboard totals');

  // Review chain: Data Entry → department Director → BEAP Chair → Executive Chairman → UBEC.
  await db.query("UPDATE state_workflow_settings SET beap_chair_submission_mode='individual_components', ubec_submission_mode='reviewed_components' WHERE state_code='GLOBAL'");
  fails(await review('ict', { action: 'submit', pillar: 'quality' }), 403);
  ok(await review('qa', { action: 'submit', pillar: 'quality' }));
  ok(await review('ict', { action: 'submit', pillar: 'ict' }));
  fails(await api('ict', url('ict'), line('ict', 7, 100)), 409);
  fails(await allocate('ict', '36000000'), 409);
  fails(await review('ictDirector', { action: 'endorse', pillar: 'quality' }), 403);
  // A Director edit that removes a compulsory line blocks the next send step too.
  const removable = ok(await api('meDirector', url('quality'))).lines.find(l => l.activity === 9);
  ok(await api('meDirector', url('quality'), { workstream: 'quality', entity: 'line', action: 'delete', id: removable.id }));
  fails(await review('meDirector', { action: 'endorse', pillar: 'quality' }), 409, /Daily school monitoring/);
  ok(await api('meDirector', url('quality'), line('quality', 9, 100000)));
  ok(await review('meDirector', { action: 'endorse', pillar: 'quality' }));
  ok(await review('ictDirector', { action: 'endorse', pillar: 'ict' }));
  const chairView = ok(await api('chair', `/api/plans/review?plan=${planId}`));
  assert.ok(['quality', 'ict'].every(p => chairView.visiblePillars.includes(p)));
  assert.equal(chairView.snapshot.ict.find(l => l.id === dlc.id).documents[0].id, boq.id);
  assert.equal(chairView.snapshot.ict.find(l => l.id === smart.id).schools[0].name, 'QI Smart School A');
  assert.equal(chairView.snapshot.quality.find(l => l.id === equipment.id).equipment_type, 'Vehicles');
  fails(await api('ec', `/api/activities/line-documents?id=${specDoc.id}`), 404);
  for (const pillar of ['quality', 'ict']) ok(await review('chair', { action: 'forward', pillar }));
  ok(await api('ec', `/api/activities/line-documents?id=${specDoc.id}`));
  const plans = ok(await api('ec', '/api/plans')).plans.find(p => p.id === planId);
  assert.equal(plans.qualityBudget, 10000000 + 1000000 + 6 * 100000); assert.ok(plans.ictBudget > 0);
  const ecView = ok(await api('ec', `/api/plans/review?plan=${planId}`));
  assert.ok(['quality', 'ict'].every(p => ecView.pillarReviews.find(r => r.pillar === p).status === 'chairman_ready'));
  const ubecPath = `/api/ubec/review?plan=${planId}`;
  ok(await api('ec', ubecPath, { action: 'submit', version: ok(await api('ec', ubecPath)).plan.version }));
  const esView = ok(await api('es', ubecPath));
  assert.equal(esView.round.snapshot.quality.length, 8); assert.equal(esView.round.snapshot.ict.length, 8);
  ok(await api('es', `/api/activities/line-documents?id=${boq.id}`));
  ok(await api('es', ubecPath, { action: 'assign', version: esView.plan.version, roundId: esView.round.id, assignments: [{ pillar: 'quality', department: 'quality' }, { pillar: 'ict', department: 'teachers' }] }));
  const teachersView = ok(await api('revTeachers', ubecPath));
  assert.equal(teachersView.round.snapshot.ict.length, 8); assert.deepEqual(teachersView.round.snapshot.quality, []);
  ok(await api('revTeachers', `/api/activities/line-documents?id=${boq.id}`));
  fails(await api('revQuality', `/api/activities/line-documents?id=${boq.id}`), 404);
  assert.equal(ok(await api('revQuality', ubecPath)).round.snapshot.quality.length, 8);
  fails(await upload('ict', spec.id, 'late.pdf', pdf), 409);
  step('Quality Assurance and ICT flow Director → BEAP Chair → Executive Chairman → UBEC with department assignment; snapshots carry line schools, documents and extras once sent to the BEAP Chair; Executive Chairman documents and totals once sent to them');
  console.log(`PASS: ${passed} quality-ict checks.`);
} finally {
  if (settings) await db.query("UPDATE state_workflow_settings SET beap_chair_submission_mode=$1, ubec_submission_mode=$2, component_documents_required=$3 WHERE state_code='GLOBAL'", [settings.beap_chair_submission_mode, settings.ubec_submission_mode, settings.component_documents_required]);
  if (planId) { await db.query('DELETE FROM ubec_events WHERE plan_id=$1', [planId]); await db.query('DELETE FROM ubec_assignments WHERE round_id IN (SELECT id FROM ubec_rounds WHERE plan_id=$1)', [planId]); await db.query('DELETE FROM ubec_rounds WHERE plan_id=$1', [planId]); }
  if (planId) for (const t of ['plan_comments', 'plan_notifications', 'plan_review_events', 'plan_submissions', 'plan_pillar_reviews', 'activity_line_documents', 'activity_plan_lines', 'plan_quarters']) await db.query(`DELETE FROM ${t} WHERE plan_id=$1`, [planId]);
  if (planId) await db.query('DELETE FROM action_plans WHERE id=$1', [planId]);
  if (schoolIds.length) await db.query('DELETE FROM schools WHERE id=ANY($1::int[])', [schoolIds]);
  if (userIds.length) await db.query('DELETE FROM users WHERE id=ANY($1::int[])', [userIds]);
  await db.end();
}
