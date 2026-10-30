'use client';
import { useState } from 'react';
import { CheckIcon, CircleAlertIcon, InfoIcon } from 'lucide-react';
import { toast } from 'sonner';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Field, FieldDescription, FieldLabel, FieldLegend, FieldSet } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { FieldHelp } from '@/components/field-help';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { DocumentFiles, FileUpload } from '@/components/document-files';
import { activityInfo, activityNames, type ActivityWorkstream, type DistributionSchool } from '@/lib/activity-plans';
import { allocatesToSchools, beneficiaryLabels, beneficiaryTypes, needsBeneficiary, type Beneficiary, censusTypes, compulsoryActivities, equipmentCategories, gscciItemsByActivity, lineHasItem, needsCensusType, equipmentTypesByCategory, hasLineSchools, ictSubscriptionActivity, ictWebsiteActivity, isCompulsory, isRetiredActivity, isQualityEquipmentActivity, ictSupportingDocumentHelp, lineDocumentSlots, type LineDocumentSlot, maxTypeNameLength, subscriptionGroups, subscriptionTypes, websiteTypes, type LineDocument } from '@/lib/activity-extras';
import { othersActivityName } from '@/lib/teacher-development';
import { compulsoryNames, hasReadinessRules, missingCompulsory } from '@/lib/component-readiness';
import { currentPlanHref } from '@/lib/action-plans';
import { teacherDocumentHint } from '@/lib/teacher-development';
import { SchoolLevelFilter, allLevels, filterByLevel, type SchoolLevelChoice } from '@/components/school-level-filter';

// Quality Assurance and ICT pieces of the activity editor (migration 038), kept out of activity-plan-editor.tsx.
const count = new Intl.NumberFormat('en-NG');
const pickerLimit = 200;
const required = <span className="text-destructive" aria-label="required">*</span>;
export type ExtraDraft = { activity: string; equipmentCategory: '' | typeof equipmentCategories[number]; equipmentType: string; subscriptionTypes: string[]; websiteType: string; item: string; censusType: string; schoolIds: number[]; /** ICT procurement (UBEC160). */ beneficiary?: string; schoolQuantities?: Record<string, number> };

/** The "Required" badge for a compulsory activity. */
export function RequiredBadge({ workstream, activity, setup }: { workstream: ActivityWorkstream; activity: number; setup?: { ictConnect?: 'has' | 'needs' | null } | null }) {
  return isCompulsory(workstream, activity, setup) ? <Badge variant="warning" className="required-badge">Required</Badge> : null;
}

/** An info hint beside an activity name, when the activity has an explanation. */
export function ActivityInfoHint({ workstream, activity }: { workstream: ActivityWorkstream; activity: number }) {
  const info = activityInfo[workstream]?.[activity];
  if (!info) return null;
  return <Tooltip><TooltipTrigger asChild><Button type="button" variant="ghost" size="icon-xs" className="rounded-full align-middle" aria-label={`About ${activityNames[workstream][activity]}`}><InfoIcon /></Button></TooltipTrigger><TooltipContent side="top" className="max-w-xs">{info}</TooltipContent></Tooltip>;
}

/** What is still missing before the component can be sent: lines on retired activities, and compulsory activities without a line. */
export function CompulsoryChecklist({ workstream, lines, setup }: { workstream: ActivityWorkstream; lines: readonly { activity: number }[]; setup?: { ictConnect?: 'has' | 'needs' | null } | null }) {
  if (!hasReadinessRules(workstream) || !(compulsoryActivities[workstream]?.length)) return null;
  const missing = missingCompulsory(workstream, lines, setup);
  const retired = [...new Set(lines.filter(line => isRetiredActivity(workstream, line.activity)).map(line => line.activity))];
  return <>
    {retired.length > 0 && <Alert variant="destructive" className="activity-compulsory"><CircleAlertIcon /><AlertTitle>No longer allowable · move or remove these items before sending</AlertTitle><AlertDescription><ul>{retired.map(i => <li key={i}>{activityNames[workstream][i]}</li>)}</ul></AlertDescription></Alert>}
    {missing.length ? <Alert className="activity-compulsory"><CircleAlertIcon /><AlertTitle>Required before sending · {missing.length} missing</AlertTitle><AlertDescription><ul>{compulsoryNames(workstream, missing).map(name => <li key={name}>{name}</li>)}</ul></AlertDescription></Alert>
      : <p className="activity-compulsory-done"><CheckIcon aria-hidden="true" />Every required activity has a budget line</p>}
  </>;
}

const otherValue = '__other__';

