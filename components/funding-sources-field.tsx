"use client";

import { InfoIcon, PlusIcon, Trash2Icon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldError, FieldLegend, FieldSet } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectGroup, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { CurrencyInput } from '@/components/currency-input';
import { fundingComponentIds, fundingComponentLabels, fundingSourceLabels, planWideFunding, type FundingSource, type FundingSourceTarget } from '@/lib/funding-policy';
import { fundingSourceSchema, maxFundingSources, otherFundingTotal, type PlanSetup } from '@/lib/plan-setup';

const money = new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 2 });
export type DraftSource = { key: string; component: FundingSourceTarget | ''; funder: string; amount: string };
/** The picker's wording for plan-wide funding. */
const planWideOption = 'All components';
let draftKey = 0;
const nextKey = () => `source-${++draftKey}`;
export const emptySource = (): DraftSource => ({ key: nextKey(), component: '', funder: '', amount: '' });
export const toDraftSources = (sources: readonly FundingSource[] = []): DraftSource[] => sources.map(s => ({ key: nextKey(), component: s.component, funder: s.funder, amount: s.amount }));
const isBlank = (s: DraftSource) => !s.component && !s.funder.trim() && !Number(s.amount || 0);
/** Complete rows as API payload; fully blank rows are ignored. */
export const fromDraftSources = (drafts: readonly DraftSource[]) => drafts.filter(s => !isBlank(s)).map(({ component, funder, amount }) => ({ component, funder: funder.trim(), amount }));
/** First problem of each incomplete row, keyed by row key. */
export function draftSourceErrors(drafts: readonly DraftSource[]) {
  return Object.fromEntries(drafts.filter(s => !isBlank(s)).flatMap(s => { const r = fundingSourceSchema.safeParse({ component: s.component || undefined, funder: s.funder, amount: s.amount || '0' }); return r.success ? [] : [[s.key, r.error.issues[0].message]]; })) as Record<string, string>;
}

type FieldProps = { value: DraftSource[]; onChange: (next: DraftSource[]) => void; disabled?: boolean; showErrors?: boolean };
export function FundingSourcesField({ value, onChange, disabled, showErrors }: FieldProps) {
  const errors = showErrors ? draftSourceErrors(value) : {};
  const update = (key: string, patch: Partial<DraftSource>) => onChange(value.map(s => s.key === key ? { ...s, ...patch } : s));
  const row = 'grid items-start gap-2 sm:grid-cols-[minmax(0,1.15fr)_minmax(0,1.2fr)_minmax(0,1fr)_auto]';
  return <FieldSet disabled={disabled} className="gap-2">
    <FieldLegend variant="label" className="mb-0">Other funding sources <span className="font-normal text-muted-foreground">Optional</span></FieldLegend>
    <FieldDescription>Money for one component is available only to that component. Choose All components to share it across every component by the funding policy percentages, like the state counterpart fund.</FieldDescription>
    {value.length > 0 && <div className={`${row} hidden text-xs font-medium text-muted-foreground sm:grid`} aria-hidden="true"><span>Component</span><span>Funder</span><span>Amount (₦)</span><span className="w-9" /></div>}
    {value.map((source, index) => <Field key={source.key} data-invalid={!!errors[source.key]} className="gap-1">
      <div className={row}>
        <Select value={source.component} onValueChange={component => update(source.key, { component: component as FundingSourceTarget })} disabled={disabled}><SelectTrigger className="w-full" aria-label={`Component for source ${index + 1}`} aria-invalid={!!errors[source.key] && !source.component}><SelectValue placeholder="Choose component" /></SelectTrigger><SelectContent><SelectGroup><SelectItem value={planWideFunding}>{planWideOption}</SelectItem></SelectGroup><SelectSeparator /><SelectGroup>{fundingComponentIds.map(id => <SelectItem key={id} value={id}>{fundingComponentLabels[id]}</SelectItem>)}</SelectGroup></SelectContent></Select>
        <Input aria-label={`Funder for source ${index + 1}`} placeholder="Funder, e.g. World Bank" maxLength={120} value={source.funder} onChange={e => update(source.key, { funder: e.target.value })} aria-invalid={!!errors[source.key] && !source.funder.trim()} />
        <CurrencyInput aria-label={`Amount for source ${index + 1}`} placeholder="0.00" maxIntegerDigits={13} value={source.amount} onValueChange={amount => update(source.key, { amount })} aria-invalid={!!errors[source.key] && !Number(source.amount || 0)} />
        <Button type="button" variant="ghost" size="icon" className="justify-self-end" aria-label={`Remove source ${index + 1}`} onClick={() => onChange(value.filter(s => s.key !== source.key))}><Trash2Icon /></Button>
      </div>
      {errors[source.key] && <FieldError>{errors[source.key]}</FieldError>}
    </Field>)}
    {value.length < maxFundingSources && <div><Button type="button" variant="outline" size="sm" onClick={() => onChange([...value, emptySource()])}><PlusIcon />{value.length ? 'Add another source' : 'Add funding source'}</Button></div>}
  </FieldSet>;
}

type BreakdownLine = { key: string; label: string; amount: string };
/** One line per funding source ("Other funding (SBMC) · Funder", "Other funding (all components) · Funder"), plus any legacy funding shared by every component. */
export function otherFundingLines(setup: Pick<Partial<PlanSetup>, 'otherFunding' | 'fundingSources'>): BreakdownLine[] {
  const legacy = Number(setup.otherFunding ?? 0) > 0 ? [{ key: 'legacy', label: 'Other funding (shared across components)', amount: setup.otherFunding! }] : [];
  return [...legacy, ...(setup.fundingSources ?? []).map((s, i) => ({ key: String(s.id ?? i), label: `Other funding (${s.component === planWideFunding ? 'all components' : fundingSourceLabels[s.component] ?? s.component}) · ${s.funder}`, amount: s.amount }))];
}
/** Info icon whose tooltip lists the plan's other funding by component. Renders nothing when there is none. */
export function OtherFundingInfo({ setup, className }: { setup: Pick<Partial<PlanSetup>, 'otherFunding' | 'fundingSources'>; className?: string }) {
  const lines = otherFundingLines(setup);
  if (!lines.length) return null;
  return <Tooltip><TooltipTrigger asChild><span className={`field-help-trigger align-middle ${className ?? ''}`} tabIndex={0} role="button" aria-label={`Other funding breakdown: ${lines.map(l => `${l.label} ${money.format(Number(l.amount))}`).join('; ')}`} onClick={e => e.stopPropagation()}><InfoIcon aria-hidden="true" /></span></TooltipTrigger>
    <TooltipContent side="top" sideOffset={6} className="max-w-80"><ul className="flex flex-col gap-1">{lines.map(l => <li key={l.key} className="flex justify-between gap-4"><span>{l.label}</span><strong className="tabular-nums">{money.format(Number(l.amount))}</strong></li>)}</ul><p className="mt-1.5 border-t border-background/20 pt-1.5 text-right font-semibold tabular-nums">Total {money.format(Number(otherFundingTotal(setup)))}</p></TooltipContent></Tooltip>;
}
