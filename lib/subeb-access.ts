import { subebComponentDepartments as pillarDepartments } from './beap-pillars';
import type { ImplementedPillar, PillarId } from './beap-pillars';
import type { DepartmentAccess } from './user-departments';
import { holdsComponent } from './component-access';
import { isSupportDepartment } from './subeb-departments';
import { normalizeDepartments } from './user-departments';

export const subebRoles = ['Data Entry Staff', 'Director', 'Executive Chairman'] as const;
export const canCreateStatePlan = (role: string, delegated = false, isBeapChair = false) =>
  role === 'Executive Chairman' || (role === 'Director' && isBeapChair) || (delegated && (role === 'Director' || role === 'Data Entry Staff'));
/** UBEC159: only the Executive Chairman and the BEAP Chair add or edit state users; other Directors do not. */
export const canManageStateUsers = (role?: string, isBeapChair?: boolean) => role === 'Executive Chairman' || (role === 'Director' && !!isBeapChair);
/** The BEAP Chair manages Data Entry Staff across the state; only the Executive Chairman appoints Directors. */
export const canManageRole = (actor: string, target: string, isBeapChair?: boolean) =>
  target === 'Data Entry Staff' ? canManageStateUsers(actor, isBeapChair) : target === 'Director' && actor === 'Executive Chairman';
export const canEditPillar = (role: string, departments: DepartmentAccess, pillar: PillarId) =>
  (role === 'Data Entry Staff' || role === 'Director') && pillar in pillarDepartments && holdsComponent(departments, pillar as ImplementedPillar);

type Reader = { role: string; department?: string | null; departments?: string[]; isBeapChair?: boolean };
export const canViewWholeStatePlan = (user: Reader) => user.role === 'Executive Chairman' || (user.role === 'Director' && user.isBeapChair === true);
/**
 * UBEC217 (6 November 2026): Directors and Data Entry Staff of the SUBEB support departments (Audit, Procurement,
 * Finance, Special Programmes) see every component of their state's plans in real time, read-only: no stage gate,
 * no edits, no send steps and no comments.
 */
export const isSupportViewer = (user: Reader) =>
  (user.role === 'Director' || user.role === 'Data Entry Staff') && normalizeDepartments(user.departments ?? user.department).some(isSupportDepartment);
/** Whether the viewer takes part in the component's review (edits, sends or comments on it): the old view ceiling. */
export const canWorkOnComponent = (user: Reader, component: PillarId) => canViewWholeStatePlan(user) || canEditPillar(user.role, user.departments ?? user.department, component);
/** Whether the viewer may read a component at all (the role/department ceiling; the stage gate comes on top). */
export const canViewComponent = (user: Reader, component: PillarId) => canWorkOnComponent(user, component) || isSupportViewer(user);
/** A support-department viewer reading a component they take no part in (UBEC217): read-only, no comments. */
export const readsOnly = (user: Reader, component: PillarId) => !canWorkOnComponent(user, component) && isSupportViewer(user);
/** School list (UBEC07): the Executive Chairman and the BEAP Chair by role; other state staff only with the can_manage_schools grant. */
export const canManageSchoolRegister = (role: string | undefined, isBeapChair = false, granted = false) =>
  role === 'Executive Chairman' || (role === 'Director' && isBeapChair) || (granted && (role === 'Director' || role === 'Data Entry Staff'));
