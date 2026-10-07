import type { Snapshot } from './plan-review';
import { implementedPillars, type ImplementedPillar, type PillarId } from './beap-pillars';

// UBEC roles, departments and the component each department reviews (docs/ubec-flow.md, migration 055).

export const ubecRoles = {
  es: 'UBEC Executive Secretary',
  chair: 'UBEC BEAP Chair',
  director: 'UBEC Director',
  oversight: 'UBEC Oversight Director',
  officer: 'UBEC Assessment Officer',
} as const;
export type UbecRole = typeof ubecRoles[keyof typeof ubecRoles];
export const ubecRoleList: readonly UbecRole[] = Object.values(ubecRoles);
/** Replaced by UBEC Assessment Officer (migration 055); kept only so old rows still read. It has no UBEC access. */
export const legacyReviewerRole = 'UBEC Department Reviewer';

/** Departments that review components (one Director and their Assessment Officers each). */
export const componentDepartments = [
  { id: 'physical', name: 'Physical Planning', short: 'DPP' },
  { id: 'planning', name: 'Planning, Research & Statistics', short: 'DPRS' },
  { id: 'academic', name: 'Academic Services', short: 'DACS' },
  { id: 'teachers', name: 'Teacher Professional Development', short: 'DTPD' },
  { id: 'digital', name: 'Data, Digital Platforms & Analytics', short: 'DDDPA' },
  { id: 'quality', name: 'Monitoring & Evaluation', short: 'DME' },
  { id: 'social', name: 'Social Mobilisation', short: 'DSM' },
] as const;
/** Oversight ("God mode") departments: they observe every component and comment, but never accept or reject. */
export const oversightDepartments = [
  { id: 'audit', name: 'Audit', short: 'Audit' },
  { id: 'procurement', name: 'Procurement', short: 'Procurement' },
  { id: 'finance', name: 'Finance', short: 'Finance' },
] as const;
export type ComponentDepartment = typeof componentDepartments[number]['id'];
export type OversightDepartment = typeof oversightDepartments[number]['id'];
export const oversightIds = oversightDepartments.map(d => d.id) as OversightDepartment[];
const legacyDepartments = [
  { id: 'administration', name: 'Administration and Supplies', short: 'Admin' },
  { id: 'special', name: 'Special Programmes', short: 'Special' },
  { id: 'zonal', name: 'Zonal and State Offices', short: 'Zonal' },
] as const;
/** Every UBEC department a user can hold (component and oversight departments). */
export const departments = [...componentDepartments, ...oversightDepartments] as const;
const allDepartments: readonly { id: string; name: string; short: string }[] = [...departments, ...legacyDepartments];

/** The UBEC department that reviews each component. TLM keeps the Infrastructure budget pool but Academic Services reviews it. */
export const pillarDepartments: Record<PillarId, ComponentDepartment> = {
  infrastructure: 'physical', monitoring: 'physical', planning: 'planning', sports: 'academic', tlm: 'academic', curriculum: 'academic', gscci: 'academic',
  teachers: 'teachers', ict: 'digital', quality: 'quality', sbmc: 'social',
};
export const departmentPillars = (department: string): ImplementedPillar[] => implementedPillars.filter(p => pillarDepartments[p] === department);

export const isComponentDepartment = (id: string | null | undefined): id is ComponentDepartment => componentDepartments.some(d => d.id === id);
export const isOversightDepartment = (id: string | null | undefined): id is OversightDepartment => oversightDepartments.some(d => d.id === id);
export const isUbec = (role: string) => (ubecRoleList as readonly string[]).includes(role);
export const departmentName = (id: string) => allDepartments.find(d => d.id === id)?.name ?? id;
export const departmentShort = (id: string) => allDepartments.find(d => d.id === id)?.short ?? id;
/** "Physical Planning (DPP)". */
export const departmentLabel = (id: string) => { const d = allDepartments.find(item => item.id === id); return d ? (d.short && d.short !== d.name ? `${d.name} (${d.short})` : d.name) : id; };
/** Roles that need a department, and which list it comes from. */
export const ubecRoleDepartments = (role: string): readonly { id: string; name: string; short: string }[] =>
  role === ubecRoles.director || role === ubecRoles.officer ? componentDepartments : role === ubecRoles.oversight ? oversightDepartments : [];
/** The account title shown under the name, e.g. "UBEC Director · Physical Planning (DPP)". */
export function ubecRoleTitle(role: string, department: string | null | undefined) {
  if (role === ubecRoles.director && department) return `UBEC Director · ${departmentLabel(department)}`;
  if (role === ubecRoles.oversight && department) return `UBEC Director ${departmentName(department)} · Oversight`;
  if (role === ubecRoles.officer && department) return `Assessment Officer · ${departmentLabel(department)}`;
  return role;
}

export const activePillars = (snapshot: Snapshot) => implementedPillars.filter(p => (snapshot[p]?.length ?? 0) > 0);
export const nationalStatusLabels: Record<string, string> = { received: 'With UBEC BEAP Chair', reviewing: 'Department review', returned: 'Returned to SUBEB', approved: 'Approved by UBEC' };

export type UbecAssignment = { id: number; pillar: PillarId; department: string; feedback: string | null; recommendation: string | null; reviewer: string | null; completed_at: string | null; created_at: string };
export type UbecRound = { id: number; plan_id: number; number: number; state_submission: number; status: string; snapshot: Snapshot; submitted_at: string; decision: string; decided_at: string | null; released_at?: string | null; released_by_name?: string | null; release_comment?: string };
export type UbecPlan = { id: number; state_code: string; stateName: string; start_year: number; end_year: number; funding_quarters?: number[] | null; version: number; status: string };
export type UbecDetail = {
  canSubmit: boolean; ubecMode: import('./workflow-settings').UbecSubmissionMode; user: { name: string; role: string; department?: string | null }; plan: UbecPlan; role: string; department: string | null;
  rounds: Omit<UbecRound, 'snapshot'>[]; round: UbecRound | null;
  /** Earlier-flow department assignments (read-only history). */
  assignments: UbecAssignment[];
  flow: import('./ubec-flow').UbecFlow | null;
  events: { id: number; action: string; actor: string; comment: string; created_at: string; pillar?: string | null }[];
  /** Plan funding for the summary card (from the round's snapshot setup). */
  fundingTotal?: number | null;
};
export type NationalItem = {
  id: number; planId: number; state: string; stateCode: string; startYear: number; endYear: number; fundingQuarters?: number[] | null; status: string; round: number; submittedAt: string; decidedAt: string | null;
  budget: number; schools: string[]; infrastructure: number; sports: number;
  /** Released components not yet with the BEAP Chair, and components that have arrived. */
  pending: number; completed: number;
  fundingTotal?: number | null; amounts?: Partial<Record<ImplementedPillar, number>>;
  components?: import('./ubec-flow').PipelineComponent[];
};
export type UbecQueueItem = { planId: number; state: string; label: string; detail: string; href: string; kind: 'release' | 'assign' | 'assess' | 'oversight' | 'observe' | 'decide' | 'consolidate' };
export type UbecDashboard = {
  user: { name: string; role: string; department: string | null };
  items: NationalItem[]; queue: UbecQueueItem[];
  activity: { id: number; plan_id: number; action: string; actor: string; created_at: string; stateName: string; pillar?: string | null }[];
  workload: { department: string; pending: number; completed: number }[]; monthly: { month: string; submissions: number }[]; years: number[];
};
