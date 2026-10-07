import { NextRequest, NextResponse } from 'next/server';
import type { QueryResult, QueryResultRow } from 'pg';
import { getPostgres } from '@/lib/postgres';
import { getWorkspaceState } from '@/lib/workspace-state';
import { planFields } from '@/lib/plan-workspace';
import { stateDisplayName } from '@/lib/state-names';
import { canCreateStatePlan } from '@/lib/subeb-access';
import { statePlanOpen } from '@/lib/pillar-review';
import { isSameRequestOrigin } from '@/lib/request-origin';
import { beapName, envelopeShortfalls, sharedBelowIctProblem, planEditSchema, shortfallMessage, sourcesSum } from '@/lib/plan-setup';
import { fundingComponentIds, fundingSourceLabels, type FundingComponent, type FundingSource } from '@/lib/funding-policy';
import { formatQuarters } from '@/lib/format-quarters';
import type { ActionPlan } from '@/lib/action-plans';

// Edits a plan's period and funding after creation (UBEC33). Anyone who may create plans can edit
// them while the plan is still at the state; every saved change is written to the review history.
type Db = { query<R extends QueryResultRow>(sql: string, values?: unknown[]): Promise<QueryResult<R>> };
const error = (message: string, status = 400) => NextResponse.json({ error: message }, { status, headers: { 'Cache-Control': 'no-store' } });
const money = new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 2 });
const lockedMessage = (status: string) => status === 'ubec_approved' ? 'Plan details are locked because UBEC has approved this plan.' : 'Plan details are locked while the plan is with UBEC. They can be edited again if UBEC returns it.';
const notAllowed = 'Only the Executive Chairman, the BEAP Chair or a colleague authorised to create plans can edit plan details.';

async function proposedByComponent(db: Db, planId: number) {
  const rows = (await db.query<{ component: string; amount: string }>(`SELECT 'infrastructure' AS component, ROUND(COALESCE(SUM(total_cost),0),2)::text AS amount FROM infrastructure_packages WHERE plan_id=$1
    UNION ALL SELECT 'sports', ROUND(COALESCE(SUM(unit_cost*quantity),0),2)::text FROM sports_budget_lines WHERE plan_id=$1
    UNION ALL SELECT workstream, ROUND(SUM(unit_cost*quantity),2)::text FROM activity_plan_lines WHERE plan_id=$1 GROUP BY workstream`, [planId])).rows;
  return Object.fromEntries(rows.filter(r => (fundingComponentIds as readonly string[]).includes(String(r.component))).map(r => [r.component, r.amount])) as Partial<Record<FundingComponent, string>>;
}
const reservedQuarters = async (db: Db, stateCode: string, planId: number) =>
  (await db.query<{ year: number; quarter: number }>('SELECT planning_year AS year, quarter FROM plan_quarters WHERE state_code=$1 AND plan_id<>$2 ORDER BY planning_year, quarter', [stateCode, planId])).rows;
const sourceKey = (sources: readonly FundingSource[]) => JSON.stringify(sources.map(s => [s.component, s.funder, Number(s.amount).toFixed(2)]));

