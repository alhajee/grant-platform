import type { ActionPlan } from './action-plans';
export type ReviewAction = 'submit' | 'request_changes' | 'endorse' | 'approve';
export const reviewActionLabels: Record<ReviewAction, string> = { submit: 'Sent to department Director', endorse: 'Sent to Chairman', request_changes: 'Changes requested', approve: 'Review completed' };
export type ReviewEvent = { id: number; action: ReviewAction; actorName: string; actorRole: string; comment: string; scope: string; submissionNumber: number; createdAt: string };
type School = { name: string; lga: string; level: string; location: string };
export type Snapshot = {
  setup?: import('./plan-setup').PlanSetup;
  infrastructure: { id: number; code: string; quantity: number; unit_cost: string; duration: number; rationale: string; strategy: string; longitude: string; latitude: string; school: School; construction: { name: string } }[];
  sports: { id: number; code: string; section: string; activity_type: string; description: string; quantity: number; unit_cost: string; allocations: { id: number; quantity: number; longitude: string; latitude: string; school: School }[] }[];
};
export type PlanReview = { plan: ActionPlan; role: string; department: string | null; snapshot: Snapshot; pillarReviews: import('./pillar-review').PillarReview[]; readyForUbec: boolean; selectedSubmission: number | null; submissions: { number: number; createdAt: string }[]; events: ReviewEvent[] };
