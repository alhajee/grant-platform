import { NextRequest, NextResponse } from 'next/server';
import { hashSync } from 'bcryptjs';
import { z } from 'zod';
import { getWorkspaceState } from '@/lib/workspace-state';
import { getPostgres } from '@/lib/postgres';
import { canManageRole, canManageStateUsers, subebRoles } from '@/lib/subeb-access';
import { subebDepartments as departments } from '@/lib/subeb-departments';
import { stateDisplayName } from '@/lib/state-names';
import { departmentsContain, normalizeDepartments, replaceUserDepartments, userDepartmentsSql } from '@/lib/user-departments';

const fail = (error: string, status = 400) => NextResponse.json({ error }, { status });
const profile = z.object({ name: z.string().trim().min(2).max(120), role: z.enum(['Data Entry Staff', 'Director']), department: z.string().nullable().optional(), departments: z.array(z.string().trim().min(1)).min(1).max(32).optional(), active: z.boolean(), canCreatePlan: z.boolean().optional(), canManageSchools: z.boolean().optional(), isBeapChair: z.boolean().optional() });
const create = profile.extend({ email: z.string().trim().toLowerCase().email().max(254) }).strict();
const edit = profile.extend({ id: z.number().int().positive() }).strict();
const reset = z.object({ id: z.number().int().positive(), action: z.literal('reset_password') }).strict();
const fields = `id, full_name AS name, email, role, department, ${userDepartmentsSql('users')} AS departments, active, can_create_plan AS "canCreatePlan", can_manage_schools AS "canManageSchools", is_beap_chair AS "isBeapChair"`;
const noStore = { 'Cache-Control': 'no-store' };

export async function GET(request: NextRequest) {
  try {
    const actor = await getWorkspaceState(request);
    if (!actor) return fail('Sign in to manage users.', 401);
    if (!canManageStateUsers(actor.role)) return fail('Only your state Director and Executive Chairman can manage users.', 403);
    const users = (await getPostgres().query(`SELECT ${fields} FROM users WHERE state_code=$1 AND role=ANY($2::text[]) ORDER BY active DESC, full_name, id`, [actor.stateCode, subebRoles])).rows;
    return NextResponse.json({ users, actorId: actor.userId, role: actor.role, department: actor.department, departments: actor.departments, stateName: stateDisplayName(actor.stateCode) }, { headers: noStore });
  } catch { return fail('Unable to load users. Please try again.', 503); }
}

