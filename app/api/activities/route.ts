import { canViewComponent } from '@/lib/subeb-access';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getWorkspaceState } from '@/lib/workspace-state';
import { resolveActionPlan } from '@/lib/plan-workspace';
import { getPostgres } from '@/lib/postgres';
import { mutatePlan } from '@/lib/plan-mutations';
import { mayEditPillar, readPillarReviews } from '@/lib/pillar-review';
import { activityLineSchema, activityWorkstreams, hasDistribution } from '@/lib/activity-plans';
import { activityBudgetProblem, isCapped } from '@/lib/activity-budget';
import { budgetKobo, sbmcBudgetProblem } from '@/lib/sbmc-budget';
const error=(message:string,status=400)=>NextResponse.json({error:message},{status});
export async function GET(req:NextRequest){
 try{
  const user=await getWorkspaceState(req); if(!user)return error('Sign in to continue.',401);
  const plan=await resolveActionPlan(req,user.stateCode); if(!plan)return error('Plan not found.',404);
  const parsed=z.enum(activityWorkstreams).safeParse(req.nextUrl.searchParams.get('workstream')); if(!parsed.success)return error('Choose a component.');
  const db=getPostgres(), workstream=parsed.data;
  if(!canViewComponent(user,workstream))return error('This component belongs to another department.',403);
  const lines=(await db.query('SELECT id,workstream,activity,custom_activity AS "customActivity",description,rationale,implementation_approach AS "implementationApproach",quantity,unit_cost::float8 AS "unitCost",strategy,target_group AS "targetGroup",location,equipment,textbook_classes AS "textbookClasses",textbook_subject AS "textbookSubject" FROM activity_plan_lines WHERE plan_id=$1 AND workstream=$2 ORDER BY activity,id',[plan.id,workstream])).rows;
  const schoolFields='s.id,s.name,s.lga,s.level,s.location,(s.enrolment_male+s.enrolment_female)::int AS enrolment';
  const listed=hasDistribution(workstream);
  const schools=listed?(await db.query(`SELECT ${schoolFields} FROM schools s WHERE s.state_code=$1 ORDER BY s.name`,[user.stateCode])).rows:[];
  const distribution=listed?(await db.query(`SELECT ${schoolFields} FROM tlm_distribution d JOIN schools s ON s.id=d.school_id WHERE d.plan_id=$1 AND d.workstream=$3 AND s.state_code=$2 ORDER BY s.name`,[plan.id,user.stateCode,workstream])).rows:[];
  const documents=workstream==='monitoring'?(await db.query("SELECT id,name,size FROM component_documents WHERE plan_id=$1 AND component=$2 AND removed_at IS NULL ORDER BY created_at,id",[plan.id,workstream])).rows:[];
  // Schools in this plan's Whole School Renovation/Expansion packages: listed first and offered for distribution.
  const renovated=(workstream==='tlm'||workstream==='curriculum')?(await db.query<{id:number}>("SELECT DISTINCT p.school_id AS id FROM infrastructure_packages p JOIN schools s ON s.id=p.school_id WHERE p.plan_id=$1 AND p.kind='whole' AND s.state_code=$2",[plan.id,user.stateCode])).rows.map(r=>r.id):[];
  return NextResponse.json({plan,lines,schools,distribution,renovated,documents,canEdit:mayEditPillar(user.role,user.departments ?? user.department,workstream,plan.status,await readPillarReviews(db,plan.id))},{headers:{'Cache-Control':'no-store'}});
 }catch(cause){console.error(cause);return error('Unable to load this component.',503);}
}
export async function POST(req:NextRequest){
 try{
  const user=await getWorkspaceState(req); if(!user)return error('Sign in to continue.',401);
  const plan=await resolveActionPlan(req,user.stateCode); if(!plan)return error('Plan not found.',404);
  const body=await req.json().catch(()=>null);
  const parsed=z.object({workstream:z.enum(activityWorkstreams),entity:z.enum(['line','school']),action:z.enum(['create','update','delete']),id:z.number().int().positive().optional(),schoolId:z.number().int().positive().optional(),schoolIds:z.array(z.number().int().positive()).min(1).max(10000).optional()}).safeParse(body);
  if(!parsed.success)return error('Invalid action.');
  const {workstream,entity,action,id}=parsed.data;
  if(action!=='create'&&!id)return error('Select an entry.');
  return await mutatePlan(user,plan,workstream,async db=>{
   if(entity==='school'){
    if(!hasDistribution(workstream)||action==='update')return error('Invalid distribution action.');
    const many=parsed.data.schoolIds;
    if(many){
     if(action!=='create')return error('Invalid distribution action.');
     const ids=[...new Set(many)], found=(await db.query('SELECT count(*)::int AS n FROM schools WHERE id=ANY($1::int[]) AND state_code=$2',[ids,user.stateCode])).rows[0].n;
     if(found!==ids.length)return error('One or more schools were not found in your state.',404);
     const added=(await db.query('INSERT INTO tlm_distribution(plan_id,workstream,school_id) SELECT $1,$3,unnest($2::int[]) ON CONFLICT DO NOTHING',[plan.id,ids,workstream])).rowCount??0;
     return NextResponse.json({ok:true,added,skipped:ids.length-added});
    }
    const schoolId=action==='delete'?id:parsed.data.schoolId;
    if(!schoolId||!Number.isSafeInteger(schoolId))return error('Select a school.');
    if(!(await db.query('SELECT id FROM schools WHERE id=$1 AND state_code=$2',[schoolId,user.stateCode])).rowCount)return error('School not found in your state.',404);
    if(action==='delete')await db.query('DELETE FROM tlm_distribution WHERE plan_id=$1 AND workstream=$3 AND school_id=$2',[plan.id,schoolId,workstream]);
    else {if((await db.query('SELECT 1 FROM tlm_distribution WHERE plan_id=$1 AND workstream=$3 AND school_id=$2',[plan.id,schoolId,workstream])).rowCount)return error('This school is already on the distribution list.',409);await db.query('INSERT INTO tlm_distribution(plan_id,workstream,school_id) VALUES($1,$3,$2)',[plan.id,schoolId,workstream]);}
   }else{
    if(action!=='create'&&!(await db.query('SELECT id FROM activity_plan_lines WHERE id=$1 AND plan_id=$2 AND workstream=$3',[id,plan.id,workstream])).rowCount)return error('Entry not found.',404);
    if(action==='delete')await db.query('DELETE FROM activity_plan_lines WHERE id=$1 AND plan_id=$2',[id,plan.id]);
    else{
     const line=activityLineSchema.safeParse(body); if(!line.success)return error(line.error.issues[0].message);
     const v=line.data, values=[v.activity,v.customActivity,v.description,v.quantity,v.unitCost.toFixed(2),v.strategy,v.targetGroup,v.location,v.equipment,v.rationale,v.implementationApproach,v.textbookClasses,v.textbookSubject];
     if(workstream==='sbmc') {
      const existing=(await db.query("SELECT COALESCE(SUM(quantity*unit_cost),0)::text AS total FROM activity_plan_lines WHERE plan_id=$1 AND workstream='sbmc' AND ($2::bigint IS NULL OR id<>$2)",[plan.id,action==='update'?id:null])).rows[0].total;
      const problem=sbmcBudgetProblem(budgetKobo(existing)+budgetKobo(v.unitCost.toFixed(2))*BigInt(v.quantity),plan);
      if(problem)return error(problem);
     }
     if(isCapped(workstream)) {
      const others=(await db.query<{activity:number;total:string}>('SELECT activity,SUM(quantity*unit_cost)::text AS total FROM activity_plan_lines WHERE plan_id=$1 AND workstream=$2 AND ($3::bigint IS NULL OR id<>$3) GROUP BY activity',[plan.id,workstream,action==='update'?id:null])).rows;
      const problem=activityBudgetProblem(workstream,[...others.map(r=>({activity:r.activity,kobo:budgetKobo(r.total)})),{activity:v.activity,kobo:budgetKobo(v.unitCost.toFixed(2))*BigInt(v.quantity)}],plan);
      if(problem)return error(problem);
     }
     if(action==='create')await db.query('INSERT INTO activity_plan_lines(activity,custom_activity,description,quantity,unit_cost,strategy,target_group,location,equipment,rationale,implementation_approach,textbook_classes,textbook_subject,plan_id,workstream) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)',[...values,plan.id,workstream]);
     else await db.query('UPDATE activity_plan_lines SET activity=$1,custom_activity=$2,description=$3,quantity=$4,unit_cost=$5,strategy=$6,target_group=$7,location=$8,equipment=$9,rationale=$10,implementation_approach=$11,textbook_classes=$12,textbook_subject=$13,updated_at=NOW() WHERE id=$14 AND plan_id=$15',[...values,id,plan.id]);
    }
   }
   return NextResponse.json({ok:true});
  });
 }catch(cause){console.error(cause);return error('Unable to save this change.',503);}
}
