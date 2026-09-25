import { NextRequest, NextResponse } from 'next/server';
import { getWorkspaceState } from '@/lib/workspace-state';
import { getPostgres } from '@/lib/postgres';
import { z } from 'zod';
export async function GET(request: NextRequest) {
  try {
    const user = await getWorkspaceState(request);
    if (!user) return NextResponse.json({ error: 'Sign in to continue.' }, { status: 401 });
    const notifications = await getPostgres().query(`SELECT n.id, n.plan_id AS "planId", e.action, e.actor_name AS "actorName", e.actor_role AS "actorRole", n.created_at AS "createdAt", p.start_year AS "startYear", p.end_year AS "endYear"
      FROM plan_notifications n JOIN action_plans p ON p.id = n.plan_id JOIN plan_review_events e ON e.id = n.event_id
      WHERE n.user_id = $1 AND p.state_code = $2 AND n.read_at IS NULL ORDER BY n.id DESC`, [user.userId, user.stateCode]);
    return NextResponse.json({ notifications: notifications.rows }, { headers: { 'Cache-Control': 'no-store' } });
  } catch { return NextResponse.json({ error: 'Notifications unavailable.' }, { status: 503 }); }
}
export async function POST(request: NextRequest) {
  try {
    const user = await getWorkspaceState(request);
    if (!user) return NextResponse.json({ error: 'Sign in to continue.' }, { status: 401 });
    const parsed = z.object({ planId: z.number().int().positive() }).safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'Choose a plan.' }, { status: 400 });
    const body = parsed.data;
    await getPostgres().query(`UPDATE plan_notifications n SET read_at = NOW() FROM action_plans p WHERE n.plan_id = p.id AND n.plan_id = $1 AND n.user_id = $2 AND p.state_code = $3`, [body.planId, user.userId, user.stateCode]);
    return NextResponse.json({ ok: true });
  } catch { return NextResponse.json({ error: 'Unable to update notifications.' }, { status: 503 }); }
}
