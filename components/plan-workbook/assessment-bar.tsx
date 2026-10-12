'use client';
import { useState } from 'react';
import { CheckIcon, ClipboardCheckIcon, Undo2Icon, XIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field, FieldLabel } from '@/components/ui/field';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';
import { DecisionBar } from '@/components/ubec/flow-bits';
import { decisionCounts, type ItemDecisionValue } from '@/lib/ubec-flow';
import type { SheetAssessment } from './assessment-context';
import type { WorkbookRow } from './types';

/** The row actions of a sheet's assessment, shared by the toolbar and the right-click menu. */
export type AssessActions = { busy: boolean; decide: (rowIds: string[], decision: ItemDecisionValue | null) => void };

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

/** Above an assessed sheet: decision progress, and for the assigned officer the actions on the selected rows. */
export function AssessmentBar({ assessment, rows, selected, actions }: { assessment: SheetAssessment; rows: readonly WorkbookRow[]; selected: string[]; actions: AssessActions }) {
  const counts = decisionCounts(rows.map(row => ({ rowRef: row.id })), [...assessment.decisions(assessment.pillar)].map(([rowRef, d]) => ({ rowRef, decision: d.decision })));
  const can = assessment.canDecide(assessment.pillar), decided = selected.some(id => assessment.decisions(assessment.pillar).has(id));
  return <div className="wb-assessment" data-editable={can || undefined}>
    <DecisionBar counts={counts} />
    {can && <div className="wb-assessment-actions">
      <span className="wb-assessment-hint">{selected.length ? `${items(selected.length)} selected` : 'Select rows, or right-click a row'}</span>
      <Button size="sm" variant="outline" className="rounded-full" data-kind="accept" disabled={!selected.length || actions.busy} onClick={() => actions.decide(selected, 'accept')}>{actions.busy ? <Spinner data-icon="inline-start" /> : <CheckIcon data-icon="inline-start" />}Accept</Button>
      <Button size="sm" variant="outline" className="rounded-full" data-kind="reject" disabled={!selected.length || actions.busy} onClick={() => actions.decide(selected, 'reject')}><XIcon data-icon="inline-start" />Reject</Button>
      {decided && <Button size="sm" variant="ghost" className="rounded-full" disabled={actions.busy} onClick={() => actions.decide(selected, null)}><Undo2Icon data-icon="inline-start" />Clear</Button>}
    </div>}
    {assessment.canComplete(assessment.pillar) && <Button size="sm" className="rounded-full" disabled={counts.undecided > 0} title={counts.undecided ? `Decide the remaining ${items(counts.undecided)} first` : undefined} onClick={() => assessment.complete(assessment.pillar)}><ClipboardCheckIcon data-icon="inline-start" />Complete assessment</Button>}
  </div>;
}
