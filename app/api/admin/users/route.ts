import { NextRequest, NextResponse } from 'next/server';
import { hashSync } from 'bcryptjs';
import { z } from 'zod';
import { getAuthenticatedUser } from '@/lib/workspace-state';
import { getPostgres } from '@/lib/postgres';
import { isSameRequestOrigin } from '@/lib/request-origin';
import { subebDepartments } from '@/lib/subeb-departments';
import { ubecRoleDepartments, ubecRoleList, ubecRoles } from '@/lib/ubec';
import { normalizeDepartments, replaceUserDepartments, userDepartmentsSql } from '@/lib/user-departments';

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
const roles = z.enum(['Data Entry Staff', 'Director', 'Executive Chairman', ...ubecRoleList] as [string, ...string[]]);
const profile = z.object({
  name: z.string().trim().min(2).max(120),
  role: roles,
  stateCode: z.string().trim().toUpperCase().min(2).max(8),
  department: z.string().trim().nullable().optional(),
  departments: z.array(z.string().trim().min(1)).max(32).optional(),
  active: z.boolean(),
  canCreatePlan: z.boolean().optional(),
  canManageSchools: z.boolean().optional(),
  isBeapChair: z.boolean().optional(),
});
const create = profile.extend({ email: z.string().trim().toLowerCase().email().max(254) }).strict();
const edit = profile.extend({ id: z.number().int().positive() }).strict();
const reset = z.object({ id: z.number().int().positive(), action: z.literal('reset_password') }).strict();
const fields = `id, full_name AS name, email, role, department, ${userDepartmentsSql('users')} AS departments, state_code AS "stateCode", active, can_create_plan AS "canCreatePlan", can_manage_schools AS "canManageSchools", is_beap_chair AS "isBeapChair"`;

async function requireAdmin(request: NextRequest) {
  const actor = await getAuthenticatedUser(request);
  return actor?.role === 'Super Admin' ? actor : null;
}

function validProfile(input: z.infer<typeof profile>) {
  const ubec = input.stateCode === 'UBEC';
  const roleMatchesWorkspace = ubec
    ? (ubecRoleList as readonly string[]).includes(input.role)
    : input.role === 'Data Entry Staff' || input.role === 'Director' || input.role === 'Executive Chairman';
  if (!roleMatchesWorkspace) return 'Choose a role that belongs to this workspace.';
  const needsDepartment = ['Data Entry Staff', 'Director'].includes(input.role) || ubecRoleDepartments(input.role).length > 0;
  const allowedDepartments = ubec ? ubecRoleDepartments(input.role) : subebDepartments;
  const selected = normalizeDepartments(input.departments?.length ? input.departments : input.department);
  if (needsDepartment && (!selected.length || selected.some(department => !allowedDepartments.some(item => item.id === department)))) return 'Choose at least one valid department.';
  if (ubec && needsDepartment && selected.length !== 1) return `A ${input.role} must have exactly one department.`;
  if (!needsDepartment && selected.length) return 'This role is not assigned to a department.';
  if (input.isBeapChair && (ubec || input.role !== 'Director')) return 'The BEAP Chair must be a SUBEB Director.';
  if (input.canManageSchools && ubec) return 'School register access applies to SUBEB accounts only.';
  return null;
}

