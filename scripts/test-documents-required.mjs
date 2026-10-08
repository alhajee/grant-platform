// The Super Admin "Supporting documents" setting (migration 052): when off (the default), every upload is optional:
// ICT and Teacher Development lines and Infrastructure packages save, and every send step goes ahead, without their
// documents (Infrastructure BOQs, surveys, photographic evidence, the updated Whole School BOQ). When on, today's
// refusals return. Infrastructure plan drawings are no longer collected in either mode (uploads refused, never required). The RAT upload at plan creation and the Infrastructure New Construction land declaration
// & agreement documents stay required either way.
// Creates a throwaway state with its own users, school and plan, removes them all and restores the GLOBAL settings row.
// Usage: node --env-file=.env scripts/test-documents-required.mjs [baseUrl]
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { Client } from 'pg';
import { hashSync } from 'bcryptjs';
import ExcelJS from 'exceljs';
import ts from 'typescript';

const requireModule = createRequire(import.meta.url);
function load(path) {
  const loaded = { exports: {} };
  const code = ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function('require', 'module', 'exports', code)(id => id.startsWith('.') ? load(resolve(dirname(path), id.endsWith('.ts') ? id : `${id}.ts`)) : requireModule(id), loaded, loaded.exports);
  return loaded.exports;
}

const base = process.argv[2] ?? process.env.TEST_BASE_URL ?? process.env.UBEC_TEST_URL ?? 'http://localhost:5173';
assert.ok(['localhost', '127.0.0.1'].includes(new URL(base).hostname), 'Run this test against a local server only.');
assert.ok(['localhost', '127.0.0.1'].includes(new URL(process.env.DATABASE_URL).hostname), 'Use a local database only.');
const tag = randomUUID().slice(0, 8).toUpperCase(), state = `DR${tag}`, password = randomUUID();
const db = new Client({ connectionString: process.env.DATABASE_URL });
const jars = {}, userIds = [], schoolIds = [];
let planId, settings, passed = 0;
const step = message => { passed++; console.log('✓', message); };

// Unit: the readiness rule skips documents only when they are not required.
const { componentReadinessProblem } = load(resolve('lib/component-readiness.ts'));
const compulsoryIct = [{ id: 3, activity: 2, description: 'Smart', schools: [{}] }, { id: 4, activity: 3, description: 'Connect', documents: [{}] }, { id: 5, activity: 6, description: 'Website' }];
const ictLines = [{ id: 1, activity: 0, description: 'Spec', documents: [] }, ...compulsoryIct];
assert.match(componentReadinessProblem('ict', ictLines, null, { documentsRequired: true }) ?? '', /Upload the specification document/);
assert.equal(componentReadinessProblem('ict', ictLines, null, { documentsRequired: false }), null);
const tdLines = [{ id: 2, activity: 0, description: 'Reading', documents: [] }];
assert.match(componentReadinessProblem('teachers', tdLines, { ictAllocation: '1.00' }, { documentsRequired: true }) ?? '', /supporting documents/);
assert.equal(componentReadinessProblem('teachers', tdLines, { ictAllocation: '1.00' }, { documentsRequired: false }), null);
assert.match(componentReadinessProblem('ict', ictLines.slice(0, 1), null, { documentsRequired: false }) ?? '', /compulsory activity/, 'other readiness rules still apply');
step('Readiness skips line documents only while they are optional (unit)');

