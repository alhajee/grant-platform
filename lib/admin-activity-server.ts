import { NextResponse, type NextRequest } from 'next/server';
import { getAuthenticatedUser } from '@/lib/workspace-state';

export const noStoreJson = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

/** Same checks as /api/admin/impersonation: 401 when signed out, 403 for anyone but the Super Admin. */
export async function requireSuperAdmin(request: NextRequest) {
  const actor = await getAuthenticatedUser(request);
  if (!actor) return { error: noStoreJson({ error: 'Sign in to continue.' }, 401) };
  if (actor.role !== 'Super Admin') return { error: noStoreJson({ error: 'Super-admin access required.' }, 403) };
  return { actor };
}

// Session columns shared by the list and the write-attempt detail. Expects aliases i (session), a (admin user), t (target user).
export const sessionStatusSql = "CASE WHEN i.ended_at IS NOT NULL THEN 'ended' WHEN i.expires_at <= NOW() THEN 'expired' ELSE 'active' END";
export const sessionFieldsSql = `i.id, i.actor_name AS "adminName", a.email AS "adminEmail", i.target_name AS "targetName", t.email AS "targetEmail",
  i.target_role AS role, i.target_state AS "stateCode", i.started_at AS "startedAt", i.ended_at AS "endedAt", i.expires_at AS "expiresAt",
  i.end_reason AS "endReason", ${sessionStatusSql} AS status`;
export const sessionJoinsSql = 'impersonation_sessions i LEFT JOIN users a ON a.id = i.actor_id LEFT JOIN users t ON t.id = i.target_id';
