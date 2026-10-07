import { componentEnvelope, fromKobo, infrastructurePoolEnvelope, isSplitMode, teachersSharedEnvelope, toKobo, type EnvelopePlan } from './funding-policy';
import { formatKobo } from './activity-budget';

/**
 * Two components that share one envelope and split it with one stored figure:
 *   teachers-ict        action_plans.ict_allocation (migrations 038, 040); Teacher Development keeps the rest.
 *   infrastructure-tlm  action_plans.tlm_allocation (migration 051); Infrastructure keeps the rest. Only in split mode
 *                       (state_workflow_settings.infrastructure_tlm_mode); in shared_pool mode there is no split.
 * Either side can set the split from its editor: the stored side names its own amount, the keeper side names its amount
 * and the stored side gets shared − that amount.
 */
export const splitSides = ['ict', 'teachers', 'tlm', 'infrastructure'] as const;
export type SplitSide = typeof splitSides[number];
export type BudgetPair = 'teachers-ict' | 'infrastructure-tlm';
type PairConfig = { stored: SplitSide; keeper: SplitSide; field: 'ictAllocation' | 'tlmAllocation'; column: 'ict_allocation' | 'tlm_allocation'; label: string; envelope: (plan: EnvelopePlan) => string | null };
export const budgetPairs: Record<BudgetPair, PairConfig> = {
  'teachers-ict': { stored: 'ict', keeper: 'teachers', field: 'ictAllocation', column: 'ict_allocation', label: 'Teacher Development & ICT', envelope: teachersSharedEnvelope },
  'infrastructure-tlm': { stored: 'tlm', keeper: 'infrastructure', field: 'tlmAllocation', column: 'tlm_allocation', label: 'Infrastructure & TLM', envelope: infrastructurePoolEnvelope },
};
export const sideNames: Record<SplitSide, string> = { ict: 'ICT', teachers: 'Teacher Development', tlm: 'TLM', infrastructure: 'Infrastructure' };
/** What each side's proposals are called in messages. */
export const sideItems: Record<SplitSide, string> = { ict: 'lines', teachers: 'lines', tlm: 'lines', infrastructure: 'packages' };
const positiveAmount: Record<SplitSide, string> = {
  ict: 'Enter an ICT allocation greater than zero.', tlm: 'Enter a TLM allocation greater than zero.',
  teachers: 'Enter a Teacher Development amount greater than zero.', infrastructure: 'Enter an Infrastructure amount greater than zero.',
};
export const isSplitSide = (value: string): value is SplitSide => (splitSides as readonly string[]).includes(value);
export const pairOf = (side: SplitSide): BudgetPair => side === 'ict' || side === 'teachers' ? 'teachers-ict' : 'infrastructure-tlm';
export const partnerOf = (side: SplitSide): SplitSide => { const pair = budgetPairs[pairOf(side)]; return side === pair.stored ? pair.keeper : pair.stored; };
/** Whether this side splits its envelope now: always for Teacher Development & ICT, only in split mode for Infrastructure & TLM. */
export const sideSplits = (plan: EnvelopePlan, side: string): side is SplitSide => isSplitSide(side) && (pairOf(side) === 'teachers-ict' || isSplitMode(plan));
/** The stored figure of this side's pair, or null until the split is set. */
export const storedAllocation = (plan: EnvelopePlan, side: SplitSide) => plan[budgetPairs[pairOf(side)].field] ?? null;

export type SplitProposed = { own: string; partner: string };
export type SplitResult = { problem: string; allocation?: undefined } | { problem?: undefined; allocation: string };

/**
 * Checks one side's amount and returns the stored figure to save, or why it cannot be saved. The amount must be above
 * zero and within the shared envelope, neither side may drop below what it already proposes, and the stored side may be
 * left with nothing only while it has no lines.
 */
export function sharedSplit(plan: EnvelopePlan, side: SplitSide, amount: string, proposed: SplitProposed): SplitResult {
  const pair = budgetPairs[pairOf(side)], shared = pair.envelope(plan), name = sideNames[side], partner = partnerOf(side), otherName = sideNames[partner];
  if (shared == null) return { problem: `Set the plan funding before allocating the ${name} budget.` };
  const value = toKobo(amount), ceiling = toKobo(shared), own = toKobo(proposed.own), others = toKobo(proposed.partner);
  if (value <= BigInt(0)) return { problem: positiveAmount[side] };
  if (value > ceiling) return { problem: `${name} can use up to the shared ${pair.label} budget of ${formatKobo(ceiling)}.` };
  if (value < own) return { problem: `${name} ${sideItems[side]} already propose ${formatKobo(own)}. Reduce them first or allocate at least that amount.` };
  if (ceiling - value < others) return { problem: `${otherName} ${sideItems[partner]} already propose ${formatKobo(others)}, so ${name} can use up to ${formatKobo(ceiling - others)}.` };
  return { allocation: fromKobo(side === pair.stored ? value : ceiling - value) };
}

/** This side's amount of its shared envelope, or null until the split is set. */
export function sideAmount(plan: EnvelopePlan, side: SplitSide) {
  const pair = budgetPairs[pairOf(side)], shared = pair.envelope(plan), stored = storedAllocation(plan, side);
  if (shared == null || stored == null) return null;
  return side === pair.stored ? fromKobo(toKobo(stored)) : fromKobo(toKobo(shared) - toKobo(stored));
}

export const infrastructureSplitNeeded = 'Set how much of the shared Infrastructure & TLM budget Infrastructure will use before adding packages.';
/**
 * Why Infrastructure packages totalling `total` (kobo) cannot be saved or sent in split mode, or null (also while the plan
 * has no funding: no ceiling yet, as with the shared pool). Shared-pool mode is checked with infrastructurePoolProblem instead.
 */
export function infrastructureSplitProblem(plan: EnvelopePlan, total: bigint): string | null {
  if (plan.stateLodgment == null) return null;
  const envelope = componentEnvelope(plan, 'infrastructure');
  if (envelope == null) return infrastructureSplitNeeded;
  const ceiling = toKobo(envelope);
  return total > ceiling ? `You have exceeded the Infrastructure allocation (${formatKobo(ceiling)}) by ${formatKobo(total - ceiling)}. Reduce the budget to continue.` : null;
}

/**
 * Why a plan edit cannot shrink a shared envelope: it may not fall below the stored side's allocation
 * (ICT's allocation; in split mode, TLM's allocation of the Infrastructure & TLM pool).
 */
export function sharedBelowAllocationProblem(after: EnvelopePlan) {
  const naira = new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 2 });
  return (['teachers-ict', 'infrastructure-tlm'] as const).flatMap(id => {
    const pair = budgetPairs[id], stored = after[pair.field], shared = pair.envelope(after);
    if (id === 'infrastructure-tlm' && !isSplitMode(after)) return [];
    if (stored == null || shared == null || toKobo(shared) >= toKobo(stored)) return [];
    const name = sideNames[pair.stored];
    return [`${pair.label} would have ${naira.format(Number(shared))} available, but ${name} has already been allocated ${naira.format(Number(stored))}. Ask ${name} to reduce its allocation first or keep this funding.`];
  }).join(' ') || null;
}
