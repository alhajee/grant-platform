"use client";

import { FormEvent, useRef, useState } from "react";
import { PlusIcon, XIcon } from "lucide-react";
import { toast } from "sonner";
import { CurrencyInput } from "@/components/currency-input";
import { Button } from "@/components/ui/button";
import { Combobox, ComboboxContent, ComboboxEmpty, ComboboxInput, ComboboxItem, ComboboxList } from "@/components/ui/combobox";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverDescription, PopoverHeader, PopoverTitle, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/spinner";
import { constructionTypeName, constructionTypeSchema, matchesRoomCounts, roomFields, type ConstructionType, type RoomCounts, type RoomKey } from "@/lib/construction-types";
import { useIsMobile } from "@/hooks/use-mobile";

const initialCounts: Record<RoomKey, string> = { classrooms: "0", playroomsLabs: "0", libraries: "0", toilets: "0", officesStores: "0" };
const money = new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN" });

export function ConstructionTypePicker({ types, value, onSelect, onCreated, disabled, error }: {
  types: ConstructionType[];
  value: ConstructionType | null;
  onSelect: (type: ConstructionType | null) => void;
  onCreated: (type: ConstructionType) => void;
  disabled: boolean;
  error: string;
}) {
  const [open, setOpen] = useState(false);
  const mobile = useIsMobile();
  const [counts, setCounts] = useState(initialCounts);
  const [duration, setDuration] = useState("");
  const [unitCost, setUnitCost] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [conflict, setConflict] = useState<ConstructionType | null>(null);
  const firstInput = useRef<HTMLInputElement>(null);
  const savingRef = useRef(false);
  const numericCounts = Object.fromEntries(roomFields.map(({ key }) => [key, Number(counts[key])])) as RoomCounts;
  const summary = constructionTypeName(numericCounts);
  const duplicate = conflict ?? types.find((type) => matchesRoomCounts(type, numericCounts));

  function reset() {
    setCounts(initialCounts); setDuration(""); setUnitCost(""); setFormError(""); setFieldErrors({}); setConflict(null);
  }

  function choose(type: ConstructionType) {
    onCreated(type); setOpen(false); reset();
  }

  async function createType(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    event.stopPropagation(); // The popover is portalled out of the school form.
    if (savingRef.current) return;
    if (duplicate) { choose(duplicate); return; }
    const parsed = constructionTypeSchema.safeParse({ ...numericCounts, duration: Number(duration), unitCost: Number(unitCost) });
    if (!parsed.success) {
      const errors = Object.fromEntries(parsed.error.issues.map((issue) => [String(issue.path[0]), issue.message]));
      setFieldErrors(errors);
      document.getElementById(`new-type-${parsed.error.issues[0].path[0]}`)?.focus();
      return;
    }
    savingRef.current = true; setSaving(true); setFormError(""); setFieldErrors({});
    try {
      const response = await fetch("/api/construction-types", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(parsed.data) });
      const payload = await response.json() as { constructionType?: ConstructionType; error?: string };
      if (response.status === 409 && payload.constructionType) { setConflict(payload.constructionType); return; }
      if (!response.ok || !payload.constructionType) throw new Error(payload.error ?? "Could not save this construction type.");
      choose(payload.constructionType);
      toast.success("Construction type saved and selected.");
    } catch (cause) { setFormError(cause instanceof Error ? cause.message : "Could not save this construction type. Please try again."); }
    finally { savingRef.current = false; setSaving(false); }
  }

  return (
    <Field data-invalid={Boolean(error)} data-disabled={disabled}>
      <Popover open={open} onOpenChange={(next) => { if (!saving) setOpen(next); }}>
        <div className="construction-label-row">
          <FieldLabel htmlFor="construction-type">Construction type</FieldLabel>
          <PopoverTrigger asChild><Button type="button" variant="ghost" size="sm" disabled={disabled}><PlusIcon data-icon="inline-start" />Create new</Button></PopoverTrigger>
        </div>
        <Combobox items={types} value={value} onValueChange={onSelect} disabled={disabled}
          itemToStringLabel={(type: ConstructionType) => type.name} itemToStringValue={(type: ConstructionType) => type.id} isItemEqualToValue={(a, b) => a.id === b.id}>
          <ComboboxInput id="construction-type" className="w-full" placeholder="Search saved construction types…" disabled={disabled} showClear aria-invalid={Boolean(error)} aria-describedby={error ? "construction-type-error" : undefined} />
          <ComboboxContent><ComboboxEmpty>No matching type. Use “Create new” to add one.</ComboboxEmpty><ComboboxList>{(type: ConstructionType) => (
            <ComboboxItem key={type.id} value={type}><span className="construction-option"><span>{type.name}</span><small>{type.duration} weeks · {money.format(type.unitCost)}{type.classrooms === null ? " · Previously saved" : ""}</small></span></ComboboxItem>
          )}</ComboboxList></ComboboxContent>
        </Combobox>
        {error && <FieldError id="construction-type-error">{error}</FieldError>}
        <PopoverContent side={mobile ? "bottom" : "right"} align={mobile ? "end" : "start"} sideOffset={12} collisionPadding={12} className="construction-popover w-[400px] max-w-[calc(100vw-24px)]" aria-labelledby="new-type-title"
          onOpenAutoFocus={(event) => { event.preventDefault(); firstInput.current?.focus(); }}>
          <form onSubmit={createType} noValidate className="flex flex-col gap-5">
            <PopoverHeader><div className="flex items-center justify-between gap-3"><PopoverTitle id="new-type-title">Create construction type</PopoverTitle><Button type="button" variant="ghost" size="icon-sm" disabled={saving} aria-label="Close construction type" onClick={() => setOpen(false)}><XIcon /></Button></div></PopoverHeader>
            <FieldGroup className="grid grid-cols-2 gap-4">
              {roomFields.map(({ key, label }, index) => <Field key={key} data-invalid={Boolean(fieldErrors[key])}>
                <FieldLabel htmlFor={`new-type-${key}`}>{label}</FieldLabel>
                <Input ref={index === 0 ? firstInput : undefined} id={`new-type-${key}`} type="number" inputMode="numeric" min="0" max="1000" step="1" value={counts[key]} disabled={saving} aria-invalid={Boolean(fieldErrors[key])} aria-describedby={fieldErrors[key] ? `new-type-${key}-error` : undefined}
                  onChange={(event) => { setCounts((current) => ({ ...current, [key]: event.target.value })); setConflict(null); setFieldErrors({}); }} />
                {fieldErrors[key] && <FieldError id={`new-type-${key}-error`}>{fieldErrors[key]}</FieldError>}
              </Field>)}
            </FieldGroup>
            {summary && <p className="construction-summary" aria-live="polite">{summary}</p>}
            <Separator />
            {duplicate ? <div className="flex flex-col gap-3"><p className="text-sm">This type is already saved.</p><p className="text-sm text-muted-foreground">{duplicate.duration} weeks · {money.format(duplicate.unitCost)}</p><Button type="button" onClick={() => choose(duplicate)}>Use existing type</Button></div> : <>
              <FieldGroup className="grid grid-cols-2 gap-4">
                <Field data-invalid={Boolean(fieldErrors.duration)}><FieldLabel htmlFor="new-type-duration">Duration (weeks)</FieldLabel><Input id="new-type-duration" type="number" inputMode="numeric" min="1" max="520" step="1" placeholder="e.g. 20" value={duration} disabled={saving} aria-invalid={Boolean(fieldErrors.duration)} onChange={(event) => setDuration(event.target.value)} />{fieldErrors.duration && <FieldError>{fieldErrors.duration}</FieldError>}</Field>
                <Field data-invalid={Boolean(fieldErrors.unitCost)}><FieldLabel htmlFor="new-type-unitCost">Unit cost (₦)</FieldLabel><CurrencyInput id="new-type-unitCost" placeholder="e.g. 30,000,000.00" value={unitCost} disabled={saving} aria-invalid={Boolean(fieldErrors.unitCost)} aria-describedby={fieldErrors.unitCost ? "new-type-unitCost-error" : undefined} onValueChange={setUnitCost} />{fieldErrors.unitCost && <FieldError id="new-type-unitCost-error">{fieldErrors.unitCost}</FieldError>}</Field>
              </FieldGroup>
              {formError && <FieldError role="alert">{formError}</FieldError>}
              <div className="flex justify-end gap-2"><Button type="button" variant="outline" disabled={saving} onClick={() => { setOpen(false); reset(); }}>Cancel</Button><Button type="submit" disabled={saving || disabled} aria-busy={saving}>{saving && <Spinner data-icon="inline-start" />}{saving ? "Saving…" : "Create & use type"}</Button></div>
            </>}
          </form>
        </PopoverContent>
      </Popover>
    </Field>
  );
}

