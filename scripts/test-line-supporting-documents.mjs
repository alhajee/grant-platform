// API test for the optional line supporting documents (migration 057): SBMC, TLM, Supervision & Monitoring, Curriculum,
// Quality Assurance, every ICT activity and Planning lines take documents in activity_line_documents; Sports and Greening
// (GSCCI) take none. They never block a send, even while the Supporting documents setting is Required, and downloads
// follow stage-gated visibility and the UBEC round snapshot.
// Creates a throwaway state with its own users and plan, and removes them all afterwards.
// Usage: node --env-file=.env scripts/test-line-supporting-documents.mjs [baseUrl]
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { hashSync } from 'bcryptjs';
import ExcelJS from 'exceljs';
import JSZip from 'jszip';

const base = process.argv[2] ?? process.env.TEST_BASE_URL ?? process.env.UBEC_TEST_URL ?? 'http://localhost:5173';
assert.ok(['localhost', '127.0.0.1'].includes(new URL(base).hostname), 'Run this test against a local server only.');
assert.ok(['localhost', '127.0.0.1'].includes(new URL(process.env.DATABASE_URL).hostname), 'Use a local database only.');
const tag = randomUUID().slice(0, 8).toUpperCase(), state = `LD${tag}`, password = randomUUID();
const db = new Client({ connectionString: process.env.DATABASE_URL });
const jars = {}, userIds = [];
let planId, settings, savedDefaults = [], passed = 0;
const step = message => { passed++; console.log('✓', message); };

