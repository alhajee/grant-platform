// Support and oversight accounts (UBEC169/183, 28 October 2026): for each chosen SUBEB, a Director and a Data Entry
// Officer for Procurement, Finance, Special Programmes and (UBEC168, 30 October 2026) Audit; on the UBEC side a Special Programmes Oversight Director and
// Assessment Officer. Each new SUBEB account gets the password of that state's BEAP Chair account (else its Executive Chairman's), and each UBEC one the
// password of audit.director@ubec.test (the hash is copied, nothing is printed), so the agreed shared password works
// without SEED_SHARED_PASSWORD. Accounts that already exist are left alone; nothing is deleted or deactivated.
// Usage: node --env-file=.env scripts/seed-support-accounts.mjs --states=BO,BY,KT,KW,OG [--create-core] [--yes] [--production-confirmed]
import { readFile } from 'node:fs/promises';
import { Client } from 'pg';

const args = process.argv.slice(2), apply = args.includes('--yes'), createCore = args.includes('--create-core');
const componentDepartments = ['physical', 'academic', 'me', 'teachers', 'ict', 'social', 'planning'];
const wanted = (args.find(arg => arg.startsWith('--states='))?.slice(9) ?? '').split(',').map(code => code.trim().toUpperCase()).filter(Boolean);
const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL is required.');
const host = new URL(connectionString).hostname;
if (!['localhost', '127.0.0.1', '::1'].includes(host) && !args.includes('--production-confirmed')) throw new Error(`Refusing to write to ${host} without --production-confirmed.`);
const states = JSON.parse(await readFile(new URL('../lib/nigeria-map.json', import.meta.url), 'utf8'));
const support = [['procurement', 'Procurement'], ['finance', 'Finance'], ['special', 'Special Programmes'], ['audit', 'Audit']];
const subebName = state => state.code === 'FC' ? 'FCT UBEB' : `${state.name.toUpperCase()} SUBEB`;

