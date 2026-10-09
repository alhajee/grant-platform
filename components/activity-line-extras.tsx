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
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { DocumentFiles, FileUpload } from '@/components/document-files';
import { activityInfo, activityNames, type ActivityWorkstream, type DistributionSchool } from '@/lib/activity-plans';
import { compulsoryActivities, equipmentTypes, hasLineSchools, ictSubscriptionActivity, ictWebsiteActivity, isCompulsory, isSupportingDocumentLine, lineDocumentAcceptFor, lineDocumentLabel, maxTypeNameLength, qualityEquipmentActivity, subscriptionGroups, subscriptionTypes, websiteTypes, type LineDocument } from '@/lib/activity-extras';
import { othersActivityName } from '@/lib/teacher-development';
import { compulsoryNames, hasReadinessRules, missingCompulsory } from '@/lib/component-readiness';
import { currentPlanHref } from '@/lib/action-plans';
import { teacherDocumentHint } from '@/lib/teacher-development';

// Quality Assurance and ICT pieces of the activity editor (migration 038), kept out of activity-plan-editor.tsx.
const count = new Intl.NumberFormat('en-NG');
const pickerLimit = 200;
const required = <span className="text-destructive" aria-label="required">*</span>;
export type ExtraDraft = { activity: string; equipmentType: string; subscriptionTypes: string[]; websiteType: string; schoolIds: number[] };

/** The "Required" badge for a compulsory activity. */
export function RequiredBadge({ workstream, activity }: { workstream: ActivityWorkstream; activity: number }) {
  return isCompulsory(workstream, activity) ? <Badge variant="warning">Required</Badge> : null;
}

/** An info hint beside an activity name, when the activity has an explanation. */
export function ActivityInfoHint({ workstream, activity }: { workstream: ActivityWorkstream; activity: number }) {
  const info = activityInfo[workstream]?.[activity];
  if (!info) return null;
  return <Tooltip><TooltipTrigger asChild><Button type="button" variant="ghost" size="icon-xs" className="rounded-full align-middle" aria-label={`About ${activityNames[workstream][activity]}`}><InfoIcon /></Button></TooltipTrigger><TooltipContent side="top" className="max-w-xs">{info}</TooltipContent></Tooltip>;
}

/** What is still missing before the component can be sent: compulsory activities without a line. */
export function CompulsoryChecklist({ workstream, lines }: { workstream: ActivityWorkstream; lines: readonly { activity: number }[] }) {
  const missing = missingCompulsory(workstream, lines);
  if (!hasReadinessRules(workstream) || !(compulsoryActivities[workstream]?.length)) return null;
  if (!missing.length) return <p className="activity-compulsory-done"><CheckIcon aria-hidden="true" />Every required activity has a budget line.</p>;
  return <Alert className="activity-compulsory"><CircleAlertIcon /><AlertTitle>Required before sending · {missing.length} missing</AlertTitle><AlertDescription><ul>{compulsoryNames(workstream, missing).map(name => <li key={name}>{name}</li>)}</ul></AlertDescription></Alert>;
}

const otherValue = '__other__';

/** A listed type or, through "Others (specify)", one the user types. The typed name is stored as the value. */
function TypeSelect({ id, label, options, value, onChange }: { id: string; label: string; options: readonly string[]; value: string; onChange: (value: string) => void }) {
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
  return <FieldSet className="subscription-types"><FieldLegend variant="label">Subscription types {required}</FieldLegend><FieldDescription>Choose at least one.</FieldDescription>
    <div className="subscription-grid">{subscriptionGroups.map((group, i) => group.label ? <div key={i} className="subscription-group" role="group" aria-label={group.label}><span>{group.label}</span><div>{group.types.map(box)}</div></div> : group.types.map(box))}
      <label className="subscription-option"><Checkbox checked={showOther} onCheckedChange={v => { setOther(v === true); if (v !== true) set(listed, ''); }} aria-label={othersActivityName} /><span>{othersActivityName}</span></label>
    </div>
    {showOther && <Input aria-label="Other subscription" autoFocus maxLength={maxTypeNameLength} placeholder="Enter the subscription (e.g. provider or service)" value={typed} onChange={e => set(listed, e.target.value.trimStart())} />}
  </FieldSet>;
}

