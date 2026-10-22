'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { CircleAlertIcon, SendIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';
import { currentPlanHref } from '@/lib/action-plans';
import { componentSections, type ImplementedPillar } from '@/lib/beap-pillars';
import type { PlanReview } from '@/lib/plan-review';

const nameOf = (pillar: ImplementedPillar) => componentSections[pillar][0].name;

/**
 * BEAP Chair, individual-components mode (V2-04): pick several reviewed components and send them to the Executive Chairman
 * at once. Each goes through the usual send step in turn (same checks and notifications); components that are not ready
 * are listed with the reason and cannot be picked.
 */
export function SendSeveralDialog({ open, onOpenChange, data, problemFor, onDone }: {
  open: boolean; onOpenChange: (open: boolean) => void; data: PlanReview;
  /** Why a component cannot be sent yet, or null (the page's own readiness check). */
  problemFor: (pillar: ImplementedPillar) => string | null; onDone: () => Promise<void>;
}) {
  const reviewed = data.pillarReviews.filter(review => review.status === 'beap_review').map(review => review.pillar);
  const ready = reviewed.filter(pillar => !problemFor(pillar));
  const [picked, setPicked] = useState<ImplementedPillar[] | null>(null), [comment, setComment] = useState('');
  const [confirming, setConfirming] = useState(false), [sending, setSending] = useState(false), [error, setError] = useState('');
  const chosen = (picked ?? ready).filter(pillar => ready.includes(pillar));
  const close = (next: boolean) => { if (sending) return; onOpenChange(next); if (!next) { setPicked(null); setComment(''); setConfirming(false); setError(''); } };

  async function send() {
    if (sending || !chosen.length) return;
    setSending(true); setError('');
    let version = data.plan.version, sent = 0;
    try {
      for (const pillar of chosen) {
        const response = await fetch(currentPlanHref('/api/plans/review'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'forward', pillar, version, comment }) });
        const result = await response.json().catch(() => ({})) as { error?: string; version?: number };
        if (!response.ok) { setError(`${nameOf(pillar)}: ${result.error || 'could not be sent'}${sent ? `. ${sent} sent before it.` : ''}`); return; }
        sent++; version = result.version ?? version + 1;
      }
      toast.success(`${sent} ${sent === 1 ? 'component' : 'components'} sent to the Executive Chairman`);
      close(false);
    } catch {
      setError(`You appear to be offline.${sent ? ` ${sent} sent before the connection dropped.` : ''}`);
    } finally {
      setSending(false);
      if (sent) await onDone();
    }
  }

  return <Dialog open={open} onOpenChange={close}>
    <DialogContent className="sm:max-w-lg" showCloseButton={!sending}>
      <DialogHeader>
        <DialogTitle>{confirming ? `Send ${chosen.length} ${chosen.length === 1 ? 'component' : 'components'}?` : 'Send to Executive Chairman'}</DialogTitle>
        <DialogDescription>{confirming ? 'Each goes to the Executive Chairman and locks for the SUBEB review chain.' : 'Choose the reviewed components to send together'}</DialogDescription>
      </DialogHeader>
      {!confirming ? <div className="flex flex-col gap-4">
        <ul className="send-several-list">{reviewed.map(pillar => {
          const problem = problemFor(pillar), id = `send-several-${pillar}`;
          return <li key={pillar} data-disabled={problem ? true : undefined}>
            <Checkbox id={id} disabled={!!problem || sending} checked={!problem && chosen.includes(pillar)} onCheckedChange={checked => setPicked(checked ? [...chosen, pillar] : chosen.filter(p => p !== pillar))} />
            <label htmlFor={id}><strong>{nameOf(pillar)}</strong>{problem && <span className="flex items-start gap-1 text-xs text-destructive"><CircleAlertIcon className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />{problem}</span>}</label>
          </li>;
        })}</ul>
        {!reviewed.length && <p className="text-sm text-muted-foreground">No component is waiting for you</p>}
        <Field><FieldLabel htmlFor="send-several-comment">Comment (optional)</FieldLabel><Textarea id="send-several-comment" rows={3} maxLength={5000} value={comment} onChange={e => setComment(e.target.value)} /><FieldDescription>Added to each component&apos;s review history</FieldDescription></Field>
      </div> : <div className="flex flex-col gap-3">
        <ul className="list-disc pl-5 text-sm">{chosen.map(pillar => <li key={pillar}>{nameOf(pillar)}</li>)}</ul>
        {comment.trim() && <blockquote className="border-l-2 pl-3 text-sm text-muted-foreground">{comment.trim()}</blockquote>}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      </div>}
      <DialogFooter>
        {confirming ? <>
          <Button type="button" variant="outline" disabled={sending} onClick={() => { setConfirming(false); setError(''); }}>Back</Button>
          <Button type="button" disabled={sending || !chosen.length} onClick={() => void send()}>{sending ? <Spinner data-icon="inline-start" /> : <SendIcon data-icon="inline-start" />}Send {chosen.length}</Button>
        </> : <>
          <Button type="button" variant="outline" onClick={() => close(false)}>Cancel</Button>
          <Button type="button" disabled={!chosen.length} onClick={() => setConfirming(true)}>Continue</Button>
        </>}
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}
