import { componentEnvelope, fromMinor, infrastructurePoolEnvelope, isSplitMode, teachersSharedEnvelope, toMinor, type EnvelopePlan } from './funding-policy';
import { formatMinor } from './activity-budget';
import { MINOR_PER_KOBO } from './money';
import { nairaFormat } from './money-format';

/**
 * Two components that share one envelope and split it with one stored figure:
 *   teachers-ict        action_plans.ict_allocation (migrations 038, 040); Teacher Development keeps the rest.
 *   infrastructure-tlm  action_plans.tlm_allocation (migration 051); Infrastructure keeps the rest. Only in split mode
 *                       (state_workflow_settings.infrastructure_tlm_mode); in shared_pool mode there is no split.
 * Only the SUBEB BEAP Chair sets the splits (client, 26 October 2026): when creating the plan, then from the plan page.
 * Either side's amount can be named: the stored side names its own amount, the keeper side names its amount and the
 * stored side gets shared − that amount. The component editors show the split read-only.
 */
export const setsBudgetSplits = (user: { role: string; isBeapChair?: boolean | null }) => user.role === 'Director' && user.isBeapChair === true;
export const splitsByBeapChair = 'Only the BEAP Chair sets the budget splits'
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
 * Checks one side's amount and returns the stored figure to save, or why it cannot be saved. The amount must be within
 * the shared envelope and neither side may drop below what it already proposes. UBEC239: either side may get ₦0 (the other
 * takes the whole shared budget) while it has no lines or packages (lib/unfunded-components.ts).
 */
export function sharedSplit(plan: EnvelopePlan, side: SplitSide, amount: string, proposed: SplitProposed): SplitResult {
  const pair = budgetPairs[pairOf(side)], shared = pair.envelope(plan), name = sideNames[side], partner = partnerOf(side), otherName = sideNames[partner];
  if (shared == null) return { problem: `Set the plan funding before allocating the ${name} budget` };
  const value = toMinor(amount), ceiling = toMinor(shared), own = toMinor(proposed.own), others = toMinor(proposed.partner);
  if (value < BigInt(0)) return { problem: `Enter a ${name} amount of ₦0 or more` };
  if (value > ceiling) return { problem: `${name} can use up to the shared ${pair.label} budget of ${formatMinor(ceiling)}.` };
  if (value < own) return { problem: `${name} ${sideItems[side]} already propose ${formatMinor(own)}. Reduce them first or allocate at least that amount.` };
  if (ceiling - value < others) return { problem: `${otherName} ${sideItems[partner]} already propose ${formatMinor(others)}, so ${name} can use up to ${formatMinor(ceiling - others)}.` };
  return { allocation: fromMinor(side === pair.stored ? value : ceiling - value) };
}

/** This side's amount of its shared envelope, or null until the split is set. */
export function sideAmount(plan: EnvelopePlan, side: SplitSide) {
  const pair = budgetPairs[pairOf(side)], shared = pair.envelope(plan), stored = storedAllocation(plan, side);
  if (shared == null || stored == null) return null;
  return side === pair.stored ? fromMinor(toMinor(stored)) : fromMinor(toMinor(shared) - toMinor(stored));
}

export const infrastructureSplitNeeded = 'Ask the BEAP Chair to set how much of the shared Infrastructure & TLM budget Infrastructure will use before adding packages';
/**
 * Why Infrastructure packages totalling `total` (minor units) cannot be saved or sent in split mode, or null (also while the plan
 * has no funding: no ceiling yet, as with the shared pool). Shared-pool mode is checked with infrastructurePoolProblem instead.
 */
export function infrastructureSplitProblem(plan: EnvelopePlan, total: bigint): string | null {
  if (plan.stateLodgment == null) return null;
  const envelope = componentEnvelope(plan, 'infrastructure');
  if (envelope == null) return infrastructureSplitNeeded;
  const ceiling = toMinor(envelope);
  return total > ceiling ? `You have exceeded the Infrastructure allocation (${formatMinor(ceiling)}) by ${formatMinor(total - ceiling)}. Reduce the budget to continue.` : null;
}

/**
 * Why a plan edit cannot shrink a shared envelope: it may not fall below the stored side's allocation
 * (ICT's allocation; in split mode, TLM's allocation of the Infrastructure & TLM pool).
 */
export function sharedBelowAllocationProblem(after: EnvelopePlan) {
  const naira = nairaFormat;
  return (['teachers-ict', 'infrastructure-tlm'] as const).flatMap(id => {
    const pair = budgetPairs[id], stored = after[pair.field], shared = pair.envelope(after);
    if (id === 'infrastructure-tlm' && !isSplitMode(after)) return [];
    if (stored == null || shared == null || toMinor(shared) >= toMinor(stored)) return [];
    const name = sideNames[pair.stored];
    return [`${pair.label} would have ${naira.format(Number(shared))} available, but ${name} has already been allocated ${naira.format(Number(stored))}. Ask ${name} to reduce its allocation first or keep this funding.`];
  }).join(' ') || null;
}

/** The splits the BEAP Chair sets when creating a plan: ICT's and TLM's amounts (naira strings; TLM only in split mode). */
export type CreationSplits = { ict: string; tlm?: string };
const splitAmount = /^\d{1,13}(\.\d{1,2})?$/;
/**
 * Checks the splits given at plan creation against the new plan's envelopes (nothing is proposed yet) and returns the
 * stored figures, or why they cannot be saved. TLM's amount is needed only in split mode.
 */
