import type { QueryResult, QueryResultRow } from 'pg';
import { normalizeQuarters, type QuarterUsage } from './line-quarters';

type Db = { query<R extends QueryResultRow>(sql: string, values?: unknown[]): Promise<QueryResult<R>> };

/** The plan's current quarters, read inside the caller's transaction (after mutatePlan's FOR UPDATE on the plan row). */
export async function readPlanQuarterSetup(db: Db, planId: number): Promise<{ fundingQuarters: number[] | null }> {
  const row = (await db.query<{ quarters: number[] | null }>('SELECT funding_quarters AS quarters FROM action_plans WHERE id=$1', [planId])).rows[0];
  return { fundingQuarters: row?.quarters ?? null };
}

/** How many of the plan's lines (activity lines, sports budget lines, infrastructure packages) use each timeline. */
export async function readQuarterUsage(db: Db, planId: number): Promise<QuarterUsage> {
  const rows = (await db.query<{ quarters: number[]; lines: number }>(`SELECT quarters, count(*)::int AS lines FROM (
      SELECT quarters FROM activity_plan_lines WHERE plan_id=$1
      UNION ALL SELECT quarters FROM sports_budget_lines WHERE plan_id=$1
      UNION ALL SELECT quarters FROM infrastructure_packages WHERE plan_id=$1) l GROUP BY quarters`, [planId])).rows;
  return rows.map(r => ({ quarters: normalizeQuarters(r.quarters.map(Number)), lines: r.lines }));
}
