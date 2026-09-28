import { readFile } from 'node:fs/promises';
import { Client } from 'pg';
import { hashSync } from 'bcryptjs';

const connectionString = process.env.DATABASE_URL;
const superAdminEmail = (process.env.SEED_SUPER_ADMIN_EMAIL || 'admin@ubec.test').trim().toLowerCase();
const superAdminName = process.env.SEED_SUPER_ADMIN_NAME?.trim() || 'UBEC Super Administrator';
const sharedPassword = process.env.SEED_SHARED_PASSWORD?.trim();
if (!connectionString) throw new Error('DATABASE_URL is required.');
if (!/^\S+@\S+\.\S+$/.test(superAdminEmail)) throw new Error('SEED_SUPER_ADMIN_EMAIL must be a valid email address.');
if (!sharedPassword) throw new Error('SEED_SHARED_PASSWORD is required so every seeded account keeps the agreed shared password.');

const subebDepartments = ['physical', 'academic', 'me', 'teachers', 'ict', 'social', 'planning'];
const ubecDepartments = ['academic', 'administration', 'physical', 'planning', 'special', 'teachers', 'finance', 'audit', 'quality', 'social', 'zonal'];
const baselineAllocation = {
  shares: { infrastructure: 7500, quality: 500, teachers: 500, sbmc: 500, sports: 200, monitoring: 200, curriculum: 200, planning: 200, gscci: 200 },
  tlmWithinInfrastructure: 2000,
};
const states = JSON.parse(await readFile(new URL('../lib/nigeria-map.json', import.meta.url), 'utf8'));
if (states.length !== 37) throw new Error(`Expected Nigeria's 36 states and FCT; found ${states.length}.`);

const subebName = state => state.code === 'FC' ? 'FCT UBEB' : `${state.name.toUpperCase()} SUBEB`;
const slug = state => state.name.toLowerCase().replace(/[^a-z0-9]+/g, '.');
const accounts = [
  { email: superAdminEmail, name: superAdminName, role: 'Super Admin', state: 'ADMIN', departments: [] },
  { email: 'executive.secretary@ubec.test', name: 'UBEC Executive Secretary', role: 'UBEC Executive Secretary', state: 'UBEC', departments: [] },
  ...ubecDepartments.map(department => ({ email: `${department}.reviewer@ubec.test`, name: `UBEC ${department} Reviewer`, role: 'UBEC Department Reviewer', state: 'UBEC', departments: [department] })),
  ...states.flatMap(state => {
    const workspace = subebName(state);
    const domain = `${slug(state)}.subeb.test`;
    return [
      { email: `data.entry@${domain}`, name: `${workspace} Data Entry Officer`, role: 'Data Entry Staff', state: state.code, departments: subebDepartments },
      { email: `director@${domain}`, name: `${workspace} Director`, role: 'Director', state: state.code, departments: ['academic', ...subebDepartments.filter(value => value !== 'academic')] },
      { email: `beap.chair@${domain}`, name: `${workspace} BEAP Chair`, role: 'Director', state: state.code, departments: ['physical'], isBeapChair: true, canCreatePlan: true },
      { email: `executive.chairman@${domain}`, name: `${workspace} Executive Chairman`, role: 'Executive Chairman', state: state.code, departments: [] },
    ];
  }),
];

const credentials = accounts.map(account => ({ ...account, password: sharedPassword }));
const db = new Client({ connectionString, connectionTimeoutMillis: 5000 });
await db.connect();
try {
  await db.query('BEGIN');
  await db.query("SELECT pg_advisory_xact_lock(hashtext('production-role-seed'))");
  const existing = await db.query('SELECT email FROM users WHERE email=ANY($1::text[])', [credentials.map(item => item.email)]);
  if (existing.rowCount) throw new Error(`Seed accounts already exist (${existing.rows.slice(0, 5).map(row => row.email).join(', ')}${existing.rowCount > 5 ? ', …' : ''}); clear them before running the fresh seed.`);
  for (const account of credentials) {
    const user = await db.query(
      `INSERT INTO users(email,full_name,role,department,state_code,password_hash,active,can_create_plan,is_beap_chair)
       VALUES($1,$2,$3,$4,$5,$6,TRUE,$7,$8) RETURNING id`,
      [account.email, account.name, account.role, account.departments[0] ?? null, account.state, hashSync(account.password, 12), account.canCreatePlan ?? false, account.isBeapChair ?? false],
    );
    if (account.departments.length) await db.query('INSERT INTO user_departments(user_id,department) SELECT $1,unnest($2::text[])', [user.rows[0].id, account.departments]);
  }
  // A fresh or truncated demo database must retain the policy required by new
  // plans. The insert is idempotent and never replaces an administrator's
  // existing allocation history.
  await db.query(
    'INSERT INTO funding_policies(allocation,actor_name) SELECT $1::jsonb,$2 WHERE NOT EXISTS(SELECT 1 FROM funding_policies)',
    [JSON.stringify(baselineAllocation), 'Initial allocation'],
  );
  await db.query('COMMIT');
  process.stdout.write(`${JSON.stringify({ generatedAt: new Date().toISOString(), stateCount: states.length, subebUserCount: states.length * 4, accounts: credentials }, null, 2)}\n`);
} catch (error) {
  await db.query('ROLLBACK').catch(() => undefined);
  throw error;
} finally {
  await db.end();
}