export function creationSplitProblem(plan: EnvelopePlan, splits: Partial<CreationSplits> | null | undefined): { problem: string } | { ictAllocation: string; tlmAllocation: string | null } {
  const none = { own: '0', partner: '0' };
  // UBEC239: either side may take the whole shared budget (₦0 for ICT or TLM, or all of it), since nothing is planned yet.
  const check = (side: 'ict' | 'tlm', amount: string) => sharedSplit(plan, side, amount, none);
  if (!splits?.ict || !splitAmount.test(splits.ict)) return { problem: 'Enter how much of the Teacher Development & ICT budget ICT will use' };
  const ict = check('ict', splits.ict);
  if (ict.problem !== undefined) return { problem: ict.problem };
  if (!isSplitMode(plan)) return { ictAllocation: ict.allocation, tlmAllocation: null };
  if (!splits.tlm || !splitAmount.test(splits.tlm)) return { problem: 'Enter how much of the Infrastructure & TLM budget TLM will use' };
  const tlm = check('tlm', splits.tlm);
  if (tlm.problem !== undefined) return { problem: tlm.problem };
  return { ictAllocation: ict.allocation, tlmAllocation: tlm.allocation };
}

/** UBEC228: one budget split carried over a funding change, keeping the stored side's percentage of the shared budget. */
export type SplitRescale = { pair: BudgetPair; label: string; side: SplitSide; keeper: SplitSide; percent: string; before: string; after: string; keeperBefore: string; keeperAfter: string };
export type SplitRescaleResult = { plan: EnvelopePlan; rescaled: SplitRescale[]; problems: string[] };
const percentFormat = new Intl.NumberFormat('en', { maximumFractionDigits: 1 });
/** The stored side's share of the shared budget as "70.9%". */
export const splitPercent = (stored: string, shared: string) => toMinor(shared) > BigInt(0) ? `${percentFormat.format(Number(toMinor(stored) * BigInt(1000000) / toMinor(shared)) / 10000)}%` : '0%';

/**
 * UBEC228: when a plan edit changes the shared budget of a split pair (Teacher Development & ICT; Infrastructure & TLM in
 * split mode), the stored allocation keeps the same percentage of the new shared budget (rounded to the kobo) instead of
 * blocking the edit. Returns the plan with the rescaled allocations, what changed (for the review history and the dialog)
 * and why it cannot be saved: a side that would fall below its own saved lines (or packages), when the edit lowers it.
 * `proposed` holds each side's saved total (ICT lines are their own workstream).
 */
export function rescaleSplits(before: EnvelopePlan, after: EnvelopePlan, proposed: Partial<Record<SplitSide, string>>): SplitRescaleResult {
  const rescaled: SplitRescale[] = [], problems: string[] = [];
  let plan: EnvelopePlan = after;
  for (const id of ['teachers-ict', 'infrastructure-tlm'] as const) {
    const pair = budgetPairs[id];
    if (id === 'infrastructure-tlm' && !isSplitMode(after)) continue;
    const stored = before[pair.field], sharedBefore = pair.envelope(before), sharedAfter = pair.envelope(after);
    if (stored == null || sharedBefore == null || sharedAfter == null) continue;
    const oldShared = toMinor(sharedBefore), newShared = toMinor(sharedAfter), oldStored = toMinor(stored);
    if (oldShared === newShared || oldShared <= BigInt(0)) continue;
    // Round half up to the kobo (the allocations are stored to the kobo); never past the new shared budget.
    const [storedKobo, newKobo, oldKobo] = [oldStored, newShared, oldShared].map(v => v / MINOR_PER_KOBO);
    const scaled = (storedKobo * newKobo * BigInt(2) + oldKobo) / (oldKobo * BigInt(2)) * MINOR_PER_KOBO;
    const newStored = scaled > newShared ? newShared : scaled;
    const change: SplitRescale = { pair: id, label: pair.label, side: pair.stored, keeper: pair.keeper, percent: splitPercent(stored, sharedBefore), before: fromMinor(oldStored), after: fromMinor(newStored), keeperBefore: fromMinor(oldShared - oldStored), keeperAfter: fromMinor(newShared - newStored) };
    rescaled.push(change);
    plan = { ...plan, [pair.field]: change.after };
    for (const [side, next, previous] of [[pair.stored, newStored, oldStored], [pair.keeper, newShared - newStored, oldShared - oldStored]] as const) {
      const used = toMinor(proposed[side] ?? '0');
      if (used > next && next < previous) problems.push(`Keeping the ${pair.label} split (${sideNames[pair.stored]} ${change.percent}) leaves ${sideNames[side]} ${formatMinor(next)}, but its ${sideItems[side]} already propose ${formatMinor(used)}: ${formatMinor(used - next)} short. Reduce them first or keep this funding.`);
    }
  }
  return { plan, rescaled, problems };
}
/** "ICT keeps 70.9% of the Teacher Development & ICT budget: ₦X → ₦Y" for the review history and the edit dialog. */
export const rescaleNote = (r: SplitRescale) => `${sideNames[r.side]} keeps ${r.percent} of the ${r.label} budget: ${formatMinor(toMinor(r.before))} → ${formatMinor(toMinor(r.after))} (${sideNames[partnerOf(r.side)]} ${formatMinor(toMinor(r.keeperBefore))} → ${formatMinor(toMinor(r.keeperAfter))})`;
