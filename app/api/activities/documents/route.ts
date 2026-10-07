import { NextRequest, NextResponse } from 'next/server';
import { ubecSeesPillarSql } from '@/lib/ubec-flow-db';
import { z } from 'zod';
import { getWorkspaceState } from '@/lib/workspace-state';
import { resolveActionPlan } from '@/lib/plan-workspace';
import { getPostgres } from '@/lib/postgres';
import { mutatePlan } from '@/lib/plan-mutations';
import { readStageVisibility } from '@/lib/stage-visibility';
import type { ImplementedPillar } from '@/lib/beap-pillars';
import { planFormData, PlanInputError } from '@/lib/plan-upload';
import { documentWorkstreams } from '@/lib/activity-plans';

// Component documents (component_documents, migration 036): the Supervision & Monitoring proforma invoices.
const error=(message:string,status=400)=>NextResponse.json({error:message},{status});
const component=z.enum(documentWorkstreams);
const perComponentLimit=20;
const types:Record<string,string>={pdf:'application/pdf',docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',xlsx:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',xls:'application/vnd.ms-excel',png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg'};
function validContent(ext:string,bytes:Buffer){
 const hex=(n:number)=>bytes.subarray(0,n).toString('hex');
 return ext==='pdf'?bytes.subarray(0,5).toString()==='%PDF-':ext==='xls'?hex(8)==='d0cf11e0a1b11ae1':ext==='png'?hex(8)==='89504e470d0a1a0a':['jpg','jpeg'].includes(ext)?hex(3)==='ffd8ff':['docx','xlsx'].includes(ext)&&hex(4)==='504b0304';
}
export async function POST(req:NextRequest){
 try{
  const user=await getWorkspaceState(req);if(!user)return error('Sign in to upload documents.',401);
  const plan=await resolveActionPlan(req,user.stateCode);if(!plan)return error('Plan not found.',404);
  const form=await planFormData(req),workstream=component.safeParse(form.get('workstream'));
  if(!workstream.success)return error('Choose a component that accepts documents.');
  const file=form.get('file');if(!file||typeof file==='string'||!file.size||file.size>5*1024*1024)return error('Choose a nonempty file up to 5 MB.');
  const name=file.name.replace(/[\x00-\x1f\x7f/\\]/g,'_').slice(-180),ext=name.split('.').pop()?.toLowerCase()??'';
  const bytes=Buffer.from(await file.arrayBuffer());
  if(!types[ext]||!validContent(ext,bytes))return error('Use a valid PDF, DOCX, XLSX, XLS, PNG or JPEG file.');
  return await mutatePlan(user,plan,workstream.data,async db=>{
   const count=(await db.query('SELECT COUNT(*)::int AS count FROM component_documents WHERE plan_id=$1 AND component=$2 AND removed_at IS NULL',[plan.id,workstream.data])).rows[0].count;
   if(count>=perComponentLimit)return error(`This component has reached its ${perComponentLimit}-document limit.`);
   const id=crypto.randomUUID();
   await db.query("INSERT INTO component_documents(id,plan_id,component,name,media_type,content,size) VALUES($1,$2,$3,$4,$5,decode($6,'hex'),$7)",[id,plan.id,workstream.data,name,types[ext],bytes.toString('hex'),bytes.length]);
   return NextResponse.json({id,name,size:bytes.length});
  });
 }catch(cause){if(cause instanceof PlanInputError)return error(cause.message,cause.status);console.error(cause);return error('Unable to upload the document.',503);}
}
export async function DELETE(req:NextRequest){
 try{
  const user=await getWorkspaceState(req);if(!user)return error('Sign in to remove documents.',401);
  const plan=await resolveActionPlan(req,user.stateCode);if(!plan)return error('Plan not found.',404);
  const id=z.string().uuid().safeParse(req.nextUrl.searchParams.get('id')),workstream=component.safeParse(req.nextUrl.searchParams.get('workstream'));
  if(!id.success||!workstream.success)return error('Document not found.',404);
  return await mutatePlan(user,plan,workstream.data,async db=>{
   const removed=await db.query('UPDATE component_documents SET removed_at=NOW() WHERE id=$1 AND plan_id=$2 AND component=$3 AND removed_at IS NULL',[id.data,plan.id,workstream.data]);
   return removed.rowCount?NextResponse.json({ok:true}):error('Document not found.',404);
  });
 }catch(cause){console.error(cause);return error('Unable to remove the document.',503);}
}
// State users who can view the component, the UBEC ES for documents in a UBEC submission, and UBEC reviewers assigned that component.
export async function GET(req:NextRequest){
 try{
  const user=await getWorkspaceState(req);if(!user)return error('Sign in to download.',401);
  const id=z.string().uuid().safeParse(req.nextUrl.searchParams.get('id'));if(!id.success)return error('Document not found.',404);
  const db=getPostgres();
  // State users: only once the component has reached them (lib/stage-visibility.ts).
  const owner=(await db.query<{planId:number;component:ImplementedPillar;stateCode:string}>('SELECT d.plan_id AS "planId",d.component,p.state_code AS "stateCode" FROM component_documents d JOIN action_plans p ON p.id=d.plan_id WHERE d.id=$1',[id.data])).rows[0];
  if(!owner)return error('Document not found.',404);
  const stateVisible=owner.stateCode===user.stateCode&&(await readStageVisibility(db,user,owner.planId)).includes(owner.component);
  const doc=(await db.query(`SELECT d.name,d.media_type,d.content,d.component FROM component_documents d JOIN action_plans p ON p.id=d.plan_id WHERE d.id=$1 AND (
    (p.state_code=$2 AND $3) OR
    EXISTS(SELECT 1 FROM ubec_rounds r WHERE r.plan_id=p.id AND (r.snapshot->'componentDocuments') @> jsonb_build_array(jsonb_build_object('id',d.id::text)) AND ${ubecSeesPillarSql('r','d.component','$4::text','$6::int','$5::text')})
  )`,[id.data,user.stateCode,stateVisible,user.role,user.department,user.userId])).rows[0];
  if(!doc)return error('Document not found.',404);
  return new Response(new Uint8Array(doc.content),{headers:{'Content-Type':doc.media_type,'Content-Disposition':`attachment; filename="component-document"; filename*=UTF-8''${encodeURIComponent(doc.name).replace(/'/g,'%27')}`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"sandbox; default-src 'none'"}});
 }catch(cause){console.error(cause);return error('Unable to download.',503);}
}
