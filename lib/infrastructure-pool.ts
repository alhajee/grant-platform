import { infrastructurePoolEnvelope, toKobo, type EnvelopePlan } from './funding-policy';

/**
 * Shared-pool mode (state_workflow_settings.infrastructure_tlm_mode, migration 051; split mode is lib/budget-pairs.ts).
 * Infrastructure (school packages) and TLM (activity lines) draw from one pool with no split: the whole
 * infrastructure policy share plus their funding sources. Infrastructure proposed + TLM proposed may not exceed it.
 */
export const poolComponents = ['infrastructure', 'tlm'] as const;
export type PoolComponent = typeof poolComponents[number];
export const isPoolComponent = (component: string): component is PoolComponent => (poolComponents as readonly string[]).includes(component);
export const poolPartner = (component: PoolComponent): PoolComponent => component === 'infrastructure' ? 'tlm' : 'infrastructure';
export const poolLabels: Record<PoolComponent, string> = { infrastructure: 'Infrastructure', tlm: 'TLM' };
export type PoolProposed = Record<PoolComponent, bigint>;

const naira = (kobo: bigint) => `₦${(kobo / BigInt(100)).toLocaleString('en-NG')}.${String(kobo % BigInt(100)).padStart(2, '0')}`;

/** What is left of the pool (kobo, may be negative) after both sides' proposals, or null until the plan funding is set. */
export function poolRemainingKobo(plan: EnvelopePlan, proposed: PoolProposed): bigint | null {
  const pool = infrastructurePoolEnvelope(plan);
  return pool == null ? null : toKobo(pool) - proposed.infrastructure - proposed.tlm;
}

/** Why these proposals cannot be saved or sent (combined total above the shared pool), or null (also while the plan has no funding). */
export function infrastructurePoolProblem(plan: EnvelopePlan, proposed: PoolProposed): string | null {
  const pool = infrastructurePoolEnvelope(plan);
  if (pool == null) return null; // No plan funding yet: no ceiling (as before the pool existed).
  const over = proposed.infrastructure + proposed.tlm - toKobo(pool);
  if (over <= BigInt(0)) return null;
  return `Infrastructure and TLM share ${naira(toKobo(pool))}. Together they would exceed it by ${naira(over)}. Reduce the budget to continue.`;
}