/** A listed type or, through "Others (specify)", one the user types. The typed name is stored as the value. */
export function TypeSelect({ id, label, options, value, onChange }: { id: string; label: string; options: readonly string[]; value: string; onChange: (value: string) => void }) {
  const listed = options.includes(value);
  const [other, setOther] = useState(Boolean(value) && !listed);
  const showOther = other || (Boolean(value) && !listed);
  return <Field><FieldLabel htmlFor={id}>{label} {required}</FieldLabel>
    <NativeSelect id={id} required value={showOther ? otherValue : value} onChange={e => { const next = e.target.value; setOther(next === otherValue); onChange(next === otherValue ? '' : next); }}>
      <NativeSelectOption value="">Choose…</NativeSelectOption>{options.map(t => <NativeSelectOption key={t} value={t}>{t}</NativeSelectOption>)}<NativeSelectOption value={otherValue}>{othersActivityName}</NativeSelectOption>
    </NativeSelect>
    {showOther && <Input id={`${id}-other`} aria-label={`Other ${label.toLowerCase()}`} required autoFocus maxLength={maxTypeNameLength} placeholder={`Enter the ${label.toLowerCase()}`} value={value} onChange={e => onChange(e.target.value)} />}
  </Field>;
}

/** Subscription checkboxes plus "Others (specify)" for one subscription that is not listed. */
function SubscriptionFields({ value, onChange }: { value: string[]; onChange: (value: string[]) => void }) {
  const listed = value.filter(t => (subscriptionTypes as readonly string[]).includes(t)), typed = value.find(t => !(subscriptionTypes as readonly string[]).includes(t)) ?? '';
  const [other, setOther] = useState(Boolean(typed));
  const showOther = other || Boolean(typed);
  const set = (nextListed: string[], nextTyped: string) => onChange([...nextListed, ...(nextTyped ? [nextTyped] : [])]);
  const toggle = (type: string, on: boolean) => set(on ? [...new Set([...listed, type])] : listed.filter(t => t !== type), typed);
  const box = (type: string) => <label key={type} className="subscription-option"><Checkbox checked={listed.includes(type)} onCheckedChange={v => toggle(type, v === true)} aria-label={type} /><span>{type}</span></label>;
  return <FieldSet className="subscription-types"><FieldLegend variant="label">Subscription types {required}</FieldLegend><FieldDescription>Choose at least one</FieldDescription>
    <div className="subscription-grid">{subscriptionGroups.map((group, i) => group.label ? <div key={i} className="subscription-group" role="group" aria-label={group.label}><span>{group.label}</span><div>{group.types.map(box)}</div></div> : group.types.map(box))}
      <label className="subscription-option"><Checkbox checked={showOther} onCheckedChange={v => { setOther(v === true); if (v !== true) set(listed, ''); }} aria-label={othersActivityName} /><span>{othersActivityName}</span></label>
    </div>
    {showOther && <Input aria-label="Other subscription" autoFocus maxLength={maxTypeNameLength} placeholder="Enter the subscription (e.g. provider or service)" value={typed} onChange={e => set(listed, e.target.value.trimStart())} />}
  </FieldSet>;
}

/**
 * Quality Assurance equipment items: Mobility or Office equipment, then the type listed for that category or typed
 * through "Others (specify)". Each item is one line with its own quantity and unit cost, so a plan lists as many as it needs.
 */
function EquipmentFields({ draft, onChange }: { draft: ExtraDraft; onChange: (next: Partial<ExtraDraft>) => void }) {
  const category = draft.equipmentCategory;
  return <div className="grid grid-cols-2 gap-4">
    <Field><FieldLabel htmlFor="equipmentCategory">Category {required}</FieldLabel>
      <NativeSelect id="equipmentCategory" required value={category} onChange={e => onChange({ equipmentCategory: e.target.value as ExtraDraft['equipmentCategory'], equipmentType: '' })}>
        <NativeSelectOption value="">Choose…</NativeSelectOption>{equipmentCategories.map(c => <NativeSelectOption key={c} value={c}>{c}</NativeSelectOption>)}
      </NativeSelect>
    </Field>
    {category ? <TypeSelect key={category} id="equipmentType" label={category === 'Mobility' ? 'Mobility type' : 'Equipment type'} options={equipmentTypesByCategory[category]} value={draft.equipmentType} onChange={equipmentType => onChange({ equipmentType })} />
      : <Field><FieldLabel htmlFor="equipmentType">Type {required}</FieldLabel><NativeSelect id="equipmentType" disabled value=""><NativeSelectOption value="">Choose the category first</NativeSelectOption></NativeSelect></Field>}
  </div>;
}

