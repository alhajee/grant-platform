import { NextRequest, NextResponse } from 'next/server';
import { hashSync } from 'bcryptjs';
import { z } from 'zod';
import { getWorkspaceState } from '@/lib/workspace-state';
import { getPostgres } from '@/lib/postgres';
import { isSameRequestOrigin } from '@/lib/request-origin';
import { componentDepartments, isComponentDepartment, ubecRoles, type ComponentDepartment } from '@/lib/ubec';
import { officerLimitProblem, readOfficerLimits } from '@/lib/ubec-officer-limits';
import { readActor } from '@/lib/ubec-flow-db';
import { replaceUserDepartments } from '@/lib/user-departments';

// Assessment Officers: a UBEC Director lists and adds officers of their own department; the UBEC BEAP Chair for any
// component department. New accounts get a one-time password shown once (like Admin > Users). Each department may have
// at most its officer limit of active officers (migration 056, set by the Super Admin); a full department gets 409.
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
const create = z.object({ name: z.string().trim().min(2).max(120), email: z.string().trim().toLowerCase().email().max(254), department: z.enum(componentDepartments.map(d => d.id) as [string, ...string[]]).optional() }).strict();
const managedDepartments = (user: { role: string; department: string | null }) =>
  user.role === ubecRoles.chair ? componentDepartments.map(d => d.id) as string[] : user.role === ubecRoles.director && isComponentDepartment(user.department) ? [user.department] : [];

export async function GET(request: NextRequest) {
  try {
    const user = await getWorkspaceState(request);
    if (!user) return json({ error: 'Sign in to continue.' }, 401);
    const departments = managedDepartments(user);
    if (!departments.length) return json({ error: 'Only UBEC Directors and the UBEC BEAP Chair manage Assessment Officers.' }, 403);
    const db = getPostgres();
    const limits = (await readOfficerLimits(db)).filter(limit => departments.includes(limit.department));
    const officers = (await db.query(`SELECT u.id, u.full_name AS name, u.email, u.department, u.active,
      (SELECT COUNT(*)::int FROM ubec_officer_assignments oa JOIN ubec_round_components rc ON rc.id=oa.round_component_id JOIN ubec_rounds r ON r.id=rc.round_id WHERE oa.officer_id=u.id AND oa.removed_at IS NULL AND oa.completed_at IS NULL AND r.status='reviewing') AS open,
      (SELECT COUNT(*)::int FROM ubec_officer_assignments oa WHERE oa.officer_id=u.id AND oa.completed_at IS NOT NULL) AS completed
      FROM users u WHERE u.role=$1 AND u.department=ANY($2::text[]) ORDER BY u.department, u.full_name`, [ubecRoles.officer, departments])).rows;
    return json({ officers, departments, limits, user: { name: user.name, role: user.role, department: user.department } });
  } catch (cause) { console.error(cause); return json({ error: 'Unable to load Assessment Officers.' }, 503); }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getWorkspaceState(request);
    if (!session) return json({ error: 'Sign in to continue.' }, 401);
    if (!isSameRequestOrigin(request)) return json({ error: 'This action must come from the portal.' }, 403);
    const parsed = create.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return json({ error: 'Enter a full name and a valid email address.' }, 400);
    return await getPostgres().transaction(async db => {
      const actor = await readActor(db, session);
      if (!actor) return json({ error: 'Session expired.' }, 401);
      const allowed = managedDepartments(actor);
      const department = parsed.data.department ?? (actor.role === ubecRoles.director ? actor.department : undefined);
      if (!allowed.length) return json({ error: 'Only UBEC Directors and the UBEC BEAP Chair add Assessment Officers.' }, 403);
      if (!department || !allowed.includes(department)) return json({ error: 'You can add officers to your own department only.' }, 403);
      await db.query('SELECT pg_advisory_xact_lock(hashtext($1))', ['admin:user-management']);
      if ((await db.query('SELECT 1 FROM users WHERE email=$1', [parsed.data.email])).rowCount) return json({ error: 'An account already uses this email address.' }, 409);
      const full = await officerLimitProblem(db, department as ComponentDepartment);
      if (full) return json({ error: full }, 409);
      const password = `Ubec-${crypto.randomUUID()}!`;
      const id = (await db.query<{ id: number }>("INSERT INTO users(full_name,email,password_hash,role,department,state_code,active) VALUES($1,$2,$3,$4,$5,'UBEC',TRUE) RETURNING id", [parsed.data.name, parsed.data.email, hashSync(password, 10), ubecRoles.officer, department])).rows[0].id;
      await replaceUserDepartments(db, id, [department]);
      await db.query('INSERT INTO user_management_events(actor_id,target_id,state_code,action,details) VALUES($1,$2,$3,$4,$5::jsonb)', [actor.id, id, 'UBEC', 'create', JSON.stringify({ role: ubecRoles.officer, departments: [department], active: true })]);
      return json({ id, email: parsed.data.email, password }, 201);
    });
  } catch (cause) {
    if ((cause as { code?: string }).code === '23505') return json({ error: 'An account already uses this email address.' }, 409);
    console.error(cause); return json({ error: 'The officer could not be added. Please try again.' }, 503);
  }
}
