'use client';

import { useId, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldLegend, FieldSet } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Spinner } from '@/components/ui/spinner';
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { fieldIssues, schoolClasses, schoolInputSchema, schoolLevels, schoolLocations, schoolTypes, type ClassEnrolment, type RegisterSchool, type SchoolClassKey } from '@/lib/school-register';

type Grid = Record<SchoolClassKey, { male: string; female: string }>;
type Form = { schoolCode: string; name: string; town: string; lga: string; category: string; location: string; level: string; latitude: string; longitude: string };
export type SchoolEntryFormProps = {
  /** Edit this school; omit to add a new one. */
  school?: RegisterSchool | null;
  lgas: string[];
  onSaved: (school: RegisterSchool) => void;
  onCancel?: () => void;
  saveLabel?: string;
};

const RequiredMark = () => <><span className="text-destructive" aria-hidden="true">*</span><span className="sr-only"> (required)</span></>;
const blankGrid = (enrolment: ClassEnrolment = {}) => Object.fromEntries(schoolClasses.map(({ key }) => [key, { male: enrolment[key] ? String(enrolment[key]!.male) : '', female: enrolment[key] ? String(enrolment[key]!.female) : '' }])) as Grid;
const formFor = (school?: RegisterSchool | null): Form => ({ schoolCode: school?.schoolCode ?? '', name: school?.name ?? '', town: school?.town ?? '', lga: school?.lga ?? '', category: school?.category || 'Public', location: school?.location || '', level: school?.level ?? '', latitude: school?.latitude ?? '', longitude: school?.longitude ?? '' });
const count = (value: string) => value.trim() === '' ? 0 : Number(value);

/**
 * Single school entry for the School register and the plan-creation step. It renders no <form>
 * element, so it can sit inside another form (the plan dialog); Enter in a text field saves.
 */
