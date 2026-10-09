'use client';
import { Fragment, useId, useRef, useState, type KeyboardEvent } from 'react';
import { CircleAlertIcon, CircleCheckIcon, ImagePlusIcon, InfoIcon, XIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { FieldHelp } from '@/components/field-help';
import { DeliverableGroupRow } from '@/components/infrastructure-package-details';
import { quantityLabel, auditGaps, auditRowProblem, groupDeliverables, rowPhotoIds, type AuditGap, type InfraDocument, type InfrastructureInput, type SchoolFacts } from '@/lib/infrastructure-model';

type Filter = 'all' | 'minimum' | 'other';
type AuditField = 'existing' | 'functional' | 'additional';
export interface AuditPhotos {
  /** Photographic evidence documents of this plan (any row). */
  documents: InfraDocument[];
  /** Required only while the Supporting documents setting is Required (migration 052). */
  required: boolean;
  busy: boolean;
  onUpload: (key: string, files: File[]) => void;
  onRemove: (id: string) => void;
}
interface AuditTableProps {
  input: InfrastructureInput;
  school: SchoolFacts;
  disabled: boolean;
  onChange: (patch: Partial<InfrastructureInput>) => void;
  photos: AuditPhotos;
}
const parseCount = (value: string): number | undefined => {
  if (value.trim() === '') return undefined;
  const n = Math.trunc(Number(value));
  return Number.isFinite(n) && n >= 0 ? Math.min(n, 1000000) : undefined;
};
const without = <T,>(record: Record<string, T>, key: string): Record<string, T> => Object.fromEntries(Object.entries(record).filter(([k]) => k !== key));
const photoAccept = '.png,.jpg,.jpeg,.pdf';

/** Header help for every column with a text box (client feedback, October 2026). */
const columnHelp = {
  required: 'Calculated from the school’s DNEMIS enrolment; the info icon on each row shows the working. For the perimeter fence, enter the metres the site needs.',
  existing: 'How many the school has now, working or not.',
  functional: 'How many of the existing ones are in good, usable condition.',
  photos: 'Attach photographs of the non-functional units, one or more for each row that has any.',
  additional: 'How many to build or supply. Leave it blank to use the calculated shortfall shown in grey, or type your own figure.',
};

/** Minimum Standard completeness by workbook S/N (the two classroom rows make up deliverable 1). */
function minimumProgress(gaps: AuditGap[], input: InfrastructureInput) {
  const bySn = new Map<number, boolean>();
  for (const gap of gaps.filter(g => g.category === 'minimum')) bySn.set(gap.sn, (bySn.get(gap.sn) ?? true) && !auditRowProblem(gap, input));
  return { complete: [...bySn.values()].filter(Boolean).length, total: bySn.size };
}

function RowInfo({ gap }: { gap: AuditGap }) {
  return <Tooltip><TooltipTrigger asChild><button type="button" className="infra-audit-info" aria-label={`How ${gap.label} is calculated`}><InfoIcon aria-hidden="true" /></button></TooltipTrigger>
    <TooltipContent side="right" sideOffset={6} className="max-w-80"><div className="flex flex-col gap-1.5 text-left">
      {gap.category === 'minimum' ? <><p className="font-semibold">Required: {gap.key === 'fence' ? 'the metres you enter' : quantityLabel(gap.required, gap.unit)}</p><p>{gap.standard}</p></>
        : <p className="font-semibold">Other facility · optional</p>}
      {gap.remark && gap.key !== 'fence' && <p className="opacity-80">{gap.remark}</p>}
      {gap.category === 'other' && <p className="opacity-80">Enter what the school has or needs; a row is added to the package once you enter a figure.</p>}
    </div></TooltipContent></Tooltip>;
}

function Head({ label, help, className }: { label: string; help?: string; className?: string }) {
  return <TableHead className={className}>{help ? <span className="inline-flex items-center gap-1">{label}<FieldHelp>{help}</FieldHelp></span> : label}</TableHead>;
}

function PhotoCell({ gap, input, photos, disabled }: { gap: AuditGap; input: InfrastructureInput; photos: AuditPhotos; disabled: boolean }) {
  const id = useId(), file = useRef<HTMLInputElement>(null);
  const attached = rowPhotoIds(input, photos.documents.map(d => d.id), gap.key).map(docId => photos.documents.find(d => d.id === docId)).filter((d): d is InfraDocument => !!d);
  if (gap.nonFunctional <= 0 && !attached.length) return <span className="text-muted-foreground">—</span>;
  return <div className="infra-audit-photos">
    {attached.map(doc => <span key={doc.id} className="infra-audit-photo"><a href={'/api/infrastructure/documents?id=' + doc.id} title={doc.name}>{doc.name}</a>
      {!disabled && <button type="button" aria-label={`Remove ${doc.name}`} onClick={() => photos.onRemove(doc.id)}><XIcon aria-hidden="true" /></button>}</span>)}
    {gap.nonFunctional > 0 && !disabled && <>
      <input ref={file} id={id} type="file" accept={photoAccept} multiple hidden onChange={e => { const files = [...(e.target.files ?? [])]; e.target.value = ''; if (files.length) photos.onUpload(gap.key, files); }} />
      <Button type="button" size="sm" variant="outline" disabled={photos.busy} aria-label={`Attach photographic evidence: ${gap.label}`} onClick={() => file.current?.click()}><ImagePlusIcon data-icon="inline-start" />{attached.length ? 'Add' : 'Attach'}</Button>
    </>}
  </div>;
}

/** Whole School step 2: one editable audit table; requirements come from DNEMIS enrolment (no model, client feedback October 2026). */
export function InfrastructureAuditTable({ input, school, disabled, onChange, photos }: AuditTableProps) {
  const [filter, setFilter] = useState<Filter>('minimum');
  const [touched, setTouched] = useState<ReadonlySet<string>>(new Set());
  const gaps = auditGaps(input, school);
  const progress = minimumProgress(gaps, input);
  const otherAdded = gaps.filter(g => g.category === 'other' && g.included).length;
  const visible = gaps.filter(g => filter === 'all' || g.category === filter);
  const ordered = groupDeliverables(visible).flatMap(g => g.rows);
  const showRequired = filter !== 'other';
  const columns = showRequired ? 8 : 7;

  function setCell(key: string, field: AuditField, value: number | undefined) {
    const stored = input.audit[key] ?? { extra: 0 };
    const row = { ...stored, [field]: value };
    const rest = without(input.audit, key);
    const empty = row.existing === undefined && row.functional === undefined && row.additional === undefined && !row.extra;
    setTouched(prev => new Set(prev).add(key));
    onChange({ audit: empty ? rest : { ...rest, [key]: row } });
  }
  // Enter / Shift+Enter move to the same column in the next / previous row, like a spreadsheet.
  function moveFocus(event: KeyboardEvent<HTMLTableSectionElement>) {
    const target = event.target as HTMLElement;
    if (event.key !== 'Enter' || target.tagName !== 'INPUT') return;
    const col = target.dataset.col, row = Number(target.dataset.row);
    if (!col || !Number.isInteger(row)) return;
    event.preventDefault();
    const step = event.shiftKey ? -1 : 1;
    for (let r = row + step; r >= 0 && r < ordered.length; r += step) {
      const next = event.currentTarget.querySelector<HTMLInputElement>(`input[data-col="${col}"][data-row="${r}"]`);
      if (next) { next.focus(); next.select(); return; }
    }
  }

  const numberCell = (gap: AuditGap, index: number, field: AuditField, problem: boolean) => {
    const stored = input.audit[gap.key];
    const value = stored?.[field] === undefined ? '' : String(stored[field]);
    const required = gap.category === 'minimum' && field !== 'additional';
    const label = { existing: 'Existing', functional: 'Functional', additional: 'Additional' }[field];
    return <Input type="number" inputMode="numeric" min={0} step={1} className="infra-audit-input" data-row={index} data-col={field} data-calculated={field === 'additional' ? true : undefined}
      aria-label={`${label}: ${gap.label}`} aria-required={required} required={required} placeholder={field === 'additional' ? String(gap.calculated) : '–'}
      aria-invalid={problem && field !== 'additional' && (value === '' || field === 'functional') ? true : undefined}
      disabled={disabled} value={value} onChange={e => setCell(gap.key, field, parseCount(e.target.value))} />;
  };

  const requiredCell = (gap: AuditGap, index: number) => {
    if (gap.category === 'other') return <span className="text-muted-foreground">—</span>;
    if (gap.key === 'fence') return <div className="flex items-center gap-2"><Input type="number" inputMode="numeric" min={0} step={1} className="infra-audit-input" data-row={index} data-col="required"
      aria-label="Fence length required (metres)" aria-required required placeholder="Metres" aria-invalid={input.fenceRequired <= 0 && touched.has('fence') ? true : undefined}
      disabled={disabled} value={input.fenceRequired ? String(input.fenceRequired) : ''} onChange={e => { setTouched(prev => new Set(prev).add('fence')); onChange({ fenceRequired: parseCount(e.target.value) ?? 0 }); }} /><span className="text-xs text-muted-foreground">metres</span></div>;
    return <span className="tabular-nums">{quantityLabel(gap.required, gap.unit)}</span>;
  };

  const levels = ([['ECCDE', school.eccde], ['Primary', school.primary], ['JSS', school.jss]] as const).filter(([, n]) => n > 0);
  return <section className="infra-audit flex flex-col gap-4" aria-labelledby="infra-school-audit-heading">
    <div className="flex flex-col gap-1">
      <h2 id="infra-school-audit-heading" className="text-lg font-semibold">School audit</h2>
      <p className="text-sm text-muted-foreground">Every Minimum Standard row is required; Other Facilities are optional. Required quantities come from the school’s DNEMIS enrolment.</p>
      <div className="flex flex-wrap gap-2 pt-1" aria-label="Enrolment used">
        {levels.map(([label, n]) => <Badge key={label} variant="secondary">{label} {n.toLocaleString()} learners</Badge>)}
        <Badge variant="secondary">{school.teachers ? `${school.teachers.toLocaleString()} teachers` : 'Teachers not recorded in DNEMIS'}</Badge>
      </div>
    </div>
    <ToggleGroup type="single" variant="outline" spacing={1} className="infra-audit-filter" aria-label="Show deliverables" value={filter} onValueChange={v => v && setFilter(v as Filter)}>
      <ToggleGroupItem value="all">All <Badge variant="secondary">{gaps.length}</Badge></ToggleGroupItem>
      <ToggleGroupItem value="minimum">Minimum Standard <Badge variant={progress.complete === progress.total ? 'secondary' : 'outline'}>{progress.complete}/{progress.total} complete</Badge></ToggleGroupItem>
      <ToggleGroupItem value="other">Other Facilities <Badge variant="secondary">{otherAdded} added</Badge></ToggleGroupItem>
    </ToggleGroup>
    {filter === 'other' && <p className="text-sm text-muted-foreground">For optional deliverables refer to minimum standard. A row becomes part of the package once you enter a figure; leave the rest blank.</p>}
    <div className="infra-audit-card">
      <Table className="infra-audit-table" data-editable>
        <TableHeader><TableRow>
          <TableHead className="infra-audit-sticky">Deliverable</TableHead>
          {showRequired && <Head label="Required" help={columnHelp.required} />}
          <Head label="Existing" help={columnHelp.existing} /><Head label="Functional" help={columnHelp.functional} /><TableHead>Non-functional</TableHead>
          <Head label="Photos" help={columnHelp.photos + (photos.required ? ' Required for every such row.' : ' Optional.')} />
          <Head label="Additional" help={columnHelp.additional} /><TableHead>Status</TableHead>
        </TableRow></TableHeader>
        <TableBody onKeyDown={moveFocus}>
          {groupDeliverables(visible).map(group => <Fragment key={group.group}><DeliverableGroupRow group={group.group} colSpan={columns} sticky />
            {group.rows.map(gap => {
              const index = ordered.indexOf(gap);
              const problem = auditRowProblem(gap, input);
              const visibleProblem = problem && (touched.has(gap.key) || gap.functional > gap.existing) ? problem : null;
              const photoMissing = photos.required && gap.nonFunctional > 0 && !rowPhotoIds(input, photos.documents.map(d => d.id), gap.key).length;
              const status = gap.category === 'other' ? (problem ? 'invalid' : gap.included ? (photoMissing ? 'incomplete' : 'added') : 'blank') : problem ? (visibleProblem ? 'invalid' : 'incomplete') : photoMissing ? 'incomplete' : 'complete';
              const message = visibleProblem ?? problem ?? (photoMissing ? 'Attach a photo of the non-functional units.' : null);
              return <TableRow key={gap.key} data-audit-key={gap.key} data-status={status} data-category={gap.category}>
                <TableCell className="infra-audit-sticky whitespace-normal"><div className="flex items-start gap-1.5">
                  <span className="infra-audit-sn">{gap.sn}</span><span className="min-w-0 flex-1">{gap.label}{filter === 'all' && gap.category === 'other' && <Badge variant="outline" className="ml-1.5 align-middle">Other</Badge>}</span><RowInfo gap={gap} /></div></TableCell>
                {showRequired && <TableCell className="whitespace-normal">{requiredCell(gap, index)}</TableCell>}
                <TableCell>{numberCell(gap, index, 'existing', !!visibleProblem)}</TableCell>
                <TableCell>{numberCell(gap, index, 'functional', !!visibleProblem)}</TableCell>
                <TableCell className="tabular-nums">{gap.nonFunctional}</TableCell>
                <TableCell><PhotoCell gap={gap} input={input} photos={photos} disabled={disabled} /></TableCell>
                <TableCell>{numberCell(gap, index, 'additional', false)}{gap.entered.additional && gap.additional !== gap.calculated && <p className="mt-1 text-xs text-muted-foreground">Calculated: {gap.calculated}</p>}</TableCell>
                <TableCell className="infra-audit-status whitespace-normal">{status === 'complete' || status === 'added' ? <span className="inline-flex items-center gap-1 text-primary"><CircleCheckIcon aria-hidden="true" />{status === 'added' ? 'Added' : 'Complete'}</span>
                  : status === 'blank' ? <span className="text-muted-foreground">Optional</span>
                  : <span role={status === 'invalid' ? 'alert' : undefined} className="inline-flex items-start gap-1"><CircleAlertIcon aria-hidden="true" />{message}</span>}</TableCell>
              </TableRow>;
            })}</Fragment>)}
        </TableBody>
      </Table>
    </div>
  </section>;
}
