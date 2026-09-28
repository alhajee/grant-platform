import type { QueryResult, QueryResultRow } from 'pg';
import { implementedPillars, type ImplementedPillar } from './beap-pillars';
import { canEditPillar } from './subeb-access';
import type { PlanStatus } from './action-plans';
import type { Snapshot } from './plan-review';
import { infrastructureDocumentProblem } from './infrastructure-documents';
import type { DepartmentAccess } from './user-departments';

export type PillarReviewStatus = 'draft' | 'director_review' | 'changes_requested' | 'beap_review' | 'chairman_ready';
export type PillarReview = { pillar: ImplementedPillar; status: PillarReviewStatus };
export const pillarReviewLabels: Record<PillarReviewStatus,string> = {
  draft: 'Draft', director_review: 'With Director', changes_requested: 'Changes requested', beap_review: 'With BEAP Chair', chairman_ready: 'With Executive Chairman',
};
export const statePlanOpen = (status: string) => !['submitted_ubec','ubec_review','ubec_approved'].includes(status);
export async function readPillarReviews(db: { query<R extends QueryResultRow>(sql: string, values?: unknown[]): Promise<QueryResult<R>> }, planId: number): Promise<PillarReview[]> {
  const rows = (await db.query<PillarReview>('SELECT pillar,status FROM plan_pillar_reviews WHERE plan_id=$1', [planId])).rows;
  return implementedPillars.map(pillar => rows.find(row => row.pillar === pillar) ?? { pillar, status: 'draft' });
}
export function mayEditPillar(role: string, departments: DepartmentAccess, pillar: ImplementedPillar, status: string, reviews: PillarReview[]) {
  const review = reviews.find(r => r.pillar === pillar)?.status ?? 'draft';
  return statePlanOpen(status) && canEditPillar(role, departments, pillar) &&
    (role === 'Director' ? review === 'director_review' : ['draft','changes_requested'].includes(review));
}
export function readyForUbec(reviews: PillarReview[], snapshot: Snapshot) {
  return implementedPillars.every(p => reviews.some(r => r.pillar === p && r.status === 'chairman_ready')) && planIsComplete(snapshot);
}
export function readyForExecutiveChairman(reviews: PillarReview[], snapshot: Snapshot) {
  return implementedPillars.every(p => reviews.some(r => r.pillar === p && ['beap_review','chairman_ready'].includes(r.status))) &&
    reviews.some(r => r.status === 'beap_review') && planIsComplete(snapshot);
}
function planIsComplete(snapshot: Snapshot) {
  return implementedPillars.every(p => (snapshot[p]?.length ?? 0) > 0) && (snapshot.tlmDistribution?.length ?? 0)>0 && !infrastructureDocumentProblem(snapshot);
}
export function aggregateReviewStatus(reviews: PillarReview[]): PlanStatus {
  if (implementedPillars.every(p => reviews.some(r => r.pillar === p && r.status === 'chairman_ready'))) return 'awaiting_chairman';
  if (reviews.some(r => r.status === 'changes_requested')) return 'changes_requested';
  if (reviews.some(r => r.status === 'director_review')) return 'awaiting_review';
  if (implementedPillars.every(p => reviews.some(r => r.pillar === p && ['beap_review','chairman_ready'].includes(r.status)))) return 'awaiting_beap_chair';
  return 'draft';
}
