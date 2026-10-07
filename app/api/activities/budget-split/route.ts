import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getWorkspaceState } from '@/lib/workspace-state';
import { planSetupFields, resolveActionPlan } from '@/lib/plan-workspace';
import { mutatePlan } from '@/lib/plan-mutations';
import { isSameRequestOrigin } from '@/lib/request-origin';
import { budgetPairs, pairOf, partnerOf, sharedSplit, sideSplits, splitSides, type SplitSide } from '@/lib/budget-pairs';
import type { EnvelopePlan } from '@/lib/funding-policy';

// The split of a shared envelope (lib/budget-pairs.ts): Teacher Development & ICT (action_plans.ict_allocation,
// migrations 038 and 040) and, in split mode, Infrastructure & TLM (action_plans.tlm_allocation, migration 051).
// `side` says whose amount this is; the stored side's amount is saved as is, the keeper's as shared − amount.
// Whoever may edit that side's component sets it while the plan is open; the other side's proposals are protected.
// Also served at /api/activities/ict-allocation (side defaults to 'ict' there, as before).
const error = (message: string, status = 400) => NextResponse.json({ error: message }, { status, headers: { 'Cache-Control': 'no-store' } });
const body = z.object({
  amount: z.string().regex(/^\d{1,12}(\.\d{1,2})?$/, 'Enter an amount with up to two decimal places.'),
  side: z.enum(splitSides).default('ict'),
}).strict();

/** What one side proposes now (naira strings): activity lines, or Infrastructure's school packages. */
const proposedSql: Record<SplitSide, string> = {
  ict: "SELECT COALESCE(SUM(quantity*unit_cost),0)::text AS total FROM activity_plan_lines WHERE plan_id=$1 AND workstream='ict'",
  teachers: "SELECT COALESCE(SUM(quantity*unit_cost),0)::text AS total FROM activity_plan_lines WHERE plan_id=$1 AND workstream='teachers'",
  tlm: "SELECT COALESCE(SUM(quantity*unit_cost),0)::text AS total FROM activity_plan_lines WHERE plan_id=$1 AND workstream='tlm'",
  infrastructure: 'SELECT COALESCE(SUM(total_cost),0)::text AS total FROM infrastructure_packages WHERE plan_id=$1',
};

export async function PATCH(req: NextRequest) {
  try {
    if (!isSameRequestOrigin(req)) return error('This request must come from the BEAPMS portal.', 403);
    const user = await getWorkspaceState(req); if (!user) return error('Sign in to continue.', 401);
    const plan = await resolveActionPlan(req, user.stateCode); if (!plan) return error('Plan not found.', 404);
    const parsed = body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return error(parsed.error.issues[0].message);
    const { amount, side } = parsed.data;
    return await mutatePlan(user, plan, side, async db => {
      // Re-read the funding and the platform mode under mutatePlan's plan-row lock.
      const current = (await db.query<EnvelopePlan>(`SELECT ${planSetupFields()} FROM action_plans WHERE id=$1`, [plan.id])).rows[0];
      if (!sideSplits(current, side)) return error('Infrastructure and TLM share one budget on this platform, so there is no split to set.', 409);
      const total = async (s: SplitSide) => (await db.query<{ total: string }>(proposedSql[s], [plan.id])).rows[0].total;
      const result = sharedSplit(current, side, amount, { own: await total(side), partner: await total(partnerOf(side)) });
      if (result.problem !== undefined) return error(result.problem, 409);
      const pair = budgetPairs[pairOf(side)];
      await db.query(`UPDATE action_plans SET ${pair.column}=$1 WHERE id=$2`, [result.allocation, plan.id]);
      return NextResponse.json({ ok: true, [pair.field]: result.allocation });
    });
  } catch (cause) { console.error('Unable to save the budget split', cause); return error('The budget split could not be saved. Please try again.', 503); }
}