const db = new Client({ connectionString, connectionTimeoutMillis: 5000 });
await db.connect();
try {
  await db.query('BEGIN');
  await db.query("SELECT pg_advisory_xact_lock(hashtext('admin:user-management'))");
  const created = [], kept = [];
  const add = async (account, hash) => {
    if ((await db.query('SELECT 1 FROM users WHERE email=$1', [account.email])).rowCount) { kept.push(account.email); return; }
    created.push(`${account.name} <${account.email}>`);
    if (!apply) return;
    const departments = account.departments ?? [account.department];
    const id = (await db.query('INSERT INTO users(email,full_name,role,department,state_code,password_hash,active,can_create_plan,is_beap_chair) VALUES($1,$2,$3,$4,$5,$6,TRUE,$7,$8) RETURNING id', [account.email, account.name, account.role, departments[0] ?? null, account.state, hash, !!account.canCreatePlan, !!account.isBeapChair])).rows[0].id;
    if (departments.length) await db.query('INSERT INTO user_departments(user_id,department) SELECT $1,unnest($2::text[])', [id, departments]);
  };
  const reference = (await db.query("SELECT password_hash FROM users WHERE email='audit.director@ubec.test'")).rows[0];
  for (const code of wanted) {
    const state = states.find(item => item.code === code);
    if (!state) throw new Error(`Unknown state code ${code}.`);
    // --create-core (1 November 2026, Kaduna and Akwa Ibom): a state with no active accounts gets the four core accounts of
    // scripts/seed-production-users.mjs (Data Entry, Director, BEAP Chair, Executive Chairman), with the shared password
    // copied from audit.director@ubec.test.
    if (createCore && !(await db.query('SELECT 1 FROM users WHERE state_code=$1 AND active', [code])).rowCount) {
      if (!reference) throw new Error('No audit.director@ubec.test to copy the password from.');
      const workspace = subebName(state), domain = `${state.name.toLowerCase().replace(/[^a-z0-9]+/g, '.')}.subeb.test`;
      for (const account of [
        { email: `data.entry@${domain}`, name: `${workspace} Data Entry Officer`, role: 'Data Entry Staff', departments: componentDepartments },
        { email: `director@${domain}`, name: `${workspace} Director`, role: 'Director', departments: ['academic', ...componentDepartments.filter(value => value !== 'academic')] },
        { email: `beap.chair@${domain}`, name: `${workspace} BEAP Chair`, role: 'Director', departments: ['physical'], isBeapChair: true, canCreatePlan: true },
        { email: `executive.chairman@${domain}`, name: `${workspace} Executive Chairman`, role: 'Executive Chairman', departments: [] },
      ]) await add({ ...account, state: code }, reference.password_hash);
      if (!apply) { for (const [department, label] of support) for (const kind of ['director', 'data.entry']) created.push(`${workspace} ${kind === 'director' ? 'Director' : 'Data Entry'} – ${label} <${department}.${kind}@${domain}>`); continue; }
    }
    // The BEAP Chair's password, else (a state with no BEAP Chair yet) the Executive Chairman's.
    const chair = (await db.query("SELECT email, password_hash, is_beap_chair FROM users WHERE state_code=$1 AND active AND (is_beap_chair OR role='Executive Chairman') ORDER BY is_beap_chair DESC LIMIT 1", [code])).rows[0];
    if (!chair) throw new Error(`${code} has no active BEAP Chair or Executive Chairman to take the password from.`);
    if (!chair.is_beap_chair) console.log(`${code}: no active BEAP Chair, using the Executive Chairman's password.`);
    const domain = chair.email.split('@')[1];
    for (const [department, label] of support) {
      await add({ email: `${department}.director@${domain}`, name: `${subebName(state)} Director – ${label}`, role: 'Director', department, state: code }, chair.password_hash);
      await add({ email: `${department}.data.entry@${domain}`, name: `${subebName(state)} Data Entry – ${label}`, role: 'Data Entry Staff', department, state: code }, chair.password_hash);
    }
  }
  if (reference) {
    await add({ email: 'special.director@ubec.test', name: 'UBEC Director Special Programmes', role: 'UBEC Oversight Director', department: 'special', state: 'UBEC' }, reference.password_hash);
    await add({ email: 'special.officer@ubec.test', name: 'UBEC Assessment Officer – Special Programmes', role: 'UBEC Assessment Officer', department: 'special', state: 'UBEC' }, reference.password_hash);
    // UBEC212 (1 November 2026): a Debate Assessment Officer, a default officer of Sports, Quiz & Debate beside the Sports one.
    await add({ email: 'debate.officer@ubec.test', name: 'UBEC Assessment Officer – Debate', role: 'UBEC Assessment Officer', department: 'academic', state: 'UBEC' }, reference.password_hash);
    if (apply) {
      const sportsDefaults = await db.query("INSERT INTO ubec_default_officers(pillar,officer_id) SELECT 'sports',id FROM users WHERE email IN ('sports.officer@ubec.test','debate.officer@ubec.test') AND active ON CONFLICT DO NOTHING");
      if (sportsDefaults.rowCount) console.log(`Sports, Quiz & Debate default officers added: ${sportsDefaults.rowCount}`);
      // A custom Academic Services limit below its active officers would block new ones; raise it to make room.
      await db.query("UPDATE ubec_officer_limits l SET max_officers=a.n FROM (SELECT count(*)::int n FROM users WHERE active AND role='UBEC Assessment Officer' AND department='academic') a WHERE l.department='academic' AND l.max_officers<a.n");
    }
  } else console.log('No audit.director@ubec.test to copy the password from: UBEC Special Programmes accounts skipped.');
  await db.query(apply ? 'COMMIT' : 'ROLLBACK');
  console.log(`${apply ? 'Created' : 'Would create'} (${created.length}):\n${created.map(line => `  + ${line}`).join('\n')}`);
  if (kept.length) console.log(`Already present, left alone (${kept.length}):\n${kept.map(line => `  = ${line}`).join('\n')}`);
  if (!apply) console.log('\nDry run only. Re-run with --yes to apply.');
} catch (error) {
  await db.query('ROLLBACK').catch(() => undefined);
  throw error;
} finally {
  await db.end();
}
