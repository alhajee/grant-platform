import type { QueryResult, QueryResultRow } from 'pg';
import type { ImplementedPillar } from './beap-pillars';
import type { Snapshot } from './plan-review';
import { correctedItems, openRejections, type RejectedItem } from './ubec-corrections';

type Db = { query<R extends QueryResultRow = QueryResultRow>(sql: string, values?: unknown[]): Promise<QueryResult<R>> };

/** The latest UBEC round of the plan when it was returned, with its snapshot and rejected items; otherwise null. */
export async function readReturnedRound(db: Db, planId: number): Promise<{ id: number; snapshot: Snapshot; rejected: RejectedItem[] } | null> {
  const round = (await db.query<{ id: number; status: string; snapshot: Snapshot }>('SELECT id,status,snapshot FROM ubec_rounds WHERE plan_id=$1 ORDER BY number DESC LIMIT 1', [planId])).rows[0];
  if (!round || round.status !== 'returned') return null;
  const rejected = (await db.query<{ pillar: ImplementedPillar; row_ref: string }>("SELECT pillar,row_ref FROM ubec_item_decisions WHERE round_id=$1 AND decision='reject'", [round.id])).rows.map(r => ({ pillar: r.pillar, rowRef: r.row_ref }));
  return { id: round.id, snapshot: round.snapshot, rejected };
}

/** The rejected items of the returned round still unchanged in the working plan, per component ({} when none). */
export async function readOpenRejections(db: Db, planId: number, current: Snapshot): Promise<Partial<Record<ImplementedPillar, string[]>>> {
  const returned = await readReturnedRound(db, planId);
  return returned?.rejected.length ? openRejections(returned.snapshot, current, returned.rejected) : {};
}

/** On a resubmitted round: the previous round's rejected items that were corrected, per component. */
export async function readCorrections(db: Db, round: { plan_id: number; number: number; snapshot: Snapshot }): Promise<Partial<Record<ImplementedPillar, string[]>>> {
  const previous = (await db.query<{ id: number; snapshot: Snapshot }>('SELECT id,snapshot FROM ubec_rounds WHERE plan_id=$1 AND number<$2 ORDER BY number DESC LIMIT 1', [round.plan_id, round.number])).rows[0];
  if (!previous) return {};
  const rejected = (await db.query<{ pillar: ImplementedPillar; row_ref: string }>("SELECT pillar,row_ref FROM ubec_item_decisions WHERE round_id=$1 AND decision='reject'", [previous.id])).rows.map(r => ({ pillar: r.pillar, rowRef: r.row_ref }));
  return rejected.length ? correctedItems(previous.snapshot, round.snapshot, rejected) : {};
}
