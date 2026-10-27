import { NextRequest, NextResponse } from 'next/server';
import { generatePassword } from '@/lib/generated-password';
import { hashSync } from 'bcryptjs';
import { z } from 'zod';
import { getWorkspaceState } from '@/lib/workspace-state';
import { getPostgres } from '@/lib/postgres';
import { isSameRequestOrigin } from '@/lib/request-origin';
import { departments as ubecDepartments, isComponentDepartment, isOversightDepartment, ubecRoles } from '@/lib/ubec';
import { officerLimitProblem, readOfficerLimits } from '@/lib/ubec-officer-limits';
import { readActor } from '@/lib/ubec-flow-db';
import { replaceUserDepartments } from '@/lib/user-departments';
import { isUbecEmail, roleTitleSchema, ubecEmailError } from '@/lib/officer-title';

// Assessment Officers: a UBEC Director or Oversight Director lists and adds officers of their own department; the UBEC
// BEAP Chair for any department. Oversight departments (migration 071) have no officer limit. New accounts get a one-time password shown once (like Admin > Users). Each department may have
// at most its officer limit of active officers (migration 056, set by the Super Admin); a full department gets 409.
// UBEC150: each officer has a role name ("UBEC Assessment Officer 1 - Infrastructure") and a @ubec.gov.ng email.
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
const create = z.object({ name: z.string().trim().min(2).max(120), roleTitle: roleTitleSchema, email: z.string().trim().toLowerCase().email().max(254), department: z.enum(ubecDepartments.map(d => d.id) as [string, ...string[]]).optional() }).strict();
const managedDepartments = (user: { role: string; department: string | null }) =>
  user.role === ubecRoles.chair ? ubecDepartments.map(d => d.id) as string[]
    : (user.role === ubecRoles.director && isComponentDepartment(user.department)) || (user.role === ubecRoles.oversight && isOversightDepartment(user.department)) ? [user.department!] : [];

export async function GET(request: NextRequest) {
  try {
    const user = await getWorkspaceState(request);
    if (!user) return json({ error: 'Sign in to continue' }, 401);
    const departments = managedDepartments(user);
    if (!departments.length) return json({ error: 'Only UBEC Directors, Oversight Directors and the UBEC BEAP Chair manage Assessment Officers' }, 403);
    const db = getPostgres();
    const limits = (await readOfficerLimits(db)).filter(limit => departments.includes(limit.department));
    const officers = (await db.query(`SELECT u.id, u.full_name AS name, u.role_title AS "roleTitle", u.display_name AS label, u.email, u.department, u.active,
      (SELECT COUNT(*)::int FROM ubec_officer_assignments oa JOIN ubec_round_components rc ON rc.id=oa.round_component_id JOIN ubec_rounds r ON r.id=rc.round_id WHERE oa.officer_id=u.id AND oa.removed_at IS NULL AND oa.completed_at IS NULL AND r.status='reviewing')
        + (SELECT COUNT(*)::int FROM ubec_oversight_assignments xa JOIN ubec_round_components rc ON rc.id=xa.round_component_id JOIN ubec_rounds r ON r.id=rc.round_id WHERE xa.officer_id=u.id AND xa.removed_at IS NULL AND rc.stage='oversight' AND r.status='reviewing') AS open,
      (SELECT COUNT(*)::int FROM ubec_officer_assignments oa WHERE oa.officer_id=u.id AND oa.completed_at IS NOT NULL) AS completed
      FROM users u WHERE u.role=$1 AND u.department=ANY($2::text[]) ORDER BY u.department, u.display_name`, [ubecRoles.officer, departments])).rows;
    // The UBEC BEAP Chair also sees the Directors and Oversight Directors (UBEC133), with the components waiting on them.
    const directors = user.role === ubecRoles.chair ? (await db.query(`SELECT u.id, u.full_name AS name, u.email, u.role, u.department, u.active,
      (SELECT COUNT(*)::int FROM ubec_round_components rc JOIN ubec_rounds r ON r.id=rc.round_id WHERE r.status='reviewing'
        AND ((u.role=$1 AND rc.department=u.department AND rc.stage='director') OR (u.role=$2 AND rc.stage='oversight' AND NOT EXISTS(SELECT 1 FROM ubec_oversight_reviews o WHERE o.round_component_id=rc.id AND o.department=u.department)))) AS waiting
      FROM users u WHERE u.role IN ($1,$2) ORDER BY u.role, u.department, u.full_name`, [ubecRoles.director, ubecRoles.oversight])).rows : [];
    return json({ officers, departments, limits, directors, user: { name: user.name, role: user.role, department: user.department } });
  } catch (cause) { console.error(cause); return json({ error: 'Unable to load Assessment Officers' }, 503); }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getWorkspaceState(request);
    if (!session) return json({ error: 'Sign in to continue' }, 401);
    if (!isSameRequestOrigin(request)) return json({ error: 'This action must come from the portal' }, 403);
    const parsed = create.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return json({ error: 'Enter a full name, a role name and a valid email address' }, 400);
    if (!isUbecEmail(parsed.data.email)) return json({ error: ubecEmailError, field: 'email' }, 400);
    return await getPostgres().transaction(async db => {
      const actor = await readActor(db, session);
      if (!actor) return json({ error: 'Session expired' }, 401);
      const allowed = managedDepartments(actor);
      const department = parsed.data.department ?? (actor.role === ubecRoles.director || actor.role === ubecRoles.oversight ? actor.department : undefined);
      if (!allowed.length) return json({ error: 'Only UBEC Directors, Oversight Directors and the UBEC BEAP Chair add Assessment Officers' }, 403);
      if (!department || !allowed.includes(department)) return json({ error: 'You can add officers to your own department only' }, 403);
      await db.query('SELECT pg_advisory_xact_lock(hashtext($1))', ['admin:user-management']);
      if ((await db.query('SELECT 1 FROM users WHERE email=$1', [parsed.data.email])).rowCount) return json({ error: 'An account already uses this email address' }, 409);
      const full = isComponentDepartment(department) ? await officerLimitProblem(db, department) : null;
      if (full) return json({ error: full }, 409);
      const password = generatePassword();
      const id = (await db.query<{ id: number }>("INSERT INTO users(full_name,role_title,email,password_hash,role,department,state_code,active) VALUES($1,$6,$2,$3,$4,$5,'UBEC',TRUE) RETURNING id", [parsed.data.name, parsed.data.email, hashSync(password, 10), ubecRoles.officer, department, parsed.data.roleTitle])).rows[0].id;
      await replaceUserDepartments(db, id, [department]);
      await db.query('INSERT INTO user_management_events(actor_id,target_id,state_code,action,details) VALUES($1,$2,$3,$4,$5::jsonb)', [actor.id, id, 'UBEC', 'create', JSON.stringify({ role: ubecRoles.officer, roleTitle: parsed.data.roleTitle, departments: [department], active: true })]);
      return json({ id, email: parsed.data.email, password }, 201);
    });
  } catch (cause) {
    if ((cause as { code?: string }).code === '23505') return json({ error: 'An account already uses this email address' }, 409);
    console.error(cause); return json({ error: 'The officer could not be added. Please try again.' }, 503);
  }
}
