"use client";

import { useState } from "react";
import { SchoolLevelFilter, allLevels, filterByLevel, type SchoolLevelChoice } from "@/components/school-level-filter";
import { CurrencyInput } from "@/components/currency-input";
import { SportsSectionSelect } from "@/components/sports-section-select";
import { Combobox, ComboboxContent, ComboboxEmpty, ComboboxInput, ComboboxItem, ComboboxList } from "@/components/ui/combobox";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { EmptySportsFieldArt } from "@/components/empty-art/sports";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { LineDatesField } from "@/components/line-dates";
import { keepDatesInWindow } from "@/lib/line-dates";
import { QuarterTimeline } from "@/components/quarter-timeline";
import { debateActivity, equipmentSports, findSport, isOtherSubActivity, isPheTraining, pheTrainingActivity, maxEquipmentSports, sportsCatalog, sportsLineTotal, sportsMoney, sportsSections, sportsSubActivities, type SportsPlan, type SportsSchool, type SportsSection, type SportsLine } from "@/lib/sports";

export type BudgetDraft = { id?: number; section: SportsSection; activityType: string; description: string; quantity: string; unitCost: string; quarters: number[]; startDate: string | null; dueDate: string | null };
export type AllocationDraft = { id?: number; schoolId: number | null; lineId: number | null; quantity: string; longitude: string; latitude: string };
export type FormErrors = Record<string, string>;
/** The page fills a new line's timeline with the plan's quarters (planQuarters in lib/line-quarters.ts). */
export const emptyBudget: BudgetDraft = { section: "equipment", activityType: "", description: "", quantity: "1", unitCost: "", quarters: [], startDate: null, dueDate: null };
export const emptyAllocation: AllocationDraft = { schoolId: null, lineId: null, quantity: "1", longitude: "", latitude: "" };

const otherChoice = "__other__";
/**
 * A listed value or "Others (specify)" with a text box, like the other components' lists (UBEC144/158). The typed name is
 * stored as the value; `allowOther` false (the sport limit reached) leaves only the listed values.
 */
