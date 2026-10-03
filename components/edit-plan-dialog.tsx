"use client";

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { CheckIcon, LockKeyholeIcon } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldLegend, FieldSet } from '@/components/ui/field';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { CurrencyInput } from '@/components/currency-input';
import { FieldHelp } from '@/components/field-help';
import { FundingSourcesField, draftSourceErrors, fromDraftSources, toDraftSources, type DraftSource } from '@/components/funding-sources-field';
import { envelopeShortfalls, fundingTotal, sharedBelowIctProblem, implementationYearError, planEditSchema, shortfallMessage, sourcesSum } from '@/lib/plan-setup';
import type { FundingComponent, FundingSource } from '@/lib/funding-policy';
import type { ActionPlan } from '@/lib/action-plans';

const money = new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 2 });
type SetupData = { plan: ActionPlan; reserved: { year: number; quarter: number }[]; proposed: Partial<Record<FundingComponent, string>>; canEdit: boolean; lockedReason: string | null };
type Props = { planId: number; onClose: () => void; onSaved?: (plan: ActionPlan) => void };

/** Edits the period and funding of an existing plan (UBEC33). The server re-checks every rule. */
export function EditPlanDialog({ planId, onClose, onSaved }: Props) {
  const [data, setData] = useState<SetupData | null>(null);
  const [loadError, setLoadError] = useState('');
  const [year, setYear] = useState('');
  const [implementation, setImplementation] = useState('');
  const [quarters, setQuarters] = useState<string[]>([]);
  const [lodgment, setLodgment] = useState('');
  const [sources, setSources] = useState<DraftSource[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const pending = useRef(false);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const response = await fetch(`/api/plans/setup?plan=${planId}`, { cache: 'no-store' });
        if (response.status === 401) { window.location.replace('/'); return; }
        const result = await response.json() as SetupData & { error?: string };
        if (!response.ok) throw new Error(result.error || 'The plan details could not be loaded.');
        if (!active) return;
        setData(result); setYear(String(result.plan.startYear)); setImplementation(String(result.plan.implementationYear ?? result.plan.startYear));
        setQuarters((result.plan.fundingQuarters ?? []).map(String)); setLodgment(result.plan.stateLodgment ?? ''); setSources(toDraftSources(result.plan.fundingSources));
      } catch (cause) { if (active) setLoadError(cause instanceof Error ? cause.message : 'The plan details could not be loaded.'); }
    })();
    return () => { active = false; };
  }, [planId]);

  const locked = !!data && !data.canEdit;
  const disabled = saving || !data || locked;
  const reserved = (value: string) => new Set((data?.reserved ?? []).filter(r => r.year === Number(value)).map(r => r.quarter));
  const occupied = reserved(year);
  const fundingSources = fromDraftSources(sources) as FundingSource[];
  const other = sourcesSum(fundingSources);
  const legacy = Number(data?.plan.otherFunding ?? 0);
  const validLodgment = /^\d{0,13}(\.\d{0,2})?$/.test(lodgment);
  // Whole envelope: state ×2 + any legacy shared other funding + component sources.
  const total = validLodgment ? fundingTotal(lodgment || '0', sourcesSum([...fundingSources, { amount: data?.plan.otherFunding ?? '0' }])) : '0';
  const input = () => ({ plan: planId, version: data?.plan.version ?? 0, planningYear: Number(year), implementationYear: Number(implementation), quarters: quarters.map(Number), stateLodgment: lodgment, fundingSources });
  const sourceErrors = draftSourceErrors(sources);
  const parsed = planEditSchema.safeParse(input());
  const shortfalls = data && parsed.success && validLodgment && lodgment ? envelopeShortfalls(data.plan, { ...data.plan, stateLodgment: lodgment, fundingSources }, data.proposed) : [];
  const ictProblem = data && parsed.success && validLodgment && lodgment ? sharedBelowIctProblem({ ...data.plan, stateLodgment: lodgment, fundingSources }) : null;
  const implementationError = errors.implementationYear || (year.length === 4 && implementation.length === 4 ? implementationYearError(Number(year), Number(implementation)) : '');
  const canSave = !!data && !locked && parsed.success && !Object.keys(sourceErrors).length && !shortfalls.length && !ictProblem;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pending.current || !data || locked) return;
    const issues: Record<string, string> = {};
    if (!parsed.success) for (const issue of parsed.error.issues) issues[String(issue.path[0])] = issue.message;
    if (Object.keys(sourceErrors).length) issues.fundingSources = 'Complete or remove each other funding source.';
    setErrors(issues);
    if (!parsed.success || Object.keys(issues).length || shortfalls.length || ictProblem) return;
    pending.current = true; setSaving(true);
    try {
      const response = await fetch('/api/plans/setup', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(parsed.data) });
      const result = await response.json() as { error?: string; plan: ActionPlan; changed: boolean };
      if (!response.ok) throw new Error(result.error || 'The plan details could not be saved.');
      toast.success(result.changed ? 'Plan details updated' : 'No changes to save');
      onSaved?.(result.plan); onClose();
    } catch (cause) {
      setErrors({ form: cause instanceof Error ? cause.message : 'Please try again.' });
      pending.current = false; setSaving(false);
    }
  }

  return <Dialog open onOpenChange={value => { if (!value && !pending.current) onClose(); }}>
    <DialogContent variant="inset-footer" className="create-plan-dialog flex max-h-[92dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-[820px]" showCloseButton={!saving} onEscapeKeyDown={e => { if (pending.current) e.preventDefault(); }} onInteractOutside={e => { if (pending.current) e.preventDefault(); }}>
      <DialogHeader className="border-b px-6 py-5"><DialogTitle>Edit plan details</DialogTitle><DialogDescription>{data?.plan.beapName ? `${data.plan.beapName} · ` : ''}Change the plan period and funding. The plan name follows the year and quarters.</DialogDescription></DialogHeader>
      <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col overflow-hidden" noValidate>
        <div className="min-h-0 space-y-3 overflow-y-auto px-5 py-4">
          {loadError && <Alert variant="destructive"><AlertTitle>Plan details unavailable</AlertTitle><AlertDescription>{loadError}</AlertDescription></Alert>}
          {!data && !loadError && <div className="space-y-3"><Skeleton className="h-20 w-full rounded-xl" /><Skeleton className="h-40 w-full rounded-xl" /></div>}
          {data && <>
            {data.lockedReason && <Alert><LockKeyholeIcon /><AlertTitle>Plan details are read-only</AlertTitle><AlertDescription>{data.lockedReason}</AlertDescription></Alert>}
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-xl border bg-muted/40 p-3 text-sm sm:grid-cols-4">{[
              ['Total funding', money.format(Number(total))], ['State contribution', money.format(Number(lodgment || 0))], ['UBEC match', money.format(Number(lodgment || 0))], ['Other funding', money.format(Number(other) + legacy)],
            ].map(([label, value]) => <div key={label} className="min-w-0"><dt className="text-xs text-muted-foreground">{label}</dt><dd className="font-semibold tabular-nums break-words">{value}</dd></div>)}</dl>
            <FieldGroup className="gap-3">
              <FieldSet disabled={disabled} className="gap-3 rounded-xl border bg-card p-3 shadow-xs"><FieldLegend>Plan period</FieldLegend><FieldGroup className="gap-3">
                <FieldGroup className="grid gap-3 sm:grid-cols-2">
                  <Field data-invalid={!!errors.planningYear}><FieldLabel htmlFor="edit-planning-year">Funding year<FieldHelp>The year the grant allocation belongs to.</FieldHelp></FieldLabel><Input id="edit-planning-year" type="number" min={2004} max={2100} value={year} aria-invalid={!!errors.planningYear} onChange={e => { const value = e.target.value; setYear(value); setImplementation(current => value && Number(current) < Number(value) ? value : current); setQuarters(q => q.filter(n => !reserved(value).has(Number(n)))); }} />{errors.planningYear && <FieldError>{errors.planningYear}</FieldError>}</Field>
                  <Field data-invalid={!!implementationError}><FieldLabel htmlFor="edit-implementation-year">Implementation year<FieldHelp>The year the funded activities are expected to be carried out.</FieldHelp></FieldLabel><Input id="edit-implementation-year" type="number" min={Number(year) || 2004} max={2100} value={implementation} aria-invalid={!!implementationError} onChange={e => { setImplementation(e.target.value); setErrors(current => ({ ...current, implementationYear: '' })); }} />{implementationError && <FieldError>{implementationError}</FieldError>}</Field>
                </FieldGroup>
                <Field data-invalid={!!errors.quarters}>
                  <FieldLabel id="edit-quarters-label">Quarters<FieldHelp>Locked quarters already belong to another plan for that year.</FieldHelp></FieldLabel>
                  <ToggleGroup type="multiple" variant="outline" spacing={2} value={quarters} onValueChange={value => setQuarters(value.sort())} aria-labelledby="edit-quarters-label" aria-invalid={!!errors.quarters} className="plan-quarter-grid" disabled={disabled}>
                    {[1, 2, 3, 4].map(q => { const taken = occupied.has(q); const selected = quarters.includes(String(q));
                      return <ToggleGroupItem key={q} value={String(q)} className="plan-quarter" disabled={taken} aria-label={`Quarter ${q}${taken ? ', already assigned' : ''}`}><span className="quarter-top"><span className="quarter-number">Q{q}</span><span className="quarter-indicator">{taken ? <LockKeyholeIcon /> : selected ? <CheckIcon /> : null}</span></span></ToggleGroupItem>; })}
                  </ToggleGroup>
                  <FieldDescription aria-live="polite">{occupied.size === 4 ? 'All quarters of this year are in another plan. Choose a different funding year.' : quarters.length ? `${quarters.length} ${quarters.length === 1 ? 'quarter' : 'quarters'} selected` : 'Choose one or more quarters.'}</FieldDescription>
                  {errors.quarters && <FieldError>{errors.quarters}</FieldError>}
                </Field>
              </FieldGroup></FieldSet>
              <FieldSet disabled={disabled} className="gap-3 rounded-xl border bg-card p-3 shadow-xs"><FieldLegend>Funding</FieldLegend><FieldGroup className="gap-3">
                <Field data-invalid={!!errors.stateLodgment} className="md:max-w-[calc(50%-6px)]"><FieldLabel htmlFor="edit-state-lodgment">State contribution (₦)<FieldHelp>The amount paid by the state. UBEC adds the same amount, and both are shared across components by the funding policy.</FieldHelp></FieldLabel><CurrencyInput id="edit-state-lodgment" placeholder="0.00" value={lodgment} maxIntegerDigits={13} onValueChange={setLodgment} aria-invalid={!!errors.stateLodgment} />{errors.stateLodgment && <FieldError>{errors.stateLodgment}</FieldError>}</Field>
                {legacy > 0 && <FieldDescription>This plan also has {money.format(legacy)} of earlier other funding that is shared across components. It stays unchanged.</FieldDescription>}
                <FundingSourcesField value={sources} onChange={next => { setSources(next); setErrors(current => ({ ...current, fundingSources: '' })); }} disabled={disabled} showErrors />
                {errors.fundingSources && <FieldError>{errors.fundingSources}</FieldError>}
              </FieldGroup></FieldSet>
            </FieldGroup>
            {ictProblem && <Alert variant="destructive"><AlertTitle>Funding is below ICT’s allocation</AlertTitle><AlertDescription>{ictProblem}</AlertDescription></Alert>}
            {shortfalls.length > 0 && <Alert variant="destructive"><AlertTitle>Funding is below what is already proposed</AlertTitle><AlertDescription><ul className="list-disc pl-4">{shortfalls.map(s => <li key={s.component}>{shortfallMessage(s)}</li>)}</ul></AlertDescription></Alert>}
          </>}
        </div>
        {errors.form && <FieldError role="alert" className="px-6 pt-3">{errors.form}</FieldError>}
        <DialogFooter className="shrink-0 px-5 py-3"><Button type="button" variant="outline" onClick={onClose} disabled={saving}>{locked ? 'Close' : 'Cancel'}</Button>{!locked && <Button type="submit" disabled={saving || !canSave}>{saving && <Spinner data-icon="inline-start" />}{saving ? 'Saving…' : 'Save changes'}</Button>}</DialogFooter>
      </form>
    </DialogContent>
  </Dialog>;
}
