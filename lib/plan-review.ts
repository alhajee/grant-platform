import type { ActionPlan } from './action-plans';
/** `finance_submit`: the Finance department submitted the plan's Finance documents to the BEAP Chair (migration 073). */
/** `observation_request` / `observation_return`: the Executive Chairman asked UBEC Audit, Procurement or Finance for observations; a department sent them back (migration 075). */
export type ReviewAction = 'submit' | 'request_changes' | 'endorse' | 'forward' | 'approve' | 'edit' | 'finance_submit' | 'observation_request' | 'observation_return';
export const reviewActionLabels: Record<ReviewAction, string> = { submit: 'Sent to department Director', endorse: 'Sent to BEAP Chair', forward: 'Sent to Executive Chairman', request_changes: 'Changes requested', approve: 'Review completed', edit: 'Plan details updated', finance_submit: 'Finance documents submitted to the BEAP Chair', observation_request: 'Observations requested from UBEC', observation_return: 'UBEC observations sent back' };
export type ReviewEvent = { id: number; action: ReviewAction; actorName: string; actorRole: string; comment: string; scope: string; submissionNumber: number; createdAt: string };
type School = { id?: number; name: string; lga: string; level: string; location: string };
export type Snapshot = {
  infrastructureDocuments?: import('./infrastructure-model').InfraDocument[];
  sbmc?: import('./activity-plans').ActivitySnapshotLine[];
  tlm?: import('./activity-plans').ActivitySnapshotLine[];
  tlmDistribution?: import('./activity-plans').DistributionSchool[];
  monitoring?: import('./activity-plans').ActivitySnapshotLine[];
  gscci?: import('./activity-plans').ActivitySnapshotLine[];
  gscciDistribution?: import('./activity-plans').DistributionSchool[];
  /** UBEC74: the schools of the PHE officer training (migration 079). */
  pheDistribution?: import('./activity-plans').DistributionSchool[];
  curriculum?: import('./activity-plans').ActivitySnapshotLine[];
  curriculumDistribution?: import('./activity-plans').DistributionSchool[];
  /** Quality Assurance and ICT lines carry their chosen schools and documents (migration 038); SBMC, TLM, Monitoring, Curriculum and Planning lines carry their supporting documents (migration 057). */
  quality?: import('./activity-plans').ActivitySnapshotLine[];
  ict?: import('./activity-plans').ActivitySnapshotLine[];
  /** Teacher Development lines carry their training details and documents (migration 040). */
  teachers?: import('./activity-plans').ActivitySnapshotLine[];
  /** Planning, EMIS & Data Platform lines (migration 041). */
  planning?: import('./activity-plans').ActivitySnapshotLine[];
  /** Component documents (component_documents): the Supervision & Monitoring proforma invoices. */
  componentDocuments?: import('./activity-plans').ComponentDocument[];
  setup?: import('./plan-setup').PlanSetup;
  infrastructure: { id: number; code: string; quantity: number; unit_cost: string; duration: number; rationale: string; strategy: string; longitude: string; latitude: string; school: School; construction: { name: string }; package?: import('./infrastructure-model').InfrastructurePackage;
    /** Timeline (migration 050); submissions saved before it have none. */
    quarters?: number[]; start_date?: string | null; due_date?: string | null }[];
  sports: { id: number; code: string; section: string; activity_type: string; description: string; quantity: number; unit_cost: string; quarters?: number[]; start_date?: string | null; due_date?: string | null; allocations: { id: number; quantity: number; longitude: string; latitude: string; school: School }[] }[];
};
export type PlanReview = { /** UBEC189: rejected items not yet corrected, per component (working plan). */ ubecOpenRejections?: Partial<Record<import('./beap-pillars').ImplementedPillar, string[]>>; visiblePillars: import('./beap-pillars').ImplementedPillar[]; plan: ActionPlan; role: string; department: string | null; departments: string[]; isBeapChair: boolean; beapChairSubmissionMode: import('./workflow-settings').BeapChairSubmissionMode; ubecSubmissionMode: import('./workflow-settings').UbecSubmissionMode; /** Whether supporting documents (ICT, Teacher Development, Infrastructure except land documents) are required before sending (migration 052). */ documentsRequired: boolean; snapshot: Snapshot; pillarReviews: import('./pillar-review').PillarReview[]; readyForExecutiveChairman: boolean; /** Why the complete plan cannot go to the Executive Chairman yet (BEAP Chair only) */ executiveChairmanProblem?: string | null; readyForUbec: boolean; /** Every component must use its whole allocation before it is sent (UBEC79, migration 076). */ fullAllocation?: boolean; /** Why the plan cannot go to UBEC because of observations asked of UBEC Audit, Procurement or Finance (row 156). */ observationProblem?: string | null; selectedSubmission: number | null; submissions: { number: number; createdAt: string }[]; events: ReviewEvent[] };
