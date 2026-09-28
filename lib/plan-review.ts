import type { ActionPlan } from './action-plans';
export type ReviewAction = 'submit' | 'request_changes' | 'endorse' | 'forward' | 'approve';
export const reviewActionLabels: Record<ReviewAction, string> = { submit: 'Sent to department Director', endorse: 'Sent to BEAP Chair', forward: 'Sent to Executive Chairman', request_changes: 'Changes requested', approve: 'Review completed' };
export type ReviewEvent = { id: number; action: ReviewAction; actorName: string; actorRole: string; comment: string; scope: string; submissionNumber: number; createdAt: string };
type School = { id?: number; name: string; lga: string; level: string; location: string };
export type Snapshot = {
  infrastructureDocuments?: import('./infrastructure-model').InfraDocument[];
  sbmc?: import('./activity-plans').ActivitySnapshotLine[];
  tlm?: import('./activity-plans').ActivitySnapshotLine[];
  tlmDistribution?: import('./activity-plans').DistributionSchool[];
  setup?: import('./plan-setup').PlanSetup;
  infrastructure: { id: number; code: string; quantity: number; unit_cost: string; duration: number; rationale: string; strategy: string; longitude: string; latitude: string; school: School; construction: { name: string }; package?: import('./infrastructure-model').InfrastructurePackage }[];
  sports: { id: number; code: string; section: string; activity_type: string; description: string; quantity: number; unit_cost: string; allocations: { id: number; quantity: number; longitude: string; latitude: string; school: School }[] }[];
};
export type PlanReview = { visiblePillars: import('./beap-pillars').ImplementedPillar[]; plan: ActionPlan; role: string; department: string | null; departments: string[]; isBeapChair: boolean; beapChairSubmissionMode: import('./workflow-settings').BeapChairSubmissionMode; ubecSubmissionMode: import('./workflow-settings').UbecSubmissionMode; snapshot: Snapshot; pillarReviews: import('./pillar-review').PillarReview[]; readyForExecutiveChairman: boolean; readyForUbec: boolean; selectedSubmission: number | null; submissions: { number: number; createdAt: string }[]; events: ReviewEvent[] };
