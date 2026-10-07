// DNEMIS school sync (lib/dnemis-sync.ts, migration 044) against a mocked DHIS2: never calls the real DNEMIS server.
// Part 1 runs the sync in this process (tsx) with an injected fetch on a throwaway state; part 2 checks the admin
// sync API (access, schedule) on a local portal, with the DNEMIS settings row saved and restored around it.
// Usage: set -a; . ./.env; set +a; node scripts/test-dnemis-sync.mjs [baseUrl]
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { hashSync } from 'bcryptjs';
import { tsImport } from 'tsx/esm/api';

const base = process.argv[2] ?? process.env.TEST_BASE_URL ?? process.env.UBEC_TEST_URL ?? 'http://localhost:5173';
assert.match(base, /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/, 'Run this test against a local server only.');
assert.ok(['localhost', '127.0.0.1'].includes(new URL(process.env.DATABASE_URL).hostname), 'Use a local database only');
const sync = await tsImport('../lib/dnemis-sync.ts', import.meta.url);
const census = await tsImport('../lib/dnemis-census.ts', import.meta.url);
const schedule = await tsImport('../lib/dnemis-schedule.ts', import.meta.url);
const { DnemisError } = await tsImport('../lib/dnemis.ts', import.meta.url);

let passed = 0;
const step = message => { passed++; console.log('✓', message); };
const tag = randomUUID().slice(0, 6).toUpperCase(), state = `DS${tag}`, triggeredBy = `QA sync ${tag}`;
const db = new Client({ connectionString: process.env.DATABASE_URL });

// ---- Pure mapping and schedule rules ----
assert.equal(census.cleanSchoolName('PRY Abakire Primary School (1350510001)'), 'Abakire Primary School');
assert.equal(census.cleanSchoolName('JSS Aisha Academy (YB00124094)'), 'Aisha Academy');
assert.equal(census.cleanSchoolName('PRY GOVERNMENT DAY SCHOOL (1234567890)'), 'Government Day School');
assert.equal(census.cleanAreaName('yo Fune LGA', 'LGA'), 'Fune');
assert.equal(census.cleanAreaName('yo Katuzu Ward', 'Ward'), 'Katuzu');
assert.equal(census.statePrefix('fc Federal Capital Territory'), 'FC');
assert.deepEqual(census.classFromCombo('PRY3, Female'), { key: 'P3', sex: 'female' });
assert.deepEqual(census.classFromCombo('JS1, Male'), { key: 'JSS1', sex: 'male' });
assert.deepEqual(census.classFromCombo('Kindergarten 1/ECCD, Female'), { key: 'ECCDE', sex: 'female' });
assert.equal(census.classFromCombo('Useable'), null);
step('school, LGA and ward names are cleaned; class and sex come from category option combos');

{
  const section = (dnemisId, name, ward, level, levels) => ({ dnemisId, name, lga: 'Alpha', ward, level, levels });
  const merged = census.mergeSectionLevels([section('P1', 'Model School', 'North', 'Primary', ['ECCDE', 'Primary']), section('J1', 'model  school', 'North', 'JSS', ['JSS']),
    section('J2', 'Model School', 'South', 'JSS', ['JSS']), section('P2', 'Other School', 'North', 'Primary', ['Primary'])]);
  assert.deepEqual(merged.map(item => item.levels), [['ECCDE', 'Primary', 'JSS'], ['ECCDE', 'Primary', 'JSS'], ['JSS'], ['Primary']]);
  assert.deepEqual(merged.map(item => item.level), ['Primary', 'JSS', 'JSS', 'Primary'], 'the main level is kept');
  step('primary and JSS records of one school (same name and ward) show every level');
}