/** Greening item: the activity's procurement list plus "Others (specify)", or a typed item where the activity has no list. */
function ItemField({ activity, value, onChange }: { activity: number; value: string; onChange: (value: string) => void }) {
  const options = gscciItemsByActivity[activity];
  if (options) return <TypeSelect key={activity} id="item" label="Item" options={options} value={value} onChange={onChange} />;
  return <Field><FieldLabel htmlFor="item">Item {required}</FieldLabel>
    <Input id="item" required maxLength={maxTypeNameLength} placeholder="Enter the item" value={value} onChange={e => onChange(e.target.value)} />
  </Field>;
}

/** Equipment category and type, subscription types, website type and Greening items for the activities that ask for them. */
export function LineExtraFields({ workstream, draft, onChange }: { workstream: ActivityWorkstream; draft: ExtraDraft; onChange: (next: Partial<ExtraDraft>) => void }) {
  const activity = Number(draft.activity);
  if (isQualityEquipmentActivity(workstream, activity)) return <EquipmentFields draft={draft} onChange={onChange} />;
  if (needsCensusType(workstream, activity)) return <Field><FieldLabel htmlFor="censusType">Type of census {required}</FieldLabel>
    <NativeSelect id="censusType" required value={draft.censusType} onChange={e => onChange({ censusType: e.target.value })}>
      <NativeSelectOption value="">Pick the type of census…</NativeSelectOption>{censusTypes.map(t => <NativeSelectOption key={t} value={t}>{t}</NativeSelectOption>)}
    </NativeSelect>
  </Field>;
  if (lineHasItem(workstream)) return <ItemField activity={activity} value={draft.item} onChange={item => onChange({ item })} />;
  if (workstream === 'ict' && activity === ictWebsiteActivity) return <TypeSelect id="websiteType" label="Website type" options={websiteTypes} value={draft.websiteType} onChange={websiteType => onChange({ websiteType })} />;
  if (workstream === 'ict' && activity === ictSubscriptionActivity) return <SubscriptionFields value={draft.subscriptionTypes} onChange={subscriptionTypes => onChange({ subscriptionTypes })} />;
  return null;
}

/** Multi-select of schools from the state's School list for one line. */
/** UBEC160: who an ICT procurement item is for. Choosing SUBEB or LGA clears the schools. */
export function BeneficiaryField({ workstream, draft, disabled, onChange }: { workstream: ActivityWorkstream; draft: ExtraDraft; disabled: boolean; onChange: (beneficiary: Beneficiary) => void }) {
  if (!needsBeneficiary(workstream, Number(draft.activity))) return null;
  return <Field><FieldLabel>Beneficiaries {required}</FieldLabel>
    <ToggleGroup type="single" variant="outline" value={draft.beneficiary || undefined} disabled={disabled} onValueChange={value => { if (value) onChange(value as Beneficiary); }} aria-label="Beneficiaries" className="justify-start">
      {beneficiaryTypes.map(type => <ToggleGroupItem key={type} value={type} className="px-4">{beneficiaryLabels[type]}</ToggleGroupItem>)}
    </ToggleGroup>
    <FieldDescription>{draft.beneficiary === 'school' ? 'Choose the schools and share the quantity across them' : draft.beneficiary ? `Procured for the ${beneficiaryLabels[draft.beneficiary as Beneficiary]}: no schools` : 'Who the equipment is for'}</FieldDescription>
  </Field>;
}

