import { NextRequest, NextResponse } from "next/server";
import { RECENT_ACTIVITY_LIMIT, type PlanActivity } from '@/lib/plan-activity';
import { getPostgres } from "@/lib/postgres";
import { getWorkspaceState } from "@/lib/workspace-state";
import { planFields, planSetupFields } from "@/lib/plan-workspace";
import { stateDisplayName } from "@/lib/state-names";
import { pendingActionsFor, type PillarReviewRow } from '@/lib/pending-actions';
import { canCreateStatePlan } from '@/lib/subeb-access';
import { readStateStageVisibility } from '@/lib/stage-visibility';
import { implementedPillars, type ImplementedPillar } from '@/lib/beap-pillars';
import { planSetupSchema, beapName } from '@/lib/plan-setup';
import { planFormData, ratDocuments, PlanInputError } from '@/lib/plan-upload';

// Recent activity is filtered per component after reading, so read a few more rows than are shown.
const RECENT_ACTIVITY_SCAN = RECENT_ACTIVITY_LIMIT * 5;
type PlanFigures = Record<`${ImplementedPillar}Budget`, number> & { budget: number; lineCount: number; schoolCount: number; schoolIds: number[] };
/** A plan's budgets, lines and schools counting only the components whose details the viewer may see; hidden components read as 0. */
function visibleFigures(plan: Record<string, unknown>, visible: readonly ImplementedPillar[], lines: Record<string, number>, schools: Record<string, number[]>): PlanFigures {
  const budgets = Object.fromEntries(implementedPillars.map(pillar => [`${pillar}Budget`, visible.includes(pillar) ? Number(plan[`${pillar}Budget`] ?? 0) : 0])) as Record<`${ImplementedPillar}Budget`, number>;
  const schoolIds = [...new Set(visible.flatMap(pillar => schools[pillar] ?? []))].sort((a, b) => a - b);
  return {
    ...budgets,
    // Kobo arithmetic keeps the total exact.
    budget: implementedPillars.reduce((sum, pillar) => sum + Math.round(budgets[`${pillar}Budget`] * 100), 0) / 100,
    lineCount: visible.reduce((sum, pillar) => sum + (lines[pillar] ?? 0), 0),
    schoolCount: schoolIds.length, schoolIds,
  };
}

