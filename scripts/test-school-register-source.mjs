// School register source (migration 046): "DNEMIS only" makes the register read-only for everyone;
// "DNEMIS and manual changes" allows hand changes again. Also checks the Super Admin setting API and the missing-row fallback.
// Usage: node --env-file=.env scripts/test-school-register-source.mjs [baseUrl]
// (needs DATABASE_URL; creates and removes a throwaway state and users; restores the GLOBAL settings row).
import assert from 'node:assert/strict';
import { Client } from 'pg';
import { hashSync } from 'bcryptjs';

const base = process.argv[2] ?? process.env.TEST_BASE_URL ?? process.env.UBEC_TEST_URL ?? 'http://localhost:5173';
assert.ok(['localhost', '127.0.0.1'].includes(new URL(base).hostname), 'Run against a local portal only');
assert.ok(['localhost', '127.0.0.1'].includes(new URL(process.env.DATABASE_URL).hostname), 'Use a local database only');
const db = new Client({ connectionString: process.env.DATABASE_URL });
const marker = `RS${Date.now()}`, adminState = 'YO', adminSchoolName = `QA Source School ${marker}`;
const accounts = {}, password = crypto.randomUUID();
const offMessage = 'Schools come from DNEMIS. Adding or changing schools by hand is turned off by the administrator.';

