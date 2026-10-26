'use client';
import { useState } from 'react';
import { SplitIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { BudgetSplitBar, BudgetSplitDialog } from '@/components/budget-split-dialog';
import { budgetPairs, sideSplits, storedAllocation, type BudgetPair } from '@/lib/budget-pairs';
import type { EnvelopePlan } from '@/lib/funding-policy';
import type { PlanTotals } from '@/lib/plan-summary';

/**
 * The plan's budget splits (Infrastructure & TLM in split mode, Teacher Development & ICT) for the Executive Chairman and
 * the BEAP Chair. Only the BEAP Chair sets or adjusts them (client, 26 October 2026); the editors show them read-only.
 */
export function BudgetSplitsCard({ plan, totals, canSplit, onSaved }: { plan: EnvelopePlan; totals: PlanTotals; canSplit: boolean; onSaved: () => Promise<void> }) {
  const [open, setOpen] = useState<BudgetPair | null>(null);
  const pairs = (['infrastructure-tlm', 'teachers-ict'] as const).filter(id => sideSplits(plan, budgetPairs[id].stored) && budgetPairs[id].envelope(plan) != null);
  if (!pairs.length) return null;
  const budget = (side: 'ict' | 'teachers' | 'tlm' | 'infrastructure') => totals[side]?.budget ?? 0;
  return <Card className="plan-status-panel budget-splits-card">
    <CardHeader><CardTitle><h2 className="inline-flex items-center gap-2"><SplitIcon aria-hidden="true" className="size-4 text-primary" />Budget splits</h2></CardTitle>
      <CardDescription>{canSplit ? 'You set how the shared budgets are split' : 'Set by the BEAP Chair'}</CardDescription></CardHeader>
    <CardContent className="flex flex-col gap-4">{pairs.map(id => {
      const pair = budgetPairs[id], set = storedAllocation(plan, pair.stored) != null;
      return <div key={id} className="flex flex-col gap-2">
        <p className="m-0 text-sm font-medium">{pair.label}</p>
        {set ? <BudgetSplitBar side={pair.stored} plan={plan} /> : <p className="m-0 text-sm text-muted-foreground">Not split yet. {pair.label.split(' & ').join(' and ')} cannot add items until it is</p>}
        {canSplit && <div><Button size="sm" variant={set ? 'outline' : 'default'} className="rounded-full" onClick={() => setOpen(id)}>{set ? 'Adjust split' : 'Set the split'}</Button></div>}
        {canSplit && <BudgetSplitDialog side={pair.stored} plan={plan} proposed={budget(pair.stored)} partnerProposed={budget(pair.keeper)} open={open === id} onOpenChange={next => setOpen(next ? id : null)} onSaved={onSaved} />}
      </div>;
    })}</CardContent>
  </Card>;
}
