import type { QueryResult, QueryResultRow } from 'pg';

type Db = { query<R extends QueryResultRow>(sql: string, values?: unknown[]): Promise<QueryResult<R>> };

/** A plan that has reached UBEC keeps its review record, so it can no longer be deleted. */
export const sentToUbecMessage = 'This plan has been sent to UBEC, so it is kept for the record and cannot be deleted';

export async function planSentToUbec(db: Db, planId: number): Promise<boolean> {
  return (await db.query('SELECT 1 FROM ubec_rounds WHERE plan_id=$1 LIMIT 1', [planId])).rowCount! > 0;
}

/**
 * Deletes a plan and everything recorded against it, inside the caller's transaction (the plan row should already be
 * locked FOR UPDATE). Tables whose foreign key does not cascade are cleared first, children before parents; the rest
 * (documents, comments, quarters, funding sources, packages…) go with the plan row. The retired_* archives hold plan
 * ids without a foreign key. UBEC round records are cleared too, for scripts that clear plans already sent to UBEC;
 * the API never deletes those (planSentToUbec).
 */
export async function deletePlan(db: Db, planId: number): Promise<void> {
  const statements = [
    'DELETE FROM plan_notifications WHERE plan_id=$1',
    'DELETE FROM ubec_events WHERE plan_id=$1',
    'DELETE FROM sports_allocations WHERE line_id IN (SELECT id FROM sports_budget_lines WHERE plan_id=$1)',
    'DELETE FROM activity_line_documents WHERE plan_id=$1',
    'DELETE FROM activity_plan_lines WHERE plan_id=$1',
    'DELETE FROM infrastructure_lines WHERE plan_id=$1',
    'DELETE FROM sports_budget_lines WHERE plan_id=$1',
    'DELETE FROM tlm_distribution WHERE plan_id=$1',
    'DELETE FROM plan_submissions WHERE plan_id=$1',
    'DELETE FROM plan_review_events WHERE plan_id=$1',
    'DELETE FROM plan_pillar_reviews WHERE plan_id=$1',
    'DELETE FROM retired_gscci_lines WHERE plan_id=$1',
    'DELETE FROM retired_sbmc_lines WHERE plan_id=$1',
    'DELETE FROM ubec_assignments WHERE round_id IN (SELECT id FROM ubec_rounds WHERE plan_id=$1)',
    'DELETE FROM ubec_rounds WHERE plan_id=$1',
    'DELETE FROM action_plans WHERE id=$1',
  ];
  for (const sql of statements) await db.query(sql, [planId]);
}
