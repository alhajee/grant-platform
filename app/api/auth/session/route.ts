import { NextRequest, NextResponse } from "next/server";
import { createLocalSession, readLocalSession, sessionCookieName, sessionCookieOptions, sessionLifetime } from "@/lib/local-session";
import { getPostgres } from "@/lib/postgres";
import { isSameRequestOrigin } from "@/lib/request-origin";
import { getAuthenticatedUser, getWorkspaceState, sessionBinding } from "@/lib/workspace-state";

export async function GET(request: NextRequest) {
  try {
    const user = await getWorkspaceState(request);
    if(!user)return NextResponse.json({error:'Session expired.'},{status:401,headers:{'Cache-Control':'no-store'}});
    const {adminSessionId: _privateSession,...publicUser}=user;
    return NextResponse.json({user:publicUser},{headers:{'Cache-Control':'no-store'}});
  } catch (cause) {
    console.error("Session lookup failed", cause);
    return NextResponse.json({ error: "The local database is unavailable." }, { status: 503 });
  }
}

/**
 * Renews the session while the portal is in use (components/session-keepalive.tsx): a fresh cookie that expires
 * after the idle limit, never past the absolute limit from sign-in. The Super Admin session row and any running
 * impersonation (bound to the cookie) move with it; impersonation then lasts an hour from the last activity.
 */
export async function POST(request: NextRequest) {
  try {
    if (!isSameRequestOrigin(request)) return NextResponse.json({ error: 'Cross-site request refused.' }, { status: 403 });
    const [actor, session] = await Promise.all([getAuthenticatedUser(request), readLocalSession(request)]);
    if (!actor || !session) return NextResponse.json({ error: 'Session expired.' }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
    const lifetime = sessionLifetime(session.issuedAt);
    if (lifetime < 60) return NextResponse.json({ error: 'Session expired.' }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
    const oldBinding = await sessionBinding(request);
    const token = await createLocalSession({ name: session.name, role: session.role, email: session.email, sessionVersion: session.sessionVersion, adminSessionId: session.adminSessionId }, session.issuedAt);
    const newBinding = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))), b => b.toString(16).padStart(2, '0')).join('');
    const db = getPostgres();
    if (session.adminSessionId) await db.query('UPDATE sessions SET expires_at=NOW()+make_interval(secs=>$3) WHERE token=$1 AND user_id=$2', [session.adminSessionId, actor.userId, Math.round(lifetime)]);
    // Impersonation keeps its one-hour limit, counted from the last activity rather than from the start.
    await db.query("UPDATE impersonation_sessions SET session_binding=$3, expires_at=GREATEST(expires_at, NOW()+INTERVAL '1 hour') WHERE actor_id=$1 AND session_binding=$2 AND ended_at IS NULL AND expires_at>NOW()", [actor.userId, oldBinding, newBinding]);
    const response = NextResponse.json({ expiresAt: new Date(Date.now() + lifetime * 1000).toISOString() }, { headers: { 'Cache-Control': 'no-store' } });
    response.cookies.set(sessionCookieName, token, sessionCookieOptions(Math.floor(lifetime)));
    return response;
  } catch (cause) {
    console.error('Session renewal failed', cause);
    return NextResponse.json({ error: 'The local database is unavailable.' }, { status: 503 });
  }
}
