import { NextRequest, NextResponse } from 'next/server';
import { hashSync } from 'bcryptjs';
import { getPostgres } from '@/lib/postgres';
import { isSameRequestOrigin } from '@/lib/request-origin';
import { newPasswordProblem } from '@/lib/password-policy';
import { hashResetToken, isResetTokenShape } from '@/lib/password-reset';

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
const expired = 'This reset link has expired or was already used. Ask for a new one.';
const live = 'SELECT t.id, t.user_id AS "userId", u.email FROM password_reset_tokens t JOIN users u ON u.id = t.user_id WHERE t.token_hash = $1 AND t.used_at IS NULL AND t.expires_at > NOW() AND u.active';

/** Whether a reset link can still be used, so the page can say so before the user types a password. */
export async function GET(request: NextRequest) {
  try {
    const token = request.nextUrl.searchParams.get('token');
    if (!isResetTokenShape(token)) return json({ valid: false });
    return json({ valid: !!(await getPostgres().query(live, [hashResetToken(token)])).rowCount });
  } catch (cause) {
    console.error('Password reset check failed', cause);
    return json({ error: 'The link could not be checked. Please try again.' }, 503);
  }
}

/** Sets the new password from a reset link: the link is used up and every session of the account ends. */
export async function POST(request: NextRequest) {
  try {
    if (!isSameRequestOrigin(request)) return json({ error: 'This action must come from the portal' }, 403);
    const body = await request.json().catch(() => null) as { token?: unknown; password?: unknown } | null;
    if (!isResetTokenShape(body?.token)) return json({ error: expired }, 400);
    if (typeof body?.password !== 'string') return json({ error: 'Enter a new password' }, 400);
    const token = body.token, password = body.password;
    return await getPostgres().transaction(async db => {
      const found = (await db.query<{ id: number; userId: number; email: string }>(`${live} FOR UPDATE OF t`, [hashResetToken(token)])).rows[0];
      if (!found) return json({ error: expired }, 400);
      const problem = newPasswordProblem(password, found.email);
      if (problem) return json({ error: problem }, 400);
      await db.query('UPDATE users SET password_hash = $1, session_version = session_version + 1 WHERE id = $2', [hashSync(password, 10), found.userId]);
      await db.query('UPDATE password_reset_tokens SET used_at = NOW() WHERE user_id = $1 AND used_at IS NULL', [found.userId]);
      // Super Admin sign-ins also have a server-side session row.
      await db.query('DELETE FROM sessions WHERE user_id = $1', [found.userId]);
      return json({ ok: true });
    });
  } catch (cause) {
    console.error('Password reset failed', cause);
    return json({ error: 'The password could not be changed. Please try again.' }, 503);
  }
}
