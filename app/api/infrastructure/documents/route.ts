import { NextRequest, NextResponse } from 'next/server';
import { ubecSeesPillarSql } from '@/lib/ubec-flow-db';
import { getWorkspaceState } from '@/lib/workspace-state';
import { resolveActionPlan } from '@/lib/plan-workspace';
import { getPostgres } from '@/lib/postgres';
import { mutatePlan } from '@/lib/plan-mutations';
import { readStageVisibility } from '@/lib/stage-visibility';
import { planFormData,PlanInputError } from '@/lib/plan-upload';
import { z } from 'zod';
const error=(message:string,status=400)=>NextResponse.json({error:message},{status});
export async function DELETE(req:NextRequest){
 try{
  const user=await getWorkspaceState(req);if(!user)return error('Sign in to remove documents.',401);
  const plan=await resolveActionPlan(req,user.stateCode);if(!plan)return error('Plan not found.',404);
  const id=z.string().uuid().safeParse(req.nextUrl.searchParams.get('id'));if(!id.success)return error('Document not found.',404);
  return await mutatePlan(user,plan,'infrastructure',async db=>{
   const removed=await db.query('UPDATE infrastructure_documents SET removed_at=NOW() WHERE id=$1 AND plan_id=$2 AND removed_at IS NULL RETURNING id',[id.data,plan.id]);
   if(!removed.rowCount)return error('Document not found.',404);
   const updated=await db.query(`UPDATE infrastructure_packages SET input=jsonb_set(input,'{documentIds}',(input->'documentIds') - $1::text),version=version+1 WHERE plan_id=$2 AND (input->'documentIds') ? $1 RETURNING id,version`,[id.data,plan.id]);
   return NextResponse.json({ok:true,packages:updated.rows});
  });
 }catch(cause){console.error(cause);return error('Unable to remove the document.',503);}
}
export async function POST(req:NextRequest){
 try{
  const user=await getWorkspaceState(req);if(!user)return error('Sign in to upload documents.',401);
  const plan=await resolveActionPlan(req,user.stateCode);if(!plan)return error('Plan not found.',404);
  const form=await planFormData(req),kind=z.enum(['drawings','boq','survey','land','photo']).safeParse(form.get('kind'));
  if(!kind.success)return error('Choose the document type.');
  const schoolId=kind.data==='drawings'?null:Number(form.get('schoolId'));
  if(kind.data!=='drawings'&&(!Number.isSafeInteger(schoolId)||!schoolId||schoolId<1))return error('Select the school for this document.');
  const file=form.get('file');if(!file||typeof file==='string'||!file.size||file.size>5*1024*1024)return error('Choose a nonempty file up to 5 MB.');
  const name=file.name.replace(/[\x00-\x1f\x7f/\\]/g,'_').slice(-180),ext=name.split('.').pop()?.toLowerCase();
  const bytes=Buffer.from(await file.arrayBuffer());
  const types:Record<string,string>={pdf:'application/pdf',xls:'application/vnd.ms-excel',docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',xlsx:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg'};
  const allowed=kind.data==='boq'?['pdf','xls','xlsx']:['pdf','docx','xlsx','png','jpg','jpeg'];
  const valid=ext==='pdf'?bytes.subarray(0,5).toString()==='%PDF-':ext==='xls'?bytes.subarray(0,8).toString('hex')==='d0cf11e0a1b11ae1':ext==='png'?bytes.subarray(0,8).toString('hex')==='89504e470d0a1a0a':['jpg','jpeg'].includes(ext??'')?bytes.subarray(0,3).toString('hex')==='ffd8ff':['docx','xlsx'].includes(ext??'')&&bytes.subarray(0,4).toString('hex')==='504b0304';
  if(!ext||!allowed.includes(ext)||!types[ext]||!valid)return error(kind.data==='boq'?'Upload the BOQ as a valid Excel (.xls or .xlsx) or PDF file.':'Use a valid PDF, DOCX, XLSX, PNG or JPEG file.');
  return await mutatePlan(user,plan,'infrastructure',async db=>{
   if(schoolId&&!(await db.query('SELECT id FROM schools WHERE id=$1 AND state_code=$2',[schoolId,user.stateCode])).rowCount)return error('School not found in your state.',404);
   const count=(await db.query('SELECT COUNT(*)::int AS count FROM infrastructure_documents WHERE plan_id=$1 AND removed_at IS NULL',[plan.id])).rows[0].count;
   if(count>=100)return error('This plan has reached its 100-document limit.');
   const id=crypto.randomUUID();await db.query("INSERT INTO infrastructure_documents(id,plan_id,kind,name,media_type,content,size,school_id) VALUES($1,$2,$3,$4,$5,decode($6,'hex'),$7,$8)",[id,plan.id,kind.data,name,types[ext],bytes.toString('hex'),bytes.length,schoolId]);
   return NextResponse.json({id,kind:kind.data,name,size:bytes.length,schoolId});
  });
 }catch(cause){if(cause instanceof PlanInputError)return error(cause.message,cause.status);console.error(cause);return error('Unable to upload the document.',503);}
}
export async function GET(req:NextRequest){
 try{
  const user=await getWorkspaceState(req);if(!user)return error('Sign in to download.',401);
  const id=z.string().uuid().safeParse(req.nextUrl.searchParams.get('id'));if(!id.success)return error('Document not found.',404);
  const db=getPostgres();
  // State users: only once Infrastructure has reached them (lib/stage-visibility.ts).
  const owner=(await db.query<{planId:number;stateCode:string}>('SELECT d.plan_id AS "planId",p.state_code AS "stateCode" FROM infrastructure_documents d JOIN action_plans p ON p.id=d.plan_id WHERE d.id=$1',[id.data])).rows[0];
  if(!owner)return error('Document not found.',404);
  const stateVisible=owner.stateCode===user.stateCode&&(await readStageVisibility(db,user,owner.planId)).includes('infrastructure');
  const doc=(await db.query(`SELECT d.* FROM infrastructure_documents d JOIN action_plans p ON p.id=d.plan_id WHERE d.id=$1 AND (
    (p.state_code=$2 AND $3) OR
    EXISTS(SELECT 1 FROM ubec_rounds r WHERE r.plan_id=p.id AND (r.snapshot->'infrastructureDocuments') @> jsonb_build_array(jsonb_build_object('id',d.id::text)) AND ${ubecSeesPillarSql('r',"'infrastructure'::text",'$4::text','$6::int','$5::text')})
  )`,[id.data,user.stateCode,stateVisible,user.role,user.department,user.userId])).rows[0];
  if(!doc)return error('Document not found.',404);
  return new Response(new Uint8Array(doc.content),{headers:{'Content-Type':doc.media_type,'Content-Disposition':`attachment; filename="infrastructure-document"; filename*=UTF-8''${encodeURIComponent(doc.name).replace(/'/g,'%27')}`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"sandbox; default-src 'none'"}});
 }catch(cause){console.error(cause);return error('Unable to download.',503);}
}
