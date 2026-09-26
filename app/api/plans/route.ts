import { NextRequest, NextResponse } from "next/server";
import { getPostgres } from "@/lib/postgres";
import { getWorkspaceState } from "@/lib/workspace-state";
import { planFields, planSetupFields } from "@/lib/plan-workspace";
import { stateDisplayName } from "@/lib/state-names";
import { subebComponentDepartments as pillarDepartments } from '@/lib/beap-pillars';
import { implementedPillars, componentSections, type ImplementedPillar } from '@/lib/beap-pillars';
import { canCreateStatePlan } from '@/lib/subeb-access';
import { planSetupSchema, beapName } from '@/lib/plan-setup';
import { planFormData, ratDocuments, PlanInputError } from '@/lib/plan-upload';

export async function GET(request: NextRequest) {
  try {
    const workspace = await getWorkspaceState(request);
    if (!workspace) return NextResponse.json({ error: "Sign in to view your action plans." }, { status: 401 });
    const db = getPostgres();
    const [result, targets] = await Promise.all([db.query(`SELECT p.id, p.start_year AS "startYear", p.end_year AS "endYear", p.created_at AS "createdAt", p.status, p.version, p.submission_number AS "submissionNumber", ${planSetupFields('p')},
      COALESCE(i.budget, 0)::float8 AS "infrastructureBudget", COALESCE(s.budget, 0)::float8 AS "sportsBudget", COALESCE(a.sbmc,0)::float8 AS "sbmcBudget", COALESCE(a.tlm,0)::float8 AS "tlmBudget",
      (COALESCE(i.budget, 0) + COALESCE(s.budget, 0) + COALESCE(a.budget, 0))::float8 AS budget,
      (COALESCE(i.lines, 0) + COALESCE(s.lines, 0) + COALESCE(a.lines, 0))::int AS "lineCount",
      (SELECT COUNT(DISTINCT school_id)::int FROM (SELECT school_id FROM infrastructure_packages WHERE plan_id=p.id
        UNION SELECT a.school_id FROM sports_allocations a JOIN sports_budget_lines b ON b.id = a.line_id WHERE b.plan_id = p.id UNION SELECT school_id FROM tlm_distribution WHERE plan_id=p.id) beneficiaries) AS "schoolCount",
      GREATEST(p.created_at, p.workflow_updated_at, i.updated, s.updated, a.updated, (SELECT MAX(updated_at) FROM tlm_distribution WHERE plan_id=p.id), (SELECT MAX(a.updated_at) FROM sports_allocations a JOIN sports_budget_lines b ON b.id = a.line_id WHERE b.plan_id = p.id)) AS "updatedAt"
      FROM action_plans p
      LEFT JOIN LATERAL (SELECT SUM(total_cost) AS budget, COUNT(*) AS lines, MAX(updated_at) AS updated FROM infrastructure_packages WHERE plan_id=p.id) i ON TRUE
      LEFT JOIN LATERAL (SELECT SUM(unit_cost * quantity) AS budget, COUNT(*) AS lines, MAX(updated_at) AS updated FROM sports_budget_lines WHERE plan_id = p.id) s ON TRUE
      LEFT JOIN LATERAL (SELECT SUM(unit_cost*quantity) AS budget,SUM(unit_cost*quantity) FILTER(WHERE workstream='sbmc') AS sbmc,SUM(unit_cost*quantity) FILTER(WHERE workstream='tlm') AS tlm,COUNT(*) AS lines,MAX(updated_at) AS updated FROM activity_plan_lines WHERE plan_id=p.id) a ON TRUE
      WHERE p.state_code = $1 ORDER BY "updatedAt" DESC, p.id DESC`, [workspace.stateCode]),
      db.query<{ count: number }>(`SELECT COUNT(*)::int AS count FROM (
        SELECT i.school_id FROM infrastructure_packages i JOIN action_plans p ON p.id=i.plan_id WHERE p.state_code=$1
        UNION
        SELECT a.school_id FROM sports_allocations a
          JOIN sports_budget_lines b ON b.id = a.line_id JOIN action_plans p ON p.id = b.plan_id
          JOIN schools s ON s.id = a.school_id
          WHERE p.state_code = $1 AND b.state_code = $1 AND s.state_code = $1
      UNION SELECT d.school_id FROM tlm_distribution d JOIN action_plans p ON p.id=d.plan_id JOIN schools s ON s.id=d.school_id WHERE p.state_code=$1 AND s.state_code=$1
      ) targeted_schools`, [workspace.stateCode]),
    ]);
    const reviews = (await db.query<{plan_id:number;pillar:ImplementedPillar;status:string}>('SELECT r.plan_id,r.pillar,r.status FROM plan_pillar_reviews r JOIN action_plans p ON p.id=r.plan_id WHERE p.state_code=$1', [workspace.stateCode])).rows;
    const plans = result.rows.map(plan => {
      const pendingActions: {label:string;href:string}[]=[];
      if(!['submitted_ubec','ubec_review','ubec_approved'].includes(plan.status)) {
        for(const pillar of implementedPillars) {
          if(pillarDepartments[pillar]!==workspace.department)continue;
          const status=reviews.find(r=>r.plan_id===plan.id&&r.pillar===pillar)?.status??'draft';
          const name=componentSections[pillar][0].name;
          if(workspace.role==='Director'&&status==='director_review') pendingActions.push({label:`Review ${name}`,href:`/beap/review?plan=${plan.id}#review-${pillar}`});
          if(workspace.role==='Data Entry Staff'&&['draft','changes_requested'].includes(status)) pendingActions.push({label:`${status==='changes_requested'?'Address feedback on':'Complete'} ${name}`,href:`${componentSections[pillar][0].href}?plan=${plan.id}`});
        }
        if(workspace.role==='Executive Chairman'&&implementedPillars.every(p=>reviews.some(r=>r.plan_id===plan.id&&r.pillar===p&&r.status==='chairman_ready'))) pendingActions.push({label:'Review and send to UBEC',href:`/beap/review?plan=${plan.id}`});
      }
      return {...plan,pendingActions,pendingReview:pendingActions.length>0&&workspace.role!=='Data Entry Staff'};
    });
    return NextResponse.json({ plans, targetedSchools: targets.rows[0].count, stateName: stateDisplayName(workspace.stateCode), role: workspace.role, canCreatePlan: canCreateStatePlan(workspace.role, workspace.canCreatePlan, workspace.isBeapChair) }, { headers: { "Cache-Control": "no-store" } });
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
    const { planningYear, implementationYear, quarters, stateLodgment, otherFunding } = parsed.data;
    return await getPostgres().transaction(async db => {
    const actor = (await db.query('SELECT role,can_create_plan,is_beap_chair FROM users WHERE id=$1 AND active AND session_version=$2 AND state_code=$3 FOR SHARE', [workspace.userId,workspace.sessionVersion,workspace.stateCode])).rows[0];
    if (!actor || !canCreateStatePlan(actor.role, actor.can_create_plan, actor.is_beap_chair)) return NextResponse.json({ error:'Only the Executive Chairman or a staff member they authorize can create an action plan.' },{status:403});
    await db.query('SELECT pg_advisory_xact_lock(hashtext($1))',[`plan-period:${workspace.stateCode}:${planningYear}`]);
    const overlap = (await db.query('SELECT quarter FROM plan_quarters WHERE state_code=$1 AND planning_year=$2 AND quarter=ANY($3::int[]) ORDER BY quarter',[workspace.stateCode,planningYear,quarters])).rows;
    if(overlap.length) return NextResponse.json({error:`${overlap.map(r=>`Q${r.quarter}`).join(', ')} already belongs to a ${planningYear} plan. Choose other quarters or open the existing plan.`},{status:409});
    const name=beapName(stateDisplayName(workspace.stateCode),planningYear,quarters);
    const result = await db.query(`INSERT INTO action_plans (state_code,start_year,end_year,implementation_year,funding_quarters,state_lodgment,other_funding,beap_name,created_by,funding_policy_id) VALUES ($1,$2,$2,$3,$4,$5,$6,$7,$8,(SELECT id FROM funding_policies ORDER BY id DESC LIMIT 1)) RETURNING id`, [workspace.stateCode,planningYear,implementationYear,quarters,stateLodgment,otherFunding,name,workspace.userId]);
    const id=result.rows[0].id;
    for(const quarter of quarters) await db.query('INSERT INTO plan_quarters(plan_id,state_code,planning_year,quarter) VALUES($1,$2,$3,$4)',[id,workspace.stateCode,planningYear,quarter]);
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
