import type { QueryResult, QueryResultRow } from 'pg';
import { resolveLineDates, type LineDates } from './line-dates';

type Db = { query<R extends QueryResultRow>(sql: string, values?: unknown[]): Promise<QueryResult<R>> };
/** The tables whose lines carry start_date / due_date (migration 059). */
export type DatedTable = 'activity_plan_lines' | 'sports_budget_lines' | 'infrastructure_packages';

/**
 * The start and due dates to store for a line being saved, read inside the caller's transaction (after
 * mutatePlan's FOR UPDATE on the plan row): the plan's implementation year, and for an update the line's stored
 * dates, which are kept when the client sends none and they still fit the timeline.
 */
export async function resolveSavedLineDates(db: Db, table: DatedTable, planId: number, lineId: number | null, sent: Partial<LineDates>, quarters: readonly number[]): Promise<{ dates: LineDates; problem: string | null }> {
  const year = (await db.query<{ year: number | null }>('SELECT implementation_year AS year FROM action_plans WHERE id=$1', [planId])).rows[0]?.year ?? null;
  const stored = lineId === null ? null
    : (await db.query<{ startDate: string | null; dueDate: string | null }>(`SELECT start_date::text AS "startDate", due_date::text AS "dueDate" FROM ${table} WHERE id=$1 AND plan_id=$2`, [lineId, planId])).rows[0] ?? null;
  return resolveLineDates(sent, stored, quarters, year);
}
