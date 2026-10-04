import type { Client } from 'pg';
import { toKobo, type EnvelopePlan } from './funding-policy';
import { planSetupFields } from './plan-workspace';
import type { PoolComponent, PoolProposed } from './infrastructure-pool';

/**
 * The plan's funding and both sides' saved proposals, in kobo. Call inside the write transaction after locking the
 * plan row (mutatePlan takes it FOR UPDATE), so Infrastructure saves, TLM saves and plan funding edits are checked one
 * after the other against current figures. `except` leaves out the package or line being replaced.
 */
export async function readPoolState(db: Pick<Client, 'query'>, planId: number, except?: { component: PoolComponent; id: number }): Promise<{ plan: EnvelopePlan; proposed: PoolProposed }> {
  const row = (await db.query<EnvelopePlan & { infrastructure: string; tlm: string }>(`SELECT ${planSetupFields()},
    (SELECT COALESCE(SUM(total_cost),0) FROM infrastructure_packages WHERE plan_id=$1 AND ($2::bigint IS NULL OR id<>$2))::text AS infrastructure,
    (SELECT COALESCE(SUM(quantity*unit_cost),0) FROM activity_plan_lines WHERE plan_id=$1 AND workstream='tlm' AND ($3::bigint IS NULL OR id<>$3))::text AS tlm
    FROM action_plans WHERE id=$1`,
  [planId, except?.component === 'infrastructure' ? except.id : null, except?.component === 'tlm' ? except.id : null])).rows[0];
  return { plan: row, proposed: { infrastructure: toKobo(row.infrastructure), tlm: toKobo(row.tlm) } };
}
