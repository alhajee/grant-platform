import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getPostgres } from '@/lib/postgres';
import { getWorkspaceState } from '@/lib/workspace-state';
import { isSameRequestOrigin } from '@/lib/request-origin';
import { subebRoles } from '@/lib/subeb-access';
import { planPeriod } from '@/lib/action-plans';
import { pendingActionsFor, type PillarReviewRow } from '@/lib/pending-actions';
import { unfundedComponents } from '@/lib/unfunded-components';
import { planSetupFields } from '@/lib/plan-workspace';
import type { EnvelopePlan } from '@/lib/funding-policy';
import { NOTIFICATION_PAGE_SIZE, type NotificationFeed, type NotificationItem, type NotificationTodo } from '@/lib/notifications';

const error = (message: string, status = 400) => NextResponse.json({ error: message }, { status });
const noStore = { 'Cache-Control': 'no-store' };
const markRead = z.union([z.object({ ids: z.array(z.number().int().positive()).min(1).max(100) }).strict(), z.object({ all: z.literal(true) }).strict()]);

// State notifications only count while they belong to the viewer's own state;
// UBEC notifications (and the observation requests that state events send to UBEC users) span every state.
const visible = `n.user_id = $1 AND (n.ubec_event_id IS NOT NULL OR p.state_code = $2 OR $2 = 'UBEC')`;

async function readTodos(workspace: { stateCode: string; role: string; departments: string[]; isBeapChair: boolean }): Promise<NotificationTodo[]> {
  if (!(subebRoles as readonly string[]).includes(workspace.role)) return [];
  const db = getPostgres();
  const [plans, reviews] = await Promise.all([
    // UBEC239: the setup and item counts say which components the budget split leaves unfunded (no todos for them).
    db.query<EnvelopePlan & { id: number; status: string; startYear: number; endYear: number; fundingQuarters: number[] | null; counts: Record<string, number> }>(`SELECT p.id, p.status, p.start_year AS "startYear", p.end_year AS "endYear", ${planSetupFields('p')},
      jsonb_build_object('infrastructure', (SELECT COUNT(*)::int FROM infrastructure_packages WHERE plan_id=p.id)) || COALESCE((SELECT jsonb_object_agg(workstream, n) FROM (SELECT workstream, COUNT(*)::int AS n FROM activity_plan_lines WHERE plan_id=p.id AND workstream IN ('tlm','teachers','ict') GROUP BY workstream) counted), '{}'::jsonb) AS counts
      FROM action_plans p WHERE p.state_code = $1 ORDER BY p.workflow_updated_at DESC NULLS LAST, p.id DESC`, [workspace.stateCode]),
    db.query<PillarReviewRow>('SELECT r.plan_id, r.pillar, r.status FROM plan_pillar_reviews r JOIN action_plans p ON p.id = r.plan_id WHERE p.state_code = $1', [workspace.stateCode]),
  ]);
  return plans.rows.flatMap(plan => pendingActionsFor(workspace, plan, reviews.rows, unfundedComponents(plan, side => plan.counts[side] ?? 0)).map(action => ({ ...action, planId: plan.id, period: `${planPeriod(plan)} BEAP` })));
}

export async function GET(request: NextRequest) {
  try {
    const workspace = await getWorkspaceState(request);
    if (!workspace) return error('Sign in to continue', 401);
    const db = getPostgres();
    const [items, unread, todos] = await Promise.all([
      db.query<NotificationItem>(`SELECT n.id, n.plan_id AS "planId", n.event_id AS "eventId", CASE WHEN n.ubec_event_id IS NULL THEN 'state' ELSE 'ubec' END AS source,
          COALESCE(e.action, u.action) AS action, COALESCE(e.scope, u.pillar) AS scope, COALESCE(e.actor_name, u.actor) AS "actorName", COALESCE(e.actor_role, actor.role, '') AS "actorRole",
          COALESCE(e.comment, u.comment, '') AS comment, p.state_code AS "stateCode", p.start_year AS "startYear", p.end_year AS "endYear",
          p.funding_quarters AS "fundingQuarters", n.created_at AS "createdAt", n.read_at AS "readAt"
        FROM plan_notifications n JOIN action_plans p ON p.id = n.plan_id
        LEFT JOIN plan_review_events e ON e.id = n.event_id
        LEFT JOIN ubec_events u ON u.id = n.ubec_event_id LEFT JOIN users actor ON actor.id = u.actor_id
        WHERE ${visible} ORDER BY n.id DESC LIMIT ${NOTIFICATION_PAGE_SIZE}`, [workspace.userId, workspace.stateCode]),
      db.query<{ count: number }>(`SELECT COUNT(*)::int AS count FROM plan_notifications n JOIN action_plans p ON p.id = n.plan_id WHERE ${visible} AND n.read_at IS NULL`, [workspace.userId, workspace.stateCode]),
      readTodos(workspace),
    ]);
    const feed: NotificationFeed = { notifications: items.rows, unreadCount: unread.rows[0].count, todos };
    return NextResponse.json(feed, { headers: noStore });
  } catch (cause) { console.error('Notifications could not be loaded', cause); return error('Notifications are unavailable right now', 503); }
}

export async function PATCH(request: NextRequest) {
  try {
    if (!isSameRequestOrigin(request)) return error('This request must come from the portal', 403);
    const workspace = await getWorkspaceState(request);
    if (!workspace) return error('Sign in to continue', 401);
    const parsed = markRead.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return error('Choose notifications to mark as read');
    const ids = 'ids' in parsed.data ? parsed.data.ids : null;
    await getPostgres().query(`UPDATE plan_notifications n SET read_at = NOW() FROM action_plans p
      WHERE p.id = n.plan_id AND ${visible} AND n.read_at IS NULL ${ids ? 'AND n.id = ANY($3::int[])' : ''}`, ids ? [workspace.userId, workspace.stateCode, ids] : [workspace.userId, workspace.stateCode]);
    return NextResponse.json({ ok: true });
  } catch (cause) { console.error('Notifications could not be updated', cause); return error('Unable to update notifications. Please try again.', 503); }
}
