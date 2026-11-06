'use client';
import { Combobox, ComboboxChip, ComboboxChips, ComboboxChipsInput, ComboboxContent, ComboboxEmpty, ComboboxItem, ComboboxList, useComboboxAnchor } from '@/components/ui/combobox';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { joinTargetGroups, splitTargetGroups, targetGroups } from '@/lib/target-groups';

/** Base UI clears a multi-select when Escape is pressed with its list closed; that change is ignored. */
const keepsChoices = (details: { reason?: string }) => details.reason === 'escape-key';

/**
 * Target group chips multi-select, shared by the activity editor and the Sports budget form (UBEC219). The value is the
 * stored text, the chosen groups joined in list order ("Schools, Teachers").
 */
export function TargetGroupPicker({ id = 'targetGroup', value, onChange, error, disabled }: {
  id?: string; value: string; onChange: (value: string) => void; error?: string; disabled?: boolean;
}) {
  const anchor = useComboboxAnchor();
  const chosen = splitTargetGroups(value);
  return <Field data-invalid={Boolean(error)} data-disabled={disabled}>
    <FieldLabel htmlFor={id}>Target group <span className="text-destructive" aria-label="required">*</span></FieldLabel>
    <Combobox multiple items={[...targetGroups]} value={chosen} disabled={disabled} onValueChange={(groups, details) => { if (!keepsChoices(details)) onChange(joinTargetGroups(groups)); }}>
      <ComboboxChips ref={anchor}><>{chosen.map(group => <ComboboxChip key={group}>{group}</ComboboxChip>)}</><ComboboxChipsInput id={id} placeholder={chosen.length ? 'Add another group…' : 'Choose one or more groups…'} aria-required="true" aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-error` : undefined} /></ComboboxChips>
      <ComboboxContent anchor={anchor}><ComboboxEmpty>No groups match your search</ComboboxEmpty><ComboboxList>{targetGroups.map(group => <ComboboxItem key={group} value={group}>{group}</ComboboxItem>)}</ComboboxList></ComboboxContent>
    </Combobox>
    {error && <FieldError id={`${id}-error`}>{error}</FieldError>}
  </Field>;
}
