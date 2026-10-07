"use client";

import { CurrencyInput } from "@/components/currency-input";
import { SportsSectionSelect } from "@/components/sports-section-select";
import { Combobox, ComboboxContent, ComboboxEmpty, ComboboxInput, ComboboxItem, ComboboxList } from "@/components/ui/combobox";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { EmptySportsFieldArt } from "@/components/empty-art/sports";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { QuarterTimeline } from "@/components/quarter-timeline";
import { equipmentSports, findSport, isOtherSubActivity, maxEquipmentSports, sportsCatalog, sportsLineTotal, sportsMoney, sportsSections, sportsSubActivities, supervisionActivity, type SportsPlan, type SportsSchool, type SportsSection, type SportsLine } from "@/lib/sports";

export type BudgetDraft = { id?: number; section: SportsSection; activityType: string; description: string; quantity: string; unitCost: string; quarters: number[] };
export type AllocationDraft = { id?: number; schoolId: number | null; lineId: number | null; quantity: string; longitude: string; latitude: string };
export type FormErrors = Record<string, string>;
/** The page fills a new line's timeline with the plan's quarters (planQuarters in lib/line-quarters.ts). */
export const emptyBudget: BudgetDraft = { section: "equipment", activityType: "", description: "", quantity: "1", unitCost: "", quarters: [] };
export const emptyAllocation: AllocationDraft = { schoolId: null, lineId: null, quantity: "1", longitude: "", latitude: "" };

