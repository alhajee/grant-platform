// School register (UBEC07/UBEC03): access, single entry, edit, template and bulk import.
// Usage: node scripts/test-school-register.mjs [baseUrl]  (needs DATABASE_URL; creates and removes throwaway states).
import assert from 'node:assert/strict';
import { Client } from 'pg';
import { hashSync } from 'bcryptjs';
import ExcelJS from 'exceljs';

const base = process.argv[2] || process.env.TEST_BASE_URL || 'http://localhost:5173';
assert.ok(['localhost', '127.0.0.1'].includes(new URL(base).hostname), 'Run against a local portal only');
assert.ok(['localhost', '127.0.0.1'].includes(new URL(process.env.DATABASE_URL).hostname), 'Use a local database only');
const db = new Client({ connectionString: process.env.DATABASE_URL });
const marker = `SR${Date.now()}`, foreignState = `${marker}B`, states = [marker, foreignState];
const accounts = {}, password = crypto.randomUUID();

async function api(who, path, body, method = body ? 'POST' : 'GET', { origin = true } = {}) {
  const form = body instanceof FormData;
  const headers = { ...(origin ? { Origin: base } : {}), ...(accounts[who]?.cookie ? { Cookie: accounts[who].cookie } : {}), ...(body && !form ? { 'Content-Type': 'application/json' } : {}) };
  const response = await fetch(base + path, { method, headers, ...(body ? { body: form ? body : JSON.stringify(body) } : {}) });
  const type = response.headers.get('content-type') ?? '';
  const data = type.includes('json') ? await response.json() : Buffer.from(await response.arrayBuffer());
  return { status: response.status, data, type, cookie: response.headers.get('set-cookie')?.split(';')[0] };
}
function ok(result, status = 200) { assert.equal(result.status, status, Buffer.isBuffer(result.data) ? `binary ${result.type}` : JSON.stringify(result.data)); return result.data; }
const school = (overrides = {}) => ({ name: 'QA Register Primary School', town: 'Qa Town', lga: 'qa north', category: 'Public', location: 'Rural', level: 'Primary', latitude: '11.7469', longitude: '11.9608', schoolCode: 'qa-001', enrolment: { P1: { male: 30, female: 25 }, P2: { male: 20, female: 22 } }, ...overrides });
const upload = (bytes, name = 'schools.xlsx') => { const form = new FormData(); form.set('file', new File([bytes], name, { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })); return form; };

