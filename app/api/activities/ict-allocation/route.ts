import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getWorkspaceState } from '@/lib/workspace-state';
import { resolveActionPlan } from '@/lib/plan-workspace';
import { mutatePlan } from '@/lib/plan-mutations';
import { isSameRequestOrigin } from '@/lib/request-origin';
import { sharedSplit, splitSides, type SplitProposed } from '@/lib/ict-allocation';

// The split of the shared Teacher Development and ICT envelope (action_plans.ict_allocation, migrations 038 and 040).
// `side` says whose amount this is: 'ict' (default) stores it as ICT's allocation; 'teachers' stores shared − amount.
// Whoever may edit that side's component sets it while the plan is open; the other side's lines are protected.
const error = (message: string, status = 400) => NextResponse.json({ error: message }, { status, headers: { 'Cache-Control': 'no-store' } });
const body = z.object({
  amount: z.string().regex(/^\d{1,12}(\.\d{1,2})?$/, 'Enter an amount with up to two decimal places.'),
  side: z.enum(splitSides).default('ict'),
}).strict();

export async function PATCH(req: NextRequest) {
  try {
    if (!isSameRequestOrigin(req)) return error('This request must come from the BEAPMS portal.', 403);
    const user = await getWorkspaceState(req); if (!user) return error('Sign in to continue.', 401);
    const plan = await resolveActionPlan(req, user.stateCode); if (!plan) return error('Plan not found.', 404);
    const parsed = body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return error(parsed.error.issues[0].message);
    const { amount, side } = parsed.data;
    return await mutatePlan(user, plan, side, async db => {
      const current = (await db.query('SELECT state_lodgment::text AS "stateLodgment", other_funding::text AS "otherFunding", (SELECT jsonb_build_object(\'allocation\',fp.allocation) FROM funding_policies fp WHERE fp.id=action_plans.funding_policy_id) AS "fundingPolicy", COALESCE((SELECT jsonb_agg(jsonb_build_object(\'component\',f.component,\'funder\',f.funder,\'amount\',f.amount::text)) FROM plan_funding_sources f WHERE f.plan_id=action_plans.id),\'[]\'::jsonb) AS "fundingSources" FROM action_plans WHERE id=$1', [plan.id])).rows[0];
      const proposed = (await db.query<SplitProposed>("SELECT COALESCE(SUM(quantity*unit_cost) FILTER (WHERE workstream='ict'),0)::text AS ict, COALESCE(SUM(quantity*unit_cost) FILTER (WHERE workstream='teachers'),0)::text AS teachers FROM activity_plan_lines WHERE plan_id=$1 AND workstream IN ('ict','teachers')", [plan.id])).rows[0];
      const result = sharedSplit(current, side, amount, proposed);
      if (result.problem !== undefined) return error(result.problem, 409);
      await db.query('UPDATE action_plans SET ict_allocation=$1 WHERE id=$2', [result.ictAllocation, plan.id]);
      return NextResponse.json({ ok: true, ictAllocation: result.ictAllocation });
    });
  } catch (cause) { console.error('Unable to save the Teacher Development & ICT split', cause); return error('The budget split could not be saved. Please try again.', 503); }
}
