'use client';
import { useState } from 'react';
import { CheckIcon, CircleDotIcon, ClipboardCheckIcon, MessageSquarePlusIcon, ShieldCheckIcon, Undo2Icon, XIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field, FieldLabel } from '@/components/ui/field';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';
import { OversightProgress } from '@/components/ubec/flow-bits';
import { decisionCounts, type ItemDecisionValue } from '@/lib/ubec-flow';
import { DocumentFiles, FileUpload } from '@/components/document-files';
import type { SheetAssessment, ValidationReports } from './assessment-context';
import type { WorkbookRow } from './types';

/** The row actions of a sheet's assessment, shared by the toolbar and the right-click menu. */
export type AssessActions = { busy: boolean; decide: (rowIds: string[], decision: ItemDecisionValue | null) => void };

const pct = (n: number, total: number) => total ? `${n / total * 100}%` : '0%';
const items = (n: number) => `${n} ${n === 1 ? 'item' : 'items'}`;

/** Decide rows of a sheet: accept saves at once, reject first asks for a reason (one for all chosen rows). */
export function useAssessActions(assessment: SheetAssessment | null) {
  const [busy, setBusy] = useState(false), [rejecting, setRejecting] = useState<string[] | null>(null), [note, setNote] = useState('');
  async function run(rowIds: string[], decision: ItemDecisionValue | null, reason = '') {
    if (!assessment || busy || !rowIds.length) return;
    setBusy(true);
    try { if (await assessment.decide(assessment.pillar, rowIds, decision, reason)) setRejecting(null); }
    finally { setBusy(false); }
  }
  const actions: AssessActions = { busy, decide: (rowIds, decision) => { if (decision === 'reject') { setNote(''); setRejecting(rowIds); } else void run(rowIds, decision); } };
  const dialog = <Dialog open={rejecting !== null} onOpenChange={open => { if (!open && !busy) setRejecting(null); }}>
    <DialogContent className="national-dialog sm:max-w-md" showCloseButton={!busy}>
      <DialogHeader><DialogTitle>Reject {items(rejecting?.length ?? 0)}</DialogTitle><DialogDescription>Say briefly why, so the Director and the SUBEB can act on it</DialogDescription></DialogHeader>
      <form onSubmit={event => { event.preventDefault(); if (rejecting) void run(rejecting, 'reject', note); }}>
        <Field><FieldLabel htmlFor="wb-reject-note">Reason (optional)</FieldLabel><Textarea id="wb-reject-note" rows={3} maxLength={1000} value={note} onChange={event => setNote(event.target.value)} disabled={busy} autoFocus /></Field>
        <DialogFooter className="mt-6"><Button type="button" variant="outline" disabled={busy} onClick={() => setRejecting(null)}>Cancel</Button><Button type="submit" variant="destructive" disabled={busy}>{busy && <Spinner data-icon="inline-start" />}Reject {items(rejecting?.length ?? 0)}</Button></DialogFooter>
      </form>
    </DialogContent>
  </Dialog>;
  return { actions, dialog };
}

/** Opens an observation (a UBEC row comment) on a row; `count` is the open observations on the sheet. */
export type Observations = { open: (rowId: string) => void; count: number };

/**
 * Above an assessed sheet: decision progress; for the assigned officer the actions on the selected rows; for an
 * Oversight Director the oversight progress, Add observation on the selected row and Observations done.
 */
