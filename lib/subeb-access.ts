import { subebComponentDepartments as pillarDepartments } from './beap-pillars';
import type { PillarId } from './beap-pillars';
import { hasDepartment, type DepartmentAccess } from './user-departments';

export const subebRoles = ['Data Entry Staff', 'Director', 'Executive Chairman'] as const;
export const canCreateStatePlan = (role: string, delegated = false, isBeapChair = false) =>
  role === 'Executive Chairman' || (role === 'Director' && isBeapChair) || (delegated && (role === 'Director' || role === 'Data Entry Staff'));
export const canManageStateUsers = (role?: string) => role === 'Director' || role === 'Executive Chairman';
export const canManageRole = (actor: string, target: string) =>
  target === 'Data Entry Staff' ? canManageStateUsers(actor) : target === 'Director' && actor === 'Executive Chairman';
export const canEditPillar = (role: string, departments: DepartmentAccess, pillar: PillarId) =>
  (role === 'Data Entry Staff' || role === 'Director') && hasDepartment(departments, pillarDepartments[pillar]);

type Reader = { role: string; department?: string | null; departments?: string[]; isBeapChair?: boolean };
export const canViewWholeStatePlan = (user: Reader) => user.role === 'Executive Chairman' || (user.role === 'Director' && user.isBeapChair === true);
export const canViewComponent = (user: Reader, component: PillarId) => canViewWholeStatePlan(user) || canEditPillar(user.role, user.departments ?? user.department, component);
/** School register (UBEC07): the Executive Chairman and the BEAP Chair by role; other state staff only with the can_manage_schools grant. */
export const canManageSchoolRegister = (role: string | undefined, isBeapChair = false, granted = false) =>
  role === 'Executive Chairman' || (role === 'Director' && isBeapChair) || (granted && (role === 'Director' || role === 'Data Entry Staff'));
