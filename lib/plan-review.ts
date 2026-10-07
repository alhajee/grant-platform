import type { ActionPlan } from './action-plans';
export type ReviewAction = 'submit' | 'request_changes' | 'endorse' | 'forward' | 'approve' | 'edit';
export const reviewActionLabels: Record<ReviewAction, string> = { submit: 'Sent to department Director', endorse: 'Sent to BEAP Chair', forward: 'Sent to Executive Chairman', request_changes: 'Changes requested', approve: 'Review completed', edit: 'Plan details updated' };
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
  curriculum?: import('./activity-plans').ActivitySnapshotLine[];
  curriculumDistribution?: import('./activity-plans').DistributionSchool[];
  /** Quality Assurance and ICT lines carry their chosen schools and documents (migration 038). */
  quality?: import('./activity-plans').ActivitySnapshotLine[];
  ict?: import('./activity-plans').ActivitySnapshotLine[];
  /** Teacher Development lines carry their training details and documents (migration 040). */
  teachers?: import('./activity-plans').ActivitySnapshotLine[];
  /** Planning, Research & Statistics lines (migration 041). */
  planning?: import('./activity-plans').ActivitySnapshotLine[];
  /** Component documents (component_documents): the Supervision & Monitoring proforma invoices. */
  componentDocuments?: import('./activity-plans').ComponentDocument[];
  setup?: import('./plan-setup').PlanSetup;
  infrastructure: { id: number; code: string; quantity: number; unit_cost: string; duration: number; rationale: string; strategy: string; longitude: string; latitude: string; school: School; construction: { name: string }; package?: import('./infrastructure-model').InfrastructurePackage }[];
  sports: { id: number; code: string; section: string; activity_type: string; description: string; quantity: number; unit_cost: string; allocations: { id: number; quantity: number; longitude: string; latitude: string; school: School }[] }[];
};
export type PlanReview = { visiblePillars: import('./beap-pillars').ImplementedPillar[]; plan: ActionPlan; role: string; department: string | null; departments: string[]; isBeapChair: boolean; beapChairSubmissionMode: import('./workflow-settings').BeapChairSubmissionMode; ubecSubmissionMode: import('./workflow-settings').UbecSubmissionMode; /** Whether ICT and Teacher Development documents are required before sending (migration 052). */ documentsRequired: boolean; snapshot: Snapshot; pillarReviews: import('./pillar-review').PillarReview[]; readyForExecutiveChairman: boolean; readyForUbec: boolean; selectedSubmission: number | null; submissions: { number: number; createdAt: string }[]; events: ReviewEvent[] };
