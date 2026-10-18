import { NextRequest, NextResponse } from 'next/server';
import { compareSync, hashSync } from 'bcryptjs';
import { getPostgres } from '@/lib/postgres';
import { isSameRequestOrigin } from '@/lib/request-origin';
import { newPasswordProblem } from '@/lib/password-policy';
import { createLocalSession, readLocalSession, sessionCookieName, sessionCookieOptions, sessionLifetime } from '@/lib/local-session';
import { getAuthenticatedUser } from '@/lib/workspace-state';

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

/**
 * The signed-in user changes their own password (account menu). Other devices are signed out (session_version);
 * this browser gets a fresh cookie and stays signed in. Not available while a Super Admin acts as another user.
 */
export async function POST(request: NextRequest) {
  try {
    if (!isSameRequestOrigin(request)) return json({ error: 'This action must come from the portal' }, 403);
    const [actor, session] = await Promise.all([getAuthenticatedUser(request), readLocalSession(request)]);
    if (!actor || !session) return json({ error: 'Sign in to change your password' }, 401);
    if (request.cookies.get('ubec_impersonation')?.value) return json({ error: 'Stop acting as another user before changing your password' }, 409);
    const body = await request.json().catch(() => null) as { currentPassword?: unknown; newPassword?: unknown } | null;
    if (typeof body?.currentPassword !== 'string' || !body.currentPassword) return json({ error: 'Enter your current password', field: 'currentPassword' }, 400);
    if (typeof body.newPassword !== 'string') return json({ error: 'Enter a new password', field: 'newPassword' }, 400);
    const currentPassword = body.currentPassword, newPassword = body.newPassword;
    return await getPostgres().transaction(async db => {
      const user = (await db.query<{ password_hash: string; email: string }>('SELECT password_hash, email FROM users WHERE id = $1 AND active FOR UPDATE', [actor.userId])).rows[0];
      if (!user) return json({ error: 'Sign in to change your password' }, 401);
      if (!compareSync(currentPassword, user.password_hash)) return json({ error: 'Your current password is not correct', field: 'currentPassword' }, 400);
      const problem = newPasswordProblem(newPassword, user.email) ?? (compareSync(newPassword, user.password_hash) ? 'Choose a password different from your current one' : null);
      if (problem) return json({ error: problem, field: 'newPassword' }, 400);
      const version = (await db.query<{ session_version: number }>('UPDATE users SET password_hash = $1, session_version = session_version + 1 WHERE id = $2 RETURNING session_version', [hashSync(newPassword, 10), actor.userId])).rows[0].session_version;
      // Any reset link still open for this account stops working.
      await db.query('UPDATE password_reset_tokens SET used_at = NOW() WHERE user_id = $1 AND used_at IS NULL', [actor.userId]);
      if (session.adminSessionId) await db.query('DELETE FROM sessions WHERE user_id = $1 AND token <> $2', [actor.userId, session.adminSessionId]);
      const lifetime = sessionLifetime(session.issuedAt);
      const token = await createLocalSession({ name: session.name, role: session.role, email: session.email, sessionVersion: version, adminSessionId: session.adminSessionId }, session.issuedAt);
      const response = json({ ok: true });
      response.cookies.set(sessionCookieName, token, sessionCookieOptions(Math.max(60, Math.floor(lifetime))));
      return response;
    });
  } catch (cause) {
    console.error('Password change failed', cause);
    return json({ error: 'Your password could not be changed. Please try again.' }, 503);
  }
}