export function SchoolEntryForm({ school, lgas, onSaved, onCancel, saveLabel }: SchoolEntryFormProps) {
  const id = useId();
  const [form, setForm] = useState<Form>(() => formFor(school));
  const [grid, setGrid] = useState<Grid>(() => blankGrid(school?.enrolment));
  const [errors, setErrors] = useState<Record<string, string>>({}), [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const pending = useRef(false);
  const hasBreakdown = !!school && Object.keys(school.enrolment ?? {}).length > 0;
  const gridEmpty = schoolClasses.every(({ key }) => !grid[key].male.trim() && !grid[key].female.trim());
  const totals = schoolClasses.reduce((sum, { key }) => ({ male: sum.male + (count(grid[key].male) || 0), female: sum.female + (count(grid[key].female) || 0) }), { male: 0, female: 0 });
  const lgaOptions = form.lga && !lgas.includes(form.lga) ? [form.lga, ...lgas] : lgas;
  const set = (patch: Partial<Form>) => { setForm(current => ({ ...current, ...patch })); setErrors(current => { const next = { ...current }; Object.keys(patch).forEach(key => delete next[key]); return next; }); };
  const setCell = (key: SchoolClassKey, part: 'male' | 'female', value: string) => { setGrid(current => ({ ...current, [key]: { ...current[key], [part]: value } })); setErrors(current => Object.fromEntries(Object.entries(current).filter(([field]) => field !== 'enrolment'))); };

  async function save() {
    if (pending.current) return;
    const enrolment = gridEmpty && school ? null : Object.fromEntries(schoolClasses.filter(({ key }) => grid[key].male.trim() || grid[key].female.trim()).map(({ key }) => [key, { male: count(grid[key].male), female: count(grid[key].female) }]));
    const payload = { ...form, schoolCode: form.schoolCode || null, enrolment };
    const parsed = schoolInputSchema.safeParse(payload);
    if (!parsed.success) { setErrors(fieldIssues(parsed.error)); setFormError('Check the highlighted fields.'); return; }
    pending.current = true; setSaving(true); setFormError(''); setErrors({});
    try {
      const response = await fetch('/api/schools', { method: school ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(school ? { ...payload, id: school.id } : payload) });
      if (response.status === 401) { window.location.replace('/'); return; }
      const body = await response.json().catch(() => ({})) as { school?: RegisterSchool; error?: string; issues?: { field: string; message: string }[] };
      if (!response.ok || !body.school) {
        if (body.issues?.length) setErrors(Object.fromEntries(body.issues.map(issue => [issue.field, issue.message])));
        throw Error(body.error || 'The school could not be saved.');
      }
      toast.success(school ? 'School updated' : `${body.school.name} added to the register`);
      if (!school) { setForm(formFor(null)); setGrid(blankGrid()); }
      onSaved(body.school);
    } catch (cause) { setFormError(cause instanceof Error ? cause.message : 'The school could not be saved.'); }
    finally { pending.current = false; setSaving(false); }
  }
  const onEnter = (event: React.KeyboardEvent) => { if (event.key === 'Enter' && (event.target as HTMLElement).tagName === 'INPUT') { event.preventDefault(); void save(); } };
  const text = (field: keyof Form, label: string, options: { required?: boolean; placeholder?: string; help?: string; inputMode?: 'decimal' } = {}) => <Field data-invalid={!!errors[field] || undefined}>
    <FieldLabel htmlFor={`${id}-${field}`}>{label}{options.required && <RequiredMark />}</FieldLabel>
    <Input id={`${id}-${field}`} value={form[field]} disabled={saving} required={options.required} aria-invalid={!!errors[field] || undefined} placeholder={options.placeholder} inputMode={options.inputMode} onChange={event => set({ [field]: event.target.value })} />
    {options.help && <FieldDescription>{options.help}</FieldDescription>}{errors[field] && <FieldError>{errors[field]}</FieldError>}
  </Field>;
  const select = (field: keyof Form, label: string, values: readonly string[], placeholder: string) => <Field data-invalid={!!errors[field] || undefined}>
    <FieldLabel htmlFor={`${id}-${field}`}>{label}<RequiredMark /></FieldLabel>
    <NativeSelect id={`${id}-${field}`} value={form[field]} disabled={saving} required aria-invalid={!!errors[field] || undefined} onChange={event => set({ [field]: event.target.value })}><NativeSelectOption value="" disabled>{placeholder}</NativeSelectOption>{values.map(value => <NativeSelectOption key={value} value={value}>{value}</NativeSelectOption>)}</NativeSelect>
    {errors[field] && <FieldError>{errors[field]}</FieldError>}
  </Field>;

  return <div className="flex flex-col gap-6" onKeyDown={onEnter}>
    <FieldGroup className="grid gap-4 sm:grid-cols-2">
      <div className="sm:col-span-2">{text('name', 'School name', { required: true })}</div>
      {lgas.length ? select('lga', 'LGA', lgaOptions, 'Choose LGA') : text('lga', 'LGA', { required: true })}
      {text('town', 'Town')}
      {select('category', 'Type of school', schoolTypes, 'Choose type')}
      {select('location', 'Location', schoolLocations, 'Choose location')}
      {select('level', 'Level', school?.level === 'SSS' ? [...schoolLevels, 'SSS'] : schoolLevels, 'Choose level')}
      {text('schoolCode', 'School code', { placeholder: 'EMIS / DNEMIS code', help: 'Optional. Must be unique in your state.' })}
      {text('latitude', 'Latitude', { placeholder: 'e.g. 11.7469', inputMode: 'decimal' })}
      {text('longitude', 'Longitude', { placeholder: 'e.g. 11.9608', inputMode: 'decimal' })}
    </FieldGroup>
    <FieldSet>
      <FieldLegend>Enrolment by class</FieldLegend>
      {school && !hasBreakdown && (school.male + school.female > 0) && <FieldDescription>The register holds {school.male.toLocaleString()} male and {school.female.toLocaleString()} female learners without a class breakdown. Leave the table empty to keep these totals, or enter every class to replace them.</FieldDescription>}
      <div className="overflow-hidden rounded-md border">
        <Table>
          <TableHeader><TableRow><TableHead>Class</TableHead><TableHead className="w-28">Male</TableHead><TableHead className="w-28">Female</TableHead><TableHead className="w-20 text-right">Total</TableHead></TableRow></TableHeader>
          <TableBody>{schoolClasses.map(({ key, label }) => <TableRow key={key}>
            <TableCell className="font-medium">{label}</TableCell>
            {(['male', 'female'] as const).map(part => <TableCell key={part} className="py-1.5"><Input aria-label={`${label} ${part}`} className="h-8" type="number" min="0" step="1" inputMode="numeric" disabled={saving} value={grid[key][part]} onChange={event => setCell(key, part, event.target.value)} /></TableCell>)}
            <TableCell className="text-right tabular-nums">{grid[key].male.trim() || grid[key].female.trim() ? (count(grid[key].male) || 0) + (count(grid[key].female) || 0) : '—'}</TableCell>
          </TableRow>)}</TableBody>
          <TableFooter><TableRow><TableCell>Total enrolment</TableCell><TableCell className="tabular-nums">{gridEmpty && school ? school.male : totals.male}</TableCell><TableCell className="tabular-nums">{gridEmpty && school ? school.female : totals.female}</TableCell><TableCell className="text-right tabular-nums">{gridEmpty && school ? school.male + school.female : totals.male + totals.female}</TableCell></TableRow></TableFooter>
        </Table>
      </div>
      {errors.enrolment && <FieldError>{errors.enrolment}</FieldError>}
    </FieldSet>
    {formError && <Alert variant="destructive"><AlertDescription>{formError}</AlertDescription></Alert>}
    <div className="flex flex-wrap justify-end gap-2">
      {onCancel && <Button type="button" variant="outline" disabled={saving} onClick={onCancel}>Cancel</Button>}
      <Button type="button" disabled={saving} onClick={() => void save()}>{saving && <Spinner data-icon="inline-start" />}{saveLabel ?? (school ? 'Save school' : 'Add school')}</Button>
    </div>
  </div>;
}
