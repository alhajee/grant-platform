import { canViewComponent } from '@/lib/subeb-access';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getWorkspaceState } from '@/lib/workspace-state';
import { resolveActionPlan } from '@/lib/plan-workspace';
import { getPostgres } from '@/lib/postgres';
import { cachedSchoolList } from '@/lib/school-cache';
import { mutatePlan } from '@/lib/plan-mutations';
import { mayEditPillar, readPillarReviews } from '@/lib/pillar-review';
import { activityLineSchema, activityWorkstreams, hasDistribution, activityShareCaps } from '@/lib/activity-plans';
import { activityBudgetProblem, isCapped } from '@/lib/activity-budget';
import { budgetKobo, sbmcBudgetProblem } from '@/lib/sbmc-budget';
import { lineSchoolActivities } from '@/lib/activity-extras';
import { readLineExtras, saveLineSchools } from '@/lib/activity-line-extras';
import { infrastructurePoolProblem } from '@/lib/infrastructure-pool';
import { readPoolState } from '@/lib/infrastructure-pool-db';
const error=(message:string,status=400)=>NextResponse.json({error:message},{status});
class LineSchoolsError extends Error {}
export async function GET(req:NextRequest){
 try{
  const user=await getWorkspaceState(req); if(!user)return error('Sign in to continue.',401);
  const plan=await resolveActionPlan(req,user.stateCode); if(!plan)return error('Plan not found.',404);
  const parsed=z.enum(activityWorkstreams).safeParse(req.nextUrl.searchParams.get('workstream')); if(!parsed.success)return error('Choose a component.');
  const db=getPostgres(), workstream=parsed.data;
  if(!canViewComponent(user,workstream))return error('This component belongs to another department.',403);
  const lines=(await db.query('SELECT id,workstream,activity,custom_activity AS "customActivity",description,rationale,implementation_approach AS "implementationApproach",quantity,unit_cost::float8 AS "unitCost",strategy,target_group AS "targetGroup",location,equipment,textbook_classes AS "textbookClasses",textbook_subject AS "textbookSubject",equipment_type AS "equipmentType",subscription_types AS "subscriptionTypes",website_type AS "websiteType",training_provider AS "trainingProvider",target_participants AS "targetParticipants",school_levels AS "schoolLevels",training_days AS "trainingDays",venue_type AS "venueType" FROM activity_plan_lines WHERE plan_id=$1 AND workstream=$2 ORDER BY activity,id',[plan.id,workstream])).rows;
  // Quality Assurance, ICT and Teacher Development lines carry their chosen schools and documents (migrations 038, 040).
  const extras=await readLineExtras(db,plan.id,workstream);
  const withExtras=lines.map(line=>{const schools=extras.schools.get(line.id)??[];return {...line,schools,schoolIds:schools.map(s=>s.id),documents:extras.documents.get(line.id)??[]};});
  const schoolFields='s.id,s.name,s.lga,s.level,s.location,(s.enrolment_male+s.enrolment_female)::int AS enrolment';
  const listed=hasDistribution(workstream);
  const schools=listed||lineSchoolActivities[workstream]?await cachedSchoolList(user.stateCode,'activities',async()=>(await db.query(`SELECT ${schoolFields} FROM schools s WHERE s.state_code=$1 ORDER BY s.name`,[user.stateCode])).rows):[];
  const distribution=listed?(await db.query(`SELECT ${schoolFields} FROM tlm_distribution d JOIN schools s ON s.id=d.school_id WHERE d.plan_id=$1 AND d.workstream=$3 AND s.state_code=$2 ORDER BY s.name`,[plan.id,user.stateCode,workstream])).rows:[];
  const documents=workstream==='monitoring'?(await db.query("SELECT id,name,size FROM component_documents WHERE plan_id=$1 AND component=$2 AND removed_at IS NULL ORDER BY created_at,id",[plan.id,workstream])).rows:[];
  // Schools in this plan's Whole School Renovation/Expansion packages: listed first and offered for distribution.
  const renovated=listed?(await db.query<{id:number}>("SELECT DISTINCT p.school_id AS id FROM infrastructure_packages p JOIN schools s ON s.id=p.school_id WHERE p.plan_id=$1 AND p.kind='whole' AND s.state_code=$2",[plan.id,user.stateCode])).rows.map(r=>r.id):[];
  // ICT and Teacher Development share one envelope: each editor also sees what the other side's lines propose.
  const sharedPartner=workstream==='ict'?'teachers':workstream==='teachers'?'ict':null;
  // TLM shares the infrastructure pool with Infrastructure's school packages, so its editor sees their total too.
  const partnerProposed=sharedPartner?(await db.query<{total:string}>('SELECT COALESCE(SUM(quantity*unit_cost),0)::text AS total FROM activity_plan_lines WHERE plan_id=$1 AND workstream=$2',[plan.id,sharedPartner])).rows[0].total
   :workstream==='tlm'?(await db.query<{total:string}>('SELECT COALESCE(SUM(total_cost),0)::text AS total FROM infrastructure_packages WHERE plan_id=$1',[plan.id])).rows[0].total:null;
  return NextResponse.json({plan,lines:withExtras,schools,distribution,renovated,documents,partnerProposed,canEdit:mayEditPillar(user.role,user.departments ?? user.department,workstream,plan.status,await readPillarReviews(db,plan.id))},{headers:{'Cache-Control':'no-store'}});
 }catch(cause){console.error(cause);return error('Unable to load this component.',503);}
}
export async function POST(req:NextRequest){
 try{
  const user=await getWorkspaceState(req); if(!user)return error('Sign in to continue.',401);
  const plan=await resolveActionPlan(req,user.stateCode); if(!plan)return error('Plan not found.',404);
  const body=await req.json().catch(()=>null);
  const parsed=z.object({workstream:z.enum(activityWorkstreams),entity:z.enum(['line','school']),action:z.enum(['create','update','delete']),id:z.number().int().positive().optional(),schoolId:z.number().int().positive().optional(),schoolIds:z.array(z.number().int().positive()).max(10000).optional()}).safeParse(body);
  if(!parsed.success)return error('Invalid action.');
  const {workstream,entity,action,id}=parsed.data;
  if(action!=='create'&&!id)return error('Select an entry.');
  return await mutatePlan(user,plan,workstream,async db=>{
   if(entity==='school'){
    if(!hasDistribution(workstream)||action==='update')return error('Invalid distribution action.');
    // Lines send their own schoolIds (Quality Assurance/ICT line schools), so only a nonempty list means a bulk add here.
    const many=parsed.data.schoolIds;
    if(many?.length){
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
    if(action==='delete'){await db.query('UPDATE activity_line_documents SET removed_at=COALESCE(removed_at,NOW()) WHERE line_id=$1 AND plan_id=$2',[id,plan.id]);await db.query('DELETE FROM activity_plan_lines WHERE id=$1 AND plan_id=$2',[id,plan.id]);}
    else{
     const line=activityLineSchema.safeParse(body); if(!line.success)return error(line.error.issues[0].message);
     if(line.data.workstream!==workstream)return error('Invalid action.');
     const v=line.data, values=[v.activity,v.customActivity,v.description,v.quantity,v.unitCost.toFixed(2),v.strategy,v.targetGroup,v.location,v.equipment,v.rationale,v.implementationApproach,v.textbookClasses,v.textbookSubject,v.equipmentType,v.subscriptionTypes,v.websiteType,v.trainingProvider,v.targetParticipants,v.schoolLevels,v.trainingDays,v.venueType];
     if(workstream==='sbmc') {
      const existing=(await db.query("SELECT COALESCE(SUM(quantity*unit_cost),0)::text AS total FROM activity_plan_lines WHERE plan_id=$1 AND workstream='sbmc' AND ($2::bigint IS NULL OR id<>$2)",[plan.id,action==='update'?id:null])).rows[0].total;
      const problem=sbmcBudgetProblem(budgetKobo(existing)+budgetKobo(v.unitCost.toFixed(2))*BigInt(v.quantity),plan);
      if(problem)return error(problem);
     }
     // TLM and Infrastructure share one pool: count Infrastructure's packages too (the plan row is locked by mutatePlan).
     // A change that does not raise the line's cost is always allowed (older plans may already be over).
     if(workstream==='tlm') {
      const cost=budgetKobo(v.unitCost.toFixed(2))*BigInt(v.quantity);
      const before=action==='update'?budgetKobo((await db.query<{total:string}>('SELECT (quantity*unit_cost)::text AS total FROM activity_plan_lines WHERE id=$1',[id])).rows[0].total):null;
      if(before===null||cost>before){
       const pool=await readPoolState(db,plan.id,action==='update'?{component:'tlm',id:id!}:undefined);
       const problem=infrastructurePoolProblem(pool.plan,{...pool.proposed,tlm:pool.proposed.tlm+cost});
       if(problem)return error(problem,409);
      }
     }
     if(isCapped(workstream)||activityShareCaps[workstream]) {
      const others=(await db.query<{activity:number;total:string}>('SELECT activity,SUM(quantity*unit_cost)::text AS total FROM activity_plan_lines WHERE plan_id=$1 AND workstream=$2 AND ($3::bigint IS NULL OR id<>$3) GROUP BY activity',[plan.id,workstream,action==='update'?id:null])).rows;
      const problem=activityBudgetProblem(workstream,[...others.map(r=>({activity:r.activity,kobo:budgetKobo(r.total)})),{activity:v.activity,kobo:budgetKobo(v.unitCost.toFixed(2))*BigInt(v.quantity)}],plan);
      if(problem)return error(problem);
     }
     const lineId=action==='create'
      ?(await db.query<{id:number}>('INSERT INTO activity_plan_lines(activity,custom_activity,description,quantity,unit_cost,strategy,target_group,location,equipment,rationale,implementation_approach,textbook_classes,textbook_subject,equipment_type,subscription_types,website_type,training_provider,target_participants,school_levels,training_days,venue_type,plan_id,workstream) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23) RETURNING id',[...values,plan.id,workstream])).rows[0].id
      :(await db.query('UPDATE activity_plan_lines SET activity=$1,custom_activity=$2,description=$3,quantity=$4,unit_cost=$5,strategy=$6,target_group=$7,location=$8,equipment=$9,rationale=$10,implementation_approach=$11,textbook_classes=$12,textbook_subject=$13,equipment_type=$14,subscription_types=$15,website_type=$16,training_provider=$17,target_participants=$18,school_levels=$19,training_days=$20,venue_type=$21,updated_at=NOW() WHERE id=$22 AND plan_id=$23',[...values,id,plan.id]),id!);
     // Line schools must be in the plan's state; a failure here rolls back the whole save.
     if(!(await saveLineSchools(db,lineId,v.schoolIds,user.stateCode)))throw new LineSchoolsError();
     return NextResponse.json({ok:true,id:lineId});
    }
   }
   return NextResponse.json({ok:true});
  });
 }catch(cause){if(cause instanceof LineSchoolsError)return error('One or more schools were not found in your state.',404);console.error(cause);return error('Unable to save this change.',503);}
}
