// UBEC accounts for the review flow (docs/ubec-flow.md, migration 055): makes the active UBEC side exactly
//   1 UBEC Executive Secretary (the existing account is kept), 1 UBEC BEAP Chair, 7 component Directors,
//   3 Oversight Directors (Audit, Procurement, Finance) and 11 Assessment Officers (one per component).
// Every other UBEC-side account (e.g. the old `UBEC Department Reviewer` accounts) is retired: deleted when nothing
// references it (every foreign key to users is checked; never TRUNCATE ... CASCADE), otherwise deactivated with its
// sessions revoked and its history kept. The Super Admin and SUBEB accounts are never touched.
// New accounts get SEED_SHARED_PASSWORD (never printed). An existing target email with a different role is refused.
// One transaction. Idempotent: a second run keeps everything.
//
//   node --env-file=.env scripts/seed-ubec-users.mjs                 # dry run: prints what it would do
//   node --env-file=.env scripts/seed-ubec-users.mjs --yes           # applies (local database only)
//   node scripts/seed-ubec-users.mjs --yes --production-confirmed    # any database: back it up first!
import { Client } from 'pg';
import { hashSync } from 'bcryptjs';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL is required.');
const apply = process.argv.includes('--yes');
const productionConfirmed = process.argv.includes('--production-confirmed');
const host = new URL(connectionString).hostname;
const local = ['localhost', '127.0.0.1', '::1'].includes(host);
if (!local && !productionConfirmed) { console.error(`Refusing to run against ${host}: pass --production-confirmed (after taking a backup) for a non-local database.`); process.exit(1); }
const sharedPassword = process.env.SEED_SHARED_PASSWORD?.trim();
if (apply && !sharedPassword) throw new Error('SEED_SHARED_PASSWORD is required so new UBEC accounts get the agreed shared password.');

const ES = 'UBEC Executive Secretary';
const directors = [['physical', 'Physical Planning (DPP)', 'dpp'], ['planning', 'Planning, Research & Statistics (DPRS)', 'dprs'], ['academic', 'Academic Services (DACS)', 'dacs'], ['teachers', 'Teacher Professional Development (DTPD)', 'dtpd'], ['digital', 'Data, Digital Platforms & Analytics (DDDPA)', 'dddpa'], ['quality', 'Monitoring & Evaluation (DME)', 'dme'], ['social', 'Social Mobilisation (DSM)', 'dsm']];
const oversight = [['audit', 'Audit'], ['procurement', 'Procurement'], ['finance', 'Finance']];
// Component → [UBEC department, name] (lib/ubec.ts pillarDepartments).
const components = [['infrastructure', 'physical', 'Infrastructure'], ['monitoring', 'physical', 'Supervision & Monitoring'], ['planning', 'planning', 'Planning (EMIS)'], ['sports', 'academic', 'Sports'], ['tlm', 'academic', 'TLM'], ['curriculum', 'academic', 'Curriculum'], ['gscci', 'academic', 'Greening'], ['teachers', 'teachers', 'Teacher Development'], ['ict', 'digital', 'ICT'], ['quality', 'quality', 'Quality Assurance'], ['sbmc', 'social', 'SBMC']];
const targets = [
  { email: 'beap.chair@ubec.test', name: 'UBEC BEAP Chair', role: 'UBEC BEAP Chair', department: null },
  ...directors.map(([department, label, key]) => ({ email: `${key}.director@ubec.test`, name: `UBEC Director ${label}`, role: 'UBEC Director', department })),
  ...oversight.map(([department, label]) => ({ email: `${department}.director@ubec.test`, name: `UBEC Director ${label}`, role: 'UBEC Oversight Director', department })),
  ...components.map(([pillar, department, label]) => ({ email: `${pillar}.officer@ubec.test`, name: `UBEC Assessment Officer – ${label}`, role: 'UBEC Assessment Officer', department })),
];
const ubecSide = "(role LIKE 'UBEC %')";
const show = user => `${user.name} <${user.email}>`;