export async function GET(request: NextRequest) {
  try {
    const workspace = await getWorkspaceState(request);
    if (!workspace) return error('Sign in to view this plan.', 401);
    const id = request.nextUrl.searchParams.get('plan') ?? '';
    if (!/^[1-9]\d{0,9}$/.test(id)) return error('Choose a plan.');
    const db = getPostgres();
    const plan = (await db.query<ActionPlan>(`SELECT ${planFields} FROM action_plans WHERE id=$1 AND state_code=$2`, [Number(id), workspace.stateCode])).rows[0];
    if (!plan) return error('Action plan not found.', 404);
    const allowed = canCreateStatePlan(workspace.role, workspace.canCreatePlan, workspace.isBeapChair);
    const lockedReason = !allowed ? notAllowed : !statePlanOpen(plan.status) ? lockedMessage(plan.status) : null;
    const [reserved, proposed] = await Promise.all([reservedQuarters(db, workspace.stateCode, plan.id), proposedByComponent(db, plan.id)]);
    return NextResponse.json({ plan, reserved, proposed, allowed, canEdit: !lockedReason, lockedReason }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (cause) {
    console.error('Unable to load plan details', cause);
    return error('The plan details could not be loaded. Please try again.', 503);
  }
}

function describeChanges(before: ActionPlan, after: { planningYear: number; implementationYear: number; quarters: number[]; stateLodgment: string; fundingSources: FundingSource[] }) {
  const changes: string[] = [];
  if (before.startYear !== after.planningYear) changes.push(`funding year ${before.startYear} → ${after.planningYear}`);
  if (before.implementationYear !== after.implementationYear) changes.push(`implementation year ${before.implementationYear ?? '—'} → ${after.implementationYear}`);
  if (formatQuarters(before.fundingQuarters ?? []) !== formatQuarters(after.quarters)) changes.push(`quarters ${formatQuarters(before.fundingQuarters ?? [])} → ${formatQuarters(after.quarters)}`);
  if (Number(before.stateLodgment) !== Number(after.stateLodgment)) changes.push(`state counterpart fund ${money.format(Number(before.stateLodgment ?? 0))} → ${money.format(Number(after.stateLodgment))}`);
  if (sourceKey(before.fundingSources ?? []) !== sourceKey(after.fundingSources)) {
    const list = after.fundingSources.map(s => `${fundingSourceLabels[s.component]} · ${s.funder} · ${money.format(Number(s.amount))}`).join('; ');
    changes.push(`other funding sources ${money.format(Number(sourcesSum(before.fundingSources ?? [])))} → ${money.format(Number(sourcesSum(after.fundingSources)))}${list ? ` (${list})` : ' (none)'}`);
  }
  return changes;
}

export async function PATCH(request: NextRequest) {
  try {
    if (!isSameRequestOrigin(request)) return error('This request must come from the BEAPMS portal.', 403);
    const workspace = await getWorkspaceState(request);
    if (!workspace) return error('Sign in to edit this plan.', 401);
    if (!canCreateStatePlan(workspace.role, workspace.canCreatePlan, workspace.isBeapChair)) return error(notAllowed, 403);
    const parsed = planEditSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return error(parsed.error.issues[0].message);
    const input = parsed.data;
    return await getPostgres().transaction(async db => {
      const actor = (await db.query('SELECT full_name,email,role,can_create_plan,is_beap_chair FROM users WHERE id=$1 AND active AND session_version=$2 AND state_code=$3 FOR SHARE', [workspace.userId, workspace.sessionVersion, workspace.stateCode])).rows[0];
      if (!actor || !canCreateStatePlan(actor.role, actor.can_create_plan, actor.is_beap_chair)) return error(notAllowed, 403);
      const plan = (await db.query<ActionPlan>(`SELECT ${planFields} FROM action_plans WHERE id=$1 AND state_code=$2 FOR UPDATE`, [input.plan, workspace.stateCode])).rows[0];
      if (!plan) return error('Action plan not found.', 404);
      if (!statePlanOpen(plan.status)) return error(lockedMessage(plan.status), 409);
      if (plan.version !== input.version) return error('This plan has changed since you opened it. Close the dialog, refresh and try again.', 409);
      const changes = describeChanges(plan, input);
      if (!changes.length) return NextResponse.json({ plan, changed: false });
      const periodChanged = plan.startYear !== input.planningYear || formatQuarters(plan.fundingQuarters ?? []) !== formatQuarters(input.quarters);
      if (periodChanged && plan.startYear !== plan.endYear) return error('This older multi-year plan cannot change its period. You can still update its funding.', 409);
      if (periodChanged) {
        await db.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`plan-period:${workspace.stateCode}:${input.planningYear}`]);
        const overlap = (await db.query('SELECT quarter FROM plan_quarters WHERE state_code=$1 AND planning_year=$2 AND quarter=ANY($3::int[]) AND plan_id<>$4 ORDER BY quarter', [workspace.stateCode, input.planningYear, input.quarters, plan.id])).rows;
        if (overlap.length) return error(`${overlap.map(r => `Q${r.quarter}`).join(', ')} already belongs to another ${input.planningYear} plan. Choose other quarters.`, 409);
      }
      const after = { stateLodgment: input.stateLodgment, otherFunding: plan.otherFunding, fundingPolicy: plan.fundingPolicy, fundingSources: input.fundingSources, ictAllocation: plan.ictAllocation };
      const shortfalls = envelopeShortfalls(plan, after, await proposedByComponent(db, plan.id));
      const ictProblem = sharedBelowIctProblem(after);
      if (shortfalls.length || ictProblem) return error([...shortfalls.map(shortfallMessage), ictProblem].filter(Boolean).join(' '), 409);
      const name = beapName(stateDisplayName(workspace.stateCode), input.planningYear, input.quarters);
      await db.query('UPDATE action_plans SET start_year=$1,end_year=$1,implementation_year=$2,funding_quarters=$3,state_lodgment=$4,beap_name=$5,version=version+1 WHERE id=$6', [input.planningYear, input.implementationYear, input.quarters, input.stateLodgment, name, plan.id]);
      if (periodChanged) {
        await db.query('DELETE FROM plan_quarters WHERE plan_id=$1', [plan.id]);
        for (const quarter of input.quarters) await db.query('INSERT INTO plan_quarters(plan_id,state_code,planning_year,quarter) VALUES($1,$2,$3,$4)', [plan.id, workspace.stateCode, input.planningYear, quarter]);
      }
      if (sourceKey(plan.fundingSources ?? []) !== sourceKey(input.fundingSources)) {
        await db.query('DELETE FROM plan_funding_sources WHERE plan_id=$1', [plan.id]);
        for (const source of input.fundingSources) await db.query('INSERT INTO plan_funding_sources(plan_id,component,funder,amount,created_by) VALUES($1,$2,$3,$4,$5)', [plan.id, source.component, source.funder, source.amount, workspace.userId]);
      }
      const comment = `Plan details updated: ${changes.join('; ')}.`;
      await db.query("INSERT INTO plan_review_events(plan_id,submission_number,action,actor_name,actor_email,actor_role,comment,scope) VALUES($1,$2,'edit',$3,$4,$5,$6,'general')", [plan.id, plan.submissionNumber, actor.full_name, actor.email, actor.role, comment.slice(0, 5000)]);
      const updated = (await db.query(`SELECT ${planFields} FROM action_plans WHERE id=$1`, [plan.id])).rows[0];
      return NextResponse.json({ plan: updated, changed: true });
    });
  } catch (cause) {
    if ((cause as { code?: string }).code === '23505') return error('Those quarters already belong to another action plan.', 409);
    console.error('Unable to update plan details', cause);
    return error('The plan details could not be saved. Please try again.', 503);
  }
}