export function SchoolProjectDefaults({ type, override, onChange, disabled }: {
  type: ConstructionType;
  override: { duration: number; unitCost: number } | null;
  onChange: (value: { duration: number; unitCost: number } | null) => void;
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [duration, setDuration] = useState("");
  const [unitCost, setUnitCost] = useState("");
  const [error, setError] = useState("");
  const values = override ?? type;
  const adjusted = override && (override.duration !== type.duration || override.unitCost !== type.unitCost);

  function apply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); event.stopPropagation();
    const parsed = constructionTypeSchema.innerType().pick({ duration: true, unitCost: true }).safeParse({ duration: Number(duration), unitCost: Number(unitCost) });
    if (!parsed.success) { setError("Enter a positive unit cost (up to two decimals) and a duration of 1–520 whole weeks."); return; }
    onChange(parsed.data.duration === type.duration && parsed.data.unitCost === type.unitCost ? null : parsed.data);
    setOpen(false);
  }

  return <div className="construction-defaults">
    <div className="project-facts"><span>Duration <strong>{values.duration} weeks</strong></span><span>Unit cost <strong>{money.format(values.unitCost)}</strong></span></div>
    <Popover open={open} onOpenChange={(next) => { if (next) { setDuration(String(values.duration)); setUnitCost(String(values.unitCost)); setError(""); } setOpen(next); }}>
      <PopoverTrigger asChild><Button type="button" size="sm" variant="ghost" disabled={disabled}>{adjusted ? "School-specific values" : "Adjust for this school"}</Button></PopoverTrigger>
      <PopoverContent align="start" className="construction-popover w-[360px] max-w-[calc(100vw-24px)]" aria-labelledby="school-defaults-title">
        <form onSubmit={apply} noValidate className="flex flex-col gap-4">
          <PopoverHeader><PopoverTitle id="school-defaults-title">Adjust for this school</PopoverTitle><PopoverDescription>Only this school project changes. The saved type stays the same.</PopoverDescription></PopoverHeader>
          <FieldGroup className="gap-4">
            <Field><FieldLabel htmlFor="school-duration">Duration (weeks)</FieldLabel><Input id="school-duration" type="number" min="1" max="520" step="1" value={duration} onChange={(event) => setDuration(event.target.value)} /></Field>
            <Field><FieldLabel htmlFor="school-unit-cost">Unit cost (₦)</FieldLabel><CurrencyInput id="school-unit-cost" value={unitCost} onValueChange={setUnitCost} /></Field>
          </FieldGroup>
          {error && <FieldError role="alert">{error}</FieldError>}
          <div className="flex flex-wrap items-center justify-between gap-2"><Button type="button" variant="ghost" onClick={() => { onChange(null); setOpen(false); }}>Use defaults</Button><Button type="submit">Apply to school</Button></div>
        </form>
      </PopoverContent>
    </Popover>
  </div>;
}
