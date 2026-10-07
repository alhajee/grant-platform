'use client';
import { useState } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { BudgetSplitBar, BudgetSplitDialog } from '@/components/budget-split-dialog';
import { type EnvelopePlan } from '@/lib/funding-policy';
import { budgetPairs, pairOf, partnerOf, sideNames, storedAllocation, type SplitSide } from '@/lib/budget-pairs';

// The split of a shared envelope (lib/budget-pairs.ts): Teacher Development & ICT (action_plans.ict_allocation) and,
// in split mode, Infrastructure & TLM (action_plans.tlm_allocation). Both editors of a pair show this panel first.
// While the split is not set the split dialog opens by itself and the editor stays read-only behind it; once set the
// panel is a compact summary with "Adjust split".

type Props = {
  side: SplitSide; plan: EnvelopePlan;
  /** What this side's saved lines (or packages) propose, and what the other side's propose (naira). */
  proposed: number; partnerProposed: number;
  canEdit: boolean; onSaved: () => Promise<void>;
};

export function SharedBudgetPanel({ side, plan, proposed, partnerProposed, canEdit, onSaved }: Props) {
  const pair = budgetPairs[pairOf(side)], shared = pair.envelope(plan), stored = storedAllocation(plan, side);
  const name = sideNames[side], otherName = sideNames[partnerOf(side)];
  // Asked on arrival: the dialog opens by itself while the split is unset (once per mount; the button reopens it).
  const [open, setOpen] = useState(stored == null && shared != null && canEdit);
  if (shared == null) return <Alert><AlertTitle>Plan funding not set</AlertTitle><AlertDescription>Set the plan funding before allocating the {name} budget.</AlertDescription></Alert>;
  const dialog = canEdit && <BudgetSplitDialog side={side} plan={plan} proposed={proposed} partnerProposed={partnerProposed} open={open} onOpenChange={setOpen} onSaved={onSaved} />;
  if (stored == null) return <section className="ict-allocation" aria-labelledby={`${side}-split-title`}>
    <h2 id={`${side}-split-title`}>How much of the shared {pair.label} budget will {name} use?</h2>
    <p>{otherName} keeps whatever {name} does not use. Set the split before adding {name} {side === 'infrastructure' ? 'packages' : 'activities'}.</p>
    {canEdit ? <div><Button type="button" onClick={() => setOpen(true)}>Set the budget split</Button></div> : <p>Someone who can edit {name} sets the split.</p>}
    {dialog}
  </section>;
  return <div className="ict-allocation-summary">
    <BudgetSplitBar side={side} plan={plan} />
    {canEdit && <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>Adjust split</Button>}
    {dialog}
  </div>;
}
