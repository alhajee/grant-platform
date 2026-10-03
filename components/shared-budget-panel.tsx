'use client';
import { useState } from 'react';
import { toast } from 'sonner';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import { CurrencyInput } from '@/components/currency-input';
import { teachersSharedEnvelope, type EnvelopePlan } from '@/lib/funding-policy';
import { teachersAmount, type SplitSide } from '@/lib/ict-allocation';
import { currentPlanHref } from '@/lib/action-plans';

// The split of the shared Teacher Development and ICT budget (action_plans.ict_allocation, migrations 038 and 040).
// Both editors show it before any activity can be chosen; each names its own amount and the other side keeps the rest.
const money = new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' });
const required = <span className="text-destructive" aria-label="required">*</span>;
const names: Record<SplitSide, string> = { ict: 'ICT', teachers: 'Teacher Development' };
const other = (side: SplitSide): SplitSide => side === 'ict' ? 'teachers' : 'ict';

type Props = {
  side: SplitSide; plan: EnvelopePlan;
  /** What this side's saved lines propose, and what the other side's lines propose (naira). */
  proposed: number; partnerProposed: number;
  canEdit: boolean; onSaved: () => Promise<void>;
};

/** This side's amount of the shared budget: asked before any activity, editable while the component is editable. */
export function SharedBudgetPanel({ side, plan, proposed, partnerProposed, canEdit, onSaved }: Props) {
  const shared = teachersSharedEnvelope(plan);
  const current = plan.ictAllocation == null ? null : side === 'ict' ? plan.ictAllocation : teachersAmount(plan);
  const [editing, setEditing] = useState(false), [value, setValue] = useState(current ?? ''), [busy, setBusy] = useState(false);
  const name = names[side], otherName = names[other(side)], id = `${side}-split`;
  async function save() {
    setBusy(true);
    try {
      const r = await fetch(currentPlanHref('/api/activities/ict-allocation'), { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ amount: value, side }) });
      const result = await r.json() as { error?: string }; if (!r.ok) throw new Error(result.error || 'Unable to save.');
      toast.success(`${name} budget saved.`); setEditing(false); await onSaved();
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Unable to save.'); }
    finally { setBusy(false); }
  }
  if (shared == null) return <Alert><AlertTitle>Plan funding not set</AlertTitle><AlertDescription>Set the plan funding before allocating the {name} budget.</AlertDescription></Alert>;
  const amount = Number(value || 0), sharedValue = Number(shared), most = sharedValue - partnerProposed;
  const invalid = !value || amount <= 0 ? 'Enter an amount greater than zero.'
    : amount > sharedValue ? `${name} can use up to ${money.format(sharedValue)}.`
    : amount < proposed ? `${name} lines already propose ${money.format(proposed)}.`
    : amount > most ? `${otherName} lines already propose ${money.format(partnerProposed)}, so ${name} can use up to ${money.format(most)}.` : '';
  if (current != null && !editing) return <div className="ict-allocation-summary"><div><span>{name} budget</span><strong>{money.format(Number(current))}</strong><small>of the shared Teacher Development & ICT budget ({money.format(sharedValue)}) · {otherName} keeps {money.format(sharedValue - Number(current))}</small></div>{canEdit && <Button type="button" variant="outline" size="sm" onClick={() => { setValue(current); setEditing(true); }}>Change</Button>}</div>;
  return <section className="ict-allocation" aria-labelledby={`${id}-title`}>
    <h2 id={`${id}-title`}>How much of the shared Teacher Development & ICT budget will {name} use?</h2>
    <p>The shared budget is <b>{money.format(sharedValue)}</b>. {otherName} keeps whatever {name} does not use.{current == null ? ` Set this before choosing ${name} activities.` : ''}</p>
    <Field><FieldLabel htmlFor={id}>{name} amount (₦) {required}</FieldLabel><CurrencyInput id={id} placeholder="0.00" maxIntegerDigits={12} value={value} disabled={!canEdit || busy} onValueChange={setValue} aria-invalid={!!value && !!invalid} />
      {value && invalid ? <FieldDescription className="text-destructive">{invalid}</FieldDescription> : <FieldDescription>{otherName} would keep {money.format(Math.max(sharedValue - amount, 0))}.</FieldDescription>}</Field>
    <div className="flex gap-2">{current != null && <Button type="button" variant="ghost" disabled={busy} onClick={() => setEditing(false)}>Cancel</Button>}<Button type="button" disabled={!canEdit || busy || !!invalid} onClick={() => void save()}>{busy ? 'Saving…' : `Save ${name} budget`}</Button></div>
  </section>;
}
