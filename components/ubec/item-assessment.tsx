'use client';

import { useState } from 'react';
import { CheckIcon, EyeIcon, HistoryIcon, MessageSquarePlusIcon, Undo2Icon, XIcon } from 'lucide-react';
import { toast } from 'sonner';
import { compactNaira } from '@/components/dashboard/plan-figures';
import type { CommentsController } from '@/components/plan-workbook/comments-context';
import { NoItemsArt, UbecEmpty } from '@/components/empty-art/ubec-flow';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field, FieldLabel } from '@/components/ui/field';
import { Spinner } from '@/components/ui/spinner';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { ImplementedPillar } from '@/lib/beap-pillars';
import type { Snapshot } from '@/lib/plan-review';
import { componentItems, componentName, decisionCounts, type ItemDecision, type ItemDecisionValue } from '@/lib/ubec-flow';
import { DecisionBar, DecisionPill, StagePill, type Stage } from './flow-bits';

const naira = new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 2 });

/**
 * One component's items for UBEC: Accept / Reject (assigned officers while assessing), View (the row in the
 * workbook), Comment (a UBEC thread on the row), with the previous round's decision for reference.
 */
export function ItemAssessment({ planId, roundId, pillar, stage, snapshot, decisions, previous, canDecide, comments, onChanged }: {
  planId: number; roundId: number; pillar: ImplementedPillar; stage: Stage; snapshot: Snapshot; decisions: readonly ItemDecision[]; previous: readonly ItemDecision[];
  canDecide: boolean; comments: CommentsController | null; onChanged: () => Promise<void> | void;
}) {
  const items = componentItems(snapshot, pillar);
  const mine = decisions.filter(d => d.pillar === pillar), before = previous.filter(d => d.pillar === pillar);
  const counts = decisionCounts(items, mine);
  const [busy, setBusy] = useState<string | null>(null), [rejecting, setRejecting] = useState<string | null>(null), [note, setNote] = useState('');
  const canComment = !!comments && comments.abilities(pillar).start;

  async function decide(rowRef: string, decision: ItemDecisionValue | null, reason = '') {
    if (busy) return;
    setBusy(rowRef);
    try {
      const response = await fetch(`/api/ubec/decisions?plan=${planId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ roundId, pillar, rowRef, decision, note: reason }) });
      const result = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(result.error || 'The decision could not be saved.');
      setRejecting(null); await onChanged();
    } catch (cause) { toast.error(cause instanceof Error ? cause.message : 'The decision could not be saved.'); }
    finally { setBusy(null); }
  }
  // View: open the component's sheet in the workbook. Comment: also open a new thread on the row there.
  const view = (rowRef: string, comment = false) => {
    window.location.hash = `review-${pillar}`;
    if (comment && comments) requestAnimationFrame(() => setTimeout(() => comments.setActive({ sheet: pillar, rowRef, columnId: null, threadId: null }), 120));
  };
  const rowComments = (rowRef: string) => comments?.threads.filter(t => t.sheet === pillar && t.rowRef === rowRef && !t.resolvedAt && t.scope === 'ubec').length ?? 0;

  return <Card className="ubec-items" id={`ubec-${pillar}`}>
    <CardHeader className="ubec-items-head">
      <div><CardTitle><h3>{componentName(pillar)}</h3></CardTitle><CardDescription>{canDecide ? 'Accept or reject each item, comment where needed, then complete your assessment.' : 'Item decisions by the Assessment Officers.'}</CardDescription></div>
      <StagePill stage={stage} />
    </CardHeader>
    <CardContent>
      {items.length > 0 && <DecisionBar counts={counts} />}
      {!items.length ? <UbecEmpty art={<NoItemsArt />} title="No items in this component" compact>This submission has no lines for {componentName(pillar)}.</UbecEmpty> : <div className="ubec-items-table">
        <Table>
          <TableHeader><TableRow><TableHead>Item</TableHead><TableHead className="text-right">Qty × unit cost</TableHead><TableHead className="text-right">Amount</TableHead><TableHead>Decision</TableHead><TableHead className="text-right"><span className="sr-only">Actions</span></TableHead></TableRow></TableHeader>
          <TableBody>{items.map(item => {
            const decision = mine.find(d => d.rowRef === item.rowRef), earlier = before.find(d => d.rowRef === item.rowRef), threads = rowComments(item.rowRef);
            return <TableRow key={item.rowRef} data-decision={decision?.decision ?? 'open'}>
              <TableCell className="ubec-item-cell"><strong>{item.title}</strong>{item.detail && <small>{item.detail}</small>}{item.code && <small className="ubec-item-code">{item.code}</small>}
                {decision?.note && <small className="ubec-item-note">“{decision.note}” · {decision.officerName}</small>}
                {earlier && <small className="ubec-item-previous"><HistoryIcon aria-hidden="true" />Previous submission: {earlier.decision === 'accept' ? 'accepted' : 'rejected'}{earlier.note ? ` (“${earlier.note}”)` : ''}</small>}</TableCell>
              <TableCell className="text-right tabular-nums">{item.quantity.toLocaleString()} × {naira.format(item.unitCost)}</TableCell>
              <TableCell className="text-right tabular-nums" title={naira.format(item.amount)}>{compactNaira.format(item.amount)}</TableCell>
              <TableCell><DecisionPill decision={decision?.decision} /></TableCell>
              <TableCell><div className="ubec-item-actions">
                {canDecide && <>
                  <Button size="sm" variant={decision?.decision === 'accept' ? 'default' : 'outline'} className="rounded-full" data-kind="accept" disabled={!!busy} aria-pressed={decision?.decision === 'accept'} onClick={() => void decide(item.rowRef, 'accept')}>{busy === item.rowRef ? <Spinner /> : <CheckIcon />}Accept</Button>
                  <Button size="sm" variant={decision?.decision === 'reject' ? 'destructive' : 'outline'} className="rounded-full" data-kind="reject" disabled={!!busy} aria-pressed={decision?.decision === 'reject'} onClick={() => { setNote(decision?.note ?? ''); setRejecting(item.rowRef); }}><XIcon />Reject</Button>
                  {decision && <Tooltip><TooltipTrigger asChild><Button size="icon-sm" variant="ghost" aria-label="Clear decision" disabled={!!busy} onClick={() => void decide(item.rowRef, null)}><Undo2Icon /></Button></TooltipTrigger><TooltipContent className="soft-tip">Clear decision</TooltipContent></Tooltip>}
                </>}
                <Tooltip><TooltipTrigger asChild><Button size="icon-sm" variant="ghost" aria-label={`View ${item.title} in the workbook`} onClick={() => view(item.rowRef)}><EyeIcon /></Button></TooltipTrigger><TooltipContent className="soft-tip">View in the workbook</TooltipContent></Tooltip>
                {canComment && <Tooltip><TooltipTrigger asChild><Button size="icon-sm" variant="ghost" aria-label={`Comment on ${item.title}`} onClick={() => view(item.rowRef, true)}><MessageSquarePlusIcon />{threads > 0 && <Badge className="ubec-item-thread-count">{threads}</Badge>}</Button></TooltipTrigger><TooltipContent className="soft-tip">Comment on this item</TooltipContent></Tooltip>}
              </div></TableCell>
            </TableRow>;
          })}</TableBody>
        </Table>
      </div>}
    </CardContent>
    <Dialog open={rejecting !== null} onOpenChange={open => { if (!open && !busy) setRejecting(null); }}>
      <DialogContent className="national-dialog sm:max-w-md" showCloseButton={!busy}>
        <DialogHeader><DialogTitle>Reject item</DialogTitle><DialogDescription>{items.find(i => i.rowRef === rejecting)?.title}. Say briefly why, so the Director and the SUBEB can act on it.</DialogDescription></DialogHeader>
        <form onSubmit={event => { event.preventDefault(); if (rejecting) void decide(rejecting, 'reject', note); }}>
          <Field><FieldLabel htmlFor="ubec-reject-note">Reason (optional)</FieldLabel><Textarea id="ubec-reject-note" rows={3} maxLength={1000} value={note} onChange={event => setNote(event.target.value)} disabled={!!busy} /></Field>
          <DialogFooter className="mt-6"><Button type="button" variant="outline" disabled={!!busy} onClick={() => setRejecting(null)}>Cancel</Button><Button type="submit" variant="destructive" disabled={!!busy}>{busy && <Spinner data-icon="inline-start" />}Reject item</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  </Card>;
}