const db = new Client({ connectionString, connectionTimeoutMillis: 5000 });
await db.connect();
const summary = { created: [], kept: [], deleted: [], deactivated: [] };
try {
  await db.query('BEGIN');
  await db.query("SELECT pg_advisory_xact_lock(hashtext('admin:user-management'))");
  const roleCheck = (await db.query("SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conname='users_role_check'")).rows[0]?.def ?? '';
  if (!roleCheck.includes('UBEC BEAP Chair')) throw new Error('Run the database migrations first (055-ubec-review-flow.sql adds the new UBEC roles).');
  // The Executive Secretary: keep executive.secretary@ubec.test if present, else the oldest active ES; create one if none.
  const esRows = (await db.query(`SELECT id, email, full_name AS name, active FROM users WHERE role=$1 ORDER BY (email='executive.secretary@ubec.test') DESC, active DESC, id`, [ES])).rows;
  const keepEs = esRows[0] ?? null;
  const plan = [...(keepEs ? [] : [{ email: 'executive.secretary@ubec.test', name: 'UBEC Executive Secretary', role: ES, department: null }]), ...targets];
  const existing = (await db.query('SELECT id, email, full_name AS name, role, department, active FROM users WHERE email=ANY($1::text[])', [plan.map(t => t.email)])).rows;
  for (const target of plan) {
    const found = existing.find(row => row.email === target.email);
    if (!found) { summary.created.push(target); continue; }
    if (found.role !== target.role || (found.department ?? null) !== target.department) throw new Error(`${target.email} already exists as ${found.role}${found.department ? ` (${found.department})` : ''}; refusing to overwrite it.`);
    summary.kept.push({ ...found, reactivate: !found.active });
  }
  if (keepEs) summary.kept.unshift({ ...keepEs, reactivate: !keepEs.active });
  const keepIds = summary.kept.map(user => user.id);
  const retire = (await db.query(`SELECT id, email, full_name AS name, role, active FROM users WHERE ${ubecSide} AND NOT (id = ANY($1::int[])) ORDER BY id`, [keepIds])).rows;
  // Every foreign key to users(id), except the account's own rows (sessions and department links go with it).
  const refs = (await db.query(`SELECT c.conrelid::regclass::text AS tbl, a.attname AS col FROM pg_constraint c JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=ANY(c.conkey)
    WHERE c.contype='f' AND c.confrelid='users'::regclass`)).rows.filter(r => !['sessions', 'user_departments'].includes(r.tbl));
  for (const user of retire) {
    let referenced = false;
    for (const ref of refs) if ((await db.query(`SELECT 1 FROM ${ref.tbl} WHERE "${ref.col}"=$1 LIMIT 1`, [user.id])).rowCount) { referenced = true; break; }
    // An account already deactivated earlier stays as it is (a second run changes nothing).
    if (!referenced) summary.deleted.push(user); else if (user.active) summary.deactivated.push(user);
  }
  if (apply) {
    const hash = hashSync(sharedPassword, 12);
    for (const target of summary.created) {
      const id = (await db.query("INSERT INTO users(email,full_name,role,department,state_code,password_hash,active) VALUES($1,$2,$3,$4,'UBEC',$5,TRUE) RETURNING id", [target.email, target.name, target.role, target.department, hash])).rows[0].id;
      if (target.department) await db.query('INSERT INTO user_departments(user_id,department) VALUES($1,$2)', [id, target.department]);
    }
    for (const user of summary.kept.filter(u => u.reactivate)) await db.query('UPDATE users SET active=TRUE WHERE id=$1', [user.id]);
    for (const user of summary.deleted) {
      await db.query('DELETE FROM sessions WHERE user_id=$1', [user.id]);
      await db.query('DELETE FROM user_departments WHERE user_id=$1', [user.id]);
      await db.query('DELETE FROM users WHERE id=$1', [user.id]);
    }
    for (const user of summary.deactivated) {
      await db.query('UPDATE users SET active=FALSE, session_version=session_version+1 WHERE id=$1', [user.id]);
      await db.query('DELETE FROM sessions WHERE user_id=$1', [user.id]);
    }
    const active = (await db.query(`SELECT role, COUNT(*)::int AS n FROM users WHERE ${ubecSide} AND active GROUP BY role ORDER BY role`)).rows;
    const expected = { 'UBEC Assessment Officer': 11, 'UBEC BEAP Chair': 1, 'UBEC Director': 7, 'UBEC Executive Secretary': 1, 'UBEC Oversight Director': 3 };
    for (const [role, n] of Object.entries(expected)) if ((active.find(r => r.role === role)?.n ?? 0) !== n) throw new Error(`Expected ${n} active ${role} account(s) after seeding.`);
    if (active.some(r => !(r.role in expected))) throw new Error('Unexpected active UBEC roles remain.');
    await db.query('COMMIT');
  } else await db.query('ROLLBACK');
  console.log(`${apply ? 'Applied' : 'Dry run (nothing changed; pass --yes to apply)'} · database host ${host}${local ? ' (local)' : ''}`);
  console.log(`\nCreated (${summary.created.length}):`); for (const user of summary.created) console.log(`  + ${show(user)} · ${user.role}${user.department ? ` · ${user.department}` : ''}`);
  console.log(`\nKept (${summary.kept.length}):`); for (const user of summary.kept) console.log(`  = ${show(user)}${user.reactivate ? ' (reactivated)' : ''}`);
  console.log(`\nDeleted, nothing referenced them (${summary.deleted.length}):`); for (const user of summary.deleted) console.log(`  - ${show(user)} · ${user.role}`);
  console.log(`\nDeactivated, history kept and sessions revoked (${summary.deactivated.length}):`); for (const user of summary.deactivated) console.log(`  x ${show(user)} · ${user.role}`);
} catch (error) {
  await db.query('ROLLBACK').catch(() => undefined);
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally { await db.end(); }