// "Select and type": pick a listed value or, when allowed, type your own.
function SelectOrType({ id, items, value, onChange, allowCustom, isDisabled, placeholder, emptyText, error, disabled, describe }: {
  id: string; items: readonly string[]; value: string; onChange: (value: string) => void; allowCustom: boolean; isDisabled?: (item: string) => boolean;
  placeholder: string; emptyText: string; error?: string; disabled: boolean; describe?: (item: string) => string | undefined;
}) {
  const entered = value.trim();
  const listed = items.find((item) => item.toLowerCase() === entered.toLowerCase());
  const options = allowCustom && entered && !listed ? [...items, entered] : [...items];
  return <Combobox items={options} value={listed ?? (entered || null)} inputValue={value} disabled={disabled}
    onInputValueChange={(next, details) => { if (details.reason === "input-change" || details.reason === "input-clear") onChange(next); }}
    onValueChange={(next) => onChange(next ?? "")}>
    <ComboboxInput id={id} className="w-full" placeholder={placeholder} maxLength={160} disabled={disabled} showClear aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-error` : undefined} />
    <ComboboxContent><ComboboxEmpty>{emptyText}</ComboboxEmpty><ComboboxList>{(item: string) => <ComboboxItem key={item} value={item} disabled={isDisabled?.(item)}>{items.includes(item) ? describe?.(item) ? <span className="school-option"><span>{item}</span><small>{describe(item)}</small></span> : item : `Use “${item}”`}</ComboboxItem>}</ComboboxList></ComboboxContent>
  </Combobox>;
}

export function SportsBudgetFields({ draft, onChange, plan, errors, disabled, planQuarters }: {
  draft: BudgetDraft; onChange: (value: BudgetDraft) => void; plan: SportsPlan; errors: FormErrors; disabled: boolean;
  /** The action plan's quarters: the only ones the timeline may use. */
  planQuarters: readonly number[];
}) {
  const section = sportsSections.find((item) => item.id === draft.section)!;
  const allocated = draft.id ? plan.allocations.filter((allocation) => allocation.lineId === draft.id).reduce((sum, allocation) => sum + allocation.quantity, 0) : 0;
  const locked = disabled || Boolean(allocated);
  const usedSports = equipmentSports(plan.lines, draft.id);
  const sportLimitReached = usedSports.length >= maxEquipmentSports;
  const sportNames = [...new Set([...usedSports, ...sportsCatalog.map((sport) => sport.name)].map((name) => findSport(name)?.name ?? name))];
  const sport = findSport(draft.activityType);
  const sportItems = [...new Set([...(sport?.items ?? []), ...plan.lines.filter((line) => line.section === "equipment" && line.activityType.trim().toLowerCase() === draft.activityType.trim().toLowerCase()).map((line) => line.description)])];
  const subActivities = draft.section === "competitions" || draft.section === "publicity" ? sportsSubActivities[draft.section] : [];
  const legacyType = subActivities.length && draft.activityType && !subActivities.some((item) => item.name === draft.activityType) ? draft.activityType : "";
  const total = sportsLineTotal({ quantity: Number(draft.quantity) || 0, unitCost: Number(draft.unitCost) || 0 });
  const setText = (field: "activityType" | "description") => (value: string) => onChange({ ...draft, [field]: value });
  return <FieldGroup className="gap-6">
    <Field data-disabled={locked}>
      <FieldLabel htmlFor="sports-section">Budget section</FieldLabel>
      <SportsSectionSelect id="sports-section" value={draft.section} disabled={locked} onValueChange={(value) => onChange({ ...draft, section: value, activityType: value === "supervision" ? supervisionActivity : "", description: "" })} />
    </Field>
    {draft.section === "equipment" && <Field data-invalid={Boolean(errors.activityType)} data-disabled={locked}>
      <div className="construction-label-row"><FieldLabel htmlFor="sports-type">Sport</FieldLabel><span className="sports-available">{usedSports.length} of {maxEquipmentSports} sports selected</span></div>
      <SelectOrType id="sports-type" items={sportNames} value={draft.activityType} onChange={(value) => onChange({ ...draft, activityType: value, description: "" })} allowCustom={!sportLimitReached} disabled={locked}
        isDisabled={(name) => sportLimitReached && !usedSports.some((used) => used.toLowerCase() === name.toLowerCase())} placeholder={section.placeholder}
        emptyText={sportLimitReached ? `You have selected ${maxEquipmentSports} sports. Add items to one of them.` : "Others: type the sport's name to add it."} error={errors.activityType} />
      <FieldDescription>Select up to {maxEquipmentSports} sports, then add the equipment needed for each. Not in the list? Type the sport&apos;s name.</FieldDescription>
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
      {draft.section === "competitions" && <FieldDescription>Shares show UBEC&apos;s indicative split of the competitions budget. They are guidance only.</FieldDescription>}
      {isOtherSubActivity(draft.activityType) && <FieldDescription>For an activity that is not in the list. Name it in the description below.</FieldDescription>}
      {errors.activityType && <FieldError id="sports-type-error">{errors.activityType}</FieldError>}
    </Field>}
    <Separator />
    <Field data-invalid={Boolean(errors.description)}>
      <FieldLabel htmlFor="sports-description">{section.itemLabel}</FieldLabel>
      {draft.section === "equipment"
        ? <SelectOrType id="sports-description" items={sportItems} value={draft.description} onChange={setText("description")} allowCustom disabled={disabled || !draft.activityType.trim()}
          placeholder={draft.activityType.trim() ? "Choose an item or type another…" : "Choose a sport first"} emptyText="Others: type the item's name to add it." error={errors.description} />
        : <Input id="sports-description" value={draft.description} maxLength={1000} placeholder="Enter a description" onChange={(event) => onChange({ ...draft, description: event.target.value })} aria-invalid={Boolean(errors.description)} aria-describedby={errors.description ? "sports-description-error" : undefined} />}
      {draft.section === "equipment" && draft.activityType.trim() && <FieldDescription>Not in the list? Type the item&apos;s name.</FieldDescription>}
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
    <QuarterTimeline id="sports-quarters" size="compact" required help="The quarters in which this item will be implemented. Only this plan's quarters can be chosen." value={draft.quarters} onChange={(quarters) => onChange({ ...draft, quarters })} available={planQuarters} disabled={disabled} error={errors.quarters} selectAll={planQuarters.length > 1} />
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
  </FieldGroup> : <Empty><EmptyHeader><EmptyMedia><EmptySportsFieldArt label="No equipment saved yet" badge={false} /></EmptyMedia><EmptyTitle>Add equipment first</EmptyTitle></EmptyHeader></Empty>;
}
