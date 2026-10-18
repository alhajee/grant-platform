import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getPostgres } from '@/lib/postgres';
import { isSameRequestOrigin } from '@/lib/request-origin';
import { mailConfigured, sendMail } from '@/lib/mailer';
import { appBaseUrl, hashResetToken, newResetToken, resetEmail, resetRequestsPerHour, resetTokenMinutes } from '@/lib/password-reset';

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
const input = z.object({ email: z.string().trim().toLowerCase().email().max(254) });
const requestIp = (request: NextRequest) => request.headers.get('x-forwarded-for')?.split(',')[0]?.trim().slice(0, 64) ?? '';

/**
 * "Forgot password": emails a one-time reset link (lib/password-reset.ts). The reply is the same whether or not an
 * account uses the address, so it cannot be used to find accounts. `emailReady` says whether email is set up yet.
 */
export async function POST(request: NextRequest) {
  try {
    if (!isSameRequestOrigin(request)) return json({ error: 'This action must come from the portal' }, 403);
    const parsed = input.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return json({ error: 'Enter your email address' }, 400);
    const reply = json({ ok: true, emailReady: mailConfigured() });
    const db = getPostgres(), ip = requestIp(request);
    const user = (await db.query<{ id: number; full_name: string }>('SELECT id, full_name FROM users WHERE email=$1 AND active', [parsed.data.email])).rows[0];
    if (!user) return reply;
    const recent = (await db.query<{ account: number; address: number }>(
      "SELECT COUNT(*) FILTER (WHERE user_id=$1)::int AS account, COUNT(*) FILTER (WHERE $2 <> '' AND requested_ip=$2)::int AS address FROM password_reset_tokens WHERE created_at > NOW() - INTERVAL '1 hour'", [user.id, ip])).rows[0];
    if (recent.account >= resetRequestsPerHour.account || recent.address >= resetRequestsPerHour.address) return reply;
    const base = appBaseUrl(request.nextUrl.origin);
    if (!base) { console.error('Password reset link not sent: set APP_URL to the portal address'); return reply; }
    const token = newResetToken();
    await db.transaction(async tx => {
      // A new link replaces any earlier one that was not used.
      await tx.query('UPDATE password_reset_tokens SET used_at=NOW() WHERE user_id=$1 AND used_at IS NULL', [user.id]);
      await tx.query("INSERT INTO password_reset_tokens(user_id, token_hash, expires_at, requested_ip) VALUES($1, $2, NOW() + make_interval(mins => $3), $4)", [user.id, hashResetToken(token), resetTokenMinutes, ip]);
    });
    await sendMail({ to: parsed.data.email, ...resetEmail(user.full_name, `${base}/reset-password?token=${token}`, base) });
    return reply;
  } catch (cause) {
    console.error('Password reset request failed', cause);
    return json({ error: 'The request could not be completed. Please try again.' }, 503);
  }
}
