"use client";

import { CheckIcon, LockKeyholeIcon } from 'lucide-react';
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { FieldHelp } from '@/components/field-help';
import { allQuarters, formatQuarters, normalizeQuarters } from '@/lib/line-quarters';
import { cn } from '@/lib/utils';
import './quarter-timeline.css';

export type QuarterTimelineProps = {
  /** Base id: the label is `${id}-label` and the guidance `${id}-guidance`. */
  id: string;
  label?: string;
  help?: string;
  required?: boolean;
  value: readonly number[];
  onChange: (quarters: number[]) => void;
  /** Quarters that may be chosen (a line's plan quarters); the others are shown locked. Defaults to Q1–Q4. */
  available?: readonly number[];
  /** Read out for a quarter outside `available`. */
  unavailableReason?: string;
  /** Quarters taken elsewhere (another plan), shown locked. */
  locked?: readonly number[];
  lockedReason?: string;
  disabled?: boolean;
  /** Shown under the picker; also marks the field invalid. */
  error?: string;
  invalid?: boolean;
  /** Offer Select all / Clear (default on). */
  selectAll?: boolean;
  /** Add "· N months" to the selection summary (default on). */
  showMonths?: boolean;
  emptyMessage?: string;
  /** Shown when no quarter can be chosen. */
  noneAvailableMessage?: string;
  size?: 'default' | 'compact';
  className?: string;
};

function RequiredMark() {
  return <><span className="text-destructive" aria-hidden="true">*</span><span className="sr-only"> (required)</span></>;
}

/**
 * Q1–Q4 picker built on the shadcn ToggleGroup: the plan period in the Create and Edit plan dialogs, and the
 * Timeline (implementation quarters) of every component line. Quarters outside `available` or in `locked` are
 * disabled with a lock, unless already selected, so an out-of-plan quarter can still be cleared.
 */
export function QuarterTimeline({ id, label = 'Timeline', help, required = false, value, onChange, available = allQuarters, unavailableReason = 'not in this plan', locked = [], lockedReason = 'already assigned', disabled = false, error, invalid = false, selectAll = true, showMonths = true, emptyMessage = 'Choose one or more quarters.', noneAvailableMessage = 'No quarters are available.', size = 'default', className }: QuarterTimelineProps) {
  const selected = normalizeQuarters(value);
  const isLocked = (q: number) => locked.includes(q);
  const isOutside = (q: number) => !available.includes(q);
  const selectable = allQuarters.filter(q => !isLocked(q) && !isOutside(q));
  const allSelected = selectable.length > 0 && selectable.every(q => selected.includes(q)) && selected.length === selectable.length;
  const restricted = selectable.length < allQuarters.length;
  const hasError = !!error || invalid;
  const summary = !selectable.length ? noneAvailableMessage
    : selected.length ? `${selected.length} ${selected.length === 1 ? 'quarter' : 'quarters'} selected${showMonths ? ` · ${selected.length * 3} months` : ''}`
    : emptyMessage;
  return <Field data-invalid={hasError || undefined} className={cn('quarter-timeline', className)} data-size={size}>
    <div className="flex flex-wrap items-center justify-between gap-2">
      <FieldLabel id={`${id}-label`}>{label}{required && <> <RequiredMark /></>}{help && <FieldHelp>{help}</FieldHelp>}</FieldLabel>
      {selectAll && selectable.length > 0 && <Button type="button" variant="ghost" size="sm" className="quarter-select-all" disabled={disabled} onClick={() => onChange(allSelected ? [] : [...selectable])}>{allSelected ? 'Clear' : restricted ? 'Select available' : 'Select all'}</Button>}
    </div>
    <ToggleGroup type="multiple" variant="outline" spacing={2} value={selected.map(String)} onValueChange={next => onChange(normalizeQuarters(next.map(Number)))} aria-labelledby={`${id}-label`} aria-describedby={`${id}-guidance`} aria-required={required || undefined} aria-invalid={hasError || undefined} className="plan-quarter-grid" disabled={disabled}>
      {allQuarters.map(q => {
        const on = selected.includes(q), reason = isLocked(q) ? lockedReason : isOutside(q) ? unavailableReason : '';
        return <ToggleGroupItem key={q} value={String(q)} className="plan-quarter" disabled={!!reason && !on} data-outside={(!!reason && on) || undefined} aria-label={`Quarter ${q}${reason ? `, ${reason}` : ''}`}>
          <span className="quarter-top"><span className="quarter-number">Q{q}</span><span className="quarter-indicator">{reason && !on ? <LockKeyholeIcon /> : on ? <CheckIcon /> : null}</span></span>
        </ToggleGroupItem>;
      })}
    </ToggleGroup>
    <FieldDescription id={`${id}-guidance`} className="quarter-guidance" aria-live="polite">{summary}</FieldDescription>
    {error && <FieldError>{error}</FieldError>}
  </Field>;
}

/** A saved line's timeline in tables and rows: "Q1–Q3", "Q1, Q3". */
export function QuarterBadge({ quarters, className }: { quarters?: readonly number[] | null; className?: string }) {
  const label = formatQuarters([...(quarters ?? [])]);
  if (!label) return null;
  return <Badge variant="outline" className={cn('quarter-badge', className)} title={`Timeline: ${label}`}><span className="sr-only">Timeline: </span>{label}</Badge>;
}
