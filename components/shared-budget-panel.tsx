'use client';
import { useState } from 'react';
import { toast } from 'sonner';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import { CurrencyInput } from '@/components/currency-input';
import { percent, policyShare, type EnvelopePlan } from '@/lib/funding-policy';
import { budgetPairs, pairOf, partnerOf, sideAmount, sideItems, sideNames, storedAllocation, type SplitSide } from '@/lib/budget-pairs';
import { currentPlanHref } from '@/lib/action-plans';

// The split of a shared envelope (lib/budget-pairs.ts): Teacher Development & ICT (action_plans.ict_allocation) and,
// in split mode, Infrastructure & TLM (action_plans.tlm_allocation). Both editors of a pair show it before anything can
// be added; each names its own amount and the other side keeps the rest.
const money = new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' });
const required = <span className="text-destructive" aria-label="required">*</span>;

type Props = {
  side: SplitSide; plan: EnvelopePlan;
  /** What this side's saved lines (or packages) propose, and what the other side's propose (naira). */
  proposed: number; partnerProposed: number;
  canEdit: boolean; onSaved: () => Promise<void>;
};

/** This side's amount of the shared budget: asked before any activity, editable while the component is editable. */
export function SharedBudgetPanel({ side, plan, proposed, partnerProposed, canEdit, onSaved }: Props) {
  const pair = budgetPairs[pairOf(side)], partner = partnerOf(side);
  const shared = pair.envelope(plan), stored = storedAllocation(plan, side);
  const current = stored == null ? null : sideAmount(plan, side);
  const [editing, setEditing] = useState(false), [value, setValue] = useState(current ?? ''), [busy, setBusy] = useState(false);
  const name = sideNames[side], otherName = sideNames[partner], id = `${side}-split`, label = pair.label;
  // "Infrastructure and TLM share ₦X (75% of the plan's funding)": the pool is the infrastructure policy share plus their funding sources.
  const sharedNote = pairOf(side) === 'infrastructure-tlm' ? `${percent(policyShare(plan, 'infrastructure'))}% of the plan's funding` : '';
  async function save() {
    setBusy(true);
    try {
      const r = await fetch(currentPlanHref('/api/activities/budget-split'), { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ amount: value, side }) });
      const result = await r.json() as { error?: string }; if (!r.ok) throw new Error(result.error || 'Unable to save.');
      toast.success(`${name} budget saved.`); setEditing(false); await onSaved();
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Unable to save.'); }
    finally { setBusy(false); }
  }
  if (shared == null) return <Alert><AlertTitle>Plan funding not set</AlertTitle><AlertDescription>Set the plan funding before allocating the {name} budget.</AlertDescription></Alert>;
  const amount = Number(value || 0), sharedValue = Number(shared), most = sharedValue - partnerProposed;
  const invalid = !value || amount <= 0 ? 'Enter an amount greater than zero.'
    : amount > sharedValue ? `${name} can use up to ${money.format(sharedValue)}.`
    : amount < proposed ? `${name} ${sideItems[side]} already propose ${money.format(proposed)}.`
    : amount > most ? `${otherName} ${sideItems[partner]} already propose ${money.format(partnerProposed)}, so ${name} can use up to ${money.format(most)}.` : '';
  if (current != null && !editing) return <div className="ict-allocation-summary"><div><span>{name} budget</span><strong>{money.format(Number(current))}</strong><small>of the shared {label} budget ({money.format(sharedValue)}{sharedNote && `, ${sharedNote}`}) · {otherName} keeps {money.format(sharedValue - Number(current))}</small></div>{canEdit && <Button type="button" variant="outline" size="sm" onClick={() => { setValue(current); setEditing(true); }}>Change</Button>}</div>;
  return <section className="ict-allocation" aria-labelledby={`${id}-title`}>
    <h2 id={`${id}-title`}>How much of the shared {label} budget will {name} use?</h2>
    <p>{pairOf(side) === 'infrastructure-tlm' ? <>Infrastructure and TLM share <b>{money.format(sharedValue)}</b> ({sharedNote}).</> : <>The shared budget is <b>{money.format(sharedValue)}</b>.</>} Set how much {name} uses; {otherName} gets the rest.{current == null ? ` Set this before adding ${name} ${side === 'infrastructure' ? 'packages' : 'activities'}.` : ''}</p>
    <Field><FieldLabel htmlFor={id}>{name} amount (₦) {required}</FieldLabel><CurrencyInput id={id} placeholder="0.00" maxIntegerDigits={12} value={value} disabled={!canEdit || busy} onValueChange={setValue} aria-invalid={!!value && !!invalid} />
      {value && invalid ? <FieldDescription className="text-destructive">{invalid}</FieldDescription> : <FieldDescription>{otherName} would keep {money.format(Math.max(sharedValue - amount, 0))}.</FieldDescription>}</Field>
    <div className="flex gap-2">{current != null && <Button type="button" variant="ghost" disabled={busy} onClick={() => setEditing(false)}>Cancel</Button>}<Button type="button" disabled={!canEdit || busy || !!invalid} onClick={() => void save()}>{busy ? 'Saving…' : `Save ${name} budget`}</Button></div>
  </section>;
}
