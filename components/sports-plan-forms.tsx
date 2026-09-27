"use client";

import { CurrencyInput } from "@/components/currency-input";
import { SportsSectionSelect } from "@/components/sports-section-select";
import { Combobox, ComboboxContent, ComboboxEmpty, ComboboxInput, ComboboxItem, ComboboxList } from "@/components/ui/combobox";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { PackageIcon } from "lucide-react";
import { sportsSections, type SportsPlan, type SportsSchool, type SportsSection, type SportsLine } from "@/lib/sports";

export type BudgetDraft = { id?: number; section: SportsSection; activityType: string; description: string; quantity: string; unitCost: string };
export type AllocationDraft = { id?: number; schoolId: number | null; lineId: number | null; quantity: string; longitude: string; latitude: string };
export type FormErrors = Record<string, string>;
export const emptyBudget: BudgetDraft = { section: "equipment", activityType: "", description: "", quantity: "1", unitCost: "" };
export const emptyAllocation: AllocationDraft = { schoolId: null, lineId: null, quantity: "1", longitude: "", latitude: "" };

export function SportsBudgetFields({ draft, onChange, plan, errors, disabled }: {
  draft: BudgetDraft; onChange: (value: BudgetDraft) => void; plan: SportsPlan; errors: FormErrors; disabled: boolean;
}) {
  const section = sportsSections.find((item) => item.id === draft.section)!;
  const types = [...new Set(plan.lines.filter((line) => line.section === draft.section).map((line) => line.activityType))];
  const enteredType = draft.activityType.trim();
  const existingType = types.find((type) => type.toLowerCase() === enteredType.toLowerCase());
  const suggestions = enteredType && !existingType ? [...types, enteredType] : types;
  const allocated = draft.id ? plan.allocations.filter((allocation) => allocation.lineId === draft.id).reduce((sum, allocation) => sum + allocation.quantity, 0) : 0;
  return <FieldGroup className="gap-6">
    <Field data-disabled={disabled || Boolean(allocated)}>
      <FieldLabel htmlFor="sports-section">Budget section</FieldLabel>
      <SportsSectionSelect id="sports-section" value={draft.section} disabled={disabled || Boolean(allocated)} onValueChange={(value) => onChange({ ...draft, section: value, activityType: "" })} />
    </Field>
    <Field data-invalid={Boolean(errors.activityType)} data-disabled={disabled || Boolean(allocated)}>
      <FieldLabel htmlFor="sports-type">{section.typeLabel}</FieldLabel>
      <Combobox items={suggestions} value={existingType ?? (enteredType || null)} inputValue={draft.activityType}
        disabled={disabled || Boolean(allocated)}
        onInputValueChange={(value, details) => { if (details.reason === "input-change" || details.reason === "input-clear") onChange({ ...draft, activityType: value }); }}
        onValueChange={(value) => onChange({ ...draft, activityType: value ?? "" })}>
        <ComboboxInput id="sports-type" className="w-full" placeholder={section.placeholder} maxLength={160} disabled={disabled || Boolean(allocated)} showClear aria-invalid={Boolean(errors.activityType)} aria-describedby={errors.activityType ? "sports-type-error" : undefined} />
        <ComboboxContent><ComboboxEmpty>Type a name to add your own.</ComboboxEmpty><ComboboxList>{(type: string) => <ComboboxItem key={type} value={type}>{types.includes(type) ? type : `Use “${type}”`}</ComboboxItem>}</ComboboxList></ComboboxContent>
      </Combobox>
      {errors.activityType && <FieldError id="sports-type-error">{errors.activityType}</FieldError>}
    </Field>
    <Separator />
    <Field data-invalid={Boolean(errors.description)}>
      <FieldLabel htmlFor="sports-description">{draft.section === "equipment" || draft.section === "competitions" ? "Item description" : "Allowable activity / item description"}</FieldLabel>
      <Input id="sports-description" value={draft.description} maxLength={1000} placeholder={draft.section === "equipment" ? "e.g. Footballs" : "Enter a description"} onChange={(event) => onChange({ ...draft, description: event.target.value })} aria-invalid={Boolean(errors.description)} aria-describedby={errors.description ? "sports-description-error" : undefined} />
      {errors.description && <FieldError id="sports-description-error">{errors.description}</FieldError>}
    </Field>
    <FieldGroup className="field-columns">
      <Field data-invalid={Boolean(errors.quantity)}>
        <FieldLabel htmlFor="sports-quantity">Quantity</FieldLabel>
        <Input id="sports-quantity" type="number" inputMode="numeric" min={Math.max(1, allocated)} max={1000000} step={1} value={draft.quantity} onChange={(event) => onChange({ ...draft, quantity: event.target.value })} aria-invalid={Boolean(errors.quantity)} aria-describedby={errors.quantity ? "sports-quantity-error" : undefined} />
        {errors.quantity && <FieldError id="sports-quantity-error">{errors.quantity}</FieldError>}
      </Field>
      <Field data-invalid={Boolean(errors.unitCost)}>
        <FieldLabel htmlFor="sports-unit-cost">Unit cost (₦)</FieldLabel>
        <CurrencyInput id="sports-unit-cost" placeholder="0.00" value={draft.unitCost} onValueChange={(unitCost) => onChange({ ...draft, unitCost })} aria-invalid={Boolean(errors.unitCost)} aria-describedby={errors.unitCost ? "sports-unit-cost-error" : undefined} />
        {errors.unitCost && <FieldError id="sports-unit-cost-error">{errors.unitCost}</FieldError>}
      </Field>
    </FieldGroup>
    {allocated > 0 && <p className="construction-summary">{allocated} items allocated to schools. The sport and section are locked while allocations exist.</p>}
  </FieldGroup>;
}

