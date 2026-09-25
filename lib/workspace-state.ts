import type { NextRequest } from "next/server";
import { getLocalSessionUser } from "@/lib/local-session";
import { getPostgres } from "@/lib/postgres";

// Simple-query literals are used in the local Workers PostgreSQL adapter.
export function sqlText(value: string) {
  return `'${value.replaceAll("'", "''")}'`;
}

export async function getAuthenticatedUser(request: NextRequest) {
  let user;
  try { user = await getLocalSessionUser(request); } catch { return null; }
  if (!user) return null;
  const { rows } = await getPostgres().query<{ stateCode: string; role: string; name: string; userId: number; department: string | null; canCreatePlan: boolean; isBeapChair: boolean }>(
    `SELECT id AS "userId", full_name AS name, role, department, can_create_plan AS "canCreatePlan", is_beap_chair AS "isBeapChair", state_code AS "stateCode" FROM users WHERE email = $1 AND active AND session_version = $2`, [user.email, user.sessionVersion ?? 0],
  );
  if(rows[0]?.role==='Super Admin'&&(!user.adminSessionId||!(await getPostgres().query('SELECT 1 FROM sessions WHERE token=$1 AND user_id=$2 AND expires_at>NOW()',[user.adminSessionId,rows[0].userId])).rowCount))return null;
  return rows[0] ? { ...rows[0], email: user.email, sessionVersion: user.sessionVersion ?? 0, adminSessionId:user.adminSessionId } : null;
}

export async function sessionBinding(request: NextRequest) {
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(request.cookies.get('ubec_session')?.value??''));
  return Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
}

export async function getWorkspaceState(request: NextRequest) {
  const actor=await getAuthenticatedUser(request);
  if(!actor)return null;
  const id=request.cookies.get('ubec_impersonation')?.value;
  if(!id)return {...actor,impersonation:undefined};
  if(actor.role!=='Super Admin'||!/^[0-9a-f-]{36}$/i.test(id))return null;
  const db=getPostgres();
  const target=(await db.query(`SELECT u.id AS "userId",u.full_name AS name,u.email,u.role,u.department,u.can_create_plan AS "canCreatePlan",u.is_beap_chair AS "isBeapChair",u.state_code AS "stateCode",u.session_version AS "sessionVersion",i.expires_at AS "expiresAt"
    FROM impersonation_sessions i JOIN users u ON u.id=i.target_id
    WHERE i.id=$1 AND i.actor_id=$2 AND i.actor_version=$3 AND i.session_binding=$4
      AND i.ended_at IS NULL AND i.expires_at>NOW() AND u.active AND u.session_version=i.target_version AND u.role<>'Super Admin'`,[id,actor.userId,actor.sessionVersion,await sessionBinding(request)])).rows[0];
  // Never silently fall back to administrator permissions when impersonation expires.
  if(!target)return null;
  if(!['GET','HEAD','OPTIONS'].includes(request.method))await db.query('INSERT INTO impersonation_requests(impersonation_id,method,path) VALUES($1,$2,$3)',[id,request.method,request.nextUrl.pathname]);
  const {expiresAt,...workspace}=target;
  return {...workspace,impersonation:{id,adminName:actor.name,expiresAt}} as typeof actor & {impersonation:{id:string;adminName:string;expiresAt:string}};
}

export const constructionTypeFields = `id, name, classrooms, playrooms_labs AS "playroomsLabs", libraries, toilets,
  offices_stores AS "officesStores", duration, unit_cost::float8 AS "unitCost"`;
