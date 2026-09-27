import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { Client } from 'pg';
import { hashSync } from 'bcryptjs';

// Destructive local-only utility. Requires explicit reset flag and a verified dump.
assert.ok(process.argv.includes('--reset-local-demo'), 'Explicit reset flag required');
const url = new URL(process.env.DATABASE_URL);
assert.ok(['localhost','127.0.0.1'].includes(url.hostname), 'Local database only');
const backup = process.env.UBEC_RESET_BACKUP;
assert.ok(backup, 'A database backup path is required');
assert.equal(readFileSync(backup).subarray(0,5).toString(), 'PGDMP', 'A PostgreSQL custom-format backup is required');
const departments = [
  ['academic','Academic Services'], ['administration','Administration and Supplies'],
  ['physical','Physical Planning'], ['planning','Planning, Research & Statistics'],
  ['special','Special Programmes'], ['teachers','Teacher Development'],
  ['finance','Finance and Accounts'], ['audit','Internal Audit'],
  ['quality','Quality Assurance'], ['social','Social Mobilization'],
  ['zonal','Zonal and State Offices'],
];
const accounts = [
  { email:'yobe.chairman@demo.local', name:'Hauwa Garba', role:'Executive Chairman', department:null, state:'YO' },
  { email:'ubec.es@demo.local', name:'UBEC Executive Secretary', role:'UBEC Executive Secretary', department:null, state:'UBEC' },
  ...departments.flatMap(([id,name]) => [
    { email:`yobe.officer.${id}@demo.local`, name:id==='physical'?'Amina Muhammad':`${name} Officer`, role:'Data Entry Staff', department:id, state:'YO' },
    { email:`yobe.director.${id}@demo.local`, name:id==='physical'?'Ibrahim Musa':`${name} Director`, role:'Director', department:id, state:'YO', isBeapChair:id==='physical' },
    { email:`ubec.${id}@demo.local`, name:`${name} Reviewer`, role:'UBEC Department Reviewer', department:id, state:'UBEC' },
  ]),
];
const password = `Ubec-Test-${randomBytes(6).toString('hex')}!`;
const passwordHash = hashSync(password,12);
const db = new Client({connectionString:url.toString()});
await db.connect();
try {
  await db.query('BEGIN');
  await db.query('LOCK TABLE users, action_plans IN ACCESS EXCLUSIVE MODE');
  const before = (await db.query('SELECT (SELECT COUNT(*)::int FROM users) AS accounts,(SELECT COUNT(*)::int FROM action_plans) AS plans')).rows[0];
  const references = async () => (await db.query(`SELECT
    (SELECT md5(string_agg(row_to_json(s)::text, '|' ORDER BY id)) FROM schools s) AS schools,
    (SELECT md5(string_agg(row_to_json(t)::text, '|' ORDER BY id)) FROM construction_types t) AS templates`)).rows[0];
  const originalReferences = await references();
  const sessionVersion = (await db.query('SELECT COALESCE(MAX(session_version),0)+1 AS version FROM users')).rows[0].version;
  const removed = {};
  for (const table of ['sessions','plan_notifications','ubec_events','ubec_assignments','ubec_rounds','plan_review_events','plan_submissions','plan_pillar_reviews','sports_allocations','sports_budget_lines','infrastructure_lines','action_plans','user_management_events','users']) {
    removed[table] = (await db.query(`DELETE FROM public.${table}`)).rowCount;
  }
  for (const account of accounts) await db.query(
    'INSERT INTO users(email,full_name,role,department,state_code,password_hash,active,session_version,is_beap_chair) VALUES($1,$2,$3,$4,$5,$6,TRUE,$7,$8)',
    [account.email,account.name,account.role,account.department,account.state,passwordHash,sessionVersion,account.isBeapChair??false],
  );
  assert.deepEqual(await references(), originalReferences, 'Reference data changed');
  assert.equal((await db.query('SELECT COUNT(*)::int AS n FROM action_plans')).rows[0].n,0);
  assert.equal((await db.query('SELECT COUNT(*)::int AS n FROM users')).rows[0].n,35);
  await db.query('COMMIT');
  console.log(JSON.stringify({before,removed,backup,password,accounts},null,2));
} catch(error) { await db.query('ROLLBACK'); throw error; }
finally { await db.end(); }