export function SportsAllocationFields({ draft, onChange, plan, errors, disabled }: {
  draft: AllocationDraft; onChange: (value: AllocationDraft) => void; plan: SportsPlan; errors: FormErrors; disabled: boolean;
}) {
  const equipment = plan.lines.filter((line) => line.section === "equipment");
  const school = plan.schools.find((item) => item.id === draft.schoolId) ?? null;
  const selectedItem = equipment.find((item) => item.id === draft.lineId) ?? null;
  const remaining = (line: SportsLine) => line.quantity - plan.allocations.filter((item) => item.lineId === line.id && item.id !== draft.id).reduce((sum, item) => sum + item.quantity, 0);
  return equipment.length ? <FieldGroup className="gap-6">
    <Field data-invalid={Boolean(errors.schoolId)}>
      <FieldLabel htmlFor="sports-school">School name</FieldLabel>
      <Combobox items={plan.schools} value={school} disabled={disabled} onValueChange={(value) => onChange({ ...draft, schoolId: value?.id ?? null })} itemToStringLabel={(value: SportsSchool) => value.name} itemToStringValue={(value: SportsSchool) => String(value.id)} isItemEqualToValue={(a, b) => a.id === b.id}>
        <ComboboxInput id="sports-school" className="w-full" placeholder="Search by school name…" disabled={disabled} showClear aria-invalid={Boolean(errors.schoolId)} aria-describedby={errors.schoolId ? "sports-school-error" : undefined} />
        <ComboboxContent><ComboboxEmpty>No schools match your search.</ComboboxEmpty><ComboboxList>{(item: SportsSchool) => <ComboboxItem key={item.id} value={item}><span className="school-option"><span>{item.name}</span><small>{item.lga} · {item.level}</small></span></ComboboxItem>}</ComboboxList></ComboboxContent>
      </Combobox>
      {errors.schoolId && <FieldError id="sports-school-error">{errors.schoolId}</FieldError>}
    </Field>
    <dl className="school-facts"><div><dt>LGEA</dt><dd>{school?.lga ?? "—"}</dd></div><div><dt>School level</dt><dd>{school?.level ?? "—"}</dd></div><div><dt>Location</dt><dd>{school?.location ?? "—"}</dd></div></dl>
    <Field data-invalid={Boolean(errors.lineId)}>
      <FieldLabel htmlFor="sports-equipment">Equipment item</FieldLabel>
      <Combobox items={equipment} value={selectedItem} disabled={disabled} onValueChange={(value) => onChange({ ...draft, lineId: value?.id ?? null })} itemToStringLabel={(value: SportsLine) => `${value.activityType} · ${value.description}`} itemToStringValue={(value: SportsLine) => String(value.id)} isItemEqualToValue={(a, b) => a.id === b.id}>
        <ComboboxInput id="sports-equipment" className="w-full" placeholder="Choose from your equipment budget…" disabled={disabled} showClear aria-invalid={Boolean(errors.lineId)} aria-describedby={errors.lineId ? "sports-equipment-error" : undefined} />
        <ComboboxContent><ComboboxEmpty>No equipment matches your search.</ComboboxEmpty><ComboboxList>{(item: SportsLine) => <ComboboxItem key={item.id} value={item} disabled={remaining(item) < 1}><span className="school-option"><span>{item.description}</span><small>{item.activityType} · {remaining(item).toLocaleString()} available</small></span></ComboboxItem>}</ComboboxList></ComboboxContent>
      </Combobox>
      {errors.lineId && <FieldError id="sports-equipment-error">{errors.lineId}</FieldError>}
    </Field>
    <Field data-invalid={Boolean(errors.quantity)}>
      <div className="construction-label-row"><FieldLabel htmlFor="allocation-quantity">Quantity for this school</FieldLabel>{selectedItem && <span className="sports-available">{remaining(selectedItem).toLocaleString()} available</span>}</div>
      <Input id="allocation-quantity" type="number" inputMode="numeric" min={1} max={selectedItem ? remaining(selectedItem) : 1000000} step={1} value={draft.quantity} onChange={(event) => onChange({ ...draft, quantity: event.target.value })} aria-invalid={Boolean(errors.quantity)} aria-describedby={errors.quantity ? "allocation-quantity-error" : undefined} />
      {errors.quantity && <FieldError id="allocation-quantity-error">{errors.quantity}</FieldError>}
    </Field>
    <Separator />
    <FieldGroup className="field-columns">
      <Field data-invalid={Boolean(errors.longitude)}><FieldLabel htmlFor="sports-longitude">Longitude <span className="text-muted-foreground">(optional)</span></FieldLabel><Input id="sports-longitude" type="number" inputMode="decimal" min={-180} max={180} step="any" placeholder="e.g. 11.04" value={draft.longitude} onChange={(event) => onChange({ ...draft, longitude: event.target.value })} aria-invalid={Boolean(errors.longitude)} aria-describedby={errors.longitude ? "sports-longitude-error" : undefined} />{errors.longitude && <FieldError id="sports-longitude-error">{errors.longitude}</FieldError>}</Field>
      <Field data-invalid={Boolean(errors.latitude)}><FieldLabel htmlFor="sports-latitude">Latitude <span className="text-muted-foreground">(optional)</span></FieldLabel><Input id="sports-latitude" type="number" inputMode="decimal" min={-90} max={90} step="any" placeholder="e.g. 12.87" value={draft.latitude} onChange={(event) => onChange({ ...draft, latitude: event.target.value })} aria-invalid={Boolean(errors.latitude)} aria-describedby={errors.latitude ? "sports-latitude-error" : undefined} />{errors.latitude && <FieldError id="sports-latitude-error">{errors.latitude}</FieldError>}</Field>
    </FieldGroup>
  </FieldGroup> : <Empty><EmptyHeader><EmptyMedia variant="icon"><PackageIcon /></EmptyMedia><EmptyTitle>Add equipment first</EmptyTitle><EmptyDescription>Saved equipment items will be available to allocate to schools here.</EmptyDescription></EmptyHeader></Empty>;
}
