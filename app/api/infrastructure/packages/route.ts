import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getWorkspaceState } from '@/lib/workspace-state';
import { resolveActionPlan } from '@/lib/plan-workspace';
import { getPostgres } from '@/lib/postgres';
import { cachedSchoolList } from '@/lib/school-cache';
import { mutatePlan } from '@/lib/plan-mutations';
import { canManageSchoolRegister, canViewComponent } from '@/lib/subeb-access';
import { notSentYetMessage, readStageVisibility } from '@/lib/stage-visibility';
import { manualSchoolsAllowed } from '@/lib/school-register-source';
import { mayEditPillar, readPillarReviews } from '@/lib/pillar-review';
import { infrastructurePoolProblem } from '@/lib/infrastructure-pool';
import { readPoolState } from '@/lib/infrastructure-pool-db';
import { isSplitMode, toKobo } from '@/lib/funding-policy';
import { infrastructureSplitProblem } from '@/lib/budget-pairs';
import { resolveLineQuarters } from '@/lib/line-quarters';
import { readPlanQuarterSetup } from '@/lib/line-quarters-db';
import { clientKeySchema } from '@/lib/save-request';
import { readComponentDocumentsRequired } from '@/lib/component-documents-setting';
import { packageSchema, packageProblem, calculateInfrastructure, landDocumentProblem, schoolComponents, schoolFacts, auditGaps, photoEvidenceProblem } from '@/lib/infrastructure-model';
const error=(message:string,status=400)=>NextResponse.json({error:message},{status});
// teachers (DNEMIS D.2) sizes the Whole School staff rooms; enrolment_by_class splits enrolment by level.
const schoolFields='id,name,lga,level,location,enrolment_male AS male,enrolment_female AS female,latitude,longitude,enrolment_by_class AS "enrolmentByClass",teachers';
export async function GET(req:NextRequest){
 try{
  const user=await getWorkspaceState(req);if(!user)return error('Sign in to continue.',401);
  if(!canViewComponent(user,'infrastructure'))return error('Infrastructure belongs to another department.',403);
  const plan=await resolveActionPlan(req,user.stateCode);if(!plan)return error('Plan not found.',404);
  const db=getPostgres();
  if(!(await readStageVisibility(db,user,plan.id)).includes('infrastructure'))return error(notSentYetMessage,403);
  const [schools,packages,documents,reviews]=await Promise.all([
   cachedSchoolList(user.stateCode,'infrastructure-v2',async()=>(await db.query(`SELECT ${schoolFields} FROM schools WHERE state_code=$1 ORDER BY name`,[user.stateCode])).rows),
   db.query(`SELECT p.*,p.result->'school' AS school FROM infrastructure_packages p WHERE p.plan_id=$1 ORDER BY p.id DESC`,[plan.id]),
   db.query('SELECT d.id,d.kind,d.name,d.size,d.school_id AS "schoolId",s.name AS "schoolName" FROM infrastructure_documents d LEFT JOIN schools s ON s.id=d.school_id WHERE d.plan_id=$1 AND d.removed_at IS NULL ORDER BY d.created_at',[plan.id]),readPillarReviews(db,plan.id)]);
  // Infrastructure shares its pool with TLM (split or shared, by the platform mode): the editor shows what TLM's lines already propose
  // (tlmProposed, also as partnerProposed like the activity editors).
  // While schools come from DNEMIS only, nobody is offered the School register edit link.
  const manualSchools=await manualSchoolsAllowed(db);
  const tlmProposed=(await db.query<{total:string}>("SELECT COALESCE(SUM(quantity*unit_cost),0)::text AS total FROM activity_plan_lines WHERE plan_id=$1 AND workstream='tlm'",[plan.id])).rows[0].total;
  // documentsRequired: the Super Admin's Supporting documents setting (migration 052); land documents are required either way.
  return NextResponse.json({plan,schools,packages:packages.rows,tlmProposed,partnerProposed:tlmProposed,documents:documents.rows,documentsRequired:await readComponentDocumentsRequired(db),canEdit:mayEditPillar(user.role,user.departments ?? user.department,'infrastructure',plan.status,reviews),canManageSchools:manualSchools&&canManageSchoolRegister(user.role,user.isBeapChair,user.canManageSchools),manualSchools},{headers:{'Cache-Control':'no-store'}});
 }catch(cause){console.error(cause);return error('Unable to load infrastructure.',503);}
}
export async function POST(req:NextRequest){
 try{
  const user=await getWorkspaceState(req);if(!user)return error('Sign in to continue.',401);
  const plan=await resolveActionPlan(req,user.stateCode);if(!plan)return error('Plan not found.',404);
  const raw=await req.json().catch(()=>null);
  const command=z.object({action:z.enum(['save','delete']),id:z.number().int().positive().optional(),version:z.number().int().positive().optional(),input:z.unknown().optional(),clientKey:clientKeySchema}).safeParse(raw);
  if(!command.success)return error('Invalid package action.');
  const v=command.data;
  return await mutatePlan(user,plan,'infrastructure',async db=>{
   // School enrolment and coordinates are edited only in the School register (/api/schools, UBEC07).
   const prior=v.id?(await db.query('SELECT * FROM infrastructure_packages WHERE id=$1 AND plan_id=$2 FOR UPDATE',[v.id,plan.id])).rows[0]:null;
   if(v.id&&!prior)return error('Package not found.',404);
   // A new package repeated with the same client key (the first reply was lost) returns the package already saved,
   // without inserting again or re-checking the pool against a total that already includes it (migration 058).
   if(v.action==='save'&&!v.id&&v.clientKey){
    const replay=(await db.query<{id:number}>('SELECT id FROM infrastructure_packages WHERE plan_id=$1 AND client_key=$2',[plan.id,v.clientKey])).rows[0];
    if(replay)return NextResponse.json({ok:true,id:replay.id,replayed:true});
   }
   if(prior&&prior.version!==v.version)return error('This package has changed. Reopen it before saving.',409);
   if(v.action==='delete'){
    if(!prior)return error('Select a package.');
    await db.query('DELETE FROM infrastructure_packages WHERE id=$1 AND plan_id=$2',[v.id,plan.id]);return NextResponse.json({ok:true});
   }
   const parsed=packageSchema.safeParse(v.input);if(!parsed.success)return error(parsed.error.issues[0].message);
   // HOPE targeting is retired (UBEC10): every new-school package is costed as one Non-HOPE package.
   // Timeline: within the plan's quarters, read under the plan lock; none sent = the plan's quarters (migration 050).
   const timeline=resolveLineQuarters(parsed.data.quarters,await readPlanQuarterSetup(db,plan.id));if(timeline.problem)return error(timeline.problem);
   const base={...(parsed.data.kind==='new'?{...parsed.data,targeting:'nonhope' as const}:parsed.data),quarters:timeline.quarters};
   const school=(await db.query(`SELECT ${schoolFields} FROM schools WHERE id=$1 AND state_code=$2 FOR SHARE`,[base.schoolId,user.stateCode])).rows[0];
   if(!school)return error('Select a school from your state register.',404);
   // School components are read-only: always taken from the School register.
   const draft={...base,components:schoolComponents(school)};
   const facts=schoolFacts(school);
   const problem=packageProblem(draft,facts);if(problem)return error(problem);
   const docs=(await db.query('SELECT id,kind,created_at,school_id FROM infrastructure_documents WHERE plan_id=$1 AND removed_at IS NULL AND id=ANY($2::uuid[])',[plan.id,draft.documentIds])).rows;
   if(new Set(draft.documentIds).size!==docs.length)return error('One or more attachments do not belong to this plan.');
   if(docs.some(d=>d.school_id!==null&&d.school_id!==draft.schoolId))return error('One or more attachments belong to a different school.');
   // New Construction: all three land declarations (packageProblem) and the C of O / R of O / Community Agreement document, always required.
   const landProblem=landDocumentProblem(draft,docs.filter(d=>d.kind==='land').length);if(landProblem)return error(landProblem);
   // Per-row photographic evidence: keep only keys that name a photo attached to this package (a removed photo drops out).
   const photoIds=docs.filter(d=>d.kind==='photo').map(d=>String(d.id));
   const input={...draft,photoKeys:Object.fromEntries(Object.entries(draft.photoKeys).filter(([id])=>photoIds.includes(id)))};
   // Photographic evidence and the updated Whole School BOQ follow the Supporting documents setting; land documents above are always required.
   const documentsRequired=await readComponentDocumentsRequired(db);
   if(documentsRequired){const photoProblem=photoEvidenceProblem(input,auditGaps(input,facts),photoIds);if(photoProblem)return error(photoProblem);}
   if(prior&&prior.kind!==input.kind)return error('An existing package’s intervention type cannot be changed.');
   if(documentsRequired&&prior?.kind==='whole'&&!docs.some(d=>d.kind==='boq'&&d.school_id===input.schoolId&&!prior.input.documentIds.includes(d.id)&&new Date(d.created_at)>new Date(prior.updated_at)))return error('Attach an updated BOQ for this school before saving changes to a Whole School Renovation/Expansion package.');
   const result={...calculateInfrastructure(input,facts),school};
   // Infrastructure and TLM share one pool; the plan row is locked by mutatePlan, so TLM saves and split changes wait for this one.
   // Split mode: packages stay within Infrastructure's part (pool − action_plans.tlm_allocation), and wait until the split is set.
   // Shared-pool mode: TLM's lines count too. A change that does not raise the package's cost is always allowed (older plans may already be over).
   const cost=toKobo(result.total.toFixed(2));
   if(!prior||cost>toKobo(String(prior.total_cost))){
    const pool=await readPoolState(db,plan.id,prior?{component:'infrastructure',id:prior.id}:undefined);
    const poolProblem=isSplitMode(pool.plan)?infrastructureSplitProblem(pool.plan,pool.proposed.infrastructure+cost):infrastructurePoolProblem(pool.plan,{...pool.proposed,infrastructure:pool.proposed.infrastructure+cost});
    if(poolProblem)return error(poolProblem,409);
   }
   const args=[JSON.stringify(input),JSON.stringify(result),result.total.toFixed(2),input.schoolId,input.kind,timeline.quarters];
   if(prior)await db.query('UPDATE infrastructure_packages SET input=$1::jsonb,result=$2::jsonb,total_cost=$3,school_id=$4,kind=$5,quarters=$6,version=version+1,updated_at=NOW() WHERE id=$7 AND plan_id=$8',[...args,v.id,plan.id]);
   else return NextResponse.json({ok:true,id:(await db.query<{id:number}>('INSERT INTO infrastructure_packages(input,result,total_cost,school_id,kind,quarters,plan_id,client_key) VALUES($1::jsonb,$2::jsonb,$3,$4,$5,$6,$7,$8) RETURNING id',[...args,plan.id,v.clientKey??null])).rows[0].id});
   return NextResponse.json({ok:true,id:prior.id});
  });
 }catch(cause){console.error(cause);return error('Unable to save the infrastructure package.',503);}
}
