import { oversightDepartments, oversightIds, ubecRoles, type OversightDepartment } from './ubec';

// Observations before sending to UBEC (bug sheet row 156, migration 075). The SUBEB Executive Chairman may ask any of the
// oversight departments to look at the whole plan before it is sent. Each department asked comments per activity
// (plan_comments scope 'observation') and sends its observations back. Until every department asked has replied and the
// SUBEB has resolved every observation, the plan cannot be sent to UBEC. Shared by the APIs and the pages.
// UBEC168/194 (30 October 2026, migration 085): requests now go to the state's own SUBEB Audit, Procurement, Finance and
// Special Programmes (their Director and Data Entry Officer), audience 'subeb'. Requests made before went to UBEC's
// Oversight Departments (audience 'ubec') and are still answered there.

export type ObservationAudience = 'ubec' | 'subeb';
export const observationDepartmentIds = oversightIds;
const departmentLabel = (department: string) => oversightDepartments.find(d => d.id === department)?.name ?? department;
const prefix = (audience: ObservationAudience) => audience === 'ubec' ? 'UBEC' : 'SUBEB';
export const observationDepartmentName = (department: string, audience: ObservationAudience = 'subeb') => `${prefix(audience)} ${departmentLabel(department)}`;
export const listDepartments = (departments: readonly string[]) => {
  const names = departments.map(departmentLabel);
  return names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : names[0] ?? '';
};
/** Who wrote an observation thread, from its author's role: UBEC accounts wrote the earlier ('ubec') requests' threads. */
export const observationAudienceOf = (authorRole: string): ObservationAudience => authorRole.startsWith('UBEC') ? 'ubec' : 'subeb';

export type ObservationReply = { department: OversightDepartment; completedAt: string | null; completedByName: string | null; note: string };
export type ObservationRequest = { id: number; audience: ObservationAudience; createdAt: string; requestedByName: string; comment: string; submissionNumber: number; departments: ObservationReply[] };
export type ObservationStatus = {
  /** Newest first; earlier requests stay listed (their observations stay visible). */
  requests: ObservationRequest[];
  /** Open observation threads on the plan (all departments, all requests). */
  openComments: number;
  /** Why the plan cannot be sent to UBEC yet, or null. */
  problem: string | null;
};

/** Departments of the latest request that have not sent their observations back. */
export const waitingDepartments = (requests: readonly ObservationRequest[]) => requests[0]?.departments.filter(d => !d.completedAt).map(d => d.department) ?? [];

export function observationProblem(requests: readonly ObservationRequest[], openComments: number): string | null {
  const waiting = waitingDepartments(requests), who = prefix(requests[0]?.audience ?? 'subeb');
  if (waiting.length) return `Waiting for observations from ${who} ${listDepartments(waiting)}. You can send to UBEC once ${waiting.length === 1 ? 'it replies' : 'they reply'}`;
  if (openComments) return `Resolve the ${openComments === 1 ? 'open observation' : `${openComments} open observations`} before sending to UBEC`;
  return null;
}

/**
 * Who works on observation requests. UBEC (requests made before 30 October 2026): the Oversight Directors and Assessment
 * Officers of Audit, Procurement, Finance and Special Programmes, and the UBEC BEAP Chair, who follows every request
 * read-only. SUBEB (audience 'subeb'): the Director and Data Entry Staff of the state's own department of the same name.
 * Only a Director sends the department's observations back.
 */
export type ObservationViewer = { audience: ObservationAudience; stateCode: string | null; department: OversightDepartment | null; director: boolean; chair: boolean };
type ViewerUser = { role: string; department?: string | null; departments?: readonly string[] | null; stateCode?: string | null };
const isObservationDepartment = (department: string | null | undefined): department is OversightDepartment => (oversightIds as readonly string[]).includes(department ?? '');
export function observationViewer(user: ViewerUser): ObservationViewer | null {
  if (user.role === ubecRoles.chair) return { audience: 'ubec', stateCode: null, department: null, director: false, chair: true };
  if ((user.role === ubecRoles.oversight || user.role === ubecRoles.officer) && isObservationDepartment(user.department)) return { audience: 'ubec', stateCode: null, department: user.department, director: user.role === ubecRoles.oversight, chair: false };
  if ((user.role === 'Director' || user.role === 'Data Entry Staff') && user.stateCode && user.stateCode !== 'UBEC') {
    const department = [...(user.departments ?? []), user.department ?? ''].find(isObservationDepartment);
    if (department) return { audience: 'subeb', stateCode: user.stateCode, department, director: user.role === 'Director', chair: false };
  }
  return null;
}
/** Whether `viewer` may comment now: their department is waiting on the latest request, made to their audience. */
export const mayObserve = (viewer: ObservationViewer, requests: readonly ObservationRequest[]) => !!viewer.department && requests[0]?.audience === viewer.audience && waitingDepartments(requests).includes(viewer.department);

/** A plan's latest observation request, as the observation lists show it. */
export type ObservationPlan = { planId: number; state: string; period: string; requestedAt: string; requestedByName: string; audience: ObservationAudience; departments: ObservationReply[] };