export function AssessmentBar({ assessment, rows, selected, actions, observations }: { assessment: SheetAssessment; rows: readonly WorkbookRow[]; selected: string[]; actions: AssessActions; observations: Observations | null }) {
  const counts = decisionCounts(rows.map(row => ({ rowRef: row.id })), [...assessment.decisions(assessment.pillar)].map(([rowRef, d]) => ({ rowRef, decision: d.decision })));
  const can = assessment.canDecide(assessment.pillar), decided = selected.some(id => assessment.decisions(assessment.pillar).has(id));
  const validation = assessment.validation?.(assessment.pillar) ?? null, missingReport = !!validation && !validation.mine.length;
  return <div className="wb-assessment" data-editable={can || undefined}>
    <div className="wb-assessment-progress" role="group" aria-label={`${counts.total - counts.undecided} of ${counts.total} items decided`}>
      <span className="wb-assessment-meter" aria-hidden="true"><span data-kind="accept" style={{ width: pct(counts.accepted, counts.total) }} /><span data-kind="reject" style={{ width: pct(counts.rejected, counts.total) }} /></span>
      <strong>{counts.total - counts.undecided} of {counts.total} decided</strong>
      <span className="wb-assessment-counts"><span data-kind="accept"><CheckIcon aria-hidden="true" />{counts.accepted}<span className="sr-only"> accepted</span></span><span data-kind="reject"><XIcon aria-hidden="true" />{counts.rejected}<span className="sr-only"> rejected</span></span>{counts.undecided > 0 && <span data-kind="open"><CircleDotIcon aria-hidden="true" />{counts.undecided}<span className="sr-only"> to decide</span></span>}</span>
    </div>
    {can && <div className="wb-assessment-actions">
      <span className="wb-assessment-hint">{selected.length ? `${items(selected.length)} selected` : 'Select rows, or right-click a row'}</span>
      <Button size="sm" variant="outline" className="rounded-full" data-kind="accept" disabled={!selected.length || actions.busy} onClick={() => actions.decide(selected, 'accept')}>{actions.busy ? <Spinner data-icon="inline-start" /> : <CheckIcon data-icon="inline-start" />}Accept</Button>
      <Button size="sm" variant="outline" className="rounded-full" data-kind="reject" disabled={!selected.length || actions.busy} onClick={() => actions.decide(selected, 'reject')}><XIcon data-icon="inline-start" />Reject</Button>
      {decided && <Button size="sm" variant="ghost" className="rounded-full" disabled={actions.busy} onClick={() => actions.decide(selected, null)}><Undo2Icon data-icon="inline-start" />Clear</Button>}
    </div>}
    {(assessment.canObserve(assessment.pillar) || !!assessment.canComment?.(assessment.pillar)) && <div className="wb-assessment-actions">
      <OversightProgress done={assessment.oversightDone(assessment.pillar)} />
      <span className="wb-assessment-hint">{observations?.count ? `${observations.count} open ${observations.count === 1 ? 'observation' : 'observations'} · ` : ''}{selected.length ? `Row ${rows.findIndex(row => row.id === selected[0]) + 1} selected` : 'Select a row, or right-click a cell'}</span>
      {observations && <Button size="sm" variant="outline" className="rounded-full" disabled={!selected.length} onClick={() => observations.open(selected[0])}><MessageSquarePlusIcon data-icon="inline-start" />Add observation</Button>}
      {assessment.canObserve(assessment.pillar) && <Button size="sm" className="rounded-full" onClick={() => assessment.observe(assessment.pillar)}><ShieldCheckIcon data-icon="inline-start" />Observations done</Button>}
    </div>}
    {assessment.canComplete(assessment.pillar) && <Button size="sm" className="rounded-full" disabled={counts.undecided > 0 || missingReport} title={counts.undecided ? `Decide the remaining ${items(counts.undecided)} first` : missingReport ? 'Upload your Validation Report first' : undefined} onClick={() => assessment.complete(assessment.pillar)}><ClipboardCheckIcon data-icon="inline-start" />Complete assessment</Button>}
    {validation && (assessment.canComplete(assessment.pillar) || validation.reports.length > 0) && <ValidationReportPanel validation={validation} editable={assessment.canComplete(assessment.pillar)} />}
  </div>;
}

const reportAccept = '.pdf,.xls,.xlsx,.docx,.png,.jpg,.jpeg';
/**
 * Infrastructure Validation Reports (migration 069): the assigned officer uploads one or more before Complete assessment;
 * everyone who sees the sheet can open them.
 */
function ValidationReportPanel({ validation, editable }: { validation: ValidationReports; editable: boolean }) {
  const files = (editable ? validation.mine : validation.reports).map(r => ({ id: r.id, name: r.name, size: r.size, url: validation.href(r.id), description: editable ? undefined : r.officerName }));
  return <div className="wb-validation" data-missing={editable && !validation.mine.length || undefined}>
    <div className="wb-validation-head"><strong>Validation report</strong><span>{editable ? (validation.mine.length ? 'Uploaded · required before Complete assessment' : 'Required before Complete assessment') : `${validation.reports.length} uploaded by the Assessment Officers`}</span></div>
    {editable && <FileUpload label="Validation report" accept={reportAccept} compact multiple busy={validation.busy} onFiles={files => void validation.upload(files)} />}
    {files.length > 0 && <DocumentFiles compact documents={files} onRemove={editable ? id => void validation.remove(id) : undefined} />}
  </div>;
}