const { infrastructureDocumentProblem } = load(resolve('lib/infrastructure-documents.ts'));
const newLine = (documentIds, land) => ({ school: { id: 7, name: 'Unit school' }, package: { kind: 'new', input: { schoolId: 7, documentIds, land } } });
const bare = { infrastructure: [newLine([], { available: false, documented: false, unencumbered: false })], infrastructureDocuments: [] };
assert.match(infrastructureDocumentProblem(bare, { documentsRequired: true }) ?? '', /a BOQ for Unit school/);
assert.equal(infrastructureDocumentProblem(bare, { documentsRequired: false }), null);
const unlanded = { infrastructure: [newLine([], { available: true, documented: true, unencumbered: false })], infrastructureDocuments: [] };
assert.match(infrastructureDocumentProblem(unlanded, { documentsRequired: false }) ?? '', /land document .*2 ticked, 0 attached/);
const landed = { infrastructure: [newLine(['l1', 'l2'], { available: true, documented: true, unencumbered: false })], infrastructureDocuments: [{ id: 'l1', kind: 'land', schoolId: 7 }, { id: 'l2', kind: 'land', schoolId: 7 }] };
assert.equal(infrastructureDocumentProblem(landed, { documentsRequired: false }), null);
assert.match(infrastructureDocumentProblem(landed, { documentsRequired: true }) ?? '', /a BOQ for Unit school/);
const complete = { ...landed, infrastructureDocuments: [...landed.infrastructureDocuments, { id: 'b', kind: 'boq', schoolId: 7 }, { id: 's', kind: 'survey', schoolId: 7 }] };
assert.equal(infrastructureDocumentProblem(complete, { documentsRequired: true }), null, 'drawings are never required');
step('Infrastructure readiness: BOQ and survey follow the setting, drawings are never required, land documents always are (unit)');

