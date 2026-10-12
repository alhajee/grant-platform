import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getWorkspaceState } from '@/lib/workspace-state';
import { planSetupFields, resolveActionPlan } from '@/lib/plan-workspace';
import { mutatePlan } from '@/lib/plan-mutations';
import { isSameRequestOrigin } from '@/lib/request-origin';
import { activityNames, activityTitles } from '@/lib/activity-plans';
import { componentEnvelopeKobo, formatKobo, overShareCaps, activityCapKobo } from '@/lib/activity-budget';
import { capActivities } from '@/lib/activity-plans';
import { selectionProblem } from '@/lib/activity-selection';
import { budgetKobo } from '@/lib/sbmc-budget';
import type { EnvelopePlan } from '@/lib/funding-policy';

// The optional Quality Assurance activities a state works with (action_plans.quality_activities, migration 061).
// The compulsory ones are always in; caps are scaled to the chosen set (lib/activity-selection.ts). Whoever may edit
// Quality Assurance sets it while the plan is open. An activity with items cannot be left out, and adding one is
// refused when the smaller caps would leave another activity over (lowering the items first is the way through).
const error = (message: string, status = 400) => NextResponse.json({ error: message }, { status, headers: { 'Cache-Control': 'no-store' } });
const body = z.object({ workstream: z.literal('quality'), activities: z.array(z.number().int().min(0)).max(20) }).strict();
const workstream = 'quality' as const;

export async function PATCH(req: NextRequest) {
  try {
    if (!isSameRequestOrigin(req)) return error('This request must come from the BEAPMS portal', 403);
    const user = await getWorkspaceState(req); if (!user) return error('Sign in to continue', 401);
    const plan = await resolveActionPlan(req, user.stateCode); if (!plan) return error('Plan not found', 404);
    const parsed = body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return error('Choose the activities to include');
    const activities = [...parsed.data.activities].sort((a, b) => a - b);
    const invalid = selectionProblem(workstream, activities); if (invalid) return error(invalid);
    return await mutatePlan(user, plan, workstream, async db => {
      const current = (await db.query<EnvelopePlan>(`SELECT ${planSetupFields()} FROM action_plans WHERE id=$1`, [plan.id])).rows[0];
      const rows = (await db.query<{ activity: number; items: number; total: string }>("SELECT activity, count(*)::int AS items, SUM(quantity*unit_cost)::text AS total FROM activity_plan_lines WHERE plan_id=$1 AND workstream='quality' GROUP BY activity", [plan.id])).rows;
      const before = current.qualityActivities ?? [];
      const dropped = rows.filter(r => before.includes(r.activity) && !activities.includes(r.activity));
      if (dropped.length) return error(`Remove the items under ${dropped.map(r => `‘${activityNames[workstream][r.activity]}’ (${r.items})`).join(' and ')} before leaving ${dropped.length === 1 ? 'it' : 'them'} out.`, 409);
      const envelope = componentEnvelopeKobo(current, workstream);
      if (envelope !== null && current.qualityActivities != null) {
        const lines = rows.map(r => ({ activity: r.activity, kobo: budgetKobo(r.total) }));
        const wasOver = overShareCaps(workstream, lines, envelope, current.qualityActivities);
        const newlyOver = overShareCaps(workstream, lines, envelope, activities).filter(a => !wasOver.includes(a));
        if (newlyOver.length) {
          const detail = newlyOver.map(a => {
            const group = capActivities(workstream, a), used = lines.filter(l => group.includes(l.activity)).reduce((s, l) => s + l.kobo, BigInt(0)), cap = activityCapKobo(workstream, envelope, a, activities);
            return `‘${group.map(g => activityNames[workstream][g]).join('’ and ‘')}’ would be ${formatKobo(used - cap)} over (up to ${formatKobo(cap)})`;
          }).join('; ');
          return error(`With these activities the ${activityTitles[workstream]} shares get smaller: ${detail}. Reduce those items first.`, 409);
        }
      }
      await db.query('UPDATE action_plans SET quality_activities=$1::smallint[] WHERE id=$2', [activities, plan.id]);
      return NextResponse.json({ ok: true, qualityActivities: activities });
    });
  } catch (cause) { console.error('Unable to save the Quality Assurance activities', cause); return error('The activities could not be saved. Please try again.', 503); }
}
