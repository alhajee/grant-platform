import { subebComponentDepartments as pillarDepartments } from './beap-pillars';
import type { PillarId } from './beap-pillars';

export const subebRoles = ['Data Entry Staff', 'Director', 'Executive Chairman'] as const;
export const canCreateStatePlan = (role: string, delegated = false, isBeapChair = false) =>
  role === 'Executive Chairman' || (role === 'Director' && isBeapChair) || (delegated && (role === 'Director' || role === 'Data Entry Staff'));
export const canManageStateUsers = (role?: string) => role === 'Director' || role === 'Executive Chairman';
export const canManageRole = (actor: string, target: string) =>
  target === 'Data Entry Staff' ? canManageStateUsers(actor) : target === 'Director' && actor === 'Executive Chairman';
export const canEditPillar = (role: string, department: string | null | undefined, pillar: PillarId) =>
  (role === 'Data Entry Staff' || role === 'Director') && department === pillarDepartments[pillar];
