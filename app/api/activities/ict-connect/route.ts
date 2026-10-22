import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getWorkspaceState } from '@/lib/workspace-state';
import { resolveActionPlan } from '@/lib/plan-workspace';
import { mutatePlan } from '@/lib/plan-mutations';
import { isSameRequestOrigin } from '@/lib/request-origin';

// ICT: does the state already have UBEC-SUBEB Connect? (action_plans.ict_connect, migration 070, UBEC123). 'has' waives
// the required "Maintenance of UBEC-SUBEB Connect" activity once a UBEC HQ waiver is attached (component_documents,
// kind 'connect_waiver'); 'needs' keeps it required. Whoever may edit ICT answers while the plan is open.
const error = (message: string, status = 400) => NextResponse.json({ error: message }, { status, headers: { 'Cache-Control': 'no-store' } });
const body = z.object({ status: z.enum(['has', 'needs']) }).strict();

export async function PATCH(req: NextRequest) {
  try {
    if (!isSameRequestOrigin(req)) return error('This request must come from the BEAPMS portal', 403);
    const user = await getWorkspaceState(req); if (!user) return error('Sign in to continue', 401);
    const plan = await resolveActionPlan(req, user.stateCode); if (!plan) return error('Plan not found', 404);
    const parsed = body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return error('Say whether the state already has UBEC-SUBEB Connect');
    return await mutatePlan(user, plan, 'ict', async db => {
      await db.query('UPDATE action_plans SET ict_connect=$1 WHERE id=$2', [parsed.data.status, plan.id]);
      return NextResponse.json({ ok: true, ictConnect: parsed.data.status });
    });
  } catch (cause) {
    console.error('Unable to save the UBEC-SUBEB Connect answer', cause);
    return error('The answer could not be saved. Please try again.', 503);
  }
}