function PickOrOther({ id, options, value, onChange, allowOther, isDisabled, placeholder, otherPlaceholder, error, disabled }: {
  id: string; options: readonly string[]; value: string; onChange: (value: string) => void; allowOther: boolean; isDisabled?: (item: string) => boolean;
  placeholder: string; otherPlaceholder: string; error?: string; disabled: boolean;
}) {
  const entered = value.trim();
  const listed = options.find((item) => item.toLowerCase() === entered.toLowerCase());
  const [other, setOther] = useState(Boolean(entered) && !listed);
  const showOther = other || (Boolean(entered) && !listed);
  return <>
    <Select value={showOther ? otherChoice : listed ?? ""} onValueChange={(next) => { setOther(next === otherChoice); onChange(next === otherChoice ? "" : next); }} disabled={disabled}>
      <SelectTrigger id={id} className="w-full" aria-invalid={Boolean(error) && !showOther} aria-describedby={error ? `${id}-error` : undefined}><SelectValue placeholder={placeholder}>{showOther ? "Others (specify)" : listed}</SelectValue></SelectTrigger>
      <SelectContent position="popper" align="start" className="w-(--radix-select-trigger-width)"><SelectGroup>
        {options.map((item) => <SelectItem key={item} value={item} disabled={isDisabled?.(item)}>{item}</SelectItem>)}
        {allowOther && <SelectItem value={otherChoice}>Others (specify)</SelectItem>}
      </SelectGroup></SelectContent>
    </Select>
    {showOther && <Input id={`${id}-other`} aria-label={otherPlaceholder} autoFocus maxLength={160} placeholder={otherPlaceholder} value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)} aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-error` : undefined} />}
  </>;
}

export function SportsBudgetFields({ draft, onChange, plan, errors, disabled, planQuarters, implementationYear }: {
  draft: BudgetDraft; onChange: (value: BudgetDraft) => void; plan: SportsPlan; errors: FormErrors; disabled: boolean;
  /** The action plan's quarters: the only ones the timeline may use. */
  planQuarters: readonly number[];
  /** The plan's implementation year: the start and due dates fall in it, within the timeline. */
  implementationYear?: number | null;
}) {
  const section = sportsSections.find((item) => item.id === draft.section)!;
  const allocated = draft.id ? plan.allocations.filter((allocation) => allocation.lineId === draft.id).reduce((sum, allocation) => sum + allocation.quantity, 0) : 0;
  const locked = disabled || Boolean(allocated);
  const usedSports = equipmentSports(plan.lines, draft.id);
  const training = isPheTraining(draft);
  const sportLimitReached = usedSports.length >= maxEquipmentSports;
  const sportNames = [...new Set([...usedSports, ...sportsCatalog.map((sport) => sport.name)].map((name) => findSport(name)?.name ?? name))];
  const sport = findSport(draft.activityType);
  const sportItems = [...new Set([...(sport?.items ?? []), ...plan.lines.filter((line) => line.section === "equipment" && line.activityType.trim().toLowerCase() === draft.activityType.trim().toLowerCase()).map((line) => line.description)])];
  const subActivities = draft.section === "competitions" || draft.section === "publicity" || draft.section === "supervision" ? sportsSubActivities[draft.section] : [];
  const legacyType = subActivities.length && draft.activityType && !subActivities.some((item) => item.name === draft.activityType) ? draft.activityType : "";
  const total = sportsLineTotal({ quantity: Number(draft.quantity) || 0, unitCost: Number(draft.unitCost) || 0 });
  const setText = (field: "activityType" | "description") => (value: string) => onChange({ ...draft, [field]: value });
  return <FieldGroup className="gap-6">
    <Field data-disabled={locked}>
      <FieldLabel htmlFor="sports-section">Budget section</FieldLabel>
      <SportsSectionSelect id="sports-section" value={draft.section} disabled={locked} onValueChange={(value) => onChange({ ...draft, section: value, activityType: value === "debate" ? debateActivity : "", description: "" })} />
    </Field>
    {draft.section === "equipment" && <Field data-disabled={locked}>
      <FieldLabel id="sports-kind-label">Type of item</FieldLabel>
      <ToggleGroup type="single" variant="outline" spacing={2} className="sports-kind" aria-labelledby="sports-kind-label" disabled={locked} value={training ? "training" : "procurement"}
        onValueChange={(value) => { if (value) onChange({ ...draft, activityType: value === "training" ? pheTrainingActivity : "", description: "" }); }}>
        <ToggleGroupItem value="procurement">Procurement of PHE equipment</ToggleGroupItem>
        <ToggleGroupItem value="training">Training of PHE Officers</ToggleGroupItem>
      </ToggleGroup>
    </Field>}
    {draft.section === "equipment" && !training && <Field data-invalid={Boolean(errors.activityType)} data-disabled={locked}>
      <div className="construction-label-row"><FieldLabel htmlFor="sports-type">Sport</FieldLabel><span className="sports-available">{usedSports.length} of {maxEquipmentSports} sports selected</span></div>
      <PickOrOther key={draft.id ?? "new"} id="sports-type" options={sportNames} value={draft.activityType} onChange={(value) => onChange({ ...draft, activityType: value, description: "" })} allowOther={!sportLimitReached} disabled={locked}
        isDisabled={(name) => sportLimitReached && !usedSports.some((used) => used.toLowerCase() === name.toLowerCase())} placeholder="Choose a sport" otherPlaceholder="Enter the sport" error={errors.activityType} />
      <FieldDescription>{sportLimitReached ? `You have selected ${maxEquipmentSports} sports. Add items to one of them.` : `Select up to ${maxEquipmentSports} sports, then add the equipment needed for each. Not in the list? Choose Others (specify).`}</FieldDescription>
      {errors.activityType && <FieldError id="sports-type-error">{errors.activityType}</FieldError>}
    </Field>}
    {subActivities.length > 0 && <Field data-invalid={Boolean(errors.activityType)} data-disabled={locked}>
      <FieldLabel htmlFor="sports-type">{section.typeLabel}</FieldLabel>
      <Select value={draft.activityType || undefined} onValueChange={setText("activityType")} disabled={locked}>
        <SelectTrigger id="sports-type" className="w-full" aria-invalid={Boolean(errors.activityType)} aria-describedby={errors.activityType ? "sports-type-error" : undefined}><SelectValue placeholder={section.placeholder}>{draft.activityType}</SelectValue></SelectTrigger>
        <SelectContent position="popper" align="start" className="w-(--radix-select-trigger-width)"><SelectGroup>
          {legacyType && <SelectItem value={legacyType}>{legacyType}</SelectItem>}
          {subActivities.map((item) => <SelectItem key={item.name} value={item.name} textValue={item.name}>{item.name}{item.share !== undefined && <span className="ml-auto text-muted-foreground tabular-nums">{item.share}%</span>}</SelectItem>)}
        </SelectGroup></SelectContent>
      </Select>
      {draft.section === "competitions" && <FieldDescription>{section.label} may use up to {section.share}% of the sports budget. Each sub-activity may use up to the share beside it of that amount.</FieldDescription>}
      {isOtherSubActivity(draft.activityType) && <FieldDescription>For an activity that is not in the list. Name it in the description below.</FieldDescription>}
      {errors.activityType && <FieldError id="sports-type-error">{errors.activityType}</FieldError>}
    </Field>}
    <Separator />
    <Field data-invalid={Boolean(errors.description)}>
      <FieldLabel htmlFor="sports-description">{training ? "Description" : section.itemLabel}</FieldLabel>
      {draft.section === "equipment" && !training
        ? <PickOrOther key={`${draft.id ?? "new"}-${draft.activityType}`} id="sports-description" options={sportItems} value={draft.description} onChange={setText("description")} allowOther disabled={disabled || !draft.activityType.trim()}
          placeholder={draft.activityType.trim() ? "Choose an item" : "Choose a sport first"} otherPlaceholder="Enter the item" error={errors.description} />
        : <Input id="sports-description" value={draft.description} maxLength={1000} placeholder="Enter a description" onChange={(event) => onChange({ ...draft, description: event.target.value })} aria-invalid={Boolean(errors.description)} aria-describedby={errors.description ? "sports-description-error" : undefined} />}
      {draft.section === "equipment" && !training && draft.activityType.trim() && <FieldDescription>Not in the list? Choose Others (specify).</FieldDescription>}
      {training && <FieldDescription>Describe the training, e.g. who is trained and for how long</FieldDescription>}
      {errors.description && <FieldError id="sports-description-error">{errors.description}</FieldError>}
    </Field>
    <FieldGroup className="field-columns">
      <Field data-invalid={Boolean(errors.quantity)}>
        <FieldLabel htmlFor="sports-quantity">Qty</FieldLabel>
        <Input id="sports-quantity" type="number" inputMode="numeric" min={Math.max(1, allocated)} max={1000000} step={1} value={draft.quantity} onChange={(event) => onChange({ ...draft, quantity: event.target.value })} aria-invalid={Boolean(errors.quantity)} aria-describedby={errors.quantity ? "sports-quantity-error" : undefined} />
        {errors.quantity && <FieldError id="sports-quantity-error">{errors.quantity}</FieldError>}
      </Field>
      <Field data-invalid={Boolean(errors.unitCost)}>
        <FieldLabel htmlFor="sports-unit-cost">Unit cost (NGN)</FieldLabel>
        <CurrencyInput id="sports-unit-cost" placeholder="0.00" value={draft.unitCost} onValueChange={(unitCost) => onChange({ ...draft, unitCost })} aria-invalid={Boolean(errors.unitCost)} aria-describedby={errors.unitCost ? "sports-unit-cost-error" : undefined} />
        {errors.unitCost && <FieldError id="sports-unit-cost-error">{errors.unitCost}</FieldError>}
      </Field>
    </FieldGroup>
    <Field>
      <FieldLabel htmlFor="sports-total-cost">Total cost (NGN)</FieldLabel>
      <Input id="sports-total-cost" readOnly tabIndex={-1} value={sportsMoney.format(Number.isFinite(total) ? total : 0)} className="tabular-nums" />
    </Field>
    <QuarterTimeline id="sports-quarters" size="compact" required help="The quarters in which this item will be implemented. Only this plan's quarters can be chosen." value={draft.quarters} onChange={(quarters) => onChange({ ...draft, quarters, ...keepDatesInWindow(draft, quarters, implementationYear) })} available={planQuarters} disabled={disabled} error={errors.quarters} selectAll={planQuarters.length > 1} />
    <LineDatesField id="sports-dates" value={{ startDate: draft.startDate, dueDate: draft.dueDate }} onChange={(dates) => onChange({ ...draft, ...dates })} quarters={draft.quarters} year={implementationYear} disabled={disabled} error={errors.startDate} revealMissing />
    {allocated > 0 && <p className="construction-summary">{allocated} items allocated to schools. The sport and section are locked while allocations exist.</p>}
  </FieldGroup>;
}

export function SportsAllocationFields({ draft, onChange, plan, errors, disabled }: {
  draft: AllocationDraft; onChange: (value: AllocationDraft) => void; plan: SportsPlan; errors: FormErrors; disabled: boolean;
}) {
  // Training of PHE Officers is not an equipment item for schools (UBEC121).
  const equipment = plan.lines.filter((line) => line.section === "equipment" && !isPheTraining(line));
  const [schoolLevel, setSchoolLevel] = useState<SchoolLevelChoice>(allLevels);
  const school = plan.schools.find((item) => item.id === draft.schoolId) ?? null;
  const selectedItem = equipment.find((item) => item.id === draft.lineId) ?? null;
  const remaining = (line: SportsLine) => line.quantity - plan.allocations.filter((item) => item.lineId === line.id && item.id !== draft.id).reduce((sum, item) => sum + item.quantity, 0);
  return equipment.length ? <FieldGroup className="gap-6">
    <Field data-invalid={Boolean(errors.schoolId)}>
      <FieldLabel htmlFor="sports-school">School name</FieldLabel>
      <SchoolLevelFilter schools={plan.schools} value={schoolLevel} disabled={disabled} onChange={setSchoolLevel} />
      <Combobox items={filterByLevel(plan.schools, schoolLevel)} value={school} disabled={disabled} onValueChange={(value) => onChange({ ...draft, schoolId: value?.id ?? null })} itemToStringLabel={(value: SportsSchool) => value.name} itemToStringValue={(value: SportsSchool) => String(value.id)} isItemEqualToValue={(a, b) => a.id === b.id}>
        <ComboboxInput id="sports-school" className="w-full" placeholder="Search by school name…" disabled={disabled} showClear aria-invalid={Boolean(errors.schoolId)} aria-describedby={errors.schoolId ? "sports-school-error" : undefined} />
        <ComboboxContent><ComboboxEmpty>No schools match your search</ComboboxEmpty><ComboboxList>{(item: SportsSchool) => <ComboboxItem key={item.id} value={item}><span className="school-option"><span>{item.name}</span><small>{item.lga} · {item.level}</small></span></ComboboxItem>}</ComboboxList></ComboboxContent>
      </Combobox>
      {errors.schoolId && <FieldError id="sports-school-error">{errors.schoolId}</FieldError>}
    </Field>
    <dl className="school-facts"><div><dt>LGEA</dt><dd>{school?.lga ?? "—"}</dd></div><div><dt>School level</dt><dd>{school?.level ?? "—"}</dd></div><div><dt>Location</dt><dd>{school?.location ?? "—"}</dd></div></dl>
    <Field data-invalid={Boolean(errors.lineId)}>
      <FieldLabel htmlFor="sports-equipment">Equipment item</FieldLabel>
      <Combobox items={equipment} value={selectedItem} disabled={disabled} onValueChange={(value) => onChange({ ...draft, lineId: value?.id ?? null })} itemToStringLabel={(value: SportsLine) => `${value.activityType} · ${value.description}`} itemToStringValue={(value: SportsLine) => String(value.id)} isItemEqualToValue={(a, b) => a.id === b.id}>
        <ComboboxInput id="sports-equipment" className="w-full" placeholder="Choose from your equipment budget…" disabled={disabled} showClear aria-invalid={Boolean(errors.lineId)} aria-describedby={errors.lineId ? "sports-equipment-error" : undefined} />
        <ComboboxContent><ComboboxEmpty>No equipment matches your search</ComboboxEmpty><ComboboxList>{(item: SportsLine) => <ComboboxItem key={item.id} value={item} disabled={remaining(item) < 1}><span className="school-option"><span>{item.description}</span><small>{item.activityType} · {remaining(item).toLocaleString()} available</small></span></ComboboxItem>}</ComboboxList></ComboboxContent>
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
  </FieldGroup> : <Empty><EmptyHeader><EmptyMedia><EmptySportsFieldArt label="No equipment saved yet" badge={false} /></EmptyMedia><EmptyTitle>Add equipment first</EmptyTitle></EmptyHeader></Empty>;
}
