import { teachersSharedEnvelope, toKobo, type EnvelopePlan } from './funding-policy';
import { formatKobo } from './activity-budget';

/**
 * Why ICT cannot take this amount of the shared Teacher Development and ICT envelope, or null:
 * it must be above zero, within the shared envelope, and not below what ICT lines already propose.
 */
export function ictAllocationProblem(plan: EnvelopePlan, amount: string, proposed: string) {
  const shared = teachersSharedEnvelope(plan);
  if (shared == null) return 'Set the plan funding before allocating the ICT budget.';
  const value = toKobo(amount), ceiling = toKobo(shared), used = toKobo(proposed);
  if (value <= BigInt(0)) return 'Enter an ICT allocation greater than zero.';
  if (value > ceiling) return `ICT can use up to the shared Teacher Development & ICT budget of ${formatKobo(ceiling)}.`;
  if (value < used) return `ICT lines already propose ${formatKobo(used)}. Reduce them first or allocate at least that amount.`;
  return null;
}
