"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { PackageIcon, PlusIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Combobox, ComboboxContent, ComboboxEmpty, ComboboxInput, ComboboxItem, ComboboxList } from "@/components/ui/combobox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptySportsFieldArt } from "@/components/empty-art/sports";
import { SchoolFilters, allLevels, allLgas, filterSchools, schoolMatches, type SchoolLevelChoice, type SchoolLgaChoice } from "@/components/school-level-filter";
import { currentPlanHref } from "@/lib/action-plans";
import { nairaFormat } from "@/lib/money-format";
import { postJson } from "@/lib/save-request";
import { isPheTraining, type SportsAllocationSet, type SportsLine, type SportsPlan, type SportsSchool } from "@/lib/sports";
import "./activity-plan-editor.css";

const count = new Intl.NumberFormat("en-NG");
/** UBEC249: the school picked on the Beneficiary schools form and the number of each equipment item it gets (as typed). */
export type SchoolItemsDraft = { schoolId: number | null; quantities: Record<string, string> };
export const emptySchoolItems: SchoolItemsDraft = { schoolId: null, quantities: {} };

/** The equipment items given to schools (Training of PHE Officers is not, UBEC121). */
export const equipmentItems = (plan: SportsPlan): SportsLine[] => plan.lines.filter((line) => line.section === "equipment" && !isPheTraining(line));
const allocatedOf = (plan: SportsPlan, lineId: number, exceptSchool?: number) => plan.allocations.filter((item) => item.lineId === lineId && item.schoolId !== exceptSchool).reduce((sum, item) => sum + item.quantity, 0);
const heldBy = (plan: SportsPlan, lineId: number, schoolId: number) => plan.allocations.find((item) => item.lineId === lineId && item.schoolId === schoolId)?.quantity ?? 0;
const typed = (value: string | undefined) => { const text = (value ?? "").trim(); return text === "" ? 0 : /^\d+$/.test(text) ? Number(text) : NaN; };
const plural = (n: number, word: string) => `${count.format(n)} ${word}${n === 1 ? "" : "s"}`;

/** The form for a school: the items it already has, as saved. */
export function schoolItemsDraft(plan: SportsPlan, schoolId: number | null): SchoolItemsDraft {
  if (!schoolId) return emptySchoolItems;
  return { schoolId, quantities: Object.fromEntries(plan.allocations.filter((item) => item.schoolId === schoolId).map((item) => [String(item.lineId), String(item.quantity)])) };
}

/**
 * The changes the school form makes, checked like the API (whole numbers, at most what is left of each item), or the
 * message per item (`line-<id>`). Unchanged items are left out; a cleared item is sent as 0 (taken off the school).
 */
export function schoolItemsChanges(plan: SportsPlan, draft: SchoolItemsDraft): { rows: SportsAllocationSet; errors: Record<string, string> } {
  const rows: SportsAllocationSet = [], errors: Record<string, string> = {};
  if (!draft.schoolId) return { rows, errors: { schoolId: "Choose a school from the list" } };
  for (const line of equipmentItems(plan)) {
    const value = typed(draft.quantities[String(line.id)]), available = line.quantity - allocatedOf(plan, line.id, draft.schoolId);
    if (!Number.isSafeInteger(value)) errors[`line-${line.id}`] = "Use a whole number of items";
    else if (value > available) errors[`line-${line.id}`] = available > 0 ? `Only ${count.format(available)} available` : "None left: every item is given to other schools";
    else if (value !== heldBy(plan, line.id, draft.schoolId)) rows.push({ lineId: line.id, schoolId: draft.schoolId, quantity: value });
  }
  return { rows, errors };
}

/** Saves several (item, school) quantities in one request (POST /api/sports, action set). Throws the API's message. */
export async function saveSportsAllocations(rows: SportsAllocationSet) {
  const reply = await postJson<{ error?: string; saved?: number; removed?: number }>(currentPlanHref("/api/sports"), { entity: "allocation", action: "set", allocations: rows });
  if (!reply.ok) throw new Error(reply.data.error ?? "The school items could not be saved");
  return reply.data;
}

