import { NextRequest, NextResponse } from 'next/server';
import { ubecSeesPillarSql } from '@/lib/ubec-flow-db';
import { getWorkspaceState } from '@/lib/workspace-state';
import { getPostgres } from '@/lib/postgres';

export async function GET(request:NextRequest) {
  try {
    const user=await getWorkspaceState(request);
    if(!user)return NextResponse.json({error:'Sign in to download this document.'},{status:401});
    const id=request.nextUrl.searchParams.get('id');
    if(!id||! /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))return NextResponse.json({error:'Document not found.'},{status:404});
    const result=await getPostgres().query(`SELECT d.name,d.media_type,d.content FROM plan_documents d JOIN action_plans p ON p.id=d.plan_id WHERE d.id=$1 AND (
      (p.state_code=$2 AND $3=ANY(ARRAY['Data Entry Staff','Director','Executive Chairman'])) OR
      EXISTS(SELECT 1 FROM ubec_rounds r WHERE r.plan_id=p.id AND ${ubecSeesPillarSql('r','NULL::text','$3::text','$5::int','$4::text')})
    )`,[id,user.stateCode,user.role,user.department,user.userId]);
    const doc=result.rows[0];
    if(!doc)return NextResponse.json({error:'Document not found.'},{status:404});
    return new Response(new Uint8Array(doc.content),{headers:{'Content-Type':doc.media_type,'Content-Disposition':`attachment; filename="RAT-document"; filename*=UTF-8''${encodeURIComponent(doc.name).replace(/'/g,'%27')}`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"sandbox; default-src 'none'"}});
  } catch {return NextResponse.json({error:'Unable to download the document.'},{status:503});}
}