const at = text => new Date(text);
const daily = { mode: 'daily', weekday: 1, time: '02:00' };
// 02:00 Lagos = 01:00 UTC.
assert.equal(schedule.latestSlot(daily, at('2026-10-04T12:00:00Z')).toISOString(), '2026-10-04T01:00:00.000Z');
assert.equal(schedule.nextSlot(daily, at('2026-10-04T12:00:00Z')).toISOString(), '2026-10-05T01:00:00.000Z');
assert.equal(schedule.latestSlot(daily, at('2026-10-04T00:30:00Z')).toISOString(), '2026-10-03T01:00:00.000Z');
const weekly = { mode: 'weekly', weekday: 1, time: '23:30' }; // Monday 23:30 Lagos = Monday 22:30 UTC
assert.equal(schedule.nextSlot(weekly, at('2026-10-04T12:00:00Z')).toISOString(), '2026-10-05T22:30:00.000Z'); // 4 Oct 2026 is a Sunday
assert.equal(schedule.latestSlot({ mode: 'off', weekday: 1, time: '02:00' }, new Date()), null);
assert.equal(schedule.dueSlot(daily, at('2026-10-04T01:00:30Z'), null, at('2026-10-01T00:00:00Z')).toISOString(), '2026-10-04T01:00:00.000Z');
assert.equal(schedule.dueSlot(daily, at('2026-10-04T01:00:30Z'), at('2026-10-04T01:00:00Z'), null), null, 'a claimed slot does not run twice');
assert.equal(schedule.dueSlot(daily, at('2026-10-04T12:00:00Z'), null, at('2026-10-04T11:00:00Z')), null, 'saving a schedule never fires a slot that already passed');
assert.equal(schedule.dueSlot(daily, at('2026-10-04T09:00:00Z'), null, null), null, 'slots missed by more than the catch-up window are skipped');
step('schedule slots are computed in Lagos time and run once');

