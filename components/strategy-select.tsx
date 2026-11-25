'use client';

import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { implementationStrategies, maxStrategyDetailLength, nonApplicableStrategy, splitStrategy, strategyLabel } from '@/lib/activity-plans';

type Props = { id: string; value: string; onChange: (value: string) => void; error?: string; disabled?: boolean; label?: string; help?: string };

/**
 * The implementation strategy list of the activity components (UBEC159), with "Non-Applicable" naming what is used
 * instead. Used by Sports (client, 25 November 2026); a retired value on an older line shows as "(no longer offered)".
 */
export function StrategySelect({ id, value, onChange, error, disabled, label = 'Implementation strategy', help }: Props) {
  const split = splitStrategy(value), chosen = split.strategy, retired = !!chosen && !(implementationStrategies as readonly string[]).includes(chosen);
  return <>
    <Field data-invalid={Boolean(error)}>
      <FieldLabel htmlFor={id}>{label} <span className="text-destructive" aria-hidden="true">*</span></FieldLabel>
      <Select value={chosen || undefined} onValueChange={next => onChange(next)} disabled={disabled}>
        <SelectTrigger id={id} className="w-full" aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-error` : undefined}><SelectValue placeholder="Choose a strategy">{chosen ? strategyLabel(chosen) : undefined}</SelectValue></SelectTrigger>
        <SelectContent position="popper" align="start" className="w-(--radix-select-trigger-width)"><SelectGroup>
          {retired && <SelectItem value={chosen} disabled>{strategyLabel(chosen)} (no longer offered)</SelectItem>}
          {implementationStrategies.map(s => <SelectItem key={s} value={s}>{strategyLabel(s)}</SelectItem>)}
        </SelectGroup></SelectContent>
      </Select>
      {help && <FieldDescription>{help}</FieldDescription>}
      {error && chosen !== nonApplicableStrategy && <FieldError id={`${id}-error`}>{error}</FieldError>}
    </Field>
    {chosen === nonApplicableStrategy && <Field data-invalid={Boolean(error)}>
      <FieldLabel htmlFor={`${id}-detail`}>What is used instead <span className="text-destructive" aria-hidden="true">*</span></FieldLabel>
      <Input id={`${id}-detail`} maxLength={maxStrategyDetailLength} placeholder="e.g. E-payment/cash transfer, direct payment to vendor" value={split.detail} disabled={disabled}
        onChange={e => { const typed = e.target.value.replace(/^\s+/, '').slice(0, maxStrategyDetailLength); onChange(typed ? `${nonApplicableStrategy}: ${typed}` : nonApplicableStrategy); }} />
      <FieldDescription>Attach the BPP waiver with the item</FieldDescription>
      {error && <FieldError id={`${id}-error`}>{error}</FieldError>}
    </Field>}
  </>;
}