async function api(who, path, body, method = body ? 'POST' : 'GET', { origin = true } = {}) {
  const form = body instanceof FormData;
  const headers = { ...(origin ? { Origin: base } : {}), ...(accounts[who]?.cookie ? { Cookie: accounts[who].cookie } : {}), ...(body && !form ? { 'Content-Type': 'application/json' } : {}) };
  const response = await fetch(base + path, { method, headers, ...(body ? { body: form ? body : JSON.stringify(body) } : {}) });
  const type = response.headers.get('content-type') ?? '';
  const data = type.includes('json') ? await response.json() : Buffer.from(await response.arrayBuffer());
  return { status: response.status, data, type, cookie: response.headers.get('set-cookie')?.split(';')[0] };
}
function ok(result, status = 200) { assert.equal(result.status, status, Buffer.isBuffer(result.data) ? `binary ${result.type}` : JSON.stringify(result.data)); return result.data; }
const refused = (result) => { assert.equal(ok(result, 409).error, offMessage); };
const school = (overrides = {}) => ({ name: `QA Source Primary ${marker}`, town: 'Qa Town', lga: 'QA North', category: 'Public', location: 'Rural', level: 'Primary', latitude: '', longitude: '', schoolCode: null, enrolment: { P1: { male: 10, female: 12 } }, ...overrides });
const upload = () => { const form = new FormData(); form.set('file', new File([Buffer.from('PK\u0003\u0004')], 'schools.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })); return form; };
const setSource = (source, who = 'admin', options) => api(who, '/api/admin/school-register-source', { source }, 'PUT', options);

await db.connect();
const globalBefore = (await db.query("SELECT row_to_json(s) AS row FROM state_workflow_settings s WHERE state_code='GLOBAL'")).rows[0]?.row ?? null;
const restoreGlobal = async () => {
  await db.query("DELETE FROM state_workflow_settings WHERE state_code='GLOBAL'");
  if (globalBefore) await db.query('INSERT INTO state_workflow_settings SELECT * FROM json_populate_record(NULL::state_workflow_settings, $1::json)', [JSON.stringify({ ...globalBefore, updated_by: null })]);
  if (globalBefore?.updated_by) await db.query("UPDATE state_workflow_settings SET updated_by=$1 WHERE state_code='GLOBAL' AND EXISTS (SELECT 1 FROM users WHERE id=$1)", [globalBefore.updated_by]);
};
try {
  for (const [who, role, state, department, isBeapChair, canManageSchools] of [
    ['chair', 'Executive Chairman', marker, null, false, false], ['beap', 'Director', marker, 'physical', true, false],
    ['officer', 'Data Entry Staff', marker, 'physical', false, true], ['director', 'Director', marker, 'social', false, false],
    ['admin', 'Super Admin', 'ADMIN', null, false, false]]) {
    const email = `${who}.${marker.toLowerCase()}@test.local`;
    const id = (await db.query('INSERT INTO users(full_name,email,role,department,state_code,password_hash,is_beap_chair,can_manage_schools) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id', [`QA ${who}`, email, role, department, state, hashSync(password, 4), isBeapChair, canManageSchools])).rows[0].id;
    accounts[who] = { id, email };
    const login = await api(who, '/api/auth/login', { email, password }); ok(login); accounts[who].cookie = login.cookie;
  }
  const [seeded] = (await db.query("INSERT INTO schools(state_code,name,lga,level,location,category,enrolment_male,enrolment_female) VALUES($1,'QA Existing School','QA North','Primary','Urban','Public',100,90) RETURNING id", [marker])).rows.map(row => row.id);
  const schoolCount = async () => (await db.query('SELECT COUNT(*)::int AS n FROM schools WHERE state_code=$1', [marker])).rows[0].n;

  // The setting API: Super Admin only, same origin on writes, a valid source.
  ok(await api('chair', '/api/admin/school-register-source'), 403);
  ok(await setSource('dnemis_and_manual', 'chair'), 403);
  ok(await setSource('dnemis_and_manual', 'admin', { origin: false }), 403);
  ok(await setSource('everything'), 400);
  ok(await api('admin', '/api/admin/school-register-source', { source: 'dnemis_only', extra: true }, 'PUT'), 400);
  assert.deepEqual(ok(await setSource('dnemis_only')), { source: 'dnemis_only' });
  assert.equal(ok(await api('admin', '/api/admin/school-register-source')).source, 'dnemis_only');
  assert.equal((await db.query("SELECT updated_by FROM state_workflow_settings WHERE state_code='GLOBAL'")).rows[0].updated_by, accounts.admin.id);

  // DNEMIS only: managers still see the register, read-only; every hand change is refused.
  for (const who of ['chair', 'beap', 'officer']) {
    const options = ok(await api(who, '/api/schools/options'));
    assert.deepEqual([options.canManage, options.manualEntry, options.source, options.lgas], [true, false, 'dnemis_only', []], who);
    assert.equal(ok(await api(who, '/api/schools')).total, 1, `${who} can still view the register`);
    refused(await api(who, '/api/schools', school(), 'POST'));
    refused(await api(who, '/api/schools', { ...school({ name: 'QA Existing School' }), id: seeded }, 'PATCH'));
    refused(await api(who, '/api/schools', { ids: [seeded] }, 'DELETE'));
    refused(await api(who, '/api/schools/import?mode=preview', upload()));
    refused(await api(who, '/api/schools/import?mode=commit', upload()));
    refused(await api(who, '/api/schools/template'));
    const exported = await api(who, '/api/schools/export', { ids: [seeded] }); ok(exported); assert.match(exported.type, /spreadsheetml/);
  }
  // Non-managers and unsigned requests keep their own answers; writes without the portal origin stay 403.
  ok(await api('director', '/api/schools', school(), 'POST'), 403);
  ok(await api('anonymous', '/api/schools', school(), 'POST'), 401);
  ok(await api('chair', '/api/schools', school(), 'POST', { origin: false }), 403);
  // The Super Admin acting in a state is refused too.
  const adminOptions = ok(await api('admin', `/api/schools/options?state=${adminState}`));
  assert.deepEqual([adminOptions.canManage, adminOptions.manualEntry], [true, false]);
  refused(await api('admin', `/api/schools?state=${adminState}`, school({ name: adminSchoolName, lga: 'x' }), 'POST'));
  refused(await api('admin', `/api/schools?state=${adminState}`, { ids: [seeded] }, 'DELETE'));
  assert.equal(await schoolCount(), 1, 'Nothing changed while the register is DNEMIS only');
  assert.equal((await db.query('SELECT COUNT(*)::int AS n FROM schools WHERE state_code=$1 AND name=$2', [adminState, adminSchoolName])).rows[0].n, 0);

  // DNEMIS and manual changes: today's behaviour.
  assert.deepEqual(ok(await setSource('dnemis_and_manual')), { source: 'dnemis_and_manual' });
  const options = ok(await api('chair', '/api/schools/options'));
  assert.deepEqual([options.manualEntry, options.source, options.lgas], [true, 'dnemis_and_manual', ['QA North']]);
  const created = ok(await api('officer', '/api/schools', school(), 'POST'), 201).school;
  assert.equal(ok(await api('beap', '/api/schools', { ...school({ town: 'New Town' }), id: created.id }, 'PATCH')).school.town, 'New Town');
  assert.deepEqual(ok(await api('chair', '/api/schools', { ids: [created.id] }, 'DELETE')), { deleted: 1, kept: [] });
  const template = await api('chair', '/api/schools/template'); ok(template); assert.match(template.type, /spreadsheetml/);
  ok(await api('director', '/api/schools', school(), 'POST'), 403);

  // Back to DNEMIS only: refused again straight away.
  ok(await setSource('dnemis_only'));
  refused(await api('chair', '/api/schools', school(), 'POST'));

  // Reset safety: without the GLOBAL row the register stays DNEMIS only.
  await db.query("DELETE FROM state_workflow_settings WHERE state_code='GLOBAL'");
  assert.equal(ok(await api('admin', '/api/admin/school-register-source')).source, 'dnemis_only');
  assert.equal(ok(await api('chair', '/api/schools/options')).manualEntry, false);
  refused(await api('chair', '/api/schools', school(), 'POST'));
  assert.equal(await schoolCount(), 1);
  console.log('School register source checks passed.');
} finally {
  await restoreGlobal();
  const ids = Object.values(accounts).map(account => account.id);
  await db.query('DELETE FROM schools WHERE state_code=$1 OR (state_code=$2 AND name=$3)', [marker, adminState, adminSchoolName]);
  await db.query('DELETE FROM sessions WHERE user_id=ANY($1::int[])', [ids]);
  await db.query('DELETE FROM users WHERE id=ANY($1::int[])', [ids]);
  await db.end();
  console.log('Removed the test state, users and schools; restored the GLOBAL settings row.');
}
