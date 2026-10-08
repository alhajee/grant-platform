// One Data Entry account per component for chosen SUBEBs, next to the state's existing Director, BEAP Chair and
// Executive Chairman (scripts/seed-production-users.mjs). Each account gets the component's SUBEB department
// (access is per department, so e.g. the four Academic Services accounts can all edit Sports, TLM, Curriculum and
// Greening). Accounts that already exist are left alone, so re-runs only add what is missing.
// Usage: node --env-file=.env scripts/seed-component-data-entry.mjs --states=DE,FC,BY [--yes] [--production-confirmed]
// Without --yes it only prints what it would do. Needs SEED_SHARED_PASSWORD (never printed).
import { readFile } from 'node:fs/promises';
import { Client } from 'pg';
import bcrypt from 'bcryptjs';

const args = process.argv.slice(2);
const apply = args.includes('--yes');
const wanted = (args.find(arg => arg.startsWith('--states='))?.slice(9) ?? '').split(',').map(code => code.trim().toUpperCase()).filter(Boolean);
const connectionString = process.env.DATABASE_URL;
const password = process.env.SEED_SHARED_PASSWORD?.trim();
if (!connectionString) throw new Error('DATABASE_URL is required.');
if (!wanted.length) throw new Error('Choose the states, e.g. --states=DE,FC,BY');
if (apply && !password) throw new Error('SEED_SHARED_PASSWORD is required so the accounts get the agreed shared password.');
const host = new URL(connectionString).hostname;
if (!['localhost', '127.0.0.1', '::1'].includes(host) && !args.includes('--production-confirmed')) throw new Error(`Refusing to write to ${host} without --production-confirmed.`);

// Component -> SUBEB department (componentSections in lib/beap-pillars.ts).
const components = [
  ['infrastructure', 'Infrastructure', 'physical'], ['monitoring', 'Supervision & Monitoring', 'physical'],
  ['sports', 'Sports', 'academic'], ['tlm', 'TLM', 'academic'], ['curriculum', 'Curriculum', 'academic'], ['gscci', 'Greening', 'academic'],
  ['quality', 'Quality Assurance', 'me'], ['teachers', 'Teacher Development', 'teachers'], ['ict', 'ICT', 'ict'],
  ['sbmc', 'SBMC', 'social'], ['planning', 'Planning', 'planning'],
];
const states = JSON.parse(await readFile(new URL('../lib/nigeria-map.json', import.meta.url), 'utf8'));
const subebName = state => state.code === 'FC' ? 'FCT UBEB' : `${state.name.toUpperCase()} SUBEB`;

const db = new Client({ connectionString, connectionTimeoutMillis: 5000 });
await db.connect();
try {
  await db.query('BEGIN');
  await db.query("SELECT pg_advisory_xact_lock(hashtext('admin:user-management'))");
  const hash = apply ? bcrypt.hashSync(password, 12) : '';
  const created = [], kept = [];
  for (const code of wanted) {
    const state = states.find(item => item.code === code);
    if (!state) throw new Error(`Unknown state code ${code}.`);
    // The state's existing seeded domain (e.g. fct.subeb.test), so new accounts sit beside the current ones.
    const existing = (await db.query("SELECT email FROM users WHERE state_code=$1 AND email LIKE 'data.entry@%' LIMIT 1", [code])).rows[0]?.email;
    const domain = existing ? existing.split('@')[1] : `${state.name.toLowerCase().replace(/[^a-z0-9]+/g, '.')}.subeb.test`;
    for (const [key, label, department] of components) {
      const email = `${key}.data.entry@${domain}`, name = `${subebName(state)} Data Entry – ${label}`;
      const found = (await db.query('SELECT id, role FROM users WHERE email=$1', [email])).rows[0];
      if (found) { kept.push(`${name} <${email}>`); continue; }
      created.push(`${name} <${email}> · ${department}`);
      if (!apply) continue;
      const id = (await db.query(
        `INSERT INTO users(email,full_name,role,department,state_code,password_hash,active) VALUES($1,$2,'Data Entry Staff',$3,$4,$5,TRUE) RETURNING id`,
        [email, name, department, code, hash])).rows[0].id;
      await db.query('INSERT INTO user_departments(user_id,department) VALUES($1,$2)', [id, department]);
    }
  }
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