export function LineSchoolPicker({ workstream, draft, schools, onChange, disabled, quantity, onQuantities }: { workstream: ActivityWorkstream; draft: ExtraDraft; schools: DistributionSchool[]; onChange: (schoolIds: number[]) => void; disabled: boolean; /** UBEC160: the line's quantity, shared across the chosen schools. */ quantity?: number; onQuantities?: (quantities: Record<string, number>) => void }) {
  const [query, setQuery] = useState(''), [level, setLevel] = useState<SchoolLevelChoice>(allLevels);
  if (!hasLineSchools(workstream, Number(draft.activity), draft.beneficiary)) return null;
  const allocating = allocatesToSchools(workstream, Number(draft.activity), draft.beneficiary) && !!onQuantities;
  const chosen = new Set(draft.schoolIds), needle = query.trim().toLowerCase();
  // Chosen schools first so they stay visible; then the rest of the list.
  const matches = filterByLevel(schools, level).filter(s => !needle || `${s.name} ${s.lga} ${s.level}`.toLowerCase().includes(needle)).sort((a, b) => Number(chosen.has(b.id)) - Number(chosen.has(a.id)));
  const toggle = (id: number, on: boolean) => onChange(on ? [...new Set([...draft.schoolIds, id])] : draft.schoolIds.filter(s => s !== id));
  return <Field><FieldLabel htmlFor="line-school-search">Schools {required}</FieldLabel>
    <Input id="line-school-search" type="search" placeholder="Search by school, LGA or level…" value={query} onChange={e => setQuery(e.target.value)} />
    <SchoolLevelFilter schools={schools} value={level} disabled={disabled} onChange={setLevel} />
    <FieldDescription>Tick every school this item covers. Schools come from your School list.</FieldDescription>
    <div className="school-picker" role="group" aria-label="Schools for this item">
      <div className="school-pick school-pick-all"><span>{count.format(chosen.size)} selected</span>{chosen.size > 0 && <Button type="button" variant="ghost" size="sm" className="ml-auto" disabled={disabled} onClick={() => onChange([])}>Clear</Button>}</div>
      {matches.slice(0, pickerLimit).map(s => <label key={s.id} className="school-pick"><Checkbox checked={chosen.has(s.id)} disabled={disabled} onCheckedChange={v => toggle(s.id, v === true)} aria-label={`Select ${s.name}`} /><span className="school-option"><span>{s.name}</span><small>{s.lga} · {s.level}</small></span></label>)}
      {!matches.length && <p className="school-pick-empty">{schools.length ? 'No schools match your search' : 'No schools are available in your state register'}</p>}
      {matches.length > pickerLimit && <p className="school-pick-empty">Showing {pickerLimit} of {count.format(matches.length)} schools. Search to narrow the list.</p>}
    </div>
    {allocating && chosen.size > 0 && <SchoolQuantities schools={schools.filter(s => chosen.has(s.id))} quantities={draft.schoolQuantities ?? {}} total={quantity ?? 0} disabled={disabled} onChange={onQuantities!} />}
  </Field>;
}

/** UBEC160: the items each chosen school gets; together they must make the line's quantity. "Share evenly" splits it. */
function SchoolQuantities({ schools, quantities, total, disabled, onChange }: { schools: DistributionSchool[]; quantities: Record<string, number>; total: number; disabled: boolean; onChange: (quantities: Record<string, number>) => void }) {
  const allocated = schools.reduce((sum, s) => sum + (quantities[String(s.id)] ?? 0), 0);
  const even = () => { const base = Math.floor(total / schools.length), extra = total % schools.length; onChange(Object.fromEntries(schools.map((s, i) => [String(s.id), base + (i < extra ? 1 : 0)]).filter(([, q]) => Number(q) > 0))); };
  return <div className="school-quantities" data-off={allocated !== total || undefined}>
    <div className="school-quantities-head"><strong>Items per school</strong><span>{count.format(allocated)} of {count.format(total)} allocated</span>{total >= schools.length && <Button type="button" size="sm" variant="ghost" disabled={disabled} onClick={even}>Share evenly</Button>}</div>
    <ul>{schools.map(s => <li key={s.id}><span><b>{s.name}</b><small>{s.lga} · {s.level}</small></span>
      <Input type="number" min={1} step={1} inputMode="numeric" aria-label={`Items for ${s.name}`} disabled={disabled} value={quantities[String(s.id)] ?? ''} onChange={e => { const n = Math.max(0, Math.floor(Number(e.target.value) || 0)); const next = { ...quantities }; if (n) next[String(s.id)] = n; else delete next[String(s.id)]; onChange(next); }} /></li>)}</ul>
    {allocated !== total && <p role="status">{allocated < total ? `${count.format(total - allocated)} more to allocate` : `${count.format(allocated - total)} more than the quantity`}</p>}
  </div>;
}

/** A file chosen for a line that is not saved yet, with the slot it goes to (migration 065). */
export type PendingDocument = { file: File; kind: LineDocumentSlot['kind'] };

/** Uploads files to a saved budget line, one at a time; returns how many were added (throws on the first failure). */
export async function uploadLineDocuments(workstream: ActivityWorkstream, lineId: number, files: readonly PendingDocument[]) {
  const endpoint = currentPlanHref('/api/activities/line-documents');
  let added = 0;
  for (const { file, kind } of files) {
    const form = new FormData(); form.set('workstream', workstream); form.set('lineId', String(lineId)); form.set('kind', kind); form.set('file', file);
    const r = await fetch(endpoint, { method: 'POST', body: form }); const result = await r.json().catch(() => ({})) as { error?: string };
    if (!r.ok) throw new Error(result.error || `Unable to upload ${file.name}.`);
    added++;
  }
  return added;
}