// ---- Mock DHIS2 ----
const ids = { public: 'GPUBLIC0001', private: 'GPRIVATE001', rural: 'GRURAL00001', urban: 'GURBAN00001', state: 'STATE000001' };
const el = { pre: 'EPRE0000001', pry: 'EPRY0000001', pry2: 'EPRY0000002', jss: 'EJSS0000001', cls: 'ECLS0000001', water: 'EWATER00001', fence: 'EFENCE00001', loc: 'ELOC0000001', lev: 'ELEV0000001', jlev: 'EJLEV000001', tch: 'ETCH0000001', phone: 'EPHONE00001' };
const coc = { p1m: 'CP1M0000001', p1f: 'CP1F0000001', p2f: 'CP2F0000001', n1m: 'CN1M0000001', j1f: 'CJ1F0000001', use: 'CUSE0000001', unuse: 'CUNUSE00001', tm: 'CTM00000001', tf: 'CTF00000001', def: 'CDEF0000001' };
const cocNames = { [coc.p1m]: 'PRY1, Male', [coc.p1f]: 'PRY1, Female', [coc.p2f]: 'PRY2, Female', [coc.n1m]: 'Nursery 1, Male', [coc.j1f]: 'JS1, Female', [coc.use]: 'Useable', [coc.unuse]: 'Not useable', [coc.tm]: 'Male', [coc.tf]: 'Female', [coc.def]: 'default' };
const unit = (id, name, ward, groups, form, extra = {}) => ({ id, name, code: extra.code, closedDate: extra.closedDate, parent: { name: `${state.toLowerCase().slice(0, 2)} ${ward} Ward`, parent: { name: `${state.toLowerCase().slice(0, 2)} ${extra.lga ?? 'Alpha'} LGA` } }, organisationUnitGroups: groups.map(id => ({ id })), dataSets: [{ id: form }] });
const PRY = 'MLTLNUmvS8r', JSS = 'uSw8GwPO417';
const units = [
  unit('OU_A000001', 'PRY Alpha Primary School (1000000001)', 'North', [ids.public, ids.rural], PRY, { code: '1000000001' }),
  unit('OU_B000001', 'PRY Bravo Nursery School (1000000002)', 'North', [ids.public], PRY, { code: '1000000002' }),
  unit('OU_C000001', 'JSS Charlie Junior Secondary (1000000003)', 'South', [ids.public, ids.urban], JSS, { code: '1000000003', lga: 'Beta' }),
  unit('OU_D000001', 'PVT Delta Private School (1000000004)', 'South', [ids.private], PRY, { code: '1000000004' }),
  unit('OU_E000001', 'PRY Echo Closed School (1000000005)', 'South', [ids.public], PRY, { code: '1000000005', closedDate: '2020-01-01T00:00:00.000' }),
  unit('OU_F000001', 'PRY Foxtrot Primary School (1000000006)', 'East', [ids.public, ids.rural], PRY, { code: '1000000006' }),
  unit('OU_G000001', 'PRY Alpha Primary School (1000000007)', 'West', [ids.public, ids.rural], PRY, { code: '1000000007' }),
  unit('OU_H000001', 'PRY Hotel Primary School (5555555555)', 'East', [ids.public, ids.rural], PRY, { code: '5555555555' }),
];
const value = (orgUnit, dataElement, categoryOptionCombo, v) => ({ dataElement, orgUnit, categoryOptionCombo, value: String(v) });
let alphaBoys = 30;
const valuesFor = (period, orgUnit) => {
  const now = String(new Date().getFullYear() - 1);
  if (orgUnit === 'OU_A000001' && period === now) return [value(orgUnit, el.pry, coc.p1m, alphaBoys), value(orgUnit, el.pry2, coc.p1m, 5), value(orgUnit, el.pry, coc.p1f, 28), value(orgUnit, el.pry, coc.p2f, 20),
    value(orgUnit, el.pre, coc.n1m, 12), value(orgUnit, el.cls, coc.use, 6), value(orgUnit, el.cls, coc.unuse, 2), value(orgUnit, el.water, coc.def, 'Borehole'),
    value(orgUnit, el.fence, coc.def, '3'), value(orgUnit, el.tch, coc.tm, 4), value(orgUnit, el.tch, coc.tf, 3), value(orgUnit, el.phone, coc.def, '0800')];
  if (orgUnit === 'OU_B000001' && period === now) return [value(orgUnit, el.pre, coc.n1m, 15), value(orgUnit, el.loc, coc.def, '1'), value(orgUnit, el.lev, coc.def, 'Pre-primary only')];
  if (orgUnit === 'OU_C000001' && period === now) return [value(orgUnit, el.jss, coc.j1f, 40), value(orgUnit, el.jlev, coc.def, 'Junior and Senior Secondary')];
  if (orgUnit === 'OU_F000001' && period === String(Number(now) - 1)) return [value(orgUnit, el.pry, coc.p1f, 9)];
  if (orgUnit === 'OU_G000001' && period === now) return [value(orgUnit, el.pry, coc.p1m, 1)];
  if (orgUnit === 'OU_H000001' && period === now) return [value(orgUnit, el.pry, coc.p1m, 2)];
  return [];
};
let failOnce = true, splits = 0;
async function mockFetch(path) {
  const url = new URL(`http://mock${path}`), p = url.pathname;
  if (p === '/api/organisationUnitGroups') return { organisationUnitGroups: [{ id: ids.public, name: 'Public' }, { id: ids.private, name: 'Private' }, { id: ids.rural, name: 'Rural' }, { id: ids.urban, name: 'Urban' }] };
  if (p === `/api/dataSets/${PRY}`) return { dataSetElements: [
    [el.pre, 'PRP_C.3 Pre-primary enrolment (3 Years)'], [el.pry, 'PRP_C.5 Primary Enrolment by age for the current school year (6 Years)'], [el.pry2, 'PRP_C.5 Primary Enrolment by age for the current school year (7 Years)'],
    [el.cls, 'F.2 Facilities available_Classrooms (How many useable/unseable classroom does the have?)'], [el.water, 'F.1 Source of safe drinking Water'],
    [el.fence, 'F.7 Fence/wall: Does the school have a fence or wall around it?'], [el.loc, 'B.2 Location'], [el.lev, 'B.3c PRP Levels of education offered'],
    [el.tch, 'D.2 How many teachers are working at the school regardless of whether they are currently present or on course or absent'], [el.phone, 'A.7 School Telephone'],
  ].map(([id, name]) => ({ dataElement: { id, name } })) };
  if (p === `/api/dataSets/${JSS}`) return { dataSetElements: [{ dataElement: { id: el.jss, name: 'JSS_C.3_Junior Secondary enrolment by age for the the current school year (12 Years)' } }, { dataElement: { id: el.jlev, name: 'B.3a JSS_Levels of education offered' } }] };
  if (p === '/api/organisationUnits' && url.searchParams.get('level') === '2') return { organisationUnits: [{ id: ids.state, name: `${state.toLowerCase()} Test State` }, { id: 'OTHERSTATE1', name: 'zz Elsewhere State' }] };
  if (p === '/api/organisationUnits') {
    assert.ok(url.searchParams.getAll('filter').includes(`path:like:${ids.state}`));
    const page = Number(url.searchParams.get('page')); // two pages, to exercise paging
    return { pager: { page, pageCount: 2 }, organisationUnits: page === 1 ? units.slice(0, 4) : units.slice(4) };
  }
  if (p === '/api/dataValueSets') {
    const orgUnits = url.searchParams.getAll('orgUnit'), period = url.searchParams.get('period');
    if (orgUnits.length > 2) { splits++; throw new DnemisError('The DNEMIS response was too large.', 'bad_response', 413); }
    if (failOnce) { failOnce = false; throw new DnemisError('DNEMIS did not respond within 90 seconds.', 'timeout'); }
    return { dataValues: orgUnits.flatMap(id => valuesFor(period, id)) };
  }
  if (p === '/api/categoryOptionCombos') {
    const wanted = url.searchParams.get('filter').replace(/^id:in:\[|\]$/g, '').split(',');
    return { categoryOptionCombos: wanted.filter(id => cocNames[id]).map(id => ({ id, name: cocNames[id] })) };
  }
  throw new Error(`Unexpected mock path ${path}`);
}
const run = options => sync.syncDnemisSchools({ states: [state], triggeredBy, fetchJson: mockFetch, allowUnknownStates: true, batchSize: 4, concurrency: 2, ...options });
const school = async id => (await db.query('SELECT * FROM schools WHERE dnemis_id = $1', [id])).rows[0];

