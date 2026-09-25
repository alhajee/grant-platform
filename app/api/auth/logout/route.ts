import { NextRequest, NextResponse } from "next/server";
import {getAuthenticatedUser,sessionBinding} from '@/lib/workspace-state';
import {getPostgres} from '@/lib/postgres';

export async function POST(request:NextRequest) {
  if(request.headers.get('origin') && request.headers.get('origin')!==request.nextUrl.origin)return NextResponse.json({error:'Invalid origin.'},{status:403});
  try{
    const actor=await getAuthenticatedUser(request);
    if(actor?.role==='Super Admin')await getPostgres().query("UPDATE impersonation_sessions SET ended_at=NOW(),end_reason='signed_out' WHERE actor_id=$1 AND session_binding=$2 AND ended_at IS NULL",[actor.userId,await sessionBinding(request)]);
    if(actor?.adminSessionId)await getPostgres().query('DELETE FROM sessions WHERE token=$1 AND user_id=$2',[actor.adminSessionId,actor.userId]);
  }catch{return NextResponse.json({error:'Unable to sign out. Try again.'},{status:503});}
  const response = NextResponse.json({ ok: true });
  response.cookies.delete("ubec_session");
  response.cookies.delete('ubec_impersonation');
  return response;
}
