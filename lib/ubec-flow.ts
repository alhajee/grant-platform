import { componentSections, implementedPillars, type ImplementedPillar } from './beap-pillars';
import { activityLabel, activityWorkstreams, type ActivityWorkstream } from './activity-plans';
import type { Snapshot } from './plan-review';
import { oversightIds, type OversightDepartment } from './ubec';

// The UBEC review flow shared by the server and the client (docs/ubec-flow.md, migration 055).

export type ComponentStage = 'director' | 'oversight' | 'chair';
export type ItemDecisionValue = 'accept' | 'reject';
export type DecisionCounts = { accepted: number; rejected: number; undecided: number; total: number };
export type OfficerAssignment = { id: number; officerId: number; officerName: string; assignedByName: string; comment: string; createdAt: string; completedAt: string | null; completionNote: string };
export type OversightReview = { department: OversightDepartment; reviewerName: string; note: string; completedAt: string };
/** An oversight department's Assessment Officer on a component (migration 071): comments on items, never decides. */
export type ObserverAssignment = { id: number; department: OversightDepartment; officerId: number; officerName: string; assignedByName: string; comment: string; createdAt: string };
export type FlowComponent = {
  id: number; pillar: ImplementedPillar; department: string; stage: ComponentStage;
  directorComment: string; directorName: string | null; sentToOversightAt: string | null; arrivedAt: string | null; releasedAt: string;
  officers: OfficerAssignment[]; oversight: OversightReview[]; counts: DecisionCounts; amount: number;
  /** Oversight departments' Assessment Officers (migration 071). */
  observers: ObserverAssignment[];
  /** Assessment Officers' Validation Reports (Infrastructure, migration 069). */
  validationReports: ValidationReport[];
};
export type ValidationReport = { id: string; name: string; size: number; officerId: number; officerName: string; createdAt: string };
/** Components whose officers must upload a Validation Report before completing their assessment. */
export const validationReportPillars: readonly ImplementedPillar[] = ['infrastructure'];
export const needsValidationReport = (pillar: ImplementedPillar) => validationReportPillars.includes(pillar);
export type ItemDecision = { pillar: ImplementedPillar; rowRef: string; decision: ItemDecisionValue; note: string; officerName: string; decidedAt: string };
export type FlowAbilities = {
  /** UBEC BEAP Chair: release the round, and approve/return it once every component has arrived. */
  release: boolean; decide: boolean;
  /** Components the viewer may assign officers to / send for oversight (Director), decide items on (officer), observe (oversight). */
  assign: ImplementedPillar[]; sendOversight: ImplementedPillar[]; assess: ImplementedPillar[]; observe: ImplementedPillar[];
  /** The viewer's own open officer assignments, by component. */
  complete: ImplementedPillar[];
  /** The Director of the component's department: change item decisions and send assessments back (UBEC143). */
  override: ImplementedPillar[];
  /** Oversight Director: assign their department's officers to components with oversight (migration 071). */
  assignObservers: ImplementedPillar[];
  /** Oversight department officer: comment on the items of the components they are assigned to (no decisions). */
  comment: ImplementedPillar[];
};
/** Active Assessment Officers the viewer may assign (a Director's department; every component department for the Super Admin). */
export type DepartmentOfficer = { id: number; name: string; email: string; open: number; department: string };
export type UbecFlow = {
  releasedAt: string | null; releasedByName: string | null; releaseComment: string;
  components: FlowComponent[]; decisions: ItemDecision[]; previousDecisions: ItemDecision[];
  /** UBEC195: the previous round's rejected items the SUBEB changed before resubmitting, per component (row refs). */
  corrected: Partial<Record<ImplementedPillar, string[]>>;
  abilities: FlowAbilities; officers: DepartmentOfficer[];
  /** Admin default officers per component, pre-ticked in the assign step (only for viewers who assign, among `officers`). */
  defaultOfficers: Partial<Record<ImplementedPillar, number[]>>;
  /** Every released component has reached the BEAP Chair; approval also needs nothing rejected or undecided and no open oversight comments. */
  allArrived: boolean; approvable: boolean;
  /** Open UBEC comments by Audit, Procurement and Finance (Directors and officers) on this round: resolve them before approval. */
  openOversightComments: number;
  /** The signed-in user, so the page can tell their own Validation Reports apart. */
  viewerId: number;
};
/** One component of a plan on the dashboards: where it is in the pipeline. */
export type PipelineComponent = {
  pillar: ImplementedPillar; department: string; stage: ComponentStage | 'unreleased'; amount: number; counts: DecisionCounts;
  officers: { name: string; completed: boolean; mine: boolean }[]; oversightDone: OversightDepartment[];
};

