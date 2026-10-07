// UBEC Assessment Officers per component department (migration 056): how many active officers a department may have,
// and the default officers the BEAP Chair's release assigns to each component. The default limit is one officer per
// component of the department; the Super Admin changes both on Admin > Workflow settings. Adding or reactivating an
// officer beyond the limit is refused by every path that does so (UBEC Officers page, Admin > Users).
import type { ImplementedPillar } from './beap-pillars';
import { componentDepartments, departmentName, departmentPillars, pillarDepartments, ubecRoles, type ComponentDepartment } from './ubec';
import { defaultAssignerName, defaultAssignmentComment } from './ubec-flow';
import { addUbecEvent, notifyUbec, type Actor, type Db } from './ubec-flow-db';

export const maxOfficerLimit = 50;
/** Most default officers one component may have (the Director's assign step takes up to 20 at once). */
export const maxDefaultOfficers = 20;
export type OfficerLimit = { department: ComponentDepartment; name: string; components: number; defaultLimit: number; limit: number; custom: boolean; active: number };

/** One officer per component of the department. */
export const defaultOfficerLimit = (department: ComponentDepartment) => Math.max(1, departmentPillars(department).length);

/** "3 active, limit 2: no new officers until one is deactivated", or null when the department is within its limit. */
export const overLimitWarning = (limit: Pick<OfficerLimit, 'active' | 'limit'>) =>
  limit.active > limit.limit ? `${limit.active} active, limit ${limit.limit}: no new officers until one is deactivated.` : null;

/** Every component department's limit and how many active officers it has now. */
export async function readOfficerLimits(db: Db): Promise<OfficerLimit[]> {
  const custom = new Map((await db.query<{ department: string; max_officers: number }>('SELECT department, max_officers FROM ubec_officer_limits')).rows.map(row => [row.department, row.max_officers]));
  const active = new Map((await db.query<{ department: string; n: number }>('SELECT department, COUNT(*)::int AS n FROM users WHERE role=$1 AND active GROUP BY department', [ubecRoles.officer])).rows.map(row => [row.department, row.n]));
  return componentDepartments.map(({ id }) => {
    const defaultLimit = defaultOfficerLimit(id), set = custom.get(id);
    return { department: id, name: departmentName(id), components: departmentPillars(id).length, defaultLimit, limit: set ?? defaultLimit, custom: set !== undefined, active: active.get(id) ?? 0 };
  });
}

/**
 * Why one more active officer may not join `department`, or null. Call inside the transaction that adds or activates
 * the officer, after taking the user-management advisory lock, so two additions cannot both pass. `exceptUserId`
 * leaves out the account being edited (an active officer saved again does not count twice).
 */
export async function officerLimitProblem(db: Db, department: ComponentDepartment, exceptUserId = 0): Promise<string | null> {
  const set = (await db.query<{ max_officers: number }>('SELECT max_officers FROM ubec_officer_limits WHERE department=$1', [department])).rows[0]?.max_officers;
  const limit = set ?? defaultOfficerLimit(department);
  const active = (await db.query<{ n: number }>('SELECT COUNT(*)::int AS n FROM users WHERE role=$1 AND active AND department=$2 AND id<>$3', [ubecRoles.officer, department, exceptUserId])).rows[0]?.n ?? 0;
  if (active < limit) return null;
  return `${departmentName(department)} already has ${active} of ${limit} Assessment Officer${limit === 1 ? '' : 's'}. Deactivate one, or ask the Super Admin to raise the limit on Admin > Workflow settings.`;
}

/** Default officers of every component that still qualify (active Assessment Officers of the component's department). */
export async function readDefaultOfficers(db: Db): Promise<Map<ImplementedPillar, { id: number; name: string }[]>> {
  const rows = (await db.query<{ pillar: ImplementedPillar; id: number; name: string; department: string }>(`SELECT d.pillar, u.id, u.full_name AS name, u.department
    FROM ubec_default_officers d JOIN users u ON u.id=d.officer_id AND u.active AND u.role=$1 ORDER BY u.full_name, u.id`, [ubecRoles.officer])).rows;
  const byPillar = new Map<ImplementedPillar, { id: number; name: string }[]>();
  for (const row of rows) {
    if (pillarDepartments[row.pillar] !== row.department) continue;
    byPillar.set(row.pillar, [...(byPillar.get(row.pillar) ?? []), { id: row.id, name: row.name }]);
  }
  return byPillar;
}

/** Drops default-officer rows an account no longer qualifies for (deactivated, another role or department). */
export async function pruneDefaultOfficers(db: Db, userId: number) {
  const user = (await db.query<{ role: string; department: string | null; active: boolean }>('SELECT role, department, active FROM users WHERE id=$1', [userId])).rows[0];
  const keep = user && user.active && user.role === ubecRoles.officer && user.department ? departmentPillars(user.department) : [];
  await db.query('DELETE FROM ubec_default_officers WHERE officer_id=$1 AND NOT (pillar=ANY($2::text[]))', [userId, keep]);
}

/**
 * Release (inside the BEAP Chair's transaction): assign each released component's default officers, record one
 * `default_officers` event per component and notify those officers and the department's Director.
 */
export async function assignDefaultOfficers(db: Db, planId: number | string, roundId: number, released: readonly { id: number; pillar: ImplementedPillar; department: string }[], actor: Actor) {
  const defaults = await readDefaultOfficers(db);
  const assigned: { pillar: ImplementedPillar; officerIds: number[] }[] = [];
  for (const component of released) {
    const officers = defaults.get(component.pillar) ?? [];
    if (!officers.length) continue;
    for (const officer of officers) {
      await db.query('INSERT INTO ubec_officer_assignments(round_component_id,officer_id,officer_name,assigned_by_id,assigned_by_name,comment) VALUES($1,$2,$3,$4,$5,$6)', [component.id, officer.id, officer.name, actor.id, defaultAssignerName, defaultAssignmentComment]);
    }
    const eventId = await addUbecEvent(db, { roundId, planId, action: 'default_officers', actor, comment: `${officers.map(o => o.name).join(', ')}: ${defaultAssignmentComment}`, pillar: component.pillar });
    await notifyUbec(db, planId, eventId, actor.id, { userIds: officers.map(o => o.id) }, { role: ubecRoles.director, departments: [component.department] });
    assigned.push({ pillar: component.pillar, officerIds: officers.map(o => o.id) });
  }
  return assigned;
}

