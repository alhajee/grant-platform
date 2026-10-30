import { NextRequest, NextResponse } from 'next/server';
import { getPostgres } from '@/lib/postgres';
import { getWorkspaceState } from '@/lib/workspace-state';
import { planFields } from '@/lib/plan-workspace';
import { canCreateStatePlan } from '@/lib/subeb-access';
import { statePlanOpen } from '@/lib/pillar-review';
import { isSameRequestOrigin } from '@/lib/request-origin';
import { PlanInputError, planFormData, ratDocuments } from '@/lib/plan-upload';
import type { ActionPlan } from '@/lib/action-plans';

// UBEC204 (bug round 10, 30 October 2026): the plan's RAT tool is replaced from Edit plan while the plan is at the SUBEB,
// before it first goes to UBEC and when UBEC returns it (when every other plan detail is locked). The new files take the
// place of the current ones; the old ones are kept, marked removed, so earlier UBEC submissions still open them.
const error = (message: string, status = 400) => NextResponse.json({ error: message }, { status, headers: { 'Cache-Control': 'no-store' } });
const notAllowed = 'Only the Executive Chairman, the BEAP Chair or a colleague authorised to create plans can replace the RAT tool';

export async function POST(request: NextRequest) {
  try {
    if (!isSameRequestOrigin(request)) return error('This request must come from the BEAPMS portal', 403);
    const workspace = await getWorkspaceState(request);
    if (!workspace) return error('Sign in to replace the RAT tool', 401);
    if (!canCreateStatePlan(workspace.role, workspace.canCreatePlan, workspace.isBeapChair)) return error(notAllowed, 403);
    const form = await planFormData(request);
    const planId = Number(form.get('plan')), version = Number(form.get('version'));
    if (!Number.isSafeInteger(planId) || planId < 1 || !Number.isSafeInteger(version) || version < 0) return error('Choose a plan');
    const files = await ratDocuments(form);
    return await getPostgres().transaction(async db => {
      const actor = (await db.query('SELECT full_name,email,role,can_create_plan,is_beap_chair FROM users WHERE id=$1 AND active AND session_version=$2 AND state_code=$3 FOR SHARE', [workspace.userId, workspace.sessionVersion, workspace.stateCode])).rows[0];
      if (!actor || !canCreateStatePlan(actor.role, actor.can_create_plan, actor.is_beap_chair)) return error(notAllowed, 403);
      const plan = (await db.query<ActionPlan>(`SELECT ${planFields} FROM action_plans WHERE id=$1 AND state_code=$2 FOR UPDATE`, [planId, workspace.stateCode])).rows[0];
      if (!plan) return error('Action plan not found', 404);
      if (!statePlanOpen(plan.status)) return error(plan.status === 'ubec_approved' ? 'The RAT tool is locked because UBEC has approved this plan' : 'The RAT tool can be replaced once the plan is back at the SUBEB', 409);
      if (plan.version !== version) return error('This plan has changed since you opened it. Close the dialog, refresh and try again.', 409);
      await db.query('UPDATE plan_documents SET removed_at=NOW() WHERE plan_id=$1 AND removed_at IS NULL', [plan.id]);
      for (const file of files) await db.query("INSERT INTO plan_documents(id,plan_id,name,media_type,content,size) VALUES($1,$2,$3,$4,decode($5,'hex'),$6)", [file.id, plan.id, file.name, file.mediaType, file.content.toString('hex'), file.size]);
      await db.query('UPDATE action_plans SET version=version+1 WHERE id=$1', [plan.id]);
      await db.query("INSERT INTO plan_review_events(plan_id,submission_number,action,actor_name,actor_email,actor_role,comment,scope) VALUES($1,$2,'edit',$3,$4,$5,$6,'general')", [plan.id, plan.submissionNumber, actor.full_name, actor.email, actor.role, `RAT tool replaced: ${files.map(f => f.name).join(', ')}`.slice(0, 5000)]);
      const updated = (await db.query<ActionPlan>(`SELECT ${planFields} FROM action_plans WHERE id=$1`, [plan.id])).rows[0];
      return NextResponse.json({ plan: updated }, { headers: { 'Cache-Control': 'no-store' } });
    });
  } catch (cause) {
    if (cause instanceof PlanInputError) return error(cause.message, cause.status);
    console.error('RAT replacement failed', cause);
    return error('The RAT tool could not be replaced. Please try again.', 503);
  }
}