await db.connect();
try {
  // A hand-added school with the DNEMIS code of school H (adopted), and one without a code (never touched).
  const manual = (await db.query(`INSERT INTO schools(state_code,name,lga,level,location,category,school_code,town,latitude,longitude) VALUES
    ($1,'Hotel Primary (manual)','Alpha','Primary','Urban','Public','5555555555','Hotel Town','11.5','11.9'),
    ($1,'Manual Only School','Alpha','Primary','Rural','Public',NULL,'Mtown','',''),
    ($1,'Alpha Primary School','Alpha','Primary','Rural','Public',NULL,'','','') RETURNING *`, [state])).rows;
  const untouched = manual[1];

  const dry = await run({ dryRun: true });
  assert.equal(dry.runId, null);
  assert.equal(dry.states[0].created, 5, JSON.stringify(dry.states[0]));
  assert.equal((await db.query('SELECT COUNT(*)::int AS n FROM schools WHERE state_code=$1 AND dnemis_id IS NOT NULL', [state])).rows[0].n, 0, 'a dry run writes nothing');
  step('a dry run reports without writing');

  failOnce = true;
  const first = await run();
  assert.ok(first.ok, first.message);
  assert.deepEqual([first.created, first.updated, first.skipped], [5, 1, 0]);
  const result = first.states[0];
  assert.deepEqual([result.found, result.imported, result.excluded.private, result.excluded.closed], [8, 6, 1, 1]);
  assert.ok(splits > 0, 'too-large responses are split'); assert.equal(failOnce, false, 'a timed-out request is retried');
  step('first sync imports public, open schools; private and closed ones are left out; retries and splits work');

  const alpha = await school('OU_A000001');
  assert.deepEqual([alpha.name, alpha.lga, alpha.ward, alpha.level, alpha.location, alpha.category, alpha.school_code], ['Alpha Primary School', 'Alpha', 'North', 'Primary', 'Rural', 'Public', '1000000001']);
  assert.deepEqual(alpha.enrolment_by_class, { ECCDE: { male: 12, female: 0 }, P1: { male: 35, female: 28 }, P2: { male: 0, female: 20 } });
  assert.deepEqual([alpha.enrolment_male, alpha.enrolment_female], [47, 48]);
  assert.deepEqual(alpha.facilities, { classrooms: { usable: 6, unusable: 2 }, waterSource: 'Borehole', fence: 'Needs major repair' });
  assert.deepEqual(alpha.teachers, { male: 4, female: 3 });
  assert.equal(alpha.dnemis_year, new Date().getFullYear() - 1);
  const bravo = await school('OU_B000001'), charlie = await school('OU_C000001'), fox = await school('OU_F000001'), hotel = await school('OU_H000001');
  assert.deepEqual([bravo.level, bravo.location, bravo.enrolment_male], ['ECCDE', 'Urban', 15]);
  assert.deepEqual([charlie.level, charlie.lga, charlie.location, charlie.enrolment_by_class], ['JSS', 'Beta', 'Urban', { JSS1: { male: 0, female: 40 } }]);
  assert.deepEqual([alpha.levels_offered, bravo.levels_offered, charlie.levels_offered, fox.levels_offered], [['ECCDE', 'Primary'], ['ECCDE'], ['JSS', 'SSS'], ['Primary']]);
  assert.equal(fox.dnemis_year, new Date().getFullYear() - 2, 'falls back to the previous year when the latest has no data');
  assert.equal(hotel.id, manual[0].id, 'the hand-added school with the same code is adopted');
  assert.deepEqual([hotel.name, hotel.town, hotel.latitude, hotel.location], ['Hotel Primary School', 'Hotel Town', '11.5', 'Rural']);
  assert.ok(await school('OU_G000001'), 'DNEMIS schools may share a name in one LGA');
  assert.equal(await school('OU_D000001'), undefined); assert.equal(await school('OU_E000001'), undefined);
  assert.deepEqual((await db.query('SELECT * FROM schools WHERE id=$1', [untouched.id])).rows[0], untouched, 'schools added by hand are never changed');
  step('records carry class enrolment, ECCDE, facilities, teachers, ward, location, level and the census year');

  const runRow = (await db.query('SELECT * FROM dnemis_sync_runs WHERE id=$1', [first.runId])).rows[0];
  assert.deepEqual([runRow.status, runRow.schools_created, runRow.schools_updated, runRow.triggered_by], ['ok', 5, 1, triggeredBy]);
  step('the run is recorded in dnemis_sync_runs');

  const again = await run();
  assert.deepEqual([again.created, again.updated, again.skipped], [0, 0, 6], again.message);
  await db.query(`UPDATE schools SET name='Edited By Hand', town='Kept Town', latitude='12.1', longitude='11.1' WHERE dnemis_id='OU_A000001'`);
  alphaBoys = 31;
  const third = await run();
  assert.deepEqual([third.created, third.updated], [0, 1]);
  const edited = await school('OU_A000001');
  assert.deepEqual([edited.name, edited.town, edited.latitude, edited.enrolment_by_class.P1.male], ['Alpha Primary School', 'Kept Town', '12.1', 36]);
  step('re-runs only write changed schools; DNEMIS fields are overwritten, town and coordinates kept');

  const holder = new Client({ connectionString: process.env.DATABASE_URL });
  await holder.connect();
  await holder.query(`SELECT pg_advisory_lock(hashtext('beapms:dnemis-sync'))`);
  await assert.rejects(run(), sync.DnemisSyncBusyError);
  await holder.end();
  step('runs never overlap (advisory lock)');

  await assert.rejects(sync.syncDnemisSchools({ states: ['not a state!'], triggeredBy, fetchJson: mockFetch }), sync.DnemisSyncConfigError);
  const unauthorised = async () => { throw new DnemisError('DNEMIS did not accept the access token.', 'unauthorised'); };
  await assert.rejects(run({ fetchJson: unauthorised }));
  const failed = (await db.query(`SELECT status, message FROM dnemis_sync_runs WHERE triggered_by=$1 ORDER BY id DESC LIMIT 1`, [triggeredBy])).rows[0];
  assert.deepEqual([failed.status, failed.message], ['failed', 'DNEMIS did not accept the access token.']);
  step('bad input is refused; a rejected token fails the run with a readable message');
} finally {
  await db.query('DELETE FROM schools WHERE state_code=$1', [state]).catch(() => undefined);
  await db.query('DELETE FROM dnemis_sync_runs WHERE triggered_by=$1', [triggeredBy]).catch(() => undefined);
}