/** The Super Admin may assign and remove officers on any released component (alongside the Director). */
export const superAdminRole = 'Super Admin';
/** Who and why on an assignment made by the release from the Admin defaults (migration 056). */
export const defaultAssignerName = 'Default (Admin)';
export const defaultAssignmentComment = 'Assigned by default (Admin)';

export const stageLabels: Record<PipelineComponent['stage'], string> = { unreleased: 'With UBEC BEAP Chair', director: 'Department assessment', oversight: 'Oversight review', chair: 'Ready for BEAP Chair' };
export const componentName = (pillar: string) => componentSections[pillar as ImplementedPillar]?.[0]?.name ?? pillar;
export const isPillar = (value: string): value is ImplementedPillar => (implementedPillars as readonly string[]).includes(value);

export type ComponentItem = { rowRef: string; title: string; detail: string; code: string; quantity: number; unitCost: number; amount: number };
const kobo = (unitCost: string, quantity: number) => Math.round(Number(unitCost) * 100) * quantity;
/** The items (lines) of a component in a round snapshot: what officers accept or reject. Row refs are the workbook row ids. */
export function componentItems(snapshot: Snapshot, pillar: ImplementedPillar): ComponentItem[] {
  if (pillar === 'infrastructure') return snapshot.infrastructure.map(line => ({ rowRef: String(line.id), title: line.construction?.name || 'Infrastructure project', detail: `${line.school.name} · ${line.school.lga}`, code: line.code ?? '', quantity: line.quantity, unitCost: Number(line.unit_cost), amount: kobo(line.unit_cost, line.quantity) / 100 }));
  if (pillar === 'sports') return snapshot.sports.map(line => ({ rowRef: String(line.id), title: line.description || line.activity_type, detail: `${line.activity_type} · ${line.section}`, code: line.code ?? '', quantity: line.quantity, unitCost: Number(line.unit_cost), amount: kobo(line.unit_cost, line.quantity) / 100 }));
  const lines = snapshot[pillar] ?? [];
  return lines.map(line => {
    const activity = (activityWorkstreams as readonly string[]).includes(pillar) ? activityLabel(pillar as ActivityWorkstream, line.activity, line.custom_activity ?? '') : '';
    return { rowRef: String(line.id), title: activity || line.description || `Line ${line.id}`, detail: line.description && line.description !== activity ? line.description : '', code: line.code ?? '', quantity: line.quantity, unitCost: Number(line.unit_cost), amount: kobo(line.unit_cost, line.quantity) / 100 };
  });
}
export const componentAmount = (snapshot: Snapshot, pillar: ImplementedPillar) => componentItems(snapshot, pillar).reduce((sum, item) => sum + Math.round(item.amount * 100), 0) / 100;

export function decisionCounts(items: readonly { rowRef: string }[], decisions: readonly { rowRef: string; decision: ItemDecisionValue }[]): DecisionCounts {
  const byRow = new Map(decisions.map(d => [d.rowRef, d.decision]));
  const accepted = items.filter(i => byRow.get(i.rowRef) === 'accept').length, rejected = items.filter(i => byRow.get(i.rowRef) === 'reject').length;
  return { accepted, rejected, undecided: items.length - accepted - rejected, total: items.length };
}
/** Oversight departments that have not finished their observations on a component yet. */
export const oversightPending = (done: readonly string[]) => oversightIds.filter(id => !done.includes(id));

/** The SUBEB's view of a decided round (app/api/ubec/results). */
export type UbecResults = {
  round: { number: number; status: string; decision: string; decidedAt: string | null } | null;
  components: { pillar: string; counts: { accepted: number; rejected: number; undecided: number; total: number }; directorComment: string; directorName: string | null;
    oversight: { department: string; reviewerName: string; note: string }[]; officers: { name: string; note: string }[];
    items: { rowRef: string; title: string; detail: string; amount: number; decision: 'accept' | 'reject' | null; note: string }[] }[];
};