function SchoolPicker({ id, schools, value, onChange, disabled, placeholder, invalid }: { id: string; schools: readonly SportsSchool[]; value: SportsSchool | null; onChange: (school: SportsSchool | null) => void; disabled: boolean; placeholder: string; invalid?: boolean }) {
  const [level, setLevel] = useState<SchoolLevelChoice>(allLevels), [lga, setLga] = useState<SchoolLgaChoice>(allLgas);
  return <>
    <SchoolFilters schools={schools} level={level} onLevelChange={setLevel} lga={lga} onLgaChange={setLga} disabled={disabled} />
    <Combobox items={filterSchools(schools, level, lga)} filter={(item: SportsSchool, query: string) => schoolMatches(item, query)} value={value} disabled={disabled} onValueChange={(next) => onChange(next ?? null)} itemToStringLabel={(item: SportsSchool) => item.name} itemToStringValue={(item: SportsSchool) => String(item.id)} isItemEqualToValue={(a, b) => a.id === b.id}>
      <ComboboxInput id={id} className="w-full" placeholder={placeholder} disabled={disabled} showClear aria-invalid={invalid || undefined} />
      <ComboboxContent><ComboboxEmpty>No schools match your search</ComboboxEmpty><ComboboxList>{(item: SportsSchool) => <ComboboxItem key={item.id} value={item}><span className="school-option"><span>{item.name}</span><small>{[item.lga, item.level, item.code].filter(Boolean).join(" · ")}</small></span></ComboboxItem>}</ComboboxList></ComboboxContent>
    </Combobox>
  </>;
}

/**
 * UBEC249: a beneficiary school and every equipment item at once, each with its quantity and what is still available,
 * so one save gives the school several items (in place of one item per save).
 */
export function SportsSchoolItemsFields({ plan, draft, onSchool, onChange, errors, disabled }: {
  plan: SportsPlan; draft: SchoolItemsDraft; onSchool: (schoolId: number | null) => void; onChange: (next: SchoolItemsDraft) => void; errors: Record<string, string>; disabled: boolean;
}) {
  const items = equipmentItems(plan);
  const school = plan.schools.find((item) => item.id === draft.schoolId) ?? null;
  if (!items.length) return <Empty><EmptyHeader><EmptyMedia><EmptySportsFieldArt label="No equipment saved yet" badge={false} /></EmptyMedia><EmptyTitle>Add equipment first</EmptyTitle></EmptyHeader></Empty>;
  const available = (line: SportsLine) => line.quantity - allocatedOf(plan, line.id, draft.schoolId ?? undefined);
  const set = (lineId: number, value: string) => onChange({ ...draft, quantities: { ...draft.quantities, [String(lineId)]: value } });
  const fillAll = () => onChange({ ...draft, quantities: Object.fromEntries(items.map((line) => [String(line.id), String(Math.max(0, available(line)))])) });
  const total = items.reduce((sum, line) => sum + (Number.isSafeInteger(typed(draft.quantities[String(line.id)])) ? typed(draft.quantities[String(line.id)]) : 0), 0);
  return <FieldGroup className="gap-6">
    <Field data-invalid={Boolean(errors.schoolId)}>
      <FieldLabel htmlFor="sports-school">School name</FieldLabel>
      <SchoolPicker id="sports-school" schools={plan.schools} value={school} onChange={(next) => onSchool(next?.id ?? null)} disabled={disabled} placeholder="Search by school, LGA or DNEMIS code…" invalid={Boolean(errors.schoolId)} />
      {errors.schoolId && <FieldError>{errors.schoolId}</FieldError>}
    </Field>
    <dl className="school-facts"><div><dt>LGEA</dt><dd>{school?.lga ?? "—"}</dd></div><div><dt>School level</dt><dd>{school?.level ?? "—"}</dd></div><div><dt>Location</dt><dd>{school?.location ?? "—"}</dd></div></dl>
    <Field>
      <div className="construction-label-row"><FieldLabel id="sports-school-items-label">Items for this school</FieldLabel>{school && <Button type="button" size="sm" variant="outline" className="rounded-full" disabled={disabled} onClick={fillAll}>Give all that is left</Button>}</div>
      <FieldDescription>{school ? "Enter how many of each item this school gets. Leave an item blank or 0 to give none" : "Choose a school to give it items"}</FieldDescription>
      <div className="sports-school-items"><Table aria-labelledby="sports-school-items-label">
        <TableHeader><TableRow><TableHead>Equipment item</TableHead><TableHead className="text-right">Available</TableHead><TableHead className="text-right w-28">Qty.</TableHead></TableRow></TableHeader>
        <TableBody>{items.map((line) => {
          const error = errors[`line-${line.id}`];
          return <TableRow key={line.id} data-invalid={Boolean(error) || undefined}>
            <TableCell className="whitespace-normal"><span className="block font-medium">{line.description}</span><small className="text-muted-foreground">{line.activityType}</small>{error && <FieldError id={`sports-item-${line.id}-error`}>{error}</FieldError>}</TableCell>
            <TableCell className="text-right tabular-nums">{count.format(available(line))} of {count.format(line.quantity)}</TableCell>
            <TableCell className="text-right"><Input id={`sports-item-${line.id}`} type="number" inputMode="numeric" min={0} max={Math.max(0, available(line))} step={1} placeholder="0" className="h-8 w-24 ml-auto text-right" aria-label={`${line.description} for this school`} value={draft.quantities[String(line.id)] ?? ""} disabled={disabled || !school} aria-invalid={Boolean(error) || undefined} aria-describedby={error ? `sports-item-${line.id}-error` : undefined} onChange={(event) => set(line.id, event.target.value)} /></TableCell>
          </TableRow>;
        })}</TableBody>
        <TableFooter><TableRow><TableCell colSpan={2}>Items for this school</TableCell><TableCell className="text-right tabular-nums">{count.format(total)}</TableCell></TableRow></TableFooter>
      </Table></div>
    </Field>
  </FieldGroup>;
}

