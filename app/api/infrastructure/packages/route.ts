import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getWorkspaceState } from '@/lib/workspace-state';
import { resolveActionPlan } from '@/lib/plan-workspace';
import { getPostgres } from '@/lib/postgres';
import { mutatePlan } from '@/lib/plan-mutations';
import { canViewComponent } from '@/lib/subeb-access';
import { mayEditPillar, readPillarReviews } from '@/lib/pillar-review';
import { packageSchema, profileSchema, packageProblem, calculateInfrastructure } from '@/lib/infrastructure-model';
const error=(message:string,status=400)=>NextResponse.json({error:message},{status});
const schoolFields='id,name,lga,level,location,enrolment_male AS male,enrolment_female AS female,latitude,longitude';
export async function GET(req:NextRequest){
 try{
  const user=await getWorkspaceState(req);if(!user)return error('Sign in to continue.',401);
  if(!canViewComponent(user,'infrastructure'))return error('Infrastructure belongs to another department.',403);
  const plan=await resolveActionPlan(req,user.stateCode);if(!plan)return error('Plan not found.',404);
  const db=getPostgres();
  const [schools,packages,documents,reviews]=await Promise.all([
   db.query(`SELECT ${schoolFields} FROM schools WHERE state_code=$1 ORDER BY name`,[user.stateCode]),
   db.query(`SELECT p.*,p.result->'school' AS school FROM infrastructure_packages p WHERE p.plan_id=$1 ORDER BY p.id DESC`,[plan.id]),
   db.query('SELECT d.id,d.kind,d.name,d.size,d.school_id AS "schoolId",s.name AS "schoolName" FROM infrastructure_documents d LEFT JOIN schools s ON s.id=d.school_id WHERE d.plan_id=$1 AND d.removed_at IS NULL ORDER BY d.created_at',[plan.id]),readPillarReviews(db,plan.id)]);
  return NextResponse.json({plan,schools:schools.rows,packages:packages.rows,documents:documents.rows,canEdit:mayEditPillar(user.role,user.departments ?? user.department,'infrastructure',plan.status,reviews)},{headers:{'Cache-Control':'no-store'}});
 }catch(cause){console.error(cause);return error('Unable to load infrastructure.',503);}
}
export async function POST(req:NextRequest){
 try{
  const user=await getWorkspaceState(req);if(!user)return error('Sign in to continue.',401);
  const plan=await resolveActionPlan(req,user.stateCode);if(!plan)return error('Plan not found.',404);
  const raw=await req.json().catch(()=>null);
  const command=z.object({action:z.enum(['save','delete','profile']),id:z.number().int().positive().optional(),version:z.number().int().positive().optional(),schoolId:z.number().int().positive().optional(),input:z.unknown().optional(),profile:z.unknown().optional()}).safeParse(raw);
  if(!command.success)return error('Invalid package action.');
  const v=command.data;
  return await mutatePlan(user,plan,'infrastructure',async db=>{
   if(v.action==='profile'){
    const profile=profileSchema.safeParse(v.profile);if(!profile.success||!v.schoolId)return error('Enter valid school enrolment and coordinates.');
    const p=profile.data;
    const current=(await db.query('SELECT enrolment_male,enrolment_female FROM schools WHERE id=$1 AND state_code=$2 FOR UPDATE',[v.schoolId,user.stateCode])).rows[0];
    if(!current)return error('School not found.',404);
    const maleEnrolmentLocked=Number(current.enrolment_male)>0;
    const femaleEnrolmentLocked=Number(current.enrolment_female)>0;
    const updated=await db.query('UPDATE schools SET enrolment_male=$1,enrolment_female=$2,latitude=$3,longitude=$4 WHERE id=$5 AND state_code=$6',[maleEnrolmentLocked?current.enrolment_male:p.male,femaleEnrolmentLocked?current.enrolment_female:p.female,p.latitude,p.longitude,v.schoolId,user.stateCode]);
    return updated.rowCount?NextResponse.json({ok:true}):error('School not found.',404);
   }
   const prior=v.id?(await db.query('SELECT * FROM infrastructure_packages WHERE id=$1 AND plan_id=$2 FOR UPDATE',[v.id,plan.id])).rows[0]:null;
   if(v.id&&!prior)return error('Package not found.',404);
   if(prior&&prior.version!==v.version)return error('This package has changed. Reopen it before saving.',409);
   if(v.action==='delete'){
    if(!prior)return error('Select a package.');
    await db.query('DELETE FROM infrastructure_packages WHERE id=$1 AND plan_id=$2',[v.id,plan.id]);return NextResponse.json({ok:true});
   }
   const parsed=packageSchema.safeParse(v.input);if(!parsed.success)return error(parsed.error.issues[0].message);
   const input=parsed.data;
   const school=(await db.query(`SELECT ${schoolFields} FROM schools WHERE id=$1 AND state_code=$2 FOR SHARE`,[input.schoolId,user.stateCode])).rows[0];
   if(!school)return error('Select a school from your state register.',404);
   const problem=packageProblem(input,school.male+school.female);if(problem)return error(problem);
   const docs=(await db.query('SELECT id,kind,created_at,school_id FROM infrastructure_documents WHERE plan_id=$1 AND removed_at IS NULL AND id=ANY($2::uuid[])',[plan.id,input.documentIds])).rows;
   if(new Set(input.documentIds).size!==docs.length)return error('One or more attachments do not belong to this plan.');
   if(docs.some(d=>d.school_id!==null&&d.school_id!==input.schoolId))return error('One or more attachments belong to a different school.');
   const primaryAudit=input.audit.classroomPri;
   if(input.kind==='whole'&&primaryAudit&&primaryAudit.existing>primaryAudit.functional&&!docs.some(d=>d.kind==='photo'))return error('Attach photographic evidence for the Whole School audit.');
   if(prior&&prior.kind!==input.kind)return error('An existing package’s intervention type cannot be changed.');
   if(prior?.kind==='whole'&&!docs.some(d=>d.kind==='boq'&&d.school_id===input.schoolId&&!prior.input.documentIds.includes(d.id)&&new Date(d.created_at)>new Date(prior.updated_at)))return error('Attach an updated BOQ for this school before saving changes to a Whole School Renovation/Expansion package.');
   const result={...calculateInfrastructure(input,school.male+school.female),school};
   const args=[JSON.stringify(input),JSON.stringify(result),result.total.toFixed(2),input.schoolId,input.kind];
   if(prior)await db.query('UPDATE infrastructure_packages SET input=$1::jsonb,result=$2::jsonb,total_cost=$3,school_id=$4,kind=$5,version=version+1,updated_at=NOW() WHERE id=$6 AND plan_id=$7',[...args,v.id,plan.id]);
   else await db.query('INSERT INTO infrastructure_packages(input,result,total_cost,school_id,kind,plan_id) VALUES($1::jsonb,$2::jsonb,$3,$4,$5,$6)',[...args,plan.id]);
   return NextResponse.json({ok:true});
  });
 }catch(cause){console.error(cause);return error('Unable to save the infrastructure package.',503);}
}