/** Equipment type, subscription types and website type for the activities that ask for them. */
export function LineExtraFields({ workstream, draft, onChange }: { workstream: ActivityWorkstream; draft: ExtraDraft; onChange: (next: Partial<ExtraDraft>) => void }) {
  const activity = Number(draft.activity);
  if (workstream === 'quality' && activity === qualityEquipmentActivity) return <TypeSelect id="equipmentType" label="Equipment type" options={equipmentTypes} value={draft.equipmentType} onChange={equipmentType => onChange({ equipmentType })} />;
  if (workstream === 'ict' && activity === ictWebsiteActivity) return <TypeSelect id="websiteType" label="Website type" options={websiteTypes} value={draft.websiteType} onChange={websiteType => onChange({ websiteType })} />;
  if (workstream === 'ict' && activity === ictSubscriptionActivity) return <SubscriptionFields value={draft.subscriptionTypes} onChange={subscriptionTypes => onChange({ subscriptionTypes })} />;
  return null;
}

/** Multi-select of schools from the state's School register for one line. */
export function LineSchoolPicker({ workstream, draft, schools, onChange, disabled }: { workstream: ActivityWorkstream; draft: ExtraDraft; schools: DistributionSchool[]; onChange: (schoolIds: number[]) => void; disabled: boolean }) {
  const [query, setQuery] = useState('');
  if (!hasLineSchools(workstream, Number(draft.activity))) return null;
  const chosen = new Set(draft.schoolIds), needle = query.trim().toLowerCase();
  // Chosen schools first so they stay visible; then the rest of the register.
  const matches = schools.filter(s => !needle || `${s.name} ${s.lga} ${s.level}`.toLowerCase().includes(needle)).sort((a, b) => Number(chosen.has(b.id)) - Number(chosen.has(a.id)));
  const toggle = (id: number, on: boolean) => onChange(on ? [...new Set([...draft.schoolIds, id])] : draft.schoolIds.filter(s => s !== id));
  return <Field><FieldLabel htmlFor="line-school-search">Schools {required}</FieldLabel>
    <Input id="line-school-search" type="search" placeholder="Search by school, LGA or level…" value={query} onChange={e => setQuery(e.target.value)} />
    <FieldDescription>Tick every school this item covers. Schools come from your School register.</FieldDescription>
    <div className="school-picker" role="group" aria-label="Schools for this item">
      <div className="school-pick school-pick-all"><span>{count.format(chosen.size)} selected</span>{chosen.size > 0 && <Button type="button" variant="ghost" size="sm" className="ml-auto" disabled={disabled} onClick={() => onChange([])}>Clear</Button>}</div>
      {matches.slice(0, pickerLimit).map(s => <label key={s.id} className="school-pick"><Checkbox checked={chosen.has(s.id)} disabled={disabled} onCheckedChange={v => toggle(s.id, v === true)} aria-label={`Select ${s.name}`} /><span className="school-option"><span>{s.name}</span><small>{s.lga} · {s.level}</small></span></label>)}
      {!matches.length && <p className="school-pick-empty">{schools.length ? 'No schools match your search.' : 'No schools are available in your state register.'}</p>}
      {matches.length > pickerLimit && <p className="school-pick-empty">Showing {pickerLimit} of {count.format(matches.length)} schools. Search to narrow the list.</p>}
    </div>
  </Field>;
}