// ---- Admin sync API ----
const password = randomUUID(), jars = {}, userIds = [];
async function api(who, body, { method = body ? 'POST' : 'GET', origin = true, url = '/api/admin/integrations/sync' } = {}) {
  const jar = jars[who] ??= {};
  const headers = { Cookie: Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; '), ...(origin ? { Origin: base } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) };
  const response = await fetch(base + url, { method, headers, ...(body ? { body: JSON.stringify(body) } : {}) });
  for (const cookie of response.headers.getSetCookie()) { const pair = cookie.split(';')[0], i = pair.indexOf('='); jar[pair.slice(0, i)] = pair.slice(i + 1); }
  const text = await response.text();
  let data; try { data = JSON.parse(text); } catch { data = { error: text.slice(0, 200) }; }
  return { status: response.status, data };
}
const expect = (result, status) => { assert.equal(result.status, status, JSON.stringify(result.data)); return result.data; };
async function user(key, role, stateCode) {
  const email = `${key}.${tag.toLowerCase()}@dnemis-sync.test`;
  userIds.push((await db.query('INSERT INTO users(email,full_name,role,state_code,password_hash) VALUES($1,$2,$3,$4,$5) RETURNING id', [email, `QA ${key}`, role, stateCode, hashSync(password, 4)])).rows[0].id);
  expect(await api(key, { email, password }, { url: '/api/auth/login' }), 200);
}
const saved = (await db.query(`SELECT row_to_json(s) AS row FROM integration_settings s WHERE provider='dnemis'`)).rows[0]?.row;
try {
  const active = (await db.query(`SELECT COUNT(*)::int AS n FROM dnemis_sync_runs WHERE status IN ('queued','running')`)).rows[0].n;
  assert.equal(active, 0, 'Wait for the running DNEMIS sync to finish before running this test.');
  await db.query(`DELETE FROM integration_settings WHERE provider='dnemis'`);
  await user('admin', 'Super Admin', 'ADMIN');
  await user('chair', 'Executive Chairman', state);
  expect(await api('anonymous'), 401);
  expect(await api('chair'), 403);
  expect(await api('chair', { action: 'start' }), 403);
  expect(await api('admin', { action: 'start' }, { origin: false }), 403);
  const runCount = async () => (await db.query('SELECT COUNT(*)::int AS n FROM dnemis_sync_runs')).rows[0].n;
  const runsBefore = await runCount();
  const status = expect(await api('admin'), 200).status;
  expect(await api('admin', undefined, { url: '/api/admin/integrations' }), 200);
  assert.deepEqual([status.schedule.mode, status.nextSync, status.active], ['off', null, false]);
  expect(await api('admin', { mode: 'daily', weekday: 1, time: '02:00' }, { method: 'PUT' }), 409);
  expect(await api('admin', { action: 'start' }), 409);
  expect(await api('admin', { action: 'start', states: ['XX'] }), 400);
  assert.equal(await runCount(), runsBefore, 'reading the status or the settings never starts a sync');
  step('sync API: Super Admin only, same origin, refuses without a saved and enabled connection; GET never starts a sync');

  await db.query(`INSERT INTO integration_settings(provider, base_url, enabled) VALUES('dnemis', 'https://asc.education.gov.ng/dhis', false)`);
  expect(await api('admin', { mode: 'hourly', weekday: 1, time: '02:00' }, { method: 'PUT' }), 400);
  expect(await api('admin', { mode: 'weekly', weekday: 9, time: '02:00' }, { method: 'PUT' }), 400);
  expect(await api('admin', { mode: 'weekly', weekday: 1, time: '2am' }, { method: 'PUT' }), 400);
  const weekly = expect(await api('admin', { mode: 'weekly', weekday: 3, time: '04:30' }, { method: 'PUT' }), 200).status;
  assert.deepEqual(weekly.schedule, { mode: 'weekly', weekday: 3, time: '04:30' });
  assert.equal(weekly.nextSync, null, 'no next sync while the connection is off');
  const stored = (await db.query(`SELECT sync_schedule, sync_weekday, sync_time, sync_schedule_updated_at FROM integration_settings WHERE provider='dnemis'`)).rows[0];
  assert.deepEqual([stored.sync_schedule, stored.sync_weekday, stored.sync_time], ['weekly', 3, '04:30']); assert.ok(stored.sync_schedule_updated_at);
  expect(await api('admin', { action: 'start', states: ['YO'] }), 409);
  for (let i = 0; i < 3; i++) expect(await api('admin'), 200);
  assert.equal(await runCount(), runsBefore, 'a saved schedule is never started by a request (only the worker runs it)');
  step('the refresh schedule is validated and stored; Sync now needs the connection turned on; requests never run the schedule');
} finally {
  await db.query(`DELETE FROM integration_settings WHERE provider='dnemis'`);
  if (saved) await db.query('INSERT INTO integration_settings SELECT * FROM json_populate_record(NULL::integration_settings, $1::json)', [JSON.stringify(saved)]);
  if (userIds.length) {
    await db.query('DELETE FROM sessions WHERE user_id = ANY($1::int[])', [userIds]).catch(() => undefined);
    await db.query('DELETE FROM users WHERE id = ANY($1::int[])', [userIds]);
  }
  await db.end();
}
console.log(`\n${passed} checks passed`);
