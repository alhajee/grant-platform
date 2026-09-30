import type { NextRequest } from 'next/server';
import { getPostgres } from '@/lib/postgres';
import { activityQuerySchema, clampPage, escapeLike, type ActivitySort, type SessionStatus } from '@/lib/admin-activity';
import { noStoreJson, requireSuperAdmin, sessionFieldsSql, sessionJoinsSql } from '@/lib/admin-activity-server';
import { stateCodesMatching } from '@/lib/state-names';

const statusFilters: Record<SessionStatus, string> = {
  active: 'i.ended_at IS NULL AND i.expires_at > NOW()',
  ended: 'i.ended_at IS NOT NULL',
  expired: 'i.ended_at IS NULL AND i.expires_at <= NOW()',
};
const sortColumns: Record<ActivitySort, string> = {
  started: 'i.started_at',
  admin: 'lower(i.actor_name)',
  target: 'lower(i.target_name)',
  writes: '"requestCount"',
};

/** Paginated impersonation history for the Super Admin Activity tab. */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireSuperAdmin(request);
    if (auth.error) return auth.error;
    const parsed = activityQuerySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
    if (!parsed.success) return noStoreJson({ error: 'Choose a valid status, sort column and direction.' }, 400);
    const { page, pageSize, q, status, sort, dir } = parsed.data;
    const where: string[] = [], params: unknown[] = [];
    if (status !== 'all') where.push(statusFilters[status]);
    if (q) {
      params.push(`%${escapeLike(q)}%`, stateCodesMatching(q));
      where.push(`(i.actor_name ILIKE $1 OR i.target_name ILIKE $1 OR i.target_role ILIKE $1 OR i.target_state ILIKE $1 OR a.email ILIKE $1 OR t.email ILIKE $1 OR i.target_state = ANY($2::text[]))`);
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    // One connection and one snapshot, so the count and the page agree.
    return await getPostgres().transaction(async db => {
      const total = (await db.query<{ total: number }>(`SELECT COUNT(*)::int AS total FROM ${sessionJoinsSql} ${whereSql}`, params)).rows[0]?.total ?? 0;
      const served = clampPage(page, pageSize, total);
      const items = total ? (await db.query(`SELECT ${sessionFieldsSql}, (SELECT COUNT(*)::int FROM impersonation_requests r WHERE r.impersonation_id = i.id) AS "requestCount"
        FROM ${sessionJoinsSql} ${whereSql}
        ORDER BY ${sortColumns[sort]} ${dir === 'asc' ? 'ASC' : 'DESC'}, i.started_at DESC, i.id
        LIMIT $${params.length + 1} OFFSET $${params.length + 2}`, [...params, pageSize, (served - 1) * pageSize])).rows : [];
      return noStoreJson({ items, total, page: served, pageSize });
    });
  } catch (cause) {
    console.error('admin activity list failed', cause);
    return noStoreJson({ error: 'Unable to load impersonation activity.' }, 503);
  }
}