/**
 * Documents for one budget line, one field per upload slot (TLM: BOQ and Sample of the item; others: their one
 * slot). On a saved line files upload straight away; on a new line they wait in the form (pending) and the editor
 * uploads them right after the item is added. `required` follows the Super Admin setting (migration 052): governed
 * slots are marked required only while it is on. Supporting documents (migration 057) are always optional.
 */
export function LineDocumentsField({ workstream, activity, lineId, documents, pending, onPendingChange, required: isRequired, disabled, onChanged }: { workstream: ActivityWorkstream; activity: number; lineId?: number; documents: LineDocument[]; pending: PendingDocument[]; onPendingChange: (files: PendingDocument[]) => void; required: boolean; disabled: boolean; onChanged: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const slots = lineDocumentSlots(workstream, activity);
  if (!slots.length) return null;
  const endpoint = currentPlanHref('/api/activities/line-documents');
  const kinds = new Set(slots.map(slot => slot.kind));
  // Documents saved before the line had these slots (earlier TLM supporting documents) are still listed.
  const earlier = documents.filter(d => !kinds.has((d.kind ?? 'document') as LineDocumentSlot['kind']));
  async function upload(kind: LineDocumentSlot['kind'], files: File[]) {
    if (!lineId) { onPendingChange([...pending, ...files.map(file => ({ file, kind }))]); return; }
    setBusy(true);
    try {
      const added = await uploadLineDocuments(workstream, lineId, files.map(file => ({ file, kind })));
      toast.success(`Uploaded ${added} file${added === 1 ? '' : 's'}.`);
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Unable to upload'); }
    finally { setBusy(false); await onChanged().catch(() => undefined); }
  }
  async function remove(id: string) {
    setBusy(true);
    try { const r = await fetch(`${endpoint}${endpoint.includes('?') ? '&' : '?'}workstream=${workstream}&id=${encodeURIComponent(id)}`, { method: 'DELETE' }); const result = await r.json() as { error?: string }; if (!r.ok) throw new Error(result.error); toast.success('Removed.'); }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Unable to remove'); }
    finally { setBusy(false); await onChanged().catch(() => undefined); }
  }
  const hintFor = (slot: LineDocumentSlot) => workstream === 'teachers' ? `${teacherDocumentHint}. PDF or Excel only` : slot.kind === 'document' && !slot.governed ? `Quotations, specifications, photos or other evidence for this item; the BPP waiver for a Non-Applicable strategy. ${slot.hint}` : slot.hint;
  return <>
    {slots.map(slot => {
      const mandatory = isRequired && slot.governed, id = `line-document-${slot.kind}`;
      const saved = documents.filter(d => (d.kind ?? 'document') === slot.kind), waiting = pending.map((p, index) => ({ ...p, index })).filter(p => p.kind === slot.kind);
      return <Field key={slot.kind}><FieldLabel htmlFor={id}>{slot.label} {mandatory ? required : <span className="font-normal text-muted-foreground">(optional)</span>}{/* UBEC75: what ICT's supporting documents are for. */}{workstream === 'ict' && slot.kind === 'document' && !slot.governed && <FieldHelp>{ictSupportingDocumentHelp}</FieldHelp>}</FieldLabel>
        <FileUpload compact id={id} label={slot.label} multiple accept={slot.accept} disabled={disabled} busy={busy} onFiles={files => void upload(slot.kind, files)} />
        {lineId
          ? saved.length > 0 && <DocumentFiles compact documents={saved.map(d => ({ ...d, url: `/api/activities/line-documents?id=${d.id}`, description: slot.label }))} disabled={disabled || busy} onRemove={disabled ? undefined : docId => void remove(docId)} />
          : waiting.length > 0 && <DocumentFiles compact documents={waiting.map(p => ({ id: `pending-${p.index}`, name: p.file.name, size: p.file.size, file: p.file }))} disabled={disabled} onRemove={disabled ? undefined : docId => onPendingChange(pending.filter((_, index) => `pending-${index}` !== docId))} />}
        <FieldDescription>{hintFor(slot)}, up to 5 MB each. {mandatory ? 'Required before sending' : 'Optional.'}</FieldDescription>
      </Field>;
    })}
    {lineId && earlier.length > 0 && <Field><FieldLabel>Earlier documents</FieldLabel>
      <DocumentFiles compact documents={earlier.map(d => ({ ...d, url: `/api/activities/line-documents?id=${d.id}`, description: 'Earlier document' }))} disabled={disabled || busy} onRemove={disabled ? undefined : docId => void remove(docId)} />
    </Field>}
  </>;
}
