"use client";

import { useState } from 'react';
import { CalendarIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { FieldHelp } from '@/components/field-help';
import { formatLineDate, quarterWindow, type LineDates } from '@/lib/line-dates';
import { cn } from '@/lib/utils';
import './line-dates.css';

export type LineDatesFieldProps = {
  /** Base id for the two pickers (`${id}-start`, `${id}-due`). */
  id: string;
  value: LineDates;
  onChange: (dates: LineDates) => void;
  /** The line's timeline: only days inside these quarters can be picked. */
  quarters: readonly number[];
  /** The plan's implementation year, which the quarters belong to. */
  year: number | null | undefined;
  disabled?: boolean;
  error?: string | null;
  /** Show a missing-date error too (forms that report errors only after a save attempt). By default the field
   * stays quiet until a date is picked, and the save button gives the reason. */
  revealMissing?: boolean;
};

const toDate = (iso: string) => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d); };
const toIso = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

type PickerProps = { id: string; label: string; help: string; value: string | null; onPick: (iso: string) => void; min: string; max: string; disabled: boolean; invalid: boolean };

function DatePicker({ id, label, help, value, onPick, min, max, disabled, invalid }: PickerProps) {
  const [open, setOpen] = useState(false);
  const from = toDate(min), to = toDate(max), selected = value ? toDate(value) : undefined;
  return <Field data-invalid={invalid || undefined}>
    <FieldLabel htmlFor={id}>{label} <span className="text-destructive" aria-hidden="true">*</span><span className="sr-only"> (required)</span><FieldHelp>{help}</FieldHelp></FieldLabel>
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button id={id} type="button" variant="outline" disabled={disabled} aria-invalid={invalid || undefined} className={cn('line-date-trigger', !value && 'text-muted-foreground')}>
          <CalendarIcon data-icon="inline-start" aria-hidden="true" />{value ? formatLineDate(value) : 'Pick a date'}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar mode="single" selected={selected} defaultMonth={selected ?? from} startMonth={from} endMonth={to}
          disabled={[{ before: from }, { after: to }]} onSelect={date => { if (date) { onPick(toIso(date)); setOpen(false); } }} autoFocus />
      </PopoverContent>
    </Popover>
  </Field>;
}

/**
 * Expected start and due dates of a component line, shown after its Timeline. The calendars open on the timeline
 * and only offer its days (Q1 = January–March … in the implementation year); the due date cannot precede the start.
 */
export function LineDatesField({ id, value, onChange, quarters, year, disabled = false, error, revealMissing = false }: LineDatesFieldProps) {
  const window = quarterWindow(year, quarters);
  // A missing date is reported by the save button; the field speaks up once a date has been picked.
  const shown = error && (revealMissing || value.startDate || value.dueDate) ? error : null;
  if (!window) return <Field className="line-dates"><FieldLabel>Expected start and due dates</FieldLabel><FieldDescription>Choose the timeline first; the dates fall within its quarters</FieldDescription></Field>;
  const pickStart = (startDate: string) => onChange({ startDate, dueDate: value.dueDate && value.dueDate < startDate ? null : value.dueDate });
  const pickDue = (dueDate: string) => onChange({ ...value, dueDate });
  return <FieldGroup className="line-dates">
    <div className="line-dates-grid">
      <DatePicker id={`${id}-start`} label="Expected start date" help="When work on this item is expected to begin. Only days within the timeline can be picked." value={value.startDate} onPick={pickStart} min={window.min} max={window.max} disabled={disabled} invalid={!!shown && !value.startDate} />
      <DatePicker id={`${id}-due`} label="Due date" help="When this item is expected to be completed. It cannot be before the start date." value={value.dueDate} onPick={pickDue} min={value.startDate ?? window.min} max={window.max} disabled={disabled} invalid={!!shown && !value.dueDate} />
    </div>
    {shown && <FieldError>{shown}</FieldError>}
  </FieldGroup>;
}
