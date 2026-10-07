'use client';
import { Fragment, useState, type KeyboardEvent } from 'react';
import { CircleAlertIcon, CircleCheckIcon, InfoIcon } from 'lucide-react';
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { DeliverableGroupRow } from '@/components/infrastructure-package-details';
import { quantityLabel, auditGaps, entriesNotIn, deliverableInfo, auditRowProblem, groupDeliverables, modelFor, modelNames, modelSummary, packageModel, standardText, type AuditGap, type InfrastructureInput } from '@/lib/infrastructure-model';

type Filter = 'all' | 'minimum' | 'other';
type AuditField = 'existing' | 'functional' | 'extra';
interface AuditTableProps {
  input: InfrastructureInput;
  enrolment: number;
  disabled: boolean;
  onChange: (patch: Partial<InfrastructureInput>) => void;
}
const COLUMNS = 9;
const modelShort = ['Model 1 · Small', 'Model 2 · Medium', 'Model 3 · Large'];
const parseCount = (value: string): number | undefined => {
  if (value.trim() === '') return undefined;
  const n = Math.trunc(Number(value));
  return Number.isFinite(n) && n >= 0 ? Math.min(n, 1000000) : undefined;
};

const without = <T,>(record: Record<string, T>, key: string): Record<string, T> => Object.fromEntries(Object.entries(record).filter(([k]) => k !== key));

/** Minimum Standard completeness by workbook S/N (the two classroom rows make up deliverable 1). */
function minimumProgress(gaps: AuditGap[], input: InfrastructureInput) {
  const bySn = new Map<number, boolean>();
  for (const gap of gaps.filter(g => g.category === 'minimum')) bySn.set(gap.sn, (bySn.get(gap.sn) ?? true) && !auditRowProblem(gap, input));
  return { complete: [...bySn.values()].filter(Boolean).length, total: bySn.size };
}

function StandardTooltip({ gap, model }: { gap: AuditGap; model: number }) {
  const others = [0, 1, 2].map(m => `${modelShort[m]}: ${standardText(gap.key, m)}`);
  return <Tooltip><TooltipTrigger asChild><button type="button" className="infra-audit-info" aria-label={`Standard for ${gap.label}`}><InfoIcon aria-hidden="true" /></button></TooltipTrigger>
    <TooltipContent side="right" sideOffset={6} className="max-w-80"><div className="flex flex-col gap-1.5 text-left">
      <p className="font-semibold">{gap.category === 'minimum' ? `${modelShort[model]} standard: ${gap.standard}` : 'Other requirement · no standard quantity'}</p>
      {gap.remark && <p>{gap.remark}</p>}
      {gap.category === 'minimum' && <ul className="opacity-80">{others.map((line, m) => <li key={line}>{m === model ? '• ' : '◦ '}{line}</li>)}</ul>}
      {gap.category === 'other' && <p className="opacity-80">Optional. Enter what the school has or needs; a row is added to the package once you enter a figure.</p>}
    </div></TooltipContent></Tooltip>;
}

