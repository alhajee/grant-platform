import { oversightDepartments, oversightIds, ubecRoles, type OversightDepartment } from './ubec';

// Observations before sending to UBEC (bug sheet row 156, migration 075). The SUBEB Executive Chairman may ask any of UBEC
// Audit, Procurement and Finance to look at the whole plan before it is sent. Each department asked comments per activity
// (plan_comments scope 'observation') and sends its observations back. Until every department asked has replied and the
// SUBEB has resolved every observation, the plan cannot be sent to UBEC. Shared by the APIs and the pages.

export const observationDepartmentIds = oversightIds;
export const observationDepartmentName = (department: string) => `UBEC ${oversightDepartments.find(d => d.id === department)?.name ?? department}`;
export const listDepartments = (departments: readonly string[]) => {
  const names = departments.map(d => oversightDepartments.find(o => o.id === d)?.name ?? d);
  return names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : names[0] ?? '';
};

export type ObservationReply = { department: OversightDepartment; completedAt: string | null; completedByName: string | null; note: string };
export type ObservationRequest = { id: number; createdAt: string; requestedByName: string; comment: string; submissionNumber: number; departments: ObservationReply[] };
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
  const waiting = waitingDepartments(requests);
  if (waiting.length) return `Waiting for observations from UBEC ${listDepartments(waiting)}. You can send to UBEC once ${waiting.length === 1 ? 'it replies' : 'they reply'}`;
  if (openComments) return `Resolve the ${openComments === 1 ? 'open observation' : `${openComments} open observations`} from UBEC before sending to UBEC`;
  return null;
}

/**
 * Who works on observation requests at UBEC: the Oversight Directors and Assessment Officers of Audit, Procurement and
 * Finance (their own department; only the Director sends the observations back), and the UBEC BEAP Chair, who follows
 * every request read-only.
 */
export type ObservationViewer = { department: OversightDepartment | null; director: boolean; chair: boolean };
export function observationViewer(role: string, department: string | null | undefined): ObservationViewer | null {
  if (role === ubecRoles.chair) return { department: null, director: false, chair: true };
  if ((role === ubecRoles.oversight || role === ubecRoles.officer) && (oversightIds as readonly string[]).includes(department ?? '')) return { department: department as OversightDepartment, director: role === ubecRoles.oversight, chair: false };
  return null;
}
/** Whether `viewer` may comment now: their department is waiting on the latest request. */
export const mayObserve = (viewer: ObservationViewer, requests: readonly ObservationRequest[]) => !!viewer.department && waitingDepartments(requests).includes(viewer.department);

/** A plan's latest observation request, as the UBEC overview lists it. */
export type ObservationPlan = { planId: number; state: string; period: string; requestedAt: string; requestedByName: string; departments: ObservationReply[] };