async function mutate(request: NextRequest, creating: boolean) {
  try {
    if (!isSameRequestOrigin(request)) return json({ error: 'This action must come from the portal.' }, 403);
    const actor = await requireAdmin(request);
    if (!actor) return json({ error: 'Super-admin access required.' }, 403);
    const parsed = (creating ? create : z.union([edit, reset])).safeParse(await request.json().catch(() => null));
    if (!parsed.success) return json({ error: 'Enter valid account details.' }, 400);
    const input = parsed.data;
    return await getPostgres().transaction(async db => {
      await db.query('SELECT pg_advisory_xact_lock(hashtext($1))', ['admin:user-management']);
      const validActor = (await db.query("SELECT id FROM users WHERE id=$1 AND active AND role='Super Admin' AND session_version=$2 FOR SHARE", [actor.userId, actor.sessionVersion])).rows[0];
      if (!validActor) return json({ error: 'Your administrator access has changed. Sign in again.' }, 403);
      const target = 'id' in input ? (await db.query(`SELECT ${fields} FROM users WHERE id=$1 AND role<>'Super Admin' FOR UPDATE`, [input.id])).rows[0] : null;
      if ('id' in input && !target) return json({ error: 'User not found.' }, 404);
      const resetting = 'action' in input;
      if (!resetting) {
        const validationError = validProfile(input);
        if (validationError) return json({ error: validationError }, 400);
        const selectedDepartments = normalizeDepartments(input.departments?.length ? input.departments : input.department);
        if (target && input.stateCode !== target.stateCode) return json({ error: 'A user cannot be moved to another workspace. Create a new account instead.' }, 409);
        if (!target && !(await db.query("SELECT 1 FROM users WHERE state_code=$1 AND role<>'Super Admin' LIMIT 1", [input.stateCode])).rowCount) return json({ error: 'Choose an existing workspace.' }, 400);
        const chair = input.isBeapChair ?? target?.isBeapChair ?? false;
        if (chair && (await db.query('SELECT id FROM users WHERE state_code=$1 AND is_beap_chair AND id<>$2', [input.stateCode, target?.id ?? 0])).rowCount) return json({ error: 'This SUBEB already has a BEAP Chair.' }, 409);
        // UBEC keeps one active BEAP Chair, one Director per component department and one Oversight Director per oversight department.
        if (input.active && [ubecRoles.chair, ubecRoles.director, ubecRoles.oversight].includes(input.role as typeof ubecRoles.chair) && (await db.query('SELECT 1 FROM users WHERE role=$1 AND active AND department IS NOT DISTINCT FROM $2 AND id<>$3 LIMIT 1', [input.role, input.role === ubecRoles.chair ? null : selectedDepartments[0], target?.id ?? 0])).rowCount) return json({ error: input.role === ubecRoles.chair ? 'UBEC already has an active BEAP Chair.' : 'This department already has an active account in this role.' }, 409);
        if (input.role === 'Director' && !input.isBeapChair && input.active && (await db.query("SELECT u.id FROM users u JOIN user_departments ud ON ud.user_id=u.id WHERE u.state_code=$1 AND ud.department=ANY($2::text[]) AND u.role='Director' AND NOT u.is_beap_chair AND u.active AND u.id<>$3 LIMIT 1", [input.stateCode, selectedDepartments, target?.id ?? 0])).rowCount) return json({ error: 'One or more selected departments already has an active Director.' }, 409);
      }
      const password = creating || resetting ? `Ubec-${crypto.randomUUID()}!` : undefined;
      let id = target?.id;
      if ('email' in input) {
        if ((await db.query('SELECT id FROM users WHERE email=$1', [input.email])).rowCount) return json({ error: 'An account already uses this email address.' }, 409);
        const selectedDepartments = normalizeDepartments(input.departments?.length ? input.departments : input.department);
        id = (await db.query('INSERT INTO users(full_name,email,password_hash,role,department,state_code,active,can_create_plan,is_beap_chair,can_manage_schools) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id', [input.name, input.email, hashSync(password!, 10), input.role, selectedDepartments[0] || null, input.stateCode, input.active, input.canCreatePlan ?? false, input.isBeapChair ?? false, input.canManageSchools ?? false])).rows[0].id;
        await replaceUserDepartments(db, id, selectedDepartments);
      } else if (resetting) {
        await db.query('UPDATE users SET password_hash=$1,session_version=session_version+1 WHERE id=$2', [hashSync(password!, 10), id]);
      } else {
        const selectedDepartments = normalizeDepartments(input.departments?.length ? input.departments : input.department);
        await db.query('UPDATE users SET full_name=$1,role=$2,department=$3,active=$4,session_version=session_version+1,can_create_plan=$6,is_beap_chair=$7,can_manage_schools=$8 WHERE id=$5', [input.name, input.role, selectedDepartments[0] || null, input.active, id, input.canCreatePlan ?? false, input.isBeapChair ?? false, input.canManageSchools ?? target.canManageSchools]);
        await replaceUserDepartments(db, id!, selectedDepartments);
      }
      const stateCode = resetting ? target.stateCode : input.stateCode;
      await db.query('INSERT INTO user_management_events(actor_id,target_id,state_code,action,details) VALUES($1,$2,$3,$4,$5::jsonb)', [actor.userId, id, stateCode, creating ? 'create' : resetting ? 'reset_password' : 'update', JSON.stringify(resetting ? {} : { role: input.role, departments: normalizeDepartments(input.departments?.length ? input.departments : input.department), active: input.active, canCreatePlan: input.canCreatePlan ?? false, canManageSchools: input.canManageSchools ?? target?.canManageSchools ?? false, isBeapChair: input.isBeapChair ?? false })]);
      return json({ id, password }, creating ? 201 : 200);
    });
  } catch (cause) {
    if ((cause as { code?: string }).code === '23505') return json({ error: 'A conflicting active account already exists.' }, 409);
    console.error('Administrator user management failed', cause);
    return json({ error: 'Changes could not be saved. Please try again.' }, 503);
  }
}

export const POST = (request: NextRequest) => mutate(request, true);
export const PATCH = (request: NextRequest) => mutate(request, false);
