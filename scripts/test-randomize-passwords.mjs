// UBEC226: scripts/randomize-passwords.mjs, run only on throwaway accounts (--emails=), never on everyone.
// Usage: node --env-file=.env scripts/test-randomize-passwords.mjs [baseUrl]   (local only; cleans up)
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, statSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from 'pg';
import bcrypt from 'bcryptjs';
import ExcelJS from 'exceljs';
import { newPasswordProblem } from '../lib/password-policy.ts';
import { randomPassword } from './randomize-passwords.mjs';

const base = process.argv[2] ?? process.env.TEST_BASE_URL ?? process.env.UBEC_TEST_URL ?? 'http://localhost:5173';
assert.match(base, /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/, 'Run this test against a local server only.');
assert.ok(['localhost', '127.0.0.1'].includes(new URL(process.env.DATABASE_URL).hostname), 'Use a local database only.');
const state = `RP${randomUUID().slice(0, 6).toUpperCase()}`, marker = randomUUID().slice(0, 8), oldPassword = randomUUID();
const db = new Client({ connectionString: process.env.DATABASE_URL });
const users = {}, emails = {}, cookies = {};
const dir = mkdtempSync(join(tmpdir(), 'beapms-passwords-'));
const step = message => console.log('✓', message);
const run = (...extra) => {
  try { return { code: 0, out: execFileSync(process.execPath, ['scripts/randomize-passwords.mjs', ...extra], { env: process.env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }) }; }
  catch (cause) { return { code: cause.status, out: `${cause.stdout}${cause.stderr}` }; }
};
async function login(who, password) {
  const response = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { Origin: base, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: emails[who], password }) });
  if (response.ok) cookies[who] = response.headers.get('set-cookie').split(';')[0];
  return response.status;
}
const session = async who => (await fetch(`${base}/api/auth/session`, { headers: { Cookie: cookies[who] ?? '' } })).status;

await db.connect();
try {
  for (const [who, role, department] of [['clerk', 'Data Entry Staff', 'physical'], ['chair', 'Director', 'academic'], ['admin', 'Super Admin', null], ['inactive', 'Data Entry Staff', 'social']]) {
    emails[who] = `${who}.${marker}@randomize.test`;
    users[who] = (await db.query('INSERT INTO users(email,full_name,role,department,state_code,password_hash,active) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id', [emails[who], `QA ${who}`, role, department, role === 'Super Admin' ? 'UBEC' : state, bcrypt.hashSync(oldPassword, 4), who !== 'inactive'])).rows[0].id;
    if (department) await db.query('INSERT INTO user_departments(user_id,department) VALUES($1,$2)', [users[who], department]);
  }
  await db.query("INSERT INTO password_reset_tokens(user_id,token_hash,expires_at) VALUES($1,$2,NOW()+interval '1 hour')", [users.clerk, randomUUID().replace(/-/g, "").repeat(2)]);
  assert.equal(await login('clerk', oldPassword), 200); assert.equal(await session('clerk'), 200);
  const filter = `--emails=${Object.values(emails).join(',')}`;

  for (let i = 0; i < 200; i++) { const p = randomPassword('x@y.z'); assert.equal(p.length, 14); assert.equal(newPasswordProblem(p, 'x@y.z'), null); assert.doesNotMatch(p, /[0O1lI]/); }
  step('generated passwords: 14 characters, upper, lower and a digit, no look-alikes, pass lib/password-policy.ts');

  const dry = run(filter);
  assert.equal(dry.code, 0, dry.out); assert.match(dry.out, /Would change the passwords of 2 active accounts/); assert.match(dry.out, /Dry run: nothing changed/);
  assert.ok(!dry.out.includes(emails.admin) && !dry.out.includes(emails.inactive), 'Super Admins and inactive accounts are left out');
  assert.equal(await login('clerk', oldPassword), 200);
  step('dry run lists the accounts and changes nothing');

  assert.equal(run(filter, '--yes').code, 1);
  assert.match(run(filter, '--yes', '--out=output/logins.xlsx').out, /inside the application folder/);
  assert.match(run(filter, '--yes', `--out=${join(dir, 'logins.csv')}`).out, /must end in \.xlsx/);
  step('--yes needs --out, an .xlsx outside the application folder');

  const before = (await db.query('SELECT id, session_version FROM users WHERE id=ANY($1::int[]) ORDER BY id', [Object.values(users)])).rows;
  const out = join(dir, 'logins.xlsx');
  const applied = run(filter, '--yes', `--out=${out}`);
  assert.equal(applied.code, 0, applied.out);
  assert.equal(statSync(out).mode & 0o777, 0o600, 'readable by the owner only');
  const book = new ExcelJS.Workbook(); await book.xlsx.readFile(out);
  const sheet = book.getWorksheet('Login details');
  assert.deepEqual(sheet.getRow(1).values.slice(1), ['State', 'Role', 'Role name', 'Department', 'Full name', 'Email', 'Password']);
  const rows = sheet.getSheetValues().slice(2).filter(Boolean).map(r => ({ email: r[6], password: r[7], role: r[2], state: r[1] }));
  assert.deepEqual(rows.map(r => r.email).sort(), [emails.chair, emails.clerk].sort());
  for (const r of rows) { assert.equal(newPasswordProblem(r.password, r.email), null); assert.ok(!applied.out.includes(r.password), 'never printed'); }
  const after = (await db.query('SELECT id, session_version, current_session_id FROM users WHERE id=ANY($1::int[]) ORDER BY id', [Object.values(users)])).rows;
  for (const [i, row] of after.entries()) {
    const changed = row.id === users.clerk || row.id === users.chair;
    assert.equal(row.session_version, before[i].session_version + (changed ? 1 : 0));
    if (changed) assert.equal(row.current_session_id, null);
  }
  assert.equal(await session('clerk'), 401, 'signed out');
  assert.equal(await login('clerk', oldPassword), 401, 'the old password no longer works');
  assert.equal(await login('clerk', rows.find(r => r.email === emails.clerk).password), 200, 'the new one does');
  assert.equal(await login('admin', oldPassword), 200, 'Super Admins keep theirs');
  assert.ok((await db.query('SELECT used_at FROM password_reset_tokens WHERE user_id=$1', [users.clerk])).rows[0].used_at, 'reset links voided');
  assert.match(run(filter, '--yes', `--out=${out}`).out, /already exists/);
  step('--yes changes each password, signs everyone out, voids reset links and writes the workbook (0600); Super Admins and inactive accounts are untouched; passwords are never printed');
  console.log('PASS: randomize passwords (UBEC226)');
} finally {
  const ids = Object.values(users);
  await db.query('DELETE FROM password_reset_tokens WHERE user_id=ANY($1::int[])', [ids]);
  await db.query('DELETE FROM sessions WHERE user_id=ANY($1::int[])', [ids]).catch(() => {});
  await db.query('DELETE FROM user_departments WHERE user_id=ANY($1::int[])', [ids]);
  await db.query('DELETE FROM users WHERE id=ANY($1::int[])', [ids]);
  await db.end();
  if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
}
