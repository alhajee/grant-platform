import { budgetPairs, isSplitSide, pairOf, partnerOf, sideAmount, sideNames, sideSplits, storedAllocation, type SplitSide } from './budget-pairs';
import { toMinor, type EnvelopePlan } from './funding-policy';
import type { ImplementedPillar } from './beap-pillars';
import type { Snapshot } from './plan-review';

// UBEC239 (client, 7 November 2026: "allow the component split in which one component takes all the funds"): the BEAP Chair
// may give a split pair's whole shared budget to one side (Teacher Development & ICT; Infrastructure & TLM in split mode).
// The other side then has a ₦0 allocation. While it also has no items it is not funded at all: nothing is planned or sent
// for it, and it never holds up the plan (complete-plan readiness, the BEAP Chair's collated send, the Executive Chairman's
// send to UBEC, the plan's status and pending actions).

/** Whether the split is set and gives this side nothing (₦0). */
export function hasNoAllocation(plan: EnvelopePlan | null | undefined, side: string): side is SplitSide {
  if (!plan || !isSplitSide(side) || !sideSplits(plan, side) || storedAllocation(plan, side) == null) return false;
  const amount = sideAmount(plan, side);
  return amount != null && toMinor(amount) === BigInt(0);
}

/**
 * The components with a ₦0 allocation and no items: not funded by the split, so they need no review and are never sent.
 * `items` gives each component's saved lines (or packages) count.
 */
export function unfundedComponents(plan: EnvelopePlan | null | undefined, items: (pillar: SplitSide) => number): ImplementedPillar[] {
  return (['infrastructure', 'tlm', 'teachers', 'ict'] as const).filter(side => hasNoAllocation(plan, side) && items(side) === 0);
}

/** The unfunded components of a snapshot (its own setup, so a saved submission reads as it was). */
export const unfundedInSnapshot = (snapshot: Pick<Snapshot, 'setup' | 'infrastructure' | 'tlm' | 'teachers' | 'ict'>) =>
  unfundedComponents(snapshot.setup as EnvelopePlan | undefined, side => snapshot[side]?.length ?? 0);

/** "No allocation · ₦0 (all to ICT)" for cards. */
export const noAllocationLabel = (side: SplitSide) => `No allocation · ₦0 (all to ${sideNames[partnerOf(side)]})`;
/** The editors' explanation. */
export const noAllocationDetail = (side: SplitSide) =>
  `The ${budgetPairs[pairOf(side)].label} split gives the whole shared budget to ${sideNames[partnerOf(side)]}, so ${sideNames[side]} has nothing to plan or send. Items cannot be added until the BEAP Chair changes the split`;
