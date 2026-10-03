import { fromKobo, teachersSharedEnvelope, toKobo, type EnvelopePlan } from './funding-policy';
import { formatKobo } from './activity-budget';

/**
 * The split of the shared Teacher Development and ICT envelope. One figure is stored, action_plans.ict_allocation
 * (migration 038); Teacher Development keeps the rest. Either editor can set the split: ICT names its own amount,
 * Teacher Development names its amount and ICT gets shared − that amount (migration 040).
 */
export const splitSides = ['ict', 'teachers'] as const;
export type SplitSide = typeof splitSides[number];
export type SplitProposed = { ict: string; teachers: string };
export type SplitResult = { problem: string; ictAllocation?: undefined } | { problem?: undefined; ictAllocation: string };

const sideName: Record<SplitSide, string> = { ict: 'ICT', teachers: 'Teacher Development' };
const other = (side: SplitSide): SplitSide => side === 'ict' ? 'teachers' : 'ict';

/**
 * Checks one side's amount and returns the ICT allocation to store, or why it cannot be saved. The amount must be
 * above zero and within the shared envelope, neither side may drop below what its lines already propose, and ICT may
 * be left with nothing only while it has no lines.
 */
export function sharedSplit(plan: EnvelopePlan, side: SplitSide, amount: string, proposed: SplitProposed): SplitResult {
  const shared = teachersSharedEnvelope(plan);
  if (shared == null) return { problem: `Set the plan funding before allocating the ${sideName[side]} budget.` };
  const value = toKobo(amount), ceiling = toKobo(shared), own = toKobo(proposed[side]), others = toKobo(proposed[other(side)]);
  const name = sideName[side], otherName = sideName[other(side)];
  if (value <= BigInt(0)) return { problem: side === 'ict' ? 'Enter an ICT allocation greater than zero.' : 'Enter a Teacher Development amount greater than zero.' };
  if (value > ceiling) return { problem: `${name} can use up to the shared Teacher Development & ICT budget of ${formatKobo(ceiling)}.` };
  if (value < own) return { problem: `${name} lines already propose ${formatKobo(own)}. Reduce them first or allocate at least that amount.` };
  if (ceiling - value < others) return { problem: `${otherName} lines already propose ${formatKobo(others)}, so ${name} can use up to ${formatKobo(ceiling - others)}.` };
  return { ictAllocation: fromKobo(side === 'ict' ? value : ceiling - value) };
}

/** Teacher Development's amount for a stored split, or null until the split is set. */
export function teachersAmount(plan: EnvelopePlan) {
  const shared = teachersSharedEnvelope(plan);
  return shared == null || plan.ictAllocation == null ? null : fromKobo(toKobo(shared) - toKobo(plan.ictAllocation));
}
