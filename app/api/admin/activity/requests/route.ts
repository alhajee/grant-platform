import type { NextRequest } from 'next/server';
import { getPostgres } from '@/lib/postgres';
import { activityRequestsQuerySchema, clampPage } from '@/lib/admin-activity';
import { noStoreJson, requireSuperAdmin, sessionFieldsSql, sessionJoinsSql } from '@/lib/admin-activity-server';

/** Write attempts (non-GET requests) logged during one impersonation session, newest first. */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireSuperAdmin(request);
    if (auth.error) return auth.error;
    const parsed = activityRequestsQuerySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
    if (!parsed.success) return noStoreJson({ error: 'Choose a valid impersonation session.' }, 400);
    const { session: id, page, pageSize } = parsed.data;
    return await getPostgres().transaction(async db => {
      const session = (await db.query(`SELECT ${sessionFieldsSql} FROM ${sessionJoinsSql} WHERE i.id = $1`, [id])).rows[0];
      if (!session) return noStoreJson({ error: 'This impersonation session no longer exists.' }, 404);
      const total = (await db.query<{ total: number }>('SELECT COUNT(*)::int AS total FROM impersonation_requests WHERE impersonation_id = $1', [id])).rows[0]?.total ?? 0;
      const served = clampPage(page, pageSize, total);
      const items = total ? (await db.query(`SELECT id::text AS id, method, path, requested_at AS "requestedAt" FROM impersonation_requests
        WHERE impersonation_id = $1 ORDER BY requested_at DESC, id DESC LIMIT $2 OFFSET $3`, [id, pageSize, (served - 1) * pageSize])).rows : [];
      return noStoreJson({ session, items, total, page: served, pageSize });
    });
  } catch (cause) {
    console.error('admin activity requests failed', cause);
    return noStoreJson({ error: 'Unable to load write attempts.' }, 503);
  }
}
