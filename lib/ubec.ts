import type { Snapshot } from './plan-review';
import { implementedPillars, type PillarId } from './beap-pillars';

export const departments = [
  { id: 'academic', name: 'Academic Services' },
  { id: 'administration', name: 'Administration and Supplies' },
  { id: 'physical', name: 'Physical Planning' },
  { id: 'planning', name: 'Planning, Research & Statistics' },
  { id: 'special', name: 'Special Programmes' },
  { id: 'teachers', name: 'Teacher Development' },
  { id: 'finance', name: 'Finance and Accounts' },
  { id: 'audit', name: 'Internal Audit' },
  { id: 'quality', name: 'Quality Assurance' },
  { id: 'social', name: 'Social Mobilization' },
  { id: 'zonal', name: 'Zonal and State Offices' },
] as const;
export const pillarDepartments: Record<PillarId, string> = { infrastructure: 'physical', tlm: 'academic', quality: 'quality', teachers: 'teachers', sbmc: 'social', sports: 'academic', monitoring: 'physical', curriculum: 'academic', planning: 'planning', gscci: 'academic' };
export const isUbec = (role: string) => ['UBEC Executive Secretary', 'UBEC Department Reviewer'].includes(role);
export const departmentName = (id: string) => departments.find(d => d.id === id)?.name ?? id;
export const activePillars = (snapshot: Snapshot) => implementedPillars.filter(p => (snapshot[p]?.length ?? 0) > 0);
export const nationalStatusLabels: Record<string, string> = { received: 'Awaiting assignment', reviewing: 'Department review', returned: 'Returned to SUBEB', approved: 'Approved by UBEC' };
export type UbecAssignment = { id: number; pillar: PillarId; department: string; feedback: string | null; recommendation: string | null; reviewer: string | null; completed_at: string | null; created_at: string };
export type UbecRound = { id: number; plan_id: number; number: number; state_submission: number; status: string; snapshot: Snapshot; submitted_at: string; decision: string; decided_at: string | null };
export type UbecPlan = { id: number; state_code: string; stateName: string; start_year: number; end_year: number; funding_quarters?: number[] | null; version: number; status: string };
export type UbecDetail = { canSubmit: boolean; ubecMode: import('./workflow-settings').UbecSubmissionMode; user: { name: string; role: string }; plan: UbecPlan; role: string; department: string | null; rounds: Omit<UbecRound, 'snapshot'>[]; round: UbecRound | null; assignments: UbecAssignment[]; events: { id: number; action: string; actor: string; comment: string; created_at: string }[] };
export type NationalItem = { id: number; planId: number; state: string; stateCode: string; startYear: number; endYear: number; fundingQuarters?: number[] | null; status: string; round: number; submittedAt: string; decidedAt: string | null; budget: number; schools: string[]; infrastructure: number; sports: number; pending: number; completed: number };
export type UbecDashboard = { user: { name: string; role: string; department: string | null }; items: NationalItem[]; activity: { id: number; plan_id: number; action: string; actor: string; created_at: string; stateName: string }[]; workload: { department: string; pending: number; completed: number }[]; monthly: { month: string; submissions: number }[]; years: number[] };
