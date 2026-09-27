import { NextRequest, NextResponse } from 'next/server';
import { hashSync } from 'bcryptjs';
import { z } from 'zod';
import { getAuthenticatedUser } from '@/lib/workspace-state';
import { getPostgres } from '@/lib/postgres';
import { isSameRequestOrigin } from '@/lib/request-origin';
import { subebDepartments } from '@/lib/subeb-departments';
import { departments as ubecDepartments } from '@/lib/ubec';

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
const roles = z.enum(['Data Entry Staff', 'Director', 'Executive Chairman', 'UBEC Department Reviewer', 'UBEC Executive Secretary']);
const profile = z.object({
  name: z.string().trim().min(2).max(120),
  role: roles,
  stateCode: z.string().trim().toUpperCase().min(2).max(8),
  department: z.string().trim().nullable(),
  active: z.boolean(),
  canCreatePlan: z.boolean().optional(),
  isBeapChair: z.boolean().optional(),
});
const create = profile.extend({ email: z.string().trim().toLowerCase().email().max(254) }).strict();
const edit = profile.extend({ id: z.number().int().positive() }).strict();
const reset = z.object({ id: z.number().int().positive(), action: z.literal('reset_password') }).strict();
const fields = 'id, full_name AS name, email, role, department, state_code AS "stateCode", active, can_create_plan AS "canCreatePlan", is_beap_chair AS "isBeapChair"';

async function requireAdmin(request: NextRequest) {
  const actor = await getAuthenticatedUser(request);
  return actor?.role === 'Super Admin' ? actor : null;
}

function validProfile(input: z.infer<typeof profile>) {
  const ubec = input.stateCode === 'UBEC';
  const roleMatchesWorkspace = ubec
    ? input.role === 'UBEC Department Reviewer' || input.role === 'UBEC Executive Secretary'
    : input.role === 'Data Entry Staff' || input.role === 'Director' || input.role === 'Executive Chairman';
  if (!roleMatchesWorkspace) return 'Choose a role that belongs to this workspace.';
  const needsDepartment = ['Data Entry Staff', 'Director', 'UBEC Department Reviewer'].includes(input.role);
  const allowedDepartments = ubec ? ubecDepartments : subebDepartments;
  if (needsDepartment && !allowedDepartments.some(item => item.id === input.department)) return 'Choose a valid department.';
  if (!needsDepartment && input.department) return 'This role is not assigned to a department.';
  if (input.isBeapChair && (ubec || input.role !== 'Director')) return 'The BEAP Chair must be a SUBEB Director.';
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
        if (target && input.stateCode !== target.stateCode) return json({ error: 'A user cannot be moved to another workspace. Create a new account instead.' }, 409);
        if (!target && !(await db.query("SELECT 1 FROM users WHERE state_code=$1 AND role<>'Super Admin' LIMIT 1", [input.stateCode])).rowCount) return json({ error: 'Choose an existing workspace.' }, 400);
        const chair = input.isBeapChair ?? target?.isBeapChair ?? false;
        if (chair && (await db.query('SELECT id FROM users WHERE state_code=$1 AND is_beap_chair AND id<>$2', [input.stateCode, target?.id ?? 0])).rowCount) return json({ error: 'This SUBEB already has a BEAP Chair.' }, 409);
        if (input.role === 'Director' && input.active && (await db.query("SELECT id FROM users WHERE state_code=$1 AND department=$2 AND role='Director' AND active AND id<>$3", [input.stateCode, input.department, target?.id ?? 0])).rowCount) return json({ error: 'This department already has an active Director.' }, 409);
      }
      const password = creating || resetting ? `Ubec-${crypto.randomUUID()}!` : undefined;
      let id = target?.id;
      if ('email' in input) {
        if ((await db.query('SELECT id FROM users WHERE email=$1', [input.email])).rowCount) return json({ error: 'An account already uses this email address.' }, 409);
        id = (await db.query('INSERT INTO users(full_name,email,password_hash,role,department,state_code,active,can_create_plan,is_beap_chair) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id', [input.name, input.email, hashSync(password!, 10), input.role, input.department || null, input.stateCode, input.active, input.canCreatePlan ?? false, input.isBeapChair ?? false])).rows[0].id;
      } else if (resetting) {
        await db.query('UPDATE users SET password_hash=$1,session_version=session_version+1 WHERE id=$2', [hashSync(password!, 10), id]);
      } else {
        await db.query('UPDATE users SET full_name=$1,role=$2,department=$3,active=$4,session_version=session_version+1,can_create_plan=$6,is_beap_chair=$7 WHERE id=$5', [input.name, input.role, input.department || null, input.active, id, input.canCreatePlan ?? false, input.isBeapChair ?? false]);
      }
      const stateCode = resetting ? target.stateCode : input.stateCode;
      await db.query('INSERT INTO user_management_events(actor_id,target_id,state_code,action,details) VALUES($1,$2,$3,$4,$5::jsonb)', [actor.userId, id, stateCode, creating ? 'create' : resetting ? 'reset_password' : 'update', JSON.stringify(resetting ? {} : { role: input.role, department: input.department || null, active: input.active, canCreatePlan: input.canCreatePlan ?? false, isBeapChair: input.isBeapChair ?? false })]);
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
