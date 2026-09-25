import { canViewComponent } from '@/lib/subeb-access';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getWorkspaceState } from '@/lib/workspace-state';
import { resolveActionPlan } from '@/lib/plan-workspace';
import { getPostgres } from '@/lib/postgres';
import { mutatePlan } from '@/lib/plan-mutations';
import { mayEditPillar, readPillarReviews } from '@/lib/pillar-review';
import { activityLineSchema, activityWorkstreams } from '@/lib/activity-plans';
const error=(message:string,status=400)=>NextResponse.json({error:message},{status});
export async function GET(req:NextRequest){
 try{
  const user=await getWorkspaceState(req); if(!user)return error('Sign in to continue.',401);
  const plan=await resolveActionPlan(req,user.stateCode); if(!plan)return error('Plan not found.',404);
  const parsed=z.enum(activityWorkstreams).safeParse(req.nextUrl.searchParams.get('workstream')); if(!parsed.success)return error('Choose a component.');
  const db=getPostgres(), workstream=parsed.data;
  if(!canViewComponent(user,workstream))return error('This component belongs to another department.',403);
  const lines=(await db.query('SELECT id,workstream,activity,description,quantity,unit_cost::float8 AS "unitCost",strategy,target_group AS "targetGroup",location,equipment FROM activity_plan_lines WHERE plan_id=$1 AND workstream=$2 ORDER BY activity,id',[plan.id,workstream])).rows;
  const schools=workstream==='tlm'?(await db.query('SELECT id,name,lga,level,location FROM schools WHERE state_code=$1 ORDER BY name',[user.stateCode])).rows:[];
  const distribution=workstream==='tlm'?(await db.query('SELECT s.id,s.name,s.lga,s.level,s.location FROM tlm_distribution d JOIN schools s ON s.id=d.school_id WHERE d.plan_id=$1 AND s.state_code=$2 ORDER BY s.name',[plan.id,user.stateCode])).rows:[];
  return NextResponse.json({plan,lines,schools,distribution,canEdit:mayEditPillar(user.role,user.department,workstream,plan.status,await readPillarReviews(db,plan.id))},{headers:{'Cache-Control':'no-store'}});
 }catch(cause){console.error(cause);return error('Unable to load this component.',503);}
}
export async function POST(req:NextRequest){
 try{
  const user=await getWorkspaceState(req); if(!user)return error('Sign in to continue.',401);
  const plan=await resolveActionPlan(req,user.stateCode); if(!plan)return error('Plan not found.',404);
  const body=await req.json().catch(()=>null);
  const parsed=z.object({workstream:z.enum(activityWorkstreams),entity:z.enum(['line','school']),action:z.enum(['create','update','delete']),id:z.number().int().positive().optional(),schoolId:z.number().int().positive().optional()}).safeParse(body);
  if(!parsed.success)return error('Invalid action.');
  const {workstream,entity,action,id}=parsed.data;
  if(action!=='create'&&!id)return error('Select an entry.');
  return await mutatePlan(user,plan,workstream,async db=>{
   if(entity==='school'){
    if(workstream!=='tlm'||action==='update')return error('Invalid distribution action.');
    const schoolId=action==='delete'?id:parsed.data.schoolId;
    if(!schoolId||!Number.isSafeInteger(schoolId))return error('Select a school.');
    if(!(await db.query('SELECT id FROM schools WHERE id=$1 AND state_code=$2',[schoolId,user.stateCode])).rowCount)return error('School not found in your state.',404);
    if(action==='delete')await db.query('DELETE FROM tlm_distribution WHERE plan_id=$1 AND school_id=$2',[plan.id,schoolId]);
    else {if((await db.query('SELECT 1 FROM tlm_distribution WHERE plan_id=$1 AND school_id=$2',[plan.id,schoolId])).rowCount)return error('This school is already on the distribution list.',409);await db.query('INSERT INTO tlm_distribution(plan_id,school_id) VALUES($1,$2)',[plan.id,schoolId]);}
   }else{
    if(action!=='create'&&!(await db.query('SELECT id FROM activity_plan_lines WHERE id=$1 AND plan_id=$2 AND workstream=$3',[id,plan.id,workstream])).rowCount)return error('Entry not found.',404);
    if(action==='delete')await db.query('DELETE FROM activity_plan_lines WHERE id=$1 AND plan_id=$2',[id,plan.id]);
    else{
     const line=activityLineSchema.safeParse(body); if(!line.success)return error(line.error.issues[0].message);
     const v=line.data, values=[v.activity,v.description,v.quantity,v.unitCost.toFixed(2),v.strategy,v.targetGroup,v.location,v.equipment];
     if(action==='create')await db.query('INSERT INTO activity_plan_lines(activity,description,quantity,unit_cost,strategy,target_group,location,equipment,plan_id,workstream) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',[...values,plan.id,workstream]);
     else await db.query('UPDATE activity_plan_lines SET activity=$1,description=$2,quantity=$3,unit_cost=$4,strategy=$5,target_group=$6,location=$7,equipment=$8,updated_at=NOW() WHERE id=$9 AND plan_id=$10',[...values,id,plan.id]);
    }
   }
   return NextResponse.json({ok:true});
  });
 }catch(cause){console.error(cause);return error('Unable to save this change.',503);}
}