async function api(who, path, body, { method = body ? 'POST' : 'GET', origin = base } = {}) {
  const jar = jars[who] ??= {}, isForm = body instanceof FormData;
  const headers = { Cookie: Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; '), Origin: origin, ...(body && !isForm ? { 'Content-Type': 'application/json' } : {}) };
  const response = await fetch(base + path, { method, headers, ...(body ? { body: isForm ? body : JSON.stringify(body) } : {}) });
  for (const cookie of response.headers.getSetCookie()) { const pair = cookie.split(';')[0], i = pair.indexOf('='); jars[who][pair.slice(0, i)] = pair.slice(i + 1); }
  const text = await response.text(); let data; try { data = JSON.parse(text); } catch { data = { error: text.slice(0, 200) }; }
  return { status: response.status, data };
}
const ok = (result, status = 200) => { assert.equal(result.status, status, JSON.stringify(result.data)); return result.data; };
const fails = (result, status, pattern) => { assert.equal(result.status, status, JSON.stringify(result.data)); if (pattern) assert.match(result.data.error ?? '', pattern); return result.data; };
async function user(key, role, departments, chair = false, stateCode = state) {
  const email = `${key}.${tag}@documents-required.test`.toLowerCase();
  const id = (await db.query('INSERT INTO users(email,full_name,role,department,state_code,password_hash,is_beap_chair) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id', [email, `DR ${key}`, role, departments[0] ?? null, stateCode, hashSync(password, 4), chair])).rows[0].id;
  userIds.push(id);
  for (const department of departments) await db.query('INSERT INTO user_departments(user_id,department) VALUES($1,$2)', [id, department]);
  ok(await api(key, '/api/auth/login', { email, password }));
}
const setting = '/api/admin/component-documents';
const setRequired = async required => assert.equal(ok(await api('admin', setting, { required }, { method: 'PUT' })).required, required);
const url = workstream => `/api/activities?plan=${planId}&workstream=${workstream}`;
const ictLine = (activity, unitCost, extra = {}) => ({ workstream: 'ict', entity: 'line', action: 'create', activity, description: `DR ict ${activity}`, quantity: 1, unitCost, strategy: 'Request for quotation', targetGroup: 'Schools', ...extra });
const training = (activity, unitCost) => ({ workstream: 'teachers', entity: 'line', action: 'create', activity, description: `DR training ${activity}`, quantity: 10, unitCost, trainingProvider: 'Special training provider approved by UBEC', targetParticipants: 'Teachers', schoolLevels: ['Primary'], trainingDays: 3, venueType: 'Hall', schoolIds: [] });
const review = async (who, body) => api(who, `/api/plans/review?plan=${planId}`, { ...body, version: ok(await api(who, `/api/plans/review?plan=${planId}`)).plan.version });
const ubecPath = () => `/api/ubec/review?plan=${planId}`;
const ratForm = async withRat => {
  const form = new FormData(); form.set('setup', JSON.stringify({ planningYear: 2038, implementationYear: 2038, quarters: [1], stateLodgment: '400000000', fundingSources: [] }));
  if (withRat) { const workbook = new ExcelJS.Workbook(); workbook.addWorksheet('RAT').addRow(['Documents QA']); form.append('rat', new Blob([await workbook.xlsx.writeBuffer()]), 'rat.xlsx'); }
  return form;
};

await db.connect();
try {
  settings = (await db.query("SELECT beap_chair_submission_mode, ubec_submission_mode, component_documents_required FROM state_workflow_settings WHERE state_code='GLOBAL'")).rows[0];
  await user('admin', 'Super Admin', [], false, 'ADMIN');
  await user('ict', 'Data Entry Staff', ['ict']);
  await user('tpd', 'Data Entry Staff', ['teachers']);
  await user('physical', 'Data Entry Staff', ['physical']);
  await user('ictDirector', 'Director', ['ict']);
  await user('tpdDirector', 'Director', ['teachers']);
  await user('physicalDirector', 'Director', ['physical']);
  await user('chair', 'Director', ['physical'], true);
  await user('ec', 'Executive Chairman', []);
  await user('es', 'UBEC Executive Secretary', [], false, 'UBEC');
  await user('ubecChair', 'UBEC BEAP Chair', [], false, 'UBEC'); // submissions need an active UBEC BEAP Chair

  // The admin API: Super Admin only, same origin, a boolean.
  fails(await api('ec', setting), 403);
  fails(await api('ec', setting, { required: true }, { method: 'PUT' }), 403);
  fails(await api('admin', setting, { required: true }, { method: 'PUT', origin: 'https://elsewhere.example' }), 403);
  fails(await api('admin', setting, { required: 'yes' }, { method: 'PUT' }), 400);
  fails(await api('admin', setting, { required: false, extra: 1 }, { method: 'PUT' }), 400);
  await setRequired(false);
  assert.equal(ok(await api('admin', setting)).required, false);
  step('Admin setting: Super Admin only, same origin, boolean; saved on the GLOBAL row');

  // The RAT stays required at plan creation whatever the setting says.
  fails(await api('ec', '/api/plans', await ratForm(false)), 400, /RAT/);
  planId = ok(await api('ec', '/api/plans', await ratForm(true)), 201).plan.id;
  schoolIds.push((await db.query("INSERT INTO schools(state_code,name,lga,level,location,enrolment_male,enrolment_female) VALUES($1,'DR School','DR LGA','Primary','Rural',50,50) RETURNING id", [state])).rows[0].id);
  const [school] = schoolIds;
  step('RAT upload still required to create a plan while documents are optional');

  // Lines save without documents (they never needed them to save), and the editors are told documents are optional.
  ok(await api('tpd', `/api/activities/ict-allocation?plan=${planId}`, { amount: '30000000', side: 'teachers' }, { method: 'PATCH' }));
  ok(await api('tpd', url('teachers'), training(0, 100000)));
  for (const [activity, extra] of [[0, {}], [2, { schoolIds: [school] }], [3, {}], [4, { schoolIds: [school] }], [6, { websiteType: 'Hosting only' }]]) ok(await api('ict', url('ict'), ictLine(activity, 100000, extra)));
  assert.equal(ok(await api('ict', url('ict'))).documentsRequired, false);
  assert.equal(ok(await api('tpd', url('teachers'))).documentsRequired, false);
  assert.equal(ok(await api('chair', `/api/plans/review?plan=${planId}`)).documentsRequired, false);
  step('ICT and Teacher Development lines save without documents; GET /api/activities and the plan review say documents are optional');

  // Setting on: today's refusals return.
  await setRequired(true);
  assert.equal(ok(await api('ict', url('ict'))).documentsRequired, true);
  assert.equal(ok(await api('chair', `/api/plans/review?plan=${planId}`)).documentsRequired, true);
  fails(await review('ict', { action: 'submit', pillar: 'ict' }), 409, /Upload the specification document for “DR ict 0”/);
  fails(await review('tpd', { action: 'submit', pillar: 'teachers' }), 409, /Upload the supporting documents for “DR training 0”/);
  step('Setting on: ICT and Teacher Development sends refused (409) until their documents are uploaded');

  // Setting off: every send step goes ahead without documents.
  await setRequired(false);
  await db.query("UPDATE state_workflow_settings SET beap_chair_submission_mode='individual_components', ubec_submission_mode='reviewed_components' WHERE state_code='GLOBAL'");
  ok(await review('ict', { action: 'submit', pillar: 'ict' }));
  ok(await review('tpd', { action: 'submit', pillar: 'teachers' }));
  ok(await review('ictDirector', { action: 'endorse', pillar: 'ict' }));
  ok(await review('tpdDirector', { action: 'endorse', pillar: 'teachers' }));
  ok(await review('chair', { action: 'forward', pillar: 'ict' }));
  ok(await review('chair', { action: 'forward', pillar: 'teachers' }));
  step('Setting off: submit, endorse and forward go ahead without ICT and Teacher Development documents');

  // Infrastructure: BOQs, surveys, photographic evidence and the updated Whole School BOQ follow the setting; drawings are no longer collected;
  // the New Construction land declaration & agreement documents are required either way.
  const { packageSchema, minimumKeys, calculateInfrastructure } = load(resolve('lib/infrastructure-model.ts'));
  const infra = `/api/infrastructure/packages?plan=${planId}`;
  const infraDoc = async (kind, schoolId) => { const form = new FormData(); form.set('kind', kind); if (schoolId) form.set('schoolId', String(schoolId)); form.set('file', new File(['%PDF-1.4\nDR\n%%EOF'], `${kind}.pdf`, { type: 'application/pdf' })); return ok(await api('physical', `/api/infrastructure/documents?plan=${planId}`, form)).id; };
  const savedPackage = async kind => ok(await api('physical', infra)).packages.find(p => p.kind === kind);
  // Split mode (migration 051): Infrastructure takes the whole Infrastructure & TLM pool here (TLM has no lines).
  await db.query('UPDATE action_plans SET tlm_allocation=0 WHERE id=$1', [planId]);
  const furniture = { action: 'save', input: { kind: 'furniture', schoolId: school, components: ['Primary'], furniture: [{ description: 'Desks', quantity: 1, cost: 1000 }], documentIds: [] } };
  const newSchool = packageSchema.parse({ kind: 'new', schoolId: school, components: ['Primary'], lumpSum: 1000, duration: '6 months', land: { available: true, documented: false, unencumbered: false }, documentIds: [] });
  const whole = packageSchema.parse({ kind: 'whole', schoolId: school, components: ['Primary'], documentIds: [] });
  whole.model = 0; whole.fenceRequired = 100;
  whole.audit = Object.fromEntries(minimumKeys.map(key => [key, { existing: 0, functional: 0, extra: 0 }]));
  whole.audit.classroomPri = { existing: 3, functional: 1, extra: 0 }; // non-functional classrooms: photographic evidence rule
  for (const item of calculateInfrastructure(whole, 100).items) whole.packageCosts[item.key] = { cost: 1, strategy: 'NCB', duration: '8 weeks' };

  // Required: the refusals are as before.
  await setRequired(true);
  assert.equal(ok(await api('physical', infra)).documentsRequired, true);
  ok(await api('physical', infra, furniture));
  fails(await review('physical', { action: 'submit', pillar: 'infrastructure' }), 400, /Attach a BOQ for DR School/);
  const drawings = new FormData(); drawings.set('kind', 'drawings'); drawings.set('file', new File(['%PDF-1.4\nDR\n%%EOF'], 'drawings.pdf', { type: 'application/pdf' }));
  fails(await api('physical', `/api/infrastructure/documents?plan=${planId}`, drawings), 400, /no longer collected/);
  fails(await api('physical', infra, { action: 'save', input: whole }), 400, /photographic evidence/);
  fails(await api('physical', infra, { action: 'save', input: newSchool }), 400, /1 ticked, 0 attached/);
  step('Setting on: Infrastructure send refused without a BOQ (never for drawings, whose uploads are refused); Whole School save refused without photographic evidence');

  // Optional: packages save without photos or an updated BOQ, but New Construction still needs its land documents.
  await setRequired(false);
  assert.equal(ok(await api('physical', infra)).documentsRequired, false);
  fails(await api('physical', infra, { action: 'save', input: newSchool }), 400, /1 ticked, 0 attached/);
  ok(await api('physical', infra, { action: 'save', input: { ...newSchool, land: { available: false, documented: false, unencumbered: false }, documentIds: [] } }), 400);
  ok(await api('physical', infra, { action: 'save', input: { ...newSchool, documentIds: [await infraDoc('land', school)] } }));
  ok(await api('physical', infra, { action: 'save', input: whole }));
  step('Setting off: Whole School saves without photographic evidence; New Construction land declaration & agreement still required');

  // Required again: re-saving the Whole School package needs an updated BOQ (and its photographic evidence).
  await setRequired(true);
  const photo = await infraDoc('photo', school);
  let saved = await savedPackage('whole');
  fails(await api('physical', infra, { action: 'save', id: saved.id, version: saved.version, input: { ...whole, documentIds: [photo] } }), 400, /updated BOQ/);
  step('Setting on: re-saving a Whole School package needs an updated BOQ');

  // Optional: re-save without an updated BOQ, then send Infrastructure without BOQs, surveys or photos (and no drawings).
  await setRequired(false);
  saved = await savedPackage('whole');
  ok(await api('physical', infra, { action: 'save', id: saved.id, version: saved.version, input: { ...whole, documentIds: [] } }));
  const infraKinds = (await db.query('SELECT DISTINCT kind FROM infrastructure_documents WHERE plan_id=$1 AND removed_at IS NULL', [planId])).rows.map(row => row.kind).sort();
  assert.deepEqual(infraKinds, ['land', 'photo'], 'no drawings, BOQ or survey uploaded');
  ok(await review('physical', { action: 'submit', pillar: 'infrastructure' }));
  ok(await review('physicalDirector', { action: 'endorse', pillar: 'infrastructure' }));
  ok(await review('chair', { action: 'forward', pillar: 'infrastructure' }));
  step('Setting off: Infrastructure re-saves without an updated BOQ and is sent on without drawings, BOQ, survey or photos');

  // Executive Chairman → UBEC follows the setting too.
  await setRequired(true);
  assert.equal(ok(await api('ec', ubecPath())).canSubmit, false);
  fails(await api('ec', ubecPath(), { action: 'submit', version: ok(await api('ec', ubecPath())).plan.version }), 409, /Upload the/);
  await setRequired(false);
  assert.equal(ok(await api('ec', ubecPath())).canSubmit, true);
  ok(await api('ec', ubecPath(), { action: 'submit', version: ok(await api('ec', ubecPath())).plan.version }));
  const esView = ok(await api('es', ubecPath()));
  assert.equal(esView.round.snapshot.ict.length, 5); assert.equal(esView.round.snapshot.teachers.length, 1); assert.equal(esView.round.snapshot.infrastructure.length, 3);
  step('Executive Chairman → UBEC: refused while required, sent without documents while optional');
  console.log(`PASS: ${passed} documents-required checks.`);
} finally {
  if (settings) await db.query("UPDATE state_workflow_settings SET beap_chair_submission_mode=$1, ubec_submission_mode=$2, component_documents_required=$3 WHERE state_code='GLOBAL'", [settings.beap_chair_submission_mode, settings.ubec_submission_mode, settings.component_documents_required]);
  if (planId) { await db.query('DELETE FROM ubec_events WHERE plan_id=$1', [planId]); await db.query('DELETE FROM ubec_assignments WHERE round_id IN (SELECT id FROM ubec_rounds WHERE plan_id=$1)', [planId]); await db.query('DELETE FROM ubec_rounds WHERE plan_id=$1', [planId]); }
  if (planId) for (const t of ['plan_comments', 'plan_notifications', 'plan_review_events', 'plan_submissions', 'plan_pillar_reviews', 'activity_line_documents', 'activity_plan_lines', 'infrastructure_packages', 'infrastructure_documents', 'plan_funding_sources', 'plan_quarters']) await db.query(`DELETE FROM ${t} WHERE plan_id=$1`, [planId]);
  if (planId) await db.query('DELETE FROM action_plans WHERE id=$1', [planId]);
  await db.query('DELETE FROM action_plans WHERE state_code=$1', [state]);
  if (schoolIds.length) await db.query('DELETE FROM schools WHERE id=ANY($1::int[]) AND state_code=$2', [schoolIds, state]);
  if (userIds.length) {
    await db.query('DELETE FROM sessions WHERE user_id=ANY($1::int[])', [userIds]);
    await db.query('DELETE FROM user_departments WHERE user_id=ANY($1::int[])', [userIds]);
    await db.query('DELETE FROM users WHERE id=ANY($1::int[])', [userIds]);
  }
  await db.end();
}
