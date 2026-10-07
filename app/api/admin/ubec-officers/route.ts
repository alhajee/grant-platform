import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getAuthenticatedUser } from '@/lib/workspace-state';
import { getPostgres } from '@/lib/postgres';
import { isSameRequestOrigin } from '@/lib/request-origin';
import { implementedPillars, type ImplementedPillar } from '@/lib/beap-pillars';
import { planPeriod } from '@/lib/action-plans';
import { stateDisplayName } from '@/lib/state-names';
import { componentDepartments, departmentPillars, pillarDepartments, ubecRoles } from '@/lib/ubec';
import { componentName } from '@/lib/ubec-flow';
import type { Db } from '@/lib/ubec-flow-db';
import { maxDefaultOfficers, maxOfficerLimit, overLimitWarning, readDefaultOfficers, readOfficerLimits } from '@/lib/ubec-officer-limits';

// Super Admin: UBEC Assessment Officers per department (migration 056). GET lists each component department's officer
// limit, active officers and the default officers of its components, plus the plans in department assessment (where
// the Super Admin can reassign officers). PUT changes limits (null = back to the default) and replaces the default
// officers of the listed components. Writes need the same origin and take the user-management lock, so they serialise
// with officer additions on Admin > Users and the UBEC Officers page.
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
const departmentIds = componentDepartments.map(d => d.id) as [string, ...string[]];
const input = z.object({
  limits: z.array(z.object({ department: z.enum(departmentIds), limit: z.number().int().min(1).max(maxOfficerLimit).nullable() }).strict()).max(departmentIds.length).optional(),
  defaults: z.array(z.object({ pillar: z.enum(implementedPillars), officerIds: z.array(z.number().int().positive()).max(maxDefaultOfficers) }).strict()).max(implementedPillars.length).optional(),
}).strict()
  .refine(value => new Set(value.limits?.map(l => l.department)).size === (value.limits?.length ?? 0), 'Each department once.')
  .refine(value => new Set(value.defaults?.map(d => d.pillar)).size === (value.defaults?.length ?? 0), 'Each component once.')
  .refine(value => (value.defaults ?? []).every(d => new Set(d.officerIds).size === d.officerIds.length), 'Each officer once per component.');

async function requireAdmin(request: NextRequest) {
  const actor = await getAuthenticatedUser(request);
  return actor?.role === 'Super Admin' ? actor : null;
}

async function readSettings(db: Db) {
  const limits = await readOfficerLimits(db);
  const defaults = await readDefaultOfficers(db);
  const officers = (await db.query<{ id: number; name: string; email: string; department: string }>('SELECT id, full_name AS name, email, department FROM users WHERE role=$1 AND active ORDER BY full_name, id', [ubecRoles.officer])).rows;
  const departments = limits.map(limit => ({
    ...limit, short: componentDepartments.find(d => d.id === limit.department)!.short, warning: overLimitWarning(limit),
    components: departmentPillars(limit.department).map(pillar => ({ pillar, name: componentName(pillar), defaults: (defaults.get(pillar) ?? []).map(o => o.id) })),
    officers: officers.filter(o => o.department === limit.department).map(({ id, name, email }) => ({ id, name, email })),
  }));
  // Latest rounds still in department assessment: the Super Admin can open them to assign or reassign officers.
  const plans = (await db.query<{ plan_id: number; number: number; state_code: string; start_year: number; end_year: number; funding_quarters: number[] | null; released_at: Date; at_director: number; released: number }>(`
    SELECT r.plan_id, r.number, p.state_code, p.start_year, p.end_year, p.funding_quarters, r.released_at,
      (SELECT COUNT(*)::int FROM ubec_round_components rc WHERE rc.round_id=r.id AND rc.stage='director') AS at_director,
      (SELECT COUNT(*)::int FROM ubec_round_components rc WHERE rc.round_id=r.id) AS released
    FROM ubec_rounds r JOIN action_plans p ON p.id=r.plan_id
    WHERE r.status='reviewing' AND r.number=(SELECT MAX(number) FROM ubec_rounds WHERE plan_id=r.plan_id)
    ORDER BY r.released_at DESC NULLS LAST LIMIT 50`)).rows
    .map(r => ({ planId: r.plan_id, state: stateDisplayName(r.state_code), period: planPeriod({ startYear: r.start_year, endYear: r.end_year, fundingQuarters: r.funding_quarters }), round: r.number, releasedAt: r.released_at, atDirector: r.at_director, released: r.released }));
  return { departments, plans };
}

export async function GET(request: NextRequest) {
  try {
    if (!await requireAdmin(request)) return json({ error: 'Super-admin access required.' }, 403);
    return json(await readSettings(getPostgres()));
  } catch (cause) {
    console.error('UBEC officer settings could not be loaded', cause);
    return json({ error: 'Unable to load the UBEC Assessment Officer settings.' }, 503);
  }
}

export async function PUT(request: NextRequest) {
  try {
    if (!isSameRequestOrigin(request)) return json({ error: 'This action must come from the portal.' }, 403);
    const actor = await requireAdmin(request);
    if (!actor) return json({ error: 'Super-admin access required.' }, 403);
    const parsed = input.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return json({ error: 'Enter a limit from 1 to 50 for each department and choose officers for each component.' }, 400);
    const { limits = [], defaults = [] } = parsed.data;
    return await getPostgres().transaction(async db => {
      await db.query('SELECT pg_advisory_xact_lock(hashtext($1))', ['admin:user-management']);
      const admin = (await db.query<{ full_name: string }>("SELECT full_name FROM users WHERE id=$1 AND active AND role='Super Admin' AND session_version=$2 FOR SHARE", [actor.userId, actor.sessionVersion])).rows[0];
      if (!admin) return json({ error: 'Your administrator access has changed. Sign in again.' }, 403);
      // Default officers must be active Assessment Officers of the component's department.
      const ids = [...new Set(defaults.flatMap(d => d.officerIds))];
      const officers = new Map((await db.query<{ id: number; department: string }>('SELECT id, department FROM users WHERE id=ANY($1::int[]) AND role=$2 AND active', [ids, ubecRoles.officer])).rows.map(o => [o.id, o.department]));
      const wrong = defaults.find(d => d.officerIds.some(id => officers.get(id) !== pillarDepartments[d.pillar as ImplementedPillar]));
      if (wrong) return json({ error: `Choose active Assessment Officers of the department that reviews ${componentName(wrong.pillar)}.` }, 400);
      for (const { department, limit } of limits) {
        if (limit === null) await db.query('DELETE FROM ubec_officer_limits WHERE department=$1', [department]);
        else await db.query(`INSERT INTO ubec_officer_limits(department, max_officers, updated_by_name) VALUES($1,$2,$3)
          ON CONFLICT (department) DO UPDATE SET max_officers=EXCLUDED.max_officers, updated_by_name=EXCLUDED.updated_by_name, updated_at=NOW()`, [department, limit, admin.full_name]);
      }
      for (const { pillar, officerIds } of defaults) {
        await db.query('DELETE FROM ubec_default_officers WHERE pillar=$1 AND NOT (officer_id=ANY($2::int[]))', [pillar, officerIds]);
        for (const officerId of officerIds) await db.query('INSERT INTO ubec_default_officers(pillar, officer_id, updated_by_name) VALUES($1,$2,$3) ON CONFLICT DO NOTHING', [pillar, officerId, admin.full_name]);
      }
      return json(await readSettings(db));
    });
  } catch (cause) {
    console.error('UBEC officer settings could not be saved', cause);
    return json({ error: 'Unable to save the UBEC Assessment Officer settings.' }, 503);
  }
}