async function api(who, path, body, { method = body ? 'POST' : 'GET' } = {}) {
  const jar = jars[who] ??= {}, isForm = body instanceof FormData;
  const headers = { Cookie: Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; '), Origin: base, ...(body && !isForm ? { 'Content-Type': 'application/json' } : {}) };
  const response = await fetch(base + path, { method, headers, ...(body ? { body: isForm ? body : JSON.stringify(body) } : {}) });
  for (const cookie of response.headers.getSetCookie()) { const pair = cookie.split(';')[0], i = pair.indexOf('='); jar[pair.slice(0, i)] = pair.slice(i + 1); }
  const bytes = Buffer.from(await response.arrayBuffer()); let data; try { data = JSON.parse(bytes.toString()); } catch { data = { error: bytes.toString().slice(0, 200) }; }
  return { status: response.status, data, bytes, headers: response.headers };
}
const ok = (result, status = 200) => { assert.equal(result.status, status, JSON.stringify(result.data)); return result.data; };
const fails = (result, status, pattern) => { assert.equal(result.status, status, JSON.stringify(result.data)); if (pattern) assert.match(result.data.error ?? '', pattern); return result.data; };
async function user(key, role, departments, chair = false, stateCode = state) {
  const email = `${key}.${tag}@line-docs.test`.toLowerCase();
  const id = (await db.query('INSERT INTO users(email,full_name,role,department,state_code,password_hash,is_beap_chair) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id', [email, `LD ${key}`, role, departments[0] ?? null, stateCode, hashSync(password, 4), chair])).rows[0].id;
  userIds.push(id);
  for (const department of departments) await db.query('INSERT INTO user_departments(user_id,department) VALUES($1,$2)', [id, department]);
  ok(await api(key, '/api/auth/login', { email, password }));
  return id;
}
const url = workstream => `/api/activities?plan=${planId}&workstream=${workstream}`;
const line = (workstream, activity, unitCost, extra = {}) => ({ workstream, entity: 'line', action: 'create', activity, description: `LD ${workstream} ${activity}`, quantity: 1, unitCost, strategy: 'Request for quotation', targetGroup: 'Schools', ...extra });
const create = async (who, workstream, activity, unitCost, extra) => ok(await api(who, url(workstream), line(workstream, activity, unitCost, extra))).id;
const review = async (who, body) => api(who, `/api/plans/review?plan=${planId}`, { ...body, version: ok(await api(who, `/api/plans/review?plan=${planId}`)).plan.version });
const upload = async (who, workstream, lineId, name, bytes) => { const form = new FormData(); form.set('workstream', workstream); form.set('lineId', String(lineId)); form.set('file', new Blob([bytes]), name); return api(who, `/api/activities/line-documents?plan=${planId}`, form); };
const download = (who, id) => api(who, `/api/activities/line-documents?id=${id}`);

const pdf = Buffer.from('%PDF-1.4\n% LD supporting document\n%%EOF\n');
const workbook = new ExcelJS.Workbook(); workbook.addWorksheet('Quote').addRow(['Item', 'Qty']);
const xlsx = Buffer.from(await workbook.xlsx.writeBuffer());
const word = new JSZip(); word.file('word/document.xml', '<w:document/>');
const docx = await word.generateAsync({ type: 'nodebuffer' });
const png = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');
const jpg = Buffer.from('ffd8ffe000104a464946', 'hex');

await db.connect();
try {
  settings = (await db.query("SELECT beap_chair_submission_mode, ubec_submission_mode, component_documents_required, infrastructure_tlm_mode FROM state_workflow_settings WHERE state_code='GLOBAL'")).rows[0];
  // Supporting documents stay optional even while the Super Admin requires documents (migration 052 governs only its own set).
  await db.query("UPDATE state_workflow_settings SET component_documents_required=TRUE, infrastructure_tlm_mode='shared_pool', beap_chair_submission_mode='individual_components', ubec_submission_mode='reviewed_components' WHERE state_code='GLOBAL'");
  savedDefaults = (await db.query('SELECT * FROM ubec_default_officers')).rows;
  await db.query('DELETE FROM ubec_default_officers');
  await user('social', 'Data Entry Staff', ['social']);
  await user('academic', 'Data Entry Staff', ['academic']);
  await user('me', 'Data Entry Staff', ['me']);
  await user('planning', 'Data Entry Staff', ['planning']);
  await user('meDirector', 'Director', ['me']);
  await user('planningDirector', 'Director', ['planning']);
  await user('chair', 'Director', ['physical'], true);
  await user('ec', 'Executive Chairman', []);
  await user('es', 'UBEC Executive Secretary', [], false, 'UBEC');
  await user('ubecChair', 'UBEC BEAP Chair', [], false, 'UBEC');
  await user('dqa', 'UBEC Director', ['quality'], false, 'UBEC');
  const revQualityId = await user('revQuality', 'UBEC Assessment Officer', ['quality'], false, 'UBEC');
  await user('revAcademic', 'UBEC Assessment Officer', ['academic'], false, 'UBEC');
  // State contribution ₦400,000,000 → shared ₦800,000,000: Quality Assurance ₦40M (5%), Planning ₦16M (2%), a large Infrastructure & TLM pool.
  planId = (await db.query("INSERT INTO action_plans(state_code,start_year,end_year,implementation_year,funding_quarters,state_lodgment,other_funding,funding_policy_id) VALUES($1,2033,2033,2033,'{1}',400000000,0,(SELECT id FROM funding_policies ORDER BY id DESC LIMIT 1)) RETURNING id", [state])).rows[0].id;
  await db.query("INSERT INTO plan_quarters(plan_id,state_code,planning_year,quarter) VALUES($1,$2,2033,1)", [planId, state]);

  const sbmc = await create('social', 'sbmc', 0, 50000, { rationale: 'Community ownership', implementationApproach: 'Direct labour' });
  const tlm = await create('academic', 'tlm', 6, 80000);
  const qaLines = {};
  for (const activity of [1, 2, 3, 6, 7, 8, 9, 10]) qaLines[activity] = await create('me', 'quality', activity, 100000);
  for (const activity of [0, 2, 3, 5]) await create('planning', 'planning', activity, 100000);
  const gscci = await create('academic', 'gscci', 0, 1000);
  ok(await api('academic', `/api/sports?plan=${planId}`, { entity: 'budget', action: 'create', section: 'equipment', activityType: 'Football', description: 'Match balls', quantity: 2, unitCost: 15000 }), 201);
  step(`plan ${planId} in throwaway state ${state}: SBMC, TLM, Quality Assurance, Planning, Greening and Sports lines`);

  // Uploads: every listed component's lines, PDF/Excel plus Word and images.
  const sbmcDoc = ok(await upload('social', 'sbmc', sbmc, 'sbmc-quote.pdf', pdf));
  const tlmDoc = ok(await upload('academic', 'tlm', tlm, 'tlm-quote.xlsx', xlsx));
  const qaDoc = ok(await upload('me', 'quality', qaLines[1], 'workshop-plan.docx', docx));
  const qaPhoto = ok(await upload('me', 'quality', qaLines[1], 'site.png', png));
  const planningLine = ok(await api('planning', url('planning'))).lines.find(l => l.activity === 0).id;
  const planningDoc = ok(await upload('planning', 'planning', planningLine, 'census.jpg', jpg));
  assert.deepEqual(ok(await api('social', url('sbmc'))).lines.find(l => l.id === sbmc).documents.map(d => d.name), ['sbmc-quote.pdf']);
  assert.deepEqual(ok(await api('academic', url('tlm'))).lines.find(l => l.id === tlm).documents.map(d => d.name), ['tlm-quote.xlsx']);
  assert.deepEqual(ok(await api('me', url('quality'))).lines.find(l => l.id === qaLines[1]).documents.map(d => d.name), ['workshop-plan.docx', 'site.png']);
  assert.deepEqual(ok(await api('planning', url('planning'))).lines.find(l => l.id === planningLine).documents.map(d => d.name), ['census.jpg']);
  const photo = await download('me', qaPhoto.id);
  assert.equal(photo.status, 200); assert.equal(photo.headers.get('content-type'), 'image/png'); assert.deepEqual(photo.bytes, png);
  assert.equal((await download('planning', planningDoc.id)).headers.get('content-type'), 'image/jpeg');
  assert.equal((await download('me', qaDoc.id)).headers.get('content-type'), 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  step('SBMC (PDF), TLM (Excel), Quality Assurance (Word and PNG) and Planning (JPG) lines take supporting documents; the editor GET lists them and downloads keep their type');

  fails(await upload('me', 'quality', qaLines[2], 'notes.txt', Buffer.from('plain text')), 400, /PDF, Excel .*Word .*image/);
  fails(await upload('me', 'quality', qaLines[2], 'fake.pdf', Buffer.from('not a pdf')), 400, /PDF, Excel/);
  fails(await upload('me', 'quality', qaLines[2], 'fake.docx', xlsx), 400, /PDF, Excel/);
  fails(await upload('academic', 'gscci', gscci, 'greening.pdf', pdf), 400, /Choose the budget line/);
  fails(await upload('academic', 'sports', 1, 'sports.pdf', pdf), 400, /Choose the budget line/);
  fails(await upload('academic', 'tlm', gscci, 'greening.pdf', pdf), 404, /Budget line not found/);
  fails(await upload('social', 'quality', qaLines[2], 'other-department.pdf', pdf), 403);
  await assert.rejects(db.query("INSERT INTO activity_line_documents(id,plan_id,line_id,component,name,media_type,content,size) VALUES($1,$2,$3,'gscci','x.pdf','application/pdf','\\x25',1)", [randomUUID(), planId, gscci]), /activity_line_documents_component_check/);
  step('Refused: unsupported or mislabelled files, Greening (GSCCI) and Sports lines, a line of another component, another department; the DB check keeps GSCCI out');

  // Stage-gated: the M&E Director cannot download a draft's documents; the Required setting does not block sending without them.
  fails(await download('meDirector', qaDoc.id), 404);
  fails(await download('chair', sbmcDoc.id), 404);
  fails(await download('ec', tlmDoc.id), 404);
  ok(await review('planning', { action: 'submit', pillar: 'planning' }));
  ok(await review('me', { action: 'submit', pillar: 'quality' }));
  ok(await download('meDirector', qaDoc.id));
  step('Planning (no documents) and Quality Assurance (documents on one line of eight) are sent while documents are Required; the M&E Director downloads only after the submission (404 before)');

  ok(await review('meDirector', { action: 'endorse', pillar: 'quality' }));
  const chairView = ok(await api('chair', `/api/plans/review?plan=${planId}`));
  assert.deepEqual(chairView.snapshot.quality.find(l => l.id === qaLines[1]).documents.map(d => d.name), ['workshop-plan.docx', 'site.png']);
  assert.deepEqual(chairView.snapshot.quality.find(l => l.id === qaLines[2]).documents, []);
  const socialView = ok(await api('social', `/api/plans/review?plan=${planId}`));
  assert.deepEqual(socialView.snapshot.sbmc.find(l => l.id === sbmc).documents.map(d => d.id), [sbmcDoc.id]);
  ok(await review('chair', { action: 'forward', pillar: 'quality' }));
  const ubecPath = `/api/ubec/review?plan=${planId}`;
  ok(await api('ec', ubecPath, { action: 'submit', version: ok(await api('ec', ubecPath)).plan.version }));
  const esView = ok(await api('es', ubecPath));
  assert.deepEqual(esView.round.snapshot.quality.find(l => l.id === qaLines[1]).documents.map(d => d.id), [qaDoc.id, qaPhoto.id]);
  assert.deepEqual(esView.round.snapshot.sbmc, []);
  ok(await download('es', qaDoc.id));
  fails(await download('es', sbmcDoc.id), 404);
  ok(await api('ubecChair', ubecPath, { action: 'release', version: esView.plan.version, roundId: esView.round.id, comment: 'Released for assessment.' }));
  ok(await api('dqa', `/api/ubec/components?plan=${planId}`, { action: 'assign_officers', roundId: esView.round.id, pillar: 'quality', officerIds: [revQualityId], comment: 'Assess Quality Assurance.' }));
  const officer = await download('revQuality', qaPhoto.id);
  assert.equal(officer.status, 200); assert.deepEqual(officer.bytes, png);
  fails(await download('revAcademic', qaPhoto.id), 404);
  fails(await download('revQuality', tlmDoc.id), 404);
  step('Snapshots carry the documents (BEAP Chair view, SBMC state view, UBEC round); the ES and the assigned Quality Assurance officer download from the round, another department\'s officer and unsent components do not (404)');
  console.log(`PASS: ${passed} line supporting document checks.`);
} finally {
  if (settings) await db.query("UPDATE state_workflow_settings SET beap_chair_submission_mode=$1, ubec_submission_mode=$2, component_documents_required=$3, infrastructure_tlm_mode=$4 WHERE state_code='GLOBAL'", [settings.beap_chair_submission_mode, settings.ubec_submission_mode, settings.component_documents_required, settings.infrastructure_tlm_mode]);
  for (const r of savedDefaults) await db.query('INSERT INTO ubec_default_officers(pillar,officer_id,updated_by_name,updated_at) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING', [r.pillar, r.officer_id, r.updated_by_name, r.updated_at]).catch(() => undefined);
  if (planId) {
    await db.query('DELETE FROM ubec_events WHERE plan_id=$1', [planId]);
    await db.query('DELETE FROM ubec_assignments WHERE round_id IN (SELECT id FROM ubec_rounds WHERE plan_id=$1)', [planId]);
    await db.query('DELETE FROM ubec_rounds WHERE plan_id=$1', [planId]);
    for (const t of ['plan_comments', 'plan_notifications', 'plan_review_events', 'plan_submissions', 'plan_pillar_reviews', 'activity_line_documents', 'activity_plan_lines', 'plan_quarters']) await db.query(`DELETE FROM ${t} WHERE plan_id=$1`, [planId]);
    await db.query('DELETE FROM sports_allocations WHERE line_id IN (SELECT id FROM sports_budget_lines WHERE plan_id=$1)', [planId]);
    await db.query('DELETE FROM sports_budget_lines WHERE plan_id=$1', [planId]);
    await db.query('DELETE FROM action_plans WHERE id=$1', [planId]);
  }
  if (userIds.length) await db.query('DELETE FROM users WHERE id=ANY($1::int[])', [userIds]);
  await db.end();
}