/** Documents of a saved line that needs one (ICT specification, supporting document, Bill of Quantities). */
/** Uploads files to a saved budget line, one at a time; returns how many were added (throws on the first failure). */
export async function uploadLineDocuments(workstream: ActivityWorkstream, lineId: number, files: readonly File[]) {
  const endpoint = currentPlanHref('/api/activities/line-documents');
  let added = 0;
  for (const file of files) {
    const form = new FormData(); form.set('workstream', workstream); form.set('lineId', String(lineId)); form.set('file', file);
    const r = await fetch(endpoint, { method: 'POST', body: form }); const result = await r.json().catch(() => ({})) as { error?: string };
    if (!r.ok) throw new Error(result.error || `Unable to upload ${file.name}.`);
    added++;
  }
  return added;
}

/**
 * Documents for one budget line. On a saved line files upload straight away; on a new line they wait in the
 * form (pending) and the editor uploads them right after the item is added. `required` follows the Super Admin
 * setting (migration 052): when off the field is marked optional and nothing is refused for a missing document.
 * Supporting documents (migration 057: SBMC, TLM, Monitoring, Curriculum, QA, other ICT activities, Planning) are
 * always optional and also take Word documents and photos.
 */
export function LineDocumentsField({ workstream, activity, lineId, documents, pending, onPendingChange, required: isRequired, disabled, onChanged }: { workstream: ActivityWorkstream; activity: number; lineId?: number; documents: LineDocument[]; pending: File[]; onPendingChange: (files: File[]) => void; required: boolean; disabled: boolean; onChanged: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const label = lineDocumentLabel(workstream, activity), supporting = isSupportingDocumentLine(workstream, activity);
  const hint = workstream === 'teachers' ? `${teacherDocumentHint}. ` : supporting ? 'Quotations, specifications, photos or other evidence for this item. ' : '';
  if (!label) return null;
  const mandatory = isRequired && !supporting, accept = lineDocumentAcceptFor(workstream, activity);
  const endpoint = currentPlanHref('/api/activities/line-documents');
  async function upload(files: File[]) {
    if (!lineId) { onPendingChange([...pending, ...files]); return; }
    setBusy(true);
    try {
      const added = await uploadLineDocuments(workstream, lineId, files);
      toast.success(`Uploaded ${added} file${added === 1 ? '' : 's'}.`);
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Unable to upload.'); }
    finally { setBusy(false); await onChanged().catch(() => undefined); }
  }
  async function remove(id: string) {
    setBusy(true);
    try { const r = await fetch(`${endpoint}${endpoint.includes('?') ? '&' : '?'}workstream=${workstream}&id=${encodeURIComponent(id)}`, { method: 'DELETE' }); const result = await r.json() as { error?: string }; if (!r.ok) throw new Error(result.error); toast.success('Removed.'); }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Unable to remove.'); }
    finally { setBusy(false); await onChanged().catch(() => undefined); }
  }
  return <Field><FieldLabel htmlFor="line-document">{label} {mandatory ? required : <span className="font-normal text-muted-foreground">(optional)</span>}</FieldLabel>
    <FileUpload compact id="line-document" label={label} multiple accept={accept} disabled={disabled} busy={busy} onFiles={upload} />
    {lineId
      ? documents.length > 0 && <DocumentFiles compact documents={documents.map(d => ({ ...d, url: `/api/activities/line-documents?id=${d.id}`, description: label }))} disabled={disabled || busy} onRemove={disabled ? undefined : id => void remove(id)} />
      : pending.length > 0 && <DocumentFiles compact documents={pending.map((file, index) => ({ id: `pending-${index}`, name: file.name, size: file.size, file }))} disabled={disabled} onRemove={disabled ? undefined : id => onPendingChange(pending.filter((_, index) => `pending-${index}` !== id))} />}
    <FieldDescription>{hint}{supporting ? 'PDF, Excel, Word or images' : 'PDF or Excel only'}, up to 5 MB each. {mandatory ? 'Required before sending.' : 'Optional.'}</FieldDescription>
  </Field>;
}