/**
 * UBEC249: the equipment items, each shared out across beneficiary schools by quantity, like the TLM, Curriculum and
 * Greening "Items for schools" (components/distribution-allocations.tsx). Every item must be given out in full before
 * sending (UBEC224).
 */
export function SportsItemsForSchools({ plan, disabled, onSaved }: { plan: SportsPlan; disabled: boolean; onSaved: () => Promise<unknown> }) {
  const items = equipmentItems(plan);
  const [open, setOpen] = useState<SportsLine | null>(null);
  if (!items.length) return null;
  const done = items.filter((line) => allocatedOf(plan, line.id) >= line.quantity).length;
  return <section className="distribution-items sports-items-for-schools" aria-labelledby="sports-items-title">
    <div className="distribution-items-head"><h3 id="sports-items-title">Items for schools</h3><Badge variant={done === items.length ? "secondary" : "warning"}>{done} of {items.length} shared out</Badge></div>
    <p className="distribution-note">Share each equipment item&apos;s quantity across beneficiary schools. Every item must be shared in full before sending</p>
    <ul>{items.map((line) => {
      const allocated = allocatedOf(plan, line.id), full = allocated >= line.quantity, schools = plan.allocations.filter((item) => item.lineId === line.id).length;
      return <li key={line.id} data-full={full || undefined}>
        <PackageIcon aria-hidden="true" />
        <div><strong>{line.description}</strong><small>{line.activityType} · {plural(schools, "school")}</small>
          <Progress value={line.quantity ? Math.min(100, allocated / line.quantity * 100) : 0} aria-label={`${allocated} of ${line.quantity} allocated`} /></div>
        <span className="tabular-nums">{count.format(allocated)} / {count.format(line.quantity)}</span>
        <Button size="sm" variant={full ? "outline" : "default"} className="rounded-full" disabled={disabled} onClick={() => setOpen(line)}>{full ? "Adjust" : "Allocate"}</Button>
      </li>;
    })}</ul>
    {open && <SportsAllocateDialog key={open.id} plan={plan} line={open} onClose={() => setOpen(null)} onSaved={onSaved} />}
  </section>;
}