await db.connect();
try {
  for (const [who, role, state, department, isBeapChair] of [['chair', 'Executive Chairman', marker, null, false], ['beap', 'Director', marker, 'physical', true], ['director', 'Director', marker, 'social', false], ['officer', 'Data Entry Staff', marker, 'physical', false], ['foreign', 'Executive Chairman', foreignState, null, false]]) {
    const email = `${who}.${marker.toLowerCase()}@test.local`;
    const id = (await db.query('INSERT INTO users(full_name,email,role,department,state_code,password_hash,is_beap_chair) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id', [`QA ${who}`, email, role, department, state, hashSync(password, 4), isBeapChair])).rows[0].id;
    accounts[who] = { id, email, role, department };
    const login = await api(who, '/api/auth/login', { email, password }); ok(login); accounts[who].cookie = login.cookie;
  }
  // The register's LGAs come from the state's existing schools.
  const seeded = (await db.query("INSERT INTO schools(state_code,name,lga,level,location,category,enrolment_male,enrolment_female) VALUES($1,'QA Existing School','QA North','Primary','Urban','Public',100,90),($1,'QA South JSS','QA South','JSS','Rural','Public',0,0) RETURNING id", [marker])).rows.map(row => row.id);
  await db.query("INSERT INTO schools(state_code,name,lga,level,location,category) VALUES($1,'Foreign School','Elsewhere','Primary','Rural','Public')", [foreignState]);

  // Access: role-based by default, Schools nav data in the session, nothing for other staff.
  ok(await api('anonymous', '/api/schools'), 401);
  ok(await api('officer', '/api/schools'), 403);
  ok(await api('director', '/api/schools'), 403);
  assert.equal(ok(await api('officer', '/api/schools/options')).canManage, false);
  const options = ok(await api('beap', '/api/schools/options'));
  assert.equal(options.canManage, true); assert.deepEqual(options.lgas, ['QA North', 'QA South']);
  assert.equal(ok(await api('officer', '/api/auth/session')).user.canManageSchools, false);
  let list = ok(await api('chair', '/api/schools?sort=name'));
  assert.equal(list.total, 2); assert.equal(list.items[0].name, 'QA Existing School');
  assert.deepEqual(list.facets.lgas.map(item => [item.value, item.count]), [['QA North', 1], ['QA South', 1]]);
  assert.equal(ok(await api('foreign', '/api/schools')).items.some(item => item.name.startsWith('QA')), false, 'Each state sees only its own schools');

  // Single entry: validation, LGA spelling, totals from the class figures, school code normalised.
  ok(await api('chair', '/api/schools', school(), 'POST', { origin: false }), 403);
  ok(await api('officer', '/api/schools', school(), 'POST'), 403);
  assert.match(ok(await api('chair', '/api/schools', school({ latitude: '25' }), 'POST'), 400).error, /Latitude/);
  assert.match(ok(await api('chair', '/api/schools', school({ lga: 'Nowhere' }), 'POST'), 400).error, /LGAs/);
  assert.match(ok(await api('chair', '/api/schools', school({ level: 'SSS' }), 'POST'), 400).error, /ECCDE, Primary or JSS/);
  ok(await api('chair', '/api/schools', school({ enrolment: { P9: { male: 1, female: 1 } } }), 'POST'), 400);
  const created = ok(await api('chair', '/api/schools', school(), 'POST'), 201).school;
  assert.deepEqual([created.lga, created.schoolCode, created.male, created.female, created.updatedBy], ['QA North', 'QA-001', 50, 47, 'QA chair']);
  assert.deepEqual(created.enrolment, { P1: { male: 30, female: 25 }, P2: { male: 20, female: 22 } });
  assert.match(ok(await api('beap', '/api/schools', school({ name: ' qa register  primary school ', schoolCode: null }), 'POST'), 409).error, /already in the register/);
  assert.match(ok(await api('beap', '/api/schools', school({ name: 'Another School', schoolCode: 'QA-001' }), 'POST'), 409).error, /already used/);

  // Edit: omitted enrolment keeps the current figures; other states cannot reach the school.
  const edited = ok(await api('beap', '/api/schools', { ...school({ town: 'New Town', enrolment: null }), id: created.id }, 'PATCH')).school;
  assert.deepEqual([edited.town, edited.male, edited.female, edited.updatedBy], ['New Town', 50, 47, 'QA beap']);
  const legacy = ok(await api('beap', '/api/schools', { ...school({ name: 'QA Existing School', schoolCode: null, location: 'Urban', enrolment: null }), id: seeded[0] }, 'PATCH')).school;
  assert.deepEqual([legacy.male, legacy.female], [100, 90], 'Schools without a class breakdown keep their totals');
  ok(await api('foreign', '/api/schools', { ...school(), id: created.id }, 'PATCH'), 404);
  assert.equal(ok(await api('chair', `/api/schools?id=${created.id}`)).items[0].town, 'New Town');
  assert.equal(ok(await api('chair', '/api/schools?q=new%20town&level=Primary&lga=QA%20North')).total, 1);

  // Grant: only the Executive Chairman can delegate register access.
  const profile = who => ({ id: accounts[who].id, name: `QA ${who}`, role: accounts[who].role, departments: [accounts[who].department], active: true });
  ok(await api('director', '/api/users', { ...profile('officer'), departments: ['social'], canManageSchools: true }, 'PATCH'), 403);
  ok(await api('chair', '/api/users', { ...profile('officer'), canManageSchools: true }, 'PATCH'));
  const relogin = await api('officer', '/api/auth/login', { email: accounts.officer.email, password }); ok(relogin); accounts.officer.cookie = relogin.cookie;
  assert.equal(ok(await api('officer', '/api/auth/session')).user.canManageSchools, true);
  assert.equal(ok(await api('chair', '/api/users')).users.find(user => user.id === accounts.officer.id).canManageSchools, true);
  ok(await api('officer', '/api/schools'));

  // Infrastructure editors read school details only; the old profile write path is gone.
  const plan = (await db.query('INSERT INTO action_plans(state_code,start_year,end_year) VALUES($1,2029,2029) RETURNING id', [marker])).rows[0].id;
  assert.equal(ok(await api('officer', `/api/infrastructure/packages?plan=${plan}`)).canManageSchools, true);
  ok(await api('officer', `/api/infrastructure/packages?plan=${plan}`, { action: 'profile', schoolId: seeded[1], profile: { male: 10, female: 10, latitude: '', longitude: '' } }), 400);

  // Template: an .xlsx with the client's columns and the state's LGAs.
  const template = await api('officer', '/api/schools/template');
  ok(template); assert.match(template.type, /spreadsheetml/); assert.equal(template.data.subarray(0, 2).toString(), 'PK');
  const workbook = new ExcelJS.Workbook(); await workbook.xlsx.load(template.data);
  const sheet = workbook.getWorksheet('Schools');
  // The client's layout ("TLMs list 2025"): title rows 1-2, headers rows 3-6, data from row 7; Level and School code last.
  assert.deepEqual([1, 4, 5, 6, 7, 8].map(column => sheet.getCell(3, column).text), ['S/N', 'SCHOOL NAME', 'TOWN', 'LGA', 'TYPE OF SCHOOL(PUBLIC OR PRIVATE)', 'LOCATION (URBAN OR RURAL)']);
  assert.deepEqual([2, 3].map(column => sheet.getCell(6, column).text), ['Longitude', 'Latitude']);
  assert.deepEqual([9, 10, 11].map(column => sheet.getCell(6, column).text), ['MALE', 'FEMALE', 'TOTAL']);
  assert.equal(sheet.getCell(4, 9).text, 'ECCDE'); assert.equal(sheet.getCell(3, 39).text, 'TOTAL ENROLMENT');
  assert.match(sheet.getCell(3, 40).text, /^LEVEL/); assert.match(sheet.getCell(3, 41).text, /^SCHOOL CODE/);
  assert.ok(workbook.getWorksheet('Guide').getColumn(5).values.includes('QA South'));

  // Bulk entry: preview reports every problem by row; commit refuses errors, then adds only new schools.
  const position = column => column < 8 ? column + 1 : column === 8 ? 40 : column === 9 ? 41 : column - 1;
  const fill = rows => { rows.forEach((values, index) => { const row = sheet.getRow(7 + index); values.forEach((value, column) => { row.getCell(position(column)).value = value ?? null; }); row.commit(); }); };
  const classes = (eccde, p1) => [eccde[0], eccde[1], eccde[0] + eccde[1], p1[0], p1[1], p1[0] + p1[1]];
  fill([
    [1, 12.01, 11.5, 'QA Bulk ECCDE Centre', 'Bulk Town', 'qa south', 'public', 'urban', 'eccde', 'QA-BULK-1', ...classes([10, 12], [0, 0])],
    [2, 11.96, 11.75, 'QA Register Primary School', 'Qa Town', 'QA North', 'Public', 'Rural', 'Primary', 'QA-001'],
    [3, 11.9, 11.6, 'QA Bad LGA School', 'Town', 'Atlantis', 'Public', 'Rural', 'Primary'],
    [4, 11.9, 11.6, 'QA Bulk ECCDE Centre', 'Bulk Town', 'QA South', 'Public', 'Urban', 'ECCDE'],
    [5, 11.9, 25, 'QA Swapped Coordinates', 'Town', 'QA South', 'Private', 'Rural', 'JSS'],
  ]);
  sheet.getCell(11, 39).value = 99;
  let bytes = await workbook.xlsx.writeBuffer();
  ok(await api('officer', '/api/schools/import?mode=preview', upload(bytes), 'POST', { origin: false }), 403);
  ok(await api('director', '/api/schools/import?mode=preview', upload(bytes)), 403);
  assert.match(ok(await api('officer', '/api/schools/import?mode=preview', upload(Buffer.from('not a workbook'), 'schools.xlsx')), 400).error, /Excel/);
  const preview = ok(await api('officer', '/api/schools/import?mode=preview', upload(bytes)));
  assert.equal(preview.rows, 5); assert.equal(preview.errorCount, 3); assert.equal(preview.ready, 1); assert.equal(preview.duplicates.length, 1);
  const byRow = Object.fromEntries(preview.errors.map(item => [item.row, item.messages.join(' ')]));
  // Data starts on row 7 in the client's layout, so spreadsheet rows are 4 higher than the old template's.
  assert.match(byRow[9], /Atlantis/); assert.match(byRow[10], /Same school as row 7/); assert.match(byRow[11], /Latitude/); assert.match(byRow[11], /Total enrolment 99/);
  assert.equal(preview.duplicates[0].row, 8);
  const refused = ok(await api('officer', '/api/schools/import?mode=commit', upload(bytes)), 400);
  assert.match(refused.error, /No schools were added/);
  assert.equal(ok(await api('chair', '/api/schools')).total, 3, 'Nothing is added while any row has errors');

  sheet.spliceRows(9, 3);
  bytes = await workbook.xlsx.writeBuffer();
  const committed = ok(await api('officer', '/api/schools/import?mode=commit', upload(bytes)), 201);
  assert.deepEqual([committed.created, committed.duplicates.length, committed.errorCount], [1, 1, 0]);
  const imported = (await db.query('SELECT name,lga,level,category,location,school_code,latitude,longitude,enrolment_male,enrolment_female,enrolment_by_class,updated_by_name FROM schools WHERE id=$1', [committed.schools[0].id])).rows[0];
  assert.deepEqual(imported, { name: 'QA Bulk ECCDE Centre', lga: 'QA South', level: 'ECCDE', category: 'Public', location: 'Urban', school_code: 'QA-BULK-1', latitude: '11.5', longitude: '12.01', enrolment_male: 10, enrolment_female: 12, enrolment_by_class: { ECCDE: { male: 10, female: 12 }, P1: { male: 0, female: 0 } }, updated_by_name: 'QA officer' });
  const again = ok(await api('officer', '/api/schools/import?mode=commit', upload(bytes)));
  assert.deepEqual([again.created, again.duplicates.length], [0, 2], 'Re-uploading the same file adds nothing');

  // Bulk actions on ticked schools: export them in the template layout, delete those not used in a plan.
  const foreignSchool = (await db.query('SELECT id FROM schools WHERE state_code=$1', [foreignState])).rows[0].id;
  ok(await api('chair', '/api/schools/export', { ids: [seeded[0]] }, 'POST', { origin: false }), 403);
  ok(await api('director', '/api/schools/export', { ids: [seeded[0]] }), 403);
  ok(await api('chair', '/api/schools/export', { ids: [] }), 400);
  assert.equal(ok(await api('chair', '/api/schools/export', { ids: [foreignSchool] }), 404).error, 'None of the selected schools are in your state register.');
  const exported = await api('chair', '/api/schools/export', { ids: [seeded[0], foreignSchool, committed.schools[0].id] });
  ok(exported); assert.match(exported.type, /spreadsheetml/);
  const exportBook = new ExcelJS.Workbook(); await exportBook.xlsx.load(exported.data);
  const exportSheet = exportBook.getWorksheet('Schools');
  assert.deepEqual([7, 8, 9].map(row => exportSheet.getCell(row, 4).text), ['QA Existing School', 'QA Bulk ECCDE Centre', ''], 'Only this state\'s ticked schools, by LGA then name');
  assert.deepEqual([exportSheet.getCell(8, 9).value, exportSheet.getCell(8, 10).value, exportSheet.getCell(8, 41).text], [10, 12, 'QA-BULK-1']);
  const reread = ok(await api('chair', '/api/schools/import?mode=preview', upload(await exportBook.xlsx.writeBuffer())));
  assert.deepEqual([reread.rows, reread.errorCount, reread.duplicates.length], [2, 0, 2], 'An export uploads back cleanly as duplicates');

  await db.query('INSERT INTO tlm_distribution(plan_id,school_id) VALUES($1,$2)', [plan, seeded[1]]);
  ok(await api('chair', '/api/schools', { ids: [seeded[0]] }, 'DELETE', { origin: false }), 403);
  ok(await api('director', '/api/schools', { ids: [seeded[0]] }, 'DELETE'), 403);
  const removed = ok(await api('chair', '/api/schools', { ids: [seeded[0], seeded[1], foreignSchool] }, 'DELETE'));
  assert.deepEqual(removed, { deleted: 1, kept: [{ id: seeded[1], name: 'QA South JSS' }] });
  assert.deepEqual((await db.query('SELECT id FROM schools WHERE id=ANY($1::int[]) ORDER BY id', [[seeded[0], seeded[1], foreignSchool]])).rows.map(row => row.id), [seeded[1], foreignSchool].sort((a, b) => a - b));
  await db.query('DELETE FROM tlm_distribution WHERE plan_id=$1', [plan]);

  // Revoking the grant removes access immediately.
  ok(await api('chair', '/api/users', { ...profile('officer'), canManageSchools: false }, 'PATCH'));
  ok(await api('officer', '/api/schools'), 401);
  console.log('School register checks passed.');
} finally {
  const ids = Object.values(accounts).map(account => account.id);
  await db.query('DELETE FROM user_management_events WHERE state_code=ANY($1::text[]) OR actor_id=ANY($2::int[]) OR target_id=ANY($2::int[])', [states, ids]);
  await db.query('DELETE FROM tlm_distribution WHERE plan_id IN (SELECT id FROM action_plans WHERE state_code=ANY($1::text[]))', [states]);
  await db.query('DELETE FROM action_plans WHERE state_code=ANY($1::text[])', [states]);
  await db.query('DELETE FROM schools WHERE state_code=ANY($1::text[])', [states]);
  await db.query('DELETE FROM sessions WHERE user_id=ANY($1::int[])', [ids]);
  await db.query('DELETE FROM users WHERE id=ANY($1::int[])', [ids]);
  await db.end();
  console.log('Removed isolated test states, users, schools and plans.');
}