export async function GET(request: NextRequest) {
  try {
    const workspace = await getWorkspaceState(request);
    if (!workspace) return NextResponse.json({ error: "Sign in to view your action plans." }, { status: 401 });
    const db = getPostgres();
    const result = await db.query(`SELECT p.id, p.start_year AS "startYear", p.end_year AS "endYear", p.created_at AS "createdAt", p.status, p.version, p.submission_number AS "submissionNumber", ${planSetupFields('p')},
      COALESCE(i.budget, 0)::float8 AS "infrastructureBudget", COALESCE(s.budget, 0)::float8 AS "sportsBudget", COALESCE(a.sbmc,0)::float8 AS "sbmcBudget", COALESCE(a.tlm,0)::float8 AS "tlmBudget", COALESCE(a.monitoring,0)::float8 AS "monitoringBudget", COALESCE(a.gscci,0)::float8 AS "gscciBudget", COALESCE(a.curriculum,0)::float8 AS "curriculumBudget", COALESCE(a.quality,0)::float8 AS "qualityBudget", COALESCE(a.teachers,0)::float8 AS "teachersBudget", COALESCE(a.ict,0)::float8 AS "ictBudget", COALESCE(a.planning,0)::float8 AS "planningBudget",
      jsonb_build_object('infrastructure', COALESCE(i.lines, 0), 'sports', COALESCE(s.lines, 0)) || COALESCE(a.lines, '{}'::jsonb) AS "componentLines",
      COALESCE(beneficiaries.ids, '{}'::jsonb) AS "componentSchools",
      GREATEST(p.created_at, p.workflow_updated_at, i.updated, s.updated, a.updated, (SELECT MAX(updated_at) FROM tlm_distribution WHERE plan_id=p.id), (SELECT MAX(a.updated_at) FROM sports_allocations a JOIN sports_budget_lines b ON b.id = a.line_id WHERE b.plan_id = p.id)) AS "updatedAt"
      FROM action_plans p
      LEFT JOIN LATERAL (SELECT SUM(total_cost) AS budget, COUNT(*)::int AS lines, MAX(updated_at) AS updated FROM infrastructure_packages WHERE plan_id=p.id) i ON TRUE
      LEFT JOIN LATERAL (SELECT SUM(unit_cost * quantity) AS budget, COUNT(*)::int AS lines, MAX(updated_at) AS updated FROM sports_budget_lines WHERE plan_id = p.id) s ON TRUE
      LEFT JOIN LATERAL (SELECT SUM(unit_cost*quantity) FILTER(WHERE workstream='sbmc') AS sbmc,SUM(unit_cost*quantity) FILTER(WHERE workstream='tlm') AS tlm,SUM(unit_cost*quantity) FILTER(WHERE workstream='monitoring') AS monitoring,SUM(unit_cost*quantity) FILTER(WHERE workstream='gscci') AS gscci,SUM(unit_cost*quantity) FILTER(WHERE workstream='curriculum') AS curriculum,SUM(unit_cost*quantity) FILTER(WHERE workstream='quality') AS quality,SUM(unit_cost*quantity) FILTER(WHERE workstream='ict') AS ict,SUM(unit_cost*quantity) FILTER(WHERE workstream='teachers') AS teachers,SUM(unit_cost*quantity) FILTER(WHERE workstream='planning') AS planning,
        (SELECT jsonb_object_agg(workstream, n) FROM (SELECT workstream, COUNT(*)::int AS n FROM activity_plan_lines WHERE plan_id=p.id GROUP BY workstream) counted) AS lines,MAX(updated_at) AS updated FROM activity_plan_lines WHERE plan_id=p.id) a ON TRUE
      LEFT JOIN LATERAL (SELECT jsonb_object_agg(component, ids) AS ids FROM (SELECT component, ARRAY_AGG(DISTINCT school_id ORDER BY school_id) AS ids FROM (
        SELECT 'infrastructure' AS component, school_id FROM infrastructure_packages WHERE plan_id=p.id
        UNION ALL SELECT 'sports', allocation.school_id FROM sports_allocations allocation JOIN sports_budget_lines line ON line.id=allocation.line_id JOIN schools school ON school.id=allocation.school_id WHERE line.plan_id=p.id AND line.state_code=p.state_code AND school.state_code=p.state_code
        UNION ALL SELECT distribution.workstream, distribution.school_id FROM tlm_distribution distribution JOIN schools school ON school.id=distribution.school_id WHERE distribution.plan_id=p.id AND school.state_code=p.state_code
        UNION ALL SELECT line.workstream, chosen.school_id FROM activity_line_schools chosen JOIN activity_plan_lines line ON line.id=chosen.line_id JOIN schools school ON school.id=chosen.school_id WHERE line.plan_id=p.id AND school.state_code=p.state_code
      ) plan_beneficiaries WHERE school_id IS NOT NULL GROUP BY component) grouped) beneficiaries ON TRUE
      WHERE p.state_code = $1 ORDER BY "updatedAt" DESC, p.id DESC`, [workspace.stateCode]);
    const reviews = (await db.query<PillarReviewRow>('SELECT r.plan_id,r.pillar,r.status FROM plan_pillar_reviews r JOIN action_plans p ON p.id=r.plan_id WHERE p.state_code=$1', [workspace.stateCode])).rows;
    // Figures and activity only for components that have reached the viewer (lib/stage-visibility.ts).
    const visibility = await readStateStageVisibility(db, workspace, workspace.stateCode, reviews);
    const recentActivity = (await db.query<PlanActivity>(`SELECT e.id, e.plan_id AS "planId", e.action, e.scope, e.actor_name AS "actorName", e.actor_role AS "actorRole", e.comment, e.created_at AS "createdAt",
      p.start_year AS "startYear", p.end_year AS "endYear", p.funding_quarters AS "fundingQuarters"
      FROM plan_review_events e JOIN action_plans p ON p.id = e.plan_id WHERE p.state_code = $1 ORDER BY e.created_at DESC, e.id DESC LIMIT ${RECENT_ACTIVITY_SCAN}`, [workspace.stateCode])).rows
      .filter(item => !item.scope || item.scope === 'general' || ((visibility.get(item.planId) ?? []) as readonly string[]).includes(item.scope.split(':')[0])).slice(0, RECENT_ACTIVITY_LIMIT);
    const plans = result.rows.map(({ componentLines, componentSchools, ...plan }) => {
      const pendingActions = pendingActionsFor(workspace, plan as { id: number; status: string }, reviews);
      return { ...plan, ...visibleFigures(plan, visibility.get(plan.id) ?? [], componentLines, componentSchools), pendingActions, pendingReview: pendingActions.length > 0 && workspace.role !== 'Data Entry Staff' };
    });
    const targetedSchools = new Set(plans.flatMap(plan => plan.schoolIds)).size;
    return NextResponse.json({ plans, recentActivity, targetedSchools, stateName: stateDisplayName(workspace.stateCode), role: workspace.role, canCreatePlan: canCreateStatePlan(workspace.role, workspace.canCreatePlan, workspace.isBeapChair) }, { headers: { "Cache-Control": "no-store" } });
  } catch (cause) {
    console.error("Unable to load action plans", cause);
    return NextResponse.json({ error: "Your action plans could not be loaded. Please try again." }, { status: 503 });
  }
}
export async function POST(request: NextRequest) {
  try {
    const workspace = await getWorkspaceState(request);
    if (!workspace) return NextResponse.json({ error: "Sign in to create an action plan." }, { status: 401 });
    if (!canCreateStatePlan(workspace.role, workspace.canCreatePlan, workspace.isBeapChair)) return NextResponse.json({error:'Only the Executive Chairman or an authorized colleague can create plans.'},{status:403});
    const form = await planFormData(request);
    const parsed = planSetupSchema.safeParse(JSON.parse(String(form.get('setup') ?? 'null')));
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    const files = await ratDocuments(form);
    const { planningYear, implementationYear, quarters, stateLodgment, fundingSources } = parsed.data;
    return await getPostgres().transaction(async db => {
    const actor = (await db.query('SELECT role,can_create_plan,is_beap_chair FROM users WHERE id=$1 AND active AND session_version=$2 AND state_code=$3 FOR SHARE', [workspace.userId,workspace.sessionVersion,workspace.stateCode])).rows[0];
    if (!actor || !canCreateStatePlan(actor.role, actor.can_create_plan, actor.is_beap_chair)) return NextResponse.json({ error:'Only the Executive Chairman or a staff member they authorize can create an action plan.' },{status:403});
    const fundingPolicy = (await db.query('SELECT id FROM funding_policies ORDER BY id DESC LIMIT 1 FOR SHARE')).rows[0];
    if (!fundingPolicy) return NextResponse.json({ error:'Funding allocations have not been configured. Ask the UBEC Executive Secretary or administrator to configure them before creating a plan.' },{status:409});
    await db.query('SELECT pg_advisory_xact_lock(hashtext($1))',[`plan-period:${workspace.stateCode}:${planningYear}`]);
    const overlap = (await db.query('SELECT quarter FROM plan_quarters WHERE state_code=$1 AND planning_year=$2 AND quarter=ANY($3::int[]) ORDER BY quarter',[workspace.stateCode,planningYear,quarters])).rows;
    if(overlap.length) return NextResponse.json({error:`${overlap.map(r=>`Q${r.quarter}`).join(', ')} already belongs to a ${planningYear} plan. Choose other quarters or open the existing plan.`},{status:409});
    const name=beapName(stateDisplayName(workspace.stateCode),planningYear,quarters);
    const result = await db.query(`INSERT INTO action_plans (state_code,start_year,end_year,implementation_year,funding_quarters,state_lodgment,other_funding,beap_name,created_by,funding_policy_id) VALUES ($1,$2,$2,$3,$4,$5,0,$6,$7,$8) RETURNING id`, [workspace.stateCode,planningYear,implementationYear,quarters,stateLodgment,name,workspace.userId,fundingPolicy.id]);
    const id=result.rows[0].id;
    for(const quarter of quarters) await db.query('INSERT INTO plan_quarters(plan_id,state_code,planning_year,quarter) VALUES($1,$2,$3,$4)',[id,workspace.stateCode,planningYear,quarter]);
    // Other funding is component-specific (plan_funding_sources); other_funding stays 0 on new plans.
    for(const source of fundingSources) await db.query('INSERT INTO plan_funding_sources(plan_id,component,funder,amount,created_by) VALUES($1,$2,$3,$4,$5)',[id,source.component,source.funder,source.amount,workspace.userId]);
    for(const file of files) await db.query("INSERT INTO plan_documents(id,plan_id,name,media_type,content,size) VALUES($1,$2,$3,$4,decode($5,'hex'),$6)",[file.id,id,file.name,file.mediaType,file.content.toString('hex'),file.size]);
    const plan=(await db.query(`SELECT ${planFields} FROM action_plans WHERE id=$1`,[id])).rows[0];
    return NextResponse.json({ plan }, { status: 201 });
    });
  } catch (cause) {
    if(cause instanceof PlanInputError) return NextResponse.json({error:cause.message},{status:cause.status});
    if(cause instanceof SyntaxError) return NextResponse.json({error:'Invalid plan details.'},{status:400});
    if((cause as {code?:string}).code==='23505') return NextResponse.json({error:'Those quarters already belong to an action plan.'},{status:409});
    console.error("Unable to create action plan", cause);
    return NextResponse.json({ error: "Your plan could not be created. Please try again." }, { status: 503 });
  }
}
