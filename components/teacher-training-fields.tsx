'use client';
import { Checkbox } from '@/components/ui/checkbox';
import { Field, FieldDescription, FieldGroup, FieldLabel, FieldLegend, FieldSet } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { maxTrainingDays, minTrainingDays, targetParticipants, trainingProviders, trainingSchoolLevels, venueTypes } from '@/lib/teacher-development';

// Teacher Development line fields (migration 040): they replace the usual description, strategy and target group.
const required = <span className="text-destructive" aria-label="required">*</span>;
export type TrainingDraft = { trainingProvider: string; targetParticipants: string; schoolLevels: string[]; trainingDays: string; venueType: string };
type Key = 'trainingProvider' | 'targetParticipants' | 'venueType';
type Props = { draft: TrainingDraft; onChange: (next: Partial<TrainingDraft>) => void };

/** Training provider, target participants, school levels, training days and venue type. */
export function TeacherTrainingFields({ draft, onChange }: Props) {
  const select = (key: Key, label: string, options: readonly string[]) => <Field><FieldLabel htmlFor={key}>{label} {required}</FieldLabel>
    <NativeSelect id={key} required value={draft[key]} onChange={e => onChange({ [key]: e.target.value })}><NativeSelectOption value="">Choose…</NativeSelectOption>{options.map(o => <NativeSelectOption key={o} value={o}>{o}</NativeSelectOption>)}</NativeSelect></Field>;
  const toggle = (level: string, on: boolean) => onChange({ schoolLevels: trainingSchoolLevels.filter(l => l === level ? on : draft.schoolLevels.includes(l)) });
  const days = draft.trainingDays === '' ? null : Number(draft.trainingDays);
  const shortDays = days != null && (!Number.isInteger(days) || days < minTrainingDays);
  return <>
    {select('trainingProvider', 'Training provider', trainingProviders)}
    {select('targetParticipants', 'Target participants', targetParticipants)}
    <FieldSet className="subscription-types"><FieldLegend variant="label">School level {required}</FieldLegend><FieldDescription>Choose at least one.</FieldDescription>
      <div className="subscription-grid" role="group" aria-label="School levels">{trainingSchoolLevels.map(level => <label key={level} className="subscription-option"><Checkbox checked={draft.schoolLevels.includes(level)} onCheckedChange={v => toggle(level, v === true)} aria-label={level} /><span>{level}</span></label>)}</div>
    </FieldSet>
    <FieldGroup className="grid grid-cols-2 gap-4">
      <Field><FieldLabel htmlFor="trainingDays">Training days {required}</FieldLabel><Input id="trainingDays" type="number" inputMode="numeric" min={minTrainingDays} max={maxTrainingDays} step="1" required value={draft.trainingDays} aria-invalid={shortDays} onChange={e => onChange({ trainingDays: e.target.value })} />
        <FieldDescription className={shortDays ? 'text-destructive' : undefined}>At least {minTrainingDays} days.</FieldDescription></Field>
      {select('venueType', 'Venue type', venueTypes)}
    </FieldGroup>
  </>;
}