export function InfrastructureAuditTable({ input, enrolment, disabled, onChange }: AuditTableProps) {
  const [filter, setFilter] = useState<Filter>('minimum');
  const [touched, setTouched] = useState<ReadonlySet<string>>(new Set());
  const [confirm, setConfirm] = useState<{ model: number; keys: string[] } | null>(null);
  const suggested = modelFor(enrolment), model = packageModel(input, enrolment);
  const gaps = auditGaps(input, enrolment);
  const progress = minimumProgress(gaps, input);
  const otherAdded = gaps.filter(g => g.category === 'other' && g.included).length;
  const visible = gaps.filter(g => filter === 'all' || g.category === filter);
  const ordered = groupDeliverables(visible).flatMap(g => g.rows);

  function setCell(key: string, field: AuditField, value: number | undefined) {
    const stored = input.audit[key] ?? { extra: 0 };
    const row = { ...stored, [field]: field === 'extra' ? value ?? 0 : value };
    const rest = without(input.audit, key);
    const empty = row.existing === undefined && row.functional === undefined && !row.extra;
    setTouched(prev => new Set(prev).add(key));
    onChange({ audit: empty ? rest : { ...rest, [key]: row } });
  }
  // A model change that would drop entered rows the new model does not ask for is confirmed first.
  function chooseModel(value: string) {
    if (!value) return;
    const next = Number(value);
    if (next === model && input.model !== undefined) return;
    const dropped = entriesNotIn(input, next);
    if (dropped.length) setConfirm({ model: next, keys: dropped });
    else onChange({ model: next });
  }
  function applyModel(change: { model: number; keys: string[] }) {
    onChange({ model: change.model, audit: Object.fromEntries(Object.entries(input.audit).filter(([key]) => !change.keys.includes(key))) });
    setConfirm(null);
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
    const value = field === 'extra' ? (stored?.extra ? String(stored.extra) : '') : stored?.[field] === undefined ? '' : String(stored[field]);
    const required = gap.category === 'minimum' && field !== 'extra';
    const label = { existing: 'Existing', functional: 'Functional', extra: 'Extra beyond standard' }[field];
    return <Input type="number" inputMode="numeric" min={0} step={1} className="infra-audit-input" data-row={index} data-col={field}
      aria-label={`${label}: ${gap.label}`} aria-required={required} required={required} placeholder={field === 'extra' ? '0' : '–'}
      aria-invalid={problem && field !== 'extra' && (value === '' || field === 'functional') ? true : undefined}
      disabled={disabled} value={value} onChange={e => setCell(gap.key, field, parseCount(e.target.value))} />;
  };

  const standardCell = (gap: AuditGap, index: number) => {
    if (gap.category === 'other') return <span className="text-muted-foreground">No standard</span>;
    if (gap.key === 'fence') return <div className="flex items-center gap-2"><Input type="number" inputMode="numeric" min={0} step={1} className="infra-audit-input" data-row={index} data-col="standard"
      aria-label="Fence length required (metres)" aria-required required placeholder="Metres" aria-invalid={input.fenceRequired <= 0 && touched.has('fence') ? true : undefined}
      disabled={disabled} value={input.fenceRequired ? String(input.fenceRequired) : ''} onChange={e => { setTouched(prev => new Set(prev).add('fence')); onChange({ fenceRequired: parseCount(e.target.value) ?? 0 }); }} /><span className="text-xs text-muted-foreground">metres</span></div>;
    return <span>{gap.standard}</span>;
  };

  return <section className="infra-audit flex flex-col gap-4" aria-labelledby="infra-school-audit-heading">
    <div className="flex flex-col gap-1">
      <h2 id="infra-school-audit-heading" className="text-lg font-semibold">School audit</h2>
      <p className="text-sm text-muted-foreground">Every Minimum Standard row is required; Other Requirements are optional.</p>
    </div>
    <fieldset className="infra-model-step flex flex-col gap-2">
      <legend className="text-sm font-semibold"><span className="infra-model-step-number" aria-hidden="true">1</span>Choose the school model</legend>
      <p className="text-sm text-muted-foreground">The model sets the Minimum Standard deliverables and quantities this school must provide. Enrolment suggests one; choose another if it fits the school better.</p>
      <ToggleGroup type="single" variant="outline" spacing={2} className="infra-model-choice" aria-label="School model" value={String(model)} onValueChange={chooseModel} disabled={disabled}>
        {modelNames.map((name, m) => <ToggleGroupItem key={name} value={String(m)} className="infra-model-option" aria-label={name}>
          <span className="font-semibold">{name}</span><span className="text-xs text-muted-foreground">{modelSummary(m)}</span>
          {m === suggested && <Badge variant="secondary" className="infra-model-suggested">Suggested for {enrolment.toLocaleString()} learners</Badge>}
        </ToggleGroupItem>)}
      </ToggleGroup>
    </fieldset>
    <h3 className="text-sm font-semibold"><span className="infra-model-step-number" aria-hidden="true">2</span>Record what the school has · {modelShort[model]} standard</h3>
    <ToggleGroup type="single" variant="outline" spacing={1} className="infra-audit-filter" aria-label="Show deliverables" value={filter} onValueChange={v => v && setFilter(v as Filter)}>
      <ToggleGroupItem value="all">All <Badge variant="secondary">{gaps.length}</Badge></ToggleGroupItem>
      <ToggleGroupItem value="minimum">Minimum Standard <Badge variant={progress.complete === progress.total ? 'secondary' : 'outline'}>{progress.complete}/{progress.total} complete</Badge></ToggleGroupItem>
      <ToggleGroupItem value="other">Other Requirements <Badge variant="secondary">{otherAdded} added</Badge></ToggleGroupItem>
    </ToggleGroup>
    {filter === 'other' && <p className="text-sm text-muted-foreground">Optional deliverables with no standard quantity. A row becomes part of the package once you enter a figure; leave the rest blank.</p>}
    <div className="infra-audit-card">
      <Table className="infra-audit-table" data-editable>
        <TableHeader><TableRow>
          <TableHead className="infra-audit-sticky">Deliverable</TableHead><TableHead>Standard</TableHead><TableHead>Required</TableHead>
          <TableHead>Existing</TableHead><TableHead>Functional</TableHead><TableHead>Non-functional</TableHead><TableHead>Additional</TableHead>
          <TableHead>Extra beyond standard</TableHead><TableHead>Status</TableHead>
        </TableRow></TableHeader>
        <TableBody onKeyDown={moveFocus}>
          {groupDeliverables(visible).map(group => <Fragment key={group.group}><DeliverableGroupRow group={group.group} colSpan={COLUMNS} sticky />
            {group.rows.map(gap => {
              const index = ordered.indexOf(gap);
              const problem = auditRowProblem(gap, input);
              const visibleProblem = problem && (touched.has(gap.key) || gap.functional > gap.existing) ? problem : null;
              const status = gap.category === 'other' ? (problem ? 'invalid' : gap.included ? 'added' : 'blank') : problem ? (visibleProblem ? 'invalid' : 'incomplete') : 'complete';
              return <TableRow key={gap.key} data-audit-key={gap.key} data-status={status} data-category={gap.category}>
                <TableCell className="infra-audit-sticky whitespace-normal"><div className="flex items-start gap-1.5">
                  <span className="infra-audit-sn">{gap.sn}</span><span className="min-w-0 flex-1">{gap.label}{filter === 'all' && gap.category === 'other' && <Badge variant="outline" className="ml-1.5 align-middle">Other</Badge>}</span><StandardTooltip gap={gap} model={model} /></div></TableCell>
                <TableCell className="whitespace-normal">{standardCell(gap, index)}</TableCell>
                <TableCell className="tabular-nums">{gap.category === 'other' ? '—' : quantityLabel(gap.required, gap.unit)}</TableCell>
                <TableCell>{numberCell(gap, index, 'existing', !!visibleProblem)}</TableCell>
                <TableCell>{numberCell(gap, index, 'functional', !!visibleProblem)}</TableCell>
                <TableCell className="tabular-nums">{gap.nonFunctional}</TableCell>
                <TableCell className="tabular-nums">{gap.additional}</TableCell>
                <TableCell>{numberCell(gap, index, 'extra', false)}</TableCell>
                <TableCell className="infra-audit-status whitespace-normal">{status === 'complete' || status === 'added' ? <span className="inline-flex items-center gap-1 text-primary"><CircleCheckIcon aria-hidden="true" />{status === 'added' ? 'Added' : 'Complete'}</span>
                  : status === 'blank' ? <span className="text-muted-foreground">Optional</span>
                  : <span role={status === 'invalid' ? 'alert' : undefined} className="inline-flex items-start gap-1"><CircleAlertIcon aria-hidden="true" />{visibleProblem ?? problem}</span>}</TableCell>
              </TableRow>;
            })}</Fragment>)}
        </TableBody>
      </Table>
    </div>
    <AlertDialog open={!!confirm} onOpenChange={open => { if (!open) setConfirm(null); }}><AlertDialogContent><AlertDialogHeader>
      <AlertDialogTitle>Switch to {confirm ? modelNames[confirm.model] : ''}?</AlertDialogTitle>
      <AlertDialogDescription>{confirm ? `${modelNames[confirm.model]} does not ask for ${confirm.keys.map(key => deliverableInfo(key)?.label ?? key).join(', ')}. The figures you entered for ${confirm.keys.length === 1 ? 'it' : 'them'} will be discarded.` : ''}</AlertDialogDescription>
    </AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Keep {modelNames[model]}</AlertDialogCancel><Button variant="destructive" onClick={() => confirm && applyModel(confirm)}>Discard and switch</Button></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </section>;
}
