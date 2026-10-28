// Support and oversight accounts (UBEC169/183, 28 October 2026): for each chosen SUBEB, a Director and a Data Entry
// Officer for Procurement, Finance and Special Programmes; on the UBEC side a Special Programmes Oversight Director and
// Assessment Officer. Each new SUBEB account gets the password of that state's BEAP Chair account, and each UBEC one the
// password of audit.director@ubec.test (the hash is copied, nothing is printed), so the agreed shared password works
// without SEED_SHARED_PASSWORD. Accounts that already exist are left alone; nothing is deleted or deactivated.
// Usage: node --env-file=.env scripts/seed-support-accounts.mjs --states=BO,BY,KT,KW,OG [--yes] [--production-confirmed]
import { readFile } from 'node:fs/promises';
import { Client } from 'pg';

const args = process.argv.slice(2), apply = args.includes('--yes');
const wanted = (args.find(arg => arg.startsWith('--states='))?.slice(9) ?? '').split(',').map(code => code.trim().toUpperCase()).filter(Boolean);
const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL is required.');
const host = new URL(connectionString).hostname;
if (!['localhost', '127.0.0.1', '::1'].includes(host) && !args.includes('--production-confirmed')) throw new Error(`Refusing to write to ${host} without --production-confirmed.`);
const states = JSON.parse(await readFile(new URL('../lib/nigeria-map.json', import.meta.url), 'utf8'));
const support = [['procurement', 'Procurement'], ['finance', 'Finance'], ['special', 'Special Programmes']];
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
    const id = (await db.query('INSERT INTO users(email,full_name,role,department,state_code,password_hash,active) VALUES($1,$2,$3,$4,$5,$6,TRUE) RETURNING id', [account.email, account.name, account.role, account.department, account.state, hash])).rows[0].id;
    await db.query('INSERT INTO user_departments(user_id,department) VALUES($1,$2)', [id, account.department]);
  };
  for (const code of wanted) {
    const state = states.find(item => item.code === code);
    if (!state) throw new Error(`Unknown state code ${code}.`);
    const chair = (await db.query("SELECT email, password_hash FROM users WHERE state_code=$1 AND is_beap_chair AND active LIMIT 1", [code])).rows[0];
    if (!chair) throw new Error(`${code} has no active BEAP Chair to take the password from.`);
    const domain = chair.email.split('@')[1];
    for (const [department, label] of support) {
      await add({ email: `${department}.director@${domain}`, name: `${subebName(state)} Director – ${label}`, role: 'Director', department, state: code }, chair.password_hash);
      await add({ email: `${department}.data.entry@${domain}`, name: `${subebName(state)} Data Entry – ${label}`, role: 'Data Entry Staff', department, state: code }, chair.password_hash);
    }
  }
  const reference = (await db.query("SELECT password_hash FROM users WHERE email='audit.director@ubec.test'")).rows[0];
  if (reference) {
    await add({ email: 'special.director@ubec.test', name: 'UBEC Director Special Programmes', role: 'UBEC Oversight Director', department: 'special', state: 'UBEC' }, reference.password_hash);
    await add({ email: 'special.officer@ubec.test', name: 'UBEC Assessment Officer – Special Programmes', role: 'UBEC Assessment Officer', department: 'special', state: 'UBEC' }, reference.password_hash);
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
