import { NextRequest, NextResponse } from 'next/server';
import { getWorkspaceState } from '@/lib/workspace-state';
import { getPostgres } from '@/lib/postgres';
import { z } from 'zod';
// Opening a plan's review marks its notifications as read; the bell reads /api/notifications.
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
