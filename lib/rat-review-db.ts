import type { QueryResult, QueryResultRow } from 'pg';
import { ratResubmitProblem, type RatReview } from './rat-review';

type Db = { query<R extends QueryResultRow = QueryResultRow>(sql: string, values?: unknown[]): Promise<QueryResult<R>> };

/** UBEC Planning's decision on a submission's RAT tool, or null while undecided. */
export async function readRatReview(db: Db, roundId: number): Promise<RatReview | null> {
  const row = (await db.query<{ decision: RatReview['decision']; comment: string; reviewer_name: string; decided_at: Date }>('SELECT decision,comment,reviewer_name,decided_at FROM ubec_rat_reviews WHERE round_id=$1', [roundId])).rows[0];
  return row ? { decision: row.decision, comment: row.comment, reviewerName: row.reviewer_name, decidedAt: row.decided_at.toISOString() } : null;
}

/** The returned round's RAT review and whether a RAT was uploaded after it (null when the plan is not back from UBEC). */
export async function readReturnedRat(db: Db, planId: number): Promise<{ review: RatReview | null; replacedSince: boolean } | null> {
  const round = (await db.query<{ id: number; status: string }>('SELECT id,status FROM ubec_rounds WHERE plan_id=$1 ORDER BY number DESC LIMIT 1', [planId])).rows[0];
  if (round?.status !== 'returned') return null;
  const review = await readRatReview(db, round.id);
  const replacedSince = !!review && (await db.query('SELECT 1 FROM plan_documents WHERE plan_id=$1 AND removed_at IS NULL AND created_at>$2 LIMIT 1', [planId, review.decidedAt])).rowCount! > 0;
  return { review, replacedSince };
}

/** Why the plan cannot be sent to UBEC again yet because of its RAT tool, or null. */
export async function readRatResubmitProblem(db: Db, planId: number): Promise<string | null> {
  const returned = await readReturnedRat(db, planId);
  return returned ? ratResubmitProblem(returned.review, returned.replacedSince) : null;
}
