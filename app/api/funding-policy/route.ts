import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { allocationSchema } from '@/lib/funding-policy';
import { getWorkspaceState } from '@/lib/workspace-state';
import { getPostgres } from '@/lib/postgres';

const fields='id, allocation, created_at AS "createdAt", actor_name AS "createdBy"';
const fail=(error:string,status:number)=>NextResponse.json({error},{status});
export async function GET(request: NextRequest) {
  try {
    const user=await getWorkspaceState(request);
    if(!user)return fail('Sign in to view allocations.',401);
    const policies=(await getPostgres().query(`SELECT ${fields} FROM funding_policies ORDER BY id DESC LIMIT 20`)).rows;
    return NextResponse.json({policy:policies[0],history:user.role==='UBEC Executive Secretary'?policies:[],canEdit:user.role==='UBEC Executive Secretary',user:{name:user.name,role:user.role}},{headers:{'Cache-Control':'no-store'}});
  } catch {return fail('Allocations could not be loaded.',503);}
}
export async function PUT(request:NextRequest) {
  try {
    const user=await getWorkspaceState(request);
    if(!user)return fail('Sign in to manage allocations.',401);
    if(user.role!=='UBEC Executive Secretary')return fail('Only the UBEC Executive Secretary can change allocations.',403);
    const parsed=z.object({version:z.number().int().positive(),allocation:allocationSchema}).strict().safeParse(await request.json().catch(()=>null));
    if(!parsed.success)return fail(parsed.error.issues[0].message,400);
    return await getPostgres().transaction(async db=>{
      await db.query("SELECT pg_advisory_xact_lock(hashtext('funding-policy'))");
      const actor=(await db.query("SELECT full_name FROM users WHERE id=$1 AND active AND session_version=$2 AND role='UBEC Executive Secretary' FOR SHARE",[user.userId,user.sessionVersion])).rows[0];
      if(!actor)return fail('Your access has changed. Sign in again.',403);
      const latest=(await db.query('SELECT id,allocation FROM funding_policies ORDER BY id DESC LIMIT 1')).rows[0];
      if(latest.id!==parsed.data.version)return fail('Allocations have changed. Reload the latest version before saving.',409);
      const policy=(await db.query(`INSERT INTO funding_policies(allocation,created_by,actor_name) VALUES($1::jsonb,$2,$3) RETURNING ${fields}`,[JSON.stringify(parsed.data.allocation),user.userId,actor.full_name])).rows[0];
      return NextResponse.json({policy},{headers:{'Cache-Control':'no-store'}});
    });
  } catch {return fail('Allocations could not be saved. Your changes have been kept in the form.',503);}
}