function SportsAllocateDialog({ plan, line, onClose, onSaved }: { plan: SportsPlan; line: SportsLine; onClose: () => void; onSaved: () => Promise<unknown> }) {
  // The rows: schools holding this item, then the plan's other beneficiary schools, then any school added here.
  const [added, setAdded] = useState<number[]>([]);
  const rows = useMemo(() => {
    const holders = plan.allocations.filter((item) => item.lineId === line.id).map((item) => item.schoolId);
    const beneficiaries = plan.allocations.map((item) => item.schoolId);
    const ids = [...new Set([...holders, ...beneficiaries, ...added])];
    return ids.map((id) => plan.schools.find((school) => school.id === id)).filter((school): school is SportsSchool => Boolean(school));
  }, [plan, line.id, added]);
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(plan.allocations.filter((item) => item.lineId === line.id).map((item) => [String(item.schoolId), String(item.quantity)])));
  const [saving, setSaving] = useState(false), [error, setError] = useState("");
  const quantityOf = (schoolId: number) => typed(values[String(schoolId)]);
  const invalid = rows.some((school) => !Number.isSafeInteger(quantityOf(school.id)));
  const allocated = rows.reduce((sum, school) => sum + (Number.isSafeInteger(quantityOf(school.id)) ? quantityOf(school.id) : 0), 0), left = line.quantity - allocated;
  const fill = (shares: Map<number, number>) => { setValues(Object.fromEntries([...shares].filter(([, q]) => q > 0).map(([id, q]) => [String(id), String(q)]))); setError(""); };
  // Whole items, the remainder to the first schools.
  const even = () => fill(new Map(rows.map((school, index) => [school.id, Math.floor(line.quantity / rows.length) + (index < line.quantity % rows.length ? 1 : 0)])));
  const others = plan.schools.filter((school) => !rows.some((row) => row.id === school.id));

  async function save() {
    if (saving) return;
    if (invalid) { setError("Use whole numbers of items"); return; }
    if (left < 0) { setError(`Share at most ${count.format(line.quantity)} items: ${count.format(allocated)} allocated`); return; }
    const changes = rows.map((school) => ({ lineId: line.id, schoolId: school.id, quantity: quantityOf(school.id) })).filter((row) => row.quantity !== heldBy(plan, line.id, row.schoolId));
    if (!changes.length) { onClose(); return; }
    setSaving(true);
    try {
      await saveSportsAllocations(changes);
      toast.success(left ? `Saved · ${plural(left, "item")} still to share` : "Saved · every item shared out");
      await onSaved(); onClose();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The allocation could not be saved"); }
    finally { setSaving(false); }
  }

  return <Dialog open onOpenChange={(next) => { if (!next && !saving) onClose(); }}>
    <DialogContent className="sm:max-w-2xl distribution-allocate-dialog">
      <DialogHeader><DialogTitle>Allocate · {line.description}</DialogTitle><DialogDescription>{line.activityType} · {plural(line.quantity, "item")} at {nairaFormat.format(Number(line.unitCost))} each. Give each school its number of items; schools left blank get none</DialogDescription></DialogHeader>
      <Field>
        <FieldLabel htmlFor={`sports-allocate-${line.id}-school`}>Add a school</FieldLabel>
        <SchoolPicker id={`sports-allocate-${line.id}-school`} schools={others} value={null} onChange={(school) => { if (school) { setAdded((current) => [...current, school.id]); setError(""); } }} disabled={saving} placeholder="Search by school, LGA or DNEMIS code…" />
      </Field>
      <div className="distribution-allocate-tools">
        <Button size="sm" variant="outline" className="rounded-full" disabled={saving || !rows.length} onClick={even}>Share evenly</Button>
        <Button size="sm" variant="ghost" className="rounded-full" disabled={saving || !allocated} onClick={() => fill(new Map())}>Clear</Button>
        <span className="distribution-allocate-left" data-over={left < 0 || undefined} data-done={left === 0 || undefined}>{left === 0 ? "All items shared" : left > 0 ? `${count.format(left)} left to share` : `${count.format(-left)} too many`}</span>
      </div>
      {rows.length ? <div className="distribution-allocate-table"><Table><TableHeader><TableRow><TableHead>School</TableHead><TableHead>LGA</TableHead><TableHead>Level</TableHead><TableHead className="text-right w-28">Items</TableHead></TableRow></TableHeader>
        <TableBody>{rows.map((school) => <TableRow key={school.id}><TableCell className="whitespace-normal">{school.name}</TableCell><TableCell>{school.lga}</TableCell><TableCell>{school.level}</TableCell>
          <TableCell className="text-right"><Input type="number" inputMode="numeric" min={0} max={line.quantity} step={1} placeholder="0" className="h-8 w-24 ml-auto text-right" aria-label={`Items for ${school.name}`} value={values[String(school.id)] ?? ""} disabled={saving} onChange={(event) => { setValues({ ...values, [String(school.id)]: event.target.value }); setError(""); }} /></TableCell></TableRow>)}</TableBody>
        <TableFooter><TableRow><TableCell colSpan={3}>Allocated</TableCell><TableCell className="text-right tabular-nums">{count.format(allocated)} / {count.format(line.quantity)}</TableCell></TableRow></TableFooter></Table></div>
        : <p className="distribution-note"><PlusIcon aria-hidden="true" className="inline size-4 align-text-bottom" /> Add the schools that get this item</p>}
      {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
      <DialogFooter><Button variant="outline" disabled={saving} onClick={onClose}>Cancel</Button><Button disabled={saving || left < 0 || invalid} onClick={() => void save()}>{saving && <Spinner data-icon="inline-start" />}Save allocation</Button></DialogFooter>
    </DialogContent>
  </Dialog>;
}