async function mutate(request: NextRequest, creating: boolean) {
  try {
    const workspace = await getWorkspaceState(request);
    if (!workspace) return fail('Sign in to manage users.', 401);
    if (!canManageStateUsers(workspace.role)) return fail('You cannot manage users.', 403);
    const parsed = (creating ? create : z.union([edit, reset])).safeParse(await request.json().catch(() => null));
    if (!parsed.success) return fail('Enter a valid name, email, role and department.');
    const input = parsed.data;
    return await getPostgres().transaction(async db => {
      // Serialize state account changes, then recheck authority inside the transaction.
      await db.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`users:${workspace.stateCode}`]);
      const actor = (await db.query(`SELECT role,department,${userDepartmentsSql('users')} AS departments FROM users WHERE id=$1 AND active AND session_version=$2 FOR SHARE`, [workspace.userId, workspace.sessionVersion])).rows[0];
      if (!actor || !canManageStateUsers(actor.role)) return fail('Your access has changed. Sign in again.', 403);
      const target = 'id' in input ? (await db.query(`SELECT ${fields} FROM users WHERE id=$1 AND state_code=$2 FOR UPDATE`, [input.id, workspace.stateCode])).rows[0] : null;
      if ('id' in input && !target) return fail('User not found.', 404);
      if (target && (target.id === workspace.userId || !canManageRole(actor.role, target.role))) return fail('You cannot change this account.', 403);
      if (actor.role === 'Director' && target && !departmentsContain(actor.departments, target.departments)) return fail('You can manage only staff whose departments are within your assignment.', 403);
      const resetting = 'action' in input;
      if (!resetting) {
        const selectedDepartments = normalizeDepartments(input.departments?.length ? input.departments : input.department);
        if (input.isBeapChair !== undefined && actor.role !== 'Executive Chairman') return fail('Only the Executive Chairman can appoint the BEAP Chair.', 403);
        const chair = input.isBeapChair ?? target?.isBeapChair ?? false;
        if (chair && (input.role !== 'Director' || !selectedDepartments.length)) return fail('The BEAP Chair must be a department Director.');
        if (chair && (await db.query('SELECT id FROM users WHERE state_code=$1 AND is_beap_chair AND id<>$2', [workspace.stateCode,target?.id ?? 0])).rowCount) return fail('This state already has a BEAP Chair. Remove the existing appointment before nominating another Director.',409);
        if (input.canCreatePlan !== undefined && actor.role !== 'Executive Chairman') return fail('Only the Executive Chairman can grant or revoke plan creation.', 403);
        if (input.canManageSchools !== undefined && actor.role !== 'Executive Chairman') return fail('Only the Executive Chairman can grant or revoke school register access.', 403);
        if (!canManageRole(actor.role, input.role)) return fail('Only the Executive Chairman can appoint a Director.', 403);
        if (!selectedDepartments.length || selectedDepartments.some(department => !departments.some(d => d.id === department))) return fail('Choose at least one valid department for this user.');
        if (actor.role === 'Director' && !departmentsContain(actor.departments, selectedDepartments)) return fail('You can assign staff only to your own departments.', 403);
        if (input.role === 'Director' && !input.isBeapChair && input.active && (await db.query("SELECT u.id FROM users u JOIN user_departments ud ON ud.user_id=u.id WHERE u.state_code=$1 AND ud.department=ANY($2::text[]) AND u.role='Director' AND NOT u.is_beap_chair AND u.active AND u.id<>$3 LIMIT 1", [workspace.stateCode, selectedDepartments, target?.id ?? 0])).rowCount) return fail('One or more selected departments already has an active Director.', 409);
      }
      // Credentials are revealed once, never stored in audit records or logs.
      const password = creating || resetting ? `Ubec-${crypto.randomUUID()}!` : undefined;
      let id = target?.id;
      if ('email' in input) {
        if ((await db.query('SELECT id FROM users WHERE email=$1', [input.email])).rowCount) return fail('An account already uses this email address.', 409);
        const selectedDepartments = normalizeDepartments(input.departments?.length ? input.departments : input.department);
        id = (await db.query('INSERT INTO users(full_name,email,password_hash,role,department,state_code,active,can_create_plan,is_beap_chair,can_manage_schools) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id', [input.name,input.email,hashSync(password!,10),input.role,selectedDepartments[0],workspace.stateCode,input.active,input.canCreatePlan ?? false,input.isBeapChair ?? false,input.canManageSchools ?? false])).rows[0].id;
        await replaceUserDepartments(db,id,selectedDepartments);
      } else if (resetting) {
        await db.query('UPDATE users SET password_hash=$1,session_version=session_version+1 WHERE id=$2', [hashSync(password!,10),id]);
      } else {
        const selectedDepartments = normalizeDepartments(input.departments?.length ? input.departments : input.department);
        await db.query('UPDATE users SET full_name=$1,role=$2,department=$3,active=$4,session_version=session_version+1,can_create_plan=$6,is_beap_chair=$7,can_manage_schools=$8 WHERE id=$5', [input.name,input.role,selectedDepartments[0],input.active,id,input.canCreatePlan ?? target.canCreatePlan,input.isBeapChair ?? target.isBeapChair,input.canManageSchools ?? target.canManageSchools]);
        await replaceUserDepartments(db,id!,selectedDepartments);
      }
      await db.query('INSERT INTO user_management_events(actor_id,target_id,state_code,action,details) VALUES($1,$2,$3,$4,$5::jsonb)', [workspace.userId,id,workspace.stateCode,creating?'create':resetting?'reset_password':'update',JSON.stringify(resetting?{}:{ role:input.role,departments:normalizeDepartments(input.departments?.length ? input.departments : input.department),active:input.active,canCreatePlan:input.canCreatePlan ?? target?.canCreatePlan ?? false,canManageSchools:input.canManageSchools ?? target?.canManageSchools ?? false,isBeapChair:input.isBeapChair ?? target?.isBeapChair ?? false })]);
      return NextResponse.json({ id, password }, { status: creating ? 201 : 200, headers: noStore });
    });
  } catch (cause) {
    if ((cause as {code?:string}).code === '23505') return fail('An account with this email or an active Director already exists.',409);
    console.error('User management failed', cause);
    return fail('Changes could not be saved. Please try again.',503);
  }
}
export const POST = (request: NextRequest) => mutate(request, true);
export const PATCH = (request: NextRequest) => mutate(request, false);
