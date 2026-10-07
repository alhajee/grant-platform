import type { QueryResult, QueryResultRow } from 'pg';
import { implementedPillars, type ImplementedPillar } from './beap-pillars';
import { canEditPillar } from './subeb-access';
import type { PlanStatus } from './action-plans';
import type { Snapshot } from './plan-review';
import { infrastructureDocumentProblem } from './infrastructure-documents';
import { componentReadinessProblem, readinessWorkstreams, hasReadinessRules, type ReadinessOptions } from './component-readiness';
import type { DepartmentAccess } from './user-departments';
import type { UbecSubmissionMode } from './workflow-settings';
import { distributionSnapshotKeys, distributionWorkstreams } from './distribution-lists';

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
export function readyForUbec(reviews: PillarReview[], snapshot: Snapshot, options: ReadinessOptions) {
  return implementedPillars.every(p => reviews.some(r => r.pillar === p && r.status === 'chairman_ready')) && planIsComplete(snapshot, options);
}
// Components the Executive Chairman holds and may send to UBEC.
export function componentsWithExecutiveChairman(reviews: PillarReview[]) {
  return implementedPillars.filter(p => reviews.some(r => r.pillar === p && r.status === 'chairman_ready'));
}
export function readyForUbecSubmission(mode: UbecSubmissionMode, reviews: PillarReview[], snapshot: Snapshot, options: ReadinessOptions) {
  return mode === 'reviewed_components' ? componentsWithExecutiveChairman(reviews).length > 0 && !unreadySentComponents(snapshot, reviews, options).length : readyForUbec(reviews, snapshot, options);
}
// UBEC receives only the components that completed the state review chain.
export function ubecSubmissionSnapshot(snapshot: Snapshot, reviews: PillarReview[]): Snapshot {
  const sent = componentsWithExecutiveChairman(reviews);
  return {
    setup: snapshot.setup,
    infrastructure: sent.includes('infrastructure') ? snapshot.infrastructure : [],
    ...(sent.includes('infrastructure') ? { infrastructureDocuments: snapshot.infrastructureDocuments } : {}),
    sports: sent.includes('sports') ? snapshot.sports : [],
    sbmc: sent.includes('sbmc') ? snapshot.sbmc ?? [] : [],
    tlm: sent.includes('tlm') ? snapshot.tlm ?? [] : [],
    tlmDistribution: sent.includes('tlm') ? snapshot.tlmDistribution ?? [] : [],
    monitoring: sent.includes('monitoring') ? snapshot.monitoring ?? [] : [],
    gscci: sent.includes('gscci') ? snapshot.gscci ?? [] : [],
    gscciDistribution: sent.includes('gscci') ? snapshot.gscciDistribution ?? [] : [],
    curriculum: sent.includes('curriculum') ? snapshot.curriculum ?? [] : [],
    curriculumDistribution: sent.includes('curriculum') ? snapshot.curriculumDistribution ?? [] : [],
    quality: sent.includes('quality') ? snapshot.quality ?? [] : [],
    teachers: sent.includes('teachers') ? snapshot.teachers ?? [] : [],
    ict: sent.includes('ict') ? snapshot.ict ?? [] : [],
    planning: sent.includes('planning') ? snapshot.planning ?? [] : [],
    componentDocuments: (snapshot.componentDocuments ?? []).filter(d => sent.includes(d.component)),
  };
}
export function readyForExecutiveChairman(reviews: PillarReview[], snapshot: Snapshot, options: ReadinessOptions) {
  return implementedPillars.every(p => reviews.some(r => r.pillar === p && ['beap_review','chairman_ready'].includes(r.status))) &&
    reviews.some(r => r.status === 'beap_review') && planIsComplete(snapshot, options);
}
function planIsComplete(snapshot: Snapshot, options: ReadinessOptions) {
  return implementedPillars.every(p => (snapshot[p]?.length ?? 0) > 0) && distributionWorkstreams.every(w => (snapshot[distributionSnapshotKeys[w]]?.length ?? 0) > 0) && !infrastructureDocumentProblem(snapshot)
    && readinessWorkstreams.every(p => !componentReadinessProblem(p, snapshot[p] ?? [], snapshot.setup, options));
}
/** Components with the Executive Chairman that are not ready to reach UBEC (compulsory activities, line schools and documents, the Teacher Development split). */
export function unreadySentComponents(snapshot: Snapshot, reviews: PillarReview[], options: ReadinessOptions) {
  return componentsWithExecutiveChairman(reviews).flatMap(p => hasReadinessRules(p) && componentReadinessProblem(p, snapshot[p] ?? [], snapshot.setup, options) ? [p] : []);
}
export function aggregateReviewStatus(reviews: PillarReview[]): PlanStatus {
  if (implementedPillars.every(p => reviews.some(r => r.pillar === p && r.status === 'chairman_ready'))) return 'awaiting_chairman';
  if (reviews.some(r => r.status === 'changes_requested')) return 'changes_requested';
  if (reviews.some(r => r.status === 'director_review')) return 'awaiting_review';
  if (implementedPillars.every(p => reviews.some(r => r.pillar === p && ['beap_review','chairman_ready'].includes(r.status)))) return 'awaiting_beap_chair';
  return 'draft';
}
