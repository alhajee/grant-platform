import {NextRequest,NextResponse} from 'next/server';
import {z} from 'zod';
import {getAuthenticatedUser,sessionBinding} from '@/lib/workspace-state';
import {getPostgres} from '@/lib/postgres';
import {isUbec} from '@/lib/ubec';
import {isSameRequestOrigin} from '@/lib/request-origin';

const json=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{'Cache-Control':'no-store'}});
const destination=(role:string)=>isUbec(role)?'/ubec':'/dashboard';
export async function GET(request:NextRequest){
  try{
    const actor=await getAuthenticatedUser(request);
    if(request.nextUrl.searchParams.get('status')==='1'&&actor?.role!=='Super Admin')return json({isAdmin:false,impersonating:false});
    if(!actor)return json({error:'Sign in to continue.'},401);
    if(actor.role!=='Super Admin')return json({error:'Super-admin access required.'},403);
    const db=getPostgres();
    if(request.nextUrl.searchParams.get('status')==='1'){
      const id=request.cookies.get('ubec_impersonation')?.value;
      const session=id&&/^[0-9a-f-]{36}$/i.test(id)?(await db.query('SELECT target_name AS name,target_role AS role,target_state AS "stateCode",expires_at AS "expiresAt" FROM impersonation_sessions WHERE id=$1 AND actor_id=$2 AND session_binding=$3',[id,actor.userId,await sessionBinding(request)])).rows[0]:null;
      return json({isAdmin:true,impersonating:!!id,session});
    }
    const users=(await db.query(`SELECT id,full_name AS name,email,role,department,state_code AS "stateCode",active,can_create_plan AS "canCreatePlan",is_beap_chair AS "isBeapChair" FROM users WHERE role<>'Super Admin' ORDER BY state_code,role,full_name`)).rows;
    const history=(await db.query(`SELECT id,actor_name AS "adminName",target_name AS "targetName",target_role AS role,target_state AS "stateCode",started_at AS "startedAt",ended_at AS "endedAt",expires_at AS "expiresAt",end_reason AS "endReason",(SELECT COUNT(*)::int FROM impersonation_requests r WHERE r.impersonation_id=i.id) AS "requestCount" FROM impersonation_sessions i ORDER BY started_at DESC LIMIT 50`)).rows;
    return json({user:{name:actor.name,role:actor.role,email:actor.email},users,history});
  }catch{return json({error:'Unable to load the admin workspace.'},503);}
}
export async function POST(request:NextRequest){
  try{
    if(!isSameRequestOrigin(request))return json({error:'This action must come from the portal.'},403);
    const actor=await getAuthenticatedUser(request);
    if(!actor)return json({error:'Sign in to continue.'},401);
    if(actor.role!=='Super Admin')return json({error:'Super-admin access required.'},403);
    const parsed=z.discriminatedUnion('action',[z.object({action:z.literal('start'),userId:z.number().int().positive()}).strict(),z.object({action:z.literal('stop')}).strict()]).safeParse(await request.json().catch(()=>null));
    if(!parsed.success)return json({error:'Choose a valid user or return to admin.'},400);
    const binding=await sessionBinding(request);
    return await getPostgres().transaction(async db=>{
      await db.query('SELECT pg_advisory_xact_lock(hashtext($1))',[`impersonation:${binding}`]);
      const valid=(await db.query("SELECT id FROM users WHERE id=$1 AND active AND role='Super Admin' AND session_version=$2 FOR SHARE",[actor.userId,actor.sessionVersion])).rows[0];
      if(!valid)return json({error:'Your admin access has changed.'},403);
      const input=parsed.data;
      const target=input.action==='start'?(await db.query("SELECT id,full_name,email,role,state_code,session_version FROM users WHERE id=$1 AND active AND role<>'Super Admin' FOR SHARE",[input.userId])).rows[0]:null;
      if(input.action==='start'&&!target)return json({error:'This user is unavailable or cannot be impersonated.'},404);
      await db.query('UPDATE impersonation_sessions SET ended_at=NOW(),end_reason=$3 WHERE actor_id=$1 AND session_binding=$2 AND ended_at IS NULL',[actor.userId,binding,input.action==='stop'?'returned_to_admin':'switched_user']);
      const response=json({destination:target?destination(target.role):'/admin'});
      if(target){
        const id=crypto.randomUUID();
        await db.query("INSERT INTO impersonation_sessions(id,actor_id,target_id,actor_version,target_version,session_binding,actor_name,target_name,target_role,target_state,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW()+INTERVAL '1 hour')",[id,actor.userId,target.id,actor.sessionVersion,target.session_version,binding,actor.name,target.full_name,target.role,target.state_code]);
        response.cookies.set('ubec_impersonation',id,{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'strict',path:'/',maxAge:60*60*12});
      }else response.cookies.delete('ubec_impersonation');
      return response;
    });
  }catch{return json({error:'Unable to switch users. Please try again.'},503);}
}
