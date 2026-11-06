// UBEC226: gives every active account (SUBEB and UBEC; never a Super Admin) its own strong random password and writes the
// new login details to an .xlsx for the administrator to share securely. Everyone it changes is signed out (session
// version bumped, current sign-in cleared, Super Admin session rows dropped) and any open reset link is voided. One
// transaction; the workbook is written first and the change is committed only once it is safely on disk (mode 0600).
// Passwords are never printed. Copied into the production image (/app/scripts) like the seed scripts.
//
//   node --env-file=.env scripts/randomize-passwords.mjs                                   # dry run: lists who would change
//   node --env-file=.env scripts/randomize-passwords.mjs --yes --out=/secure/logins.xlsx   # applies (local database)
//   node scripts/randomize-passwords.mjs --yes --production-confirmed --out=/tmp/logins.xlsx   # any database: back it up first!
// Options: --emails=a@x,b@y limits it to those accounts (for checks); --states=YO,KN limits it to those workspaces (UBEC for UBEC).
// --out is required with --yes, must end in .xlsx, must not exist yet and must be outside the application folder.
import { randomInt } from 'node:crypto';
import { existsSync, rmSync } from 'node:fs';
import { chmod } from 'node:fs/promises';
import { dirname, relative, resolve, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import bcrypt from 'bcryptjs';
import ExcelJS from 'exceljs';

/** No look-alikes (0/O, 1/l/I); 14 characters, at least one lower-case and upper-case letter and one digit (≈80 bits). */
const alphabet = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const passwordLength = 14;
/** Mirrors lib/password-policy.ts (10-128 characters, a letter and a number, not the email): the script must run without TypeScript. */
export const meetsPolicy = (password, email = '') => password.length >= 10 && password.length <= 128 && /[A-Za-z]/.test(password) && /\d/.test(password) && password.toLowerCase() !== email.trim().toLowerCase();
export function randomPassword(email = '') {
  for (;;) {
    const password = Array.from({ length: passwordLength }, () => alphabet[randomInt(alphabet.length)]).join('');
    if (/[a-z]/.test(password) && /[A-Z]/.test(password) && /\d/.test(password) && meetsPolicy(password, email)) return password;
  }
}

const args = process.argv.slice(2);
const option = name => args.find(arg => arg.startsWith(`--${name}=`))?.slice(name.length + 3) ?? null;
const list = value => value ? value.split(',').map(item => item.trim()).filter(Boolean) : null;

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is required.');
  const apply = args.includes('--yes'), productionConfirmed = args.includes('--production-confirmed');
  const host = new URL(connectionString).hostname;
  if (!['localhost', '127.0.0.1', '::1'].includes(host) && !productionConfirmed) { console.error(`Refusing to run against ${host}: pass --production-confirmed (after taking a backup) for a non-local database.`); process.exit(1); }
  const emails = list(option('emails'))?.map(email => email.toLowerCase()) ?? null, states = list(option('states'))?.map(code => code.toUpperCase()) ?? null;

  let out = null;
  if (apply) {
    const given = option('out');
    if (!given) { console.error('Pass --out=/path/outside/the/app/logins.xlsx: the new passwords are written only there.'); process.exit(1); }
    out = resolve(given);
    const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..'), inside = relative(appRoot, out);
    if (!inside.startsWith('..') && !isAbsolute(inside)) { console.error(`Refusing to write passwords inside the application folder (${appRoot}). Choose a path outside it.`); process.exit(1); }
    if (!out.toLowerCase().endsWith('.xlsx')) { console.error('--out must end in .xlsx'); process.exit(1); }
    if (existsSync(out)) { console.error(`${out} already exists. Choose a new file name.`); process.exit(1); }
  }

  const db = new pg.Client({ connectionString });
  await db.connect();
  try {
    await db.query('BEGIN');
    // Serialises with user changes made in the portal (Admin > Users, /users, /ubec/team).
    await db.query("SELECT pg_advisory_xact_lock(hashtext('admin:user-management'))");
    const accounts = (await db.query(`SELECT u.id, u.full_name, u.email, u.role, u.is_beap_chair, u.state_code, u.role_title,
        COALESCE((SELECT string_agg(ud.department, ', ' ORDER BY ud.department) FROM user_departments ud WHERE ud.user_id=u.id), u.department, '') AS departments
      FROM users u WHERE u.active AND u.role <> 'Super Admin' AND u.deleted_at IS NULL
        AND ($1::text[] IS NULL OR lower(u.email) = ANY($1::text[])) AND ($2::text[] IS NULL OR u.state_code = ANY($2::text[]))
      ORDER BY (u.state_code = 'UBEC') DESC, u.state_code, u.role, u.full_name, u.id FOR UPDATE OF u`, [emails, states])).rows;
    if (emails) for (const email of emails) if (!accounts.some(a => a.email.toLowerCase() === email)) console.warn(`Not changed (no active non-Super Admin account): ${email}`);
    const role = account => account.is_beap_chair ? `${account.role} (BEAP Chair)` : account.role;
    console.log(`${apply ? 'Changing' : 'Would change'} the passwords of ${accounts.length} active accounts (Super Admins are never changed):`);
    const byWorkspace = accounts.reduce((counts, a) => ({ ...counts, [a.state_code]: (counts[a.state_code] ?? 0) + 1 }), {});
    console.log(Object.entries(byWorkspace).map(([code, n]) => `  ${code}: ${n}`).join('\n') || '  (none)');
    if (!apply) {
      for (const a of accounts) console.log(`  ${a.state_code.padEnd(5)} ${role(a).padEnd(36)} ${a.email}`);
      console.log('Dry run: nothing changed. Add --yes --out=<file.xlsx> to apply.');
      await db.query('ROLLBACK');
      return;
    }
    if (!accounts.length) { await db.query('ROLLBACK'); console.log('Nothing to change.'); return; }

    const rows = [];
    for (const account of accounts) {
      const password = randomPassword(account.email);
      if (!meetsPolicy(password, account.email)) throw new Error('A generated password broke the password rules');
      await db.query('UPDATE users SET password_hash=$1, session_version=session_version+1, current_session_id=NULL WHERE id=$2', [bcrypt.hashSync(password, 10), account.id]);
      rows.push({ state: account.state_code, role: role(account), roleName: account.role_title ?? '', department: account.departments, name: account.full_name, email: account.email, password });
    }
    const ids = accounts.map(a => a.id);
    await db.query('DELETE FROM sessions WHERE user_id = ANY($1::int[])', [ids]);
    await db.query('UPDATE password_reset_tokens SET used_at = NOW() WHERE user_id = ANY($1::int[]) AND used_at IS NULL', [ids]);

    const book = new ExcelJS.Workbook();
    book.creator = 'BEAPMS';
    const sheet = book.addWorksheet('Login details');
    sheet.columns = [
      { header: 'State', key: 'state', width: 8 }, { header: 'Role', key: 'role', width: 32 }, { header: 'Role name', key: 'roleName', width: 30 },
      { header: 'Department', key: 'department', width: 40 }, { header: 'Full name', key: 'name', width: 36 }, { header: 'Email', key: 'email', width: 42 }, { header: 'Password', key: 'password', width: 20 },
    ];
    sheet.getRow(1).font = { bold: true };
    sheet.views = [{ state: 'frozen', ySplit: 1 }];
    sheet.autoFilter = { from: 'A1', to: 'G1' };
    sheet.addRows(rows);
    try {
      await book.xlsx.writeFile(out);
      await chmod(out, 0o600);
    } catch (cause) {
      await db.query('ROLLBACK');
      if (existsSync(out)) rmSync(out);
      throw new Error(`The workbook could not be written, so no password was changed: ${cause instanceof Error ? cause.message : cause}`);
    }
    try { await db.query('COMMIT'); } catch (cause) { rmSync(out, { force: true }); throw cause; }
    console.log(`Done: ${rows.length} passwords changed and everyone signed out. Login details written to ${out} (readable by you only). Share it securely and delete it afterwards.`);
  } catch (cause) {
    await db.query('ROLLBACK').catch(() => {});
    throw cause;
  } finally {
    await db.end();
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(cause => { console.error(cause instanceof Error ? cause.message : cause); process.exit(1); });
}
