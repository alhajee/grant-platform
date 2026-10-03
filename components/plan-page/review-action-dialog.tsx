'use client';

import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';
import type { CommentsController } from '@/components/plan-workbook/comments-context';
import { currentPlanHref } from '@/lib/action-plans';
import type { ImplementedPillar } from '@/lib/beap-pillars';
import { reviewActionLabels, type PlanReview, type ReviewAction } from '@/lib/plan-review';

export const commentCount = (n: number) => `${n} open ${n === 1 ? 'comment' : 'comments'}`;
export const ubecCount = (n: number) => `${n} UBEC ${n === 1 ? 'comment' : 'comments'}`;

/** A workflow step the viewer started: the action, and the component it applies to (none = the whole plan). */
export type ReviewRequest = { action: ReviewAction; pillar?: ImplementedPillar };

const titles: Partial<Record<ReviewAction, string>> = { endorse: 'Send to BEAP Chair', forward: 'Send to Executive Chairman', request_changes: 'Request changes' };
const submitLabels: Partial<Record<ReviewAction, string>> = { submit: 'Submit to Director', endorse: 'Send to BEAP Chair', forward: 'Send to Executive Chairman', request_changes: 'Send feedback' };

function describe(action: ReviewAction, data: PlanReview, reviewStatus: string | undefined) {
  if (action === 'submit') return 'Saved entries in this component will be sent to your department Director. Other departments can continue working.';
  if (action === 'endorse') return 'Send this department’s reviewed component to the nominated BEAP Chair for state-level consolidation.';
  if (action === 'forward') return data.beapChairSubmissionMode === 'individual_components'
    ? 'This reviewed component will be sent to the Executive Chairman. Other components will remain with the BEAP Chair until they are sent separately.'
    : 'All reviewed components will be sent together as one collated SUBEB BEAP to the Executive Chairman for final state-level review before submission to UBEC.';
  if (reviewStatus === 'chairman_ready') return 'Return this component to the BEAP Chair with the changes required by the Executive Chairman.';
  if (reviewStatus === 'beap_review') return 'Return this component to its department Director with the changes required by the BEAP Chair.';
  return 'Return this component to the department’s Data Entry Staff with the Director’s required changes.';
}

/**
 * Confirms one review step (send on, or request changes) with an optional or required note, and lists the
 * open comments that travel with it. Calls onDone after the server accepts the step.
 */
export function ReviewActionDialog({ request, data, comments, onClose, onDone }: {
  request: ReviewRequest | null; data: PlanReview; comments: CommentsController | null; onClose: () => void; onDone: () => void;
}) {
  // The last request stays rendered while the dialog animates closed.
  const [shown, setShown] = useState<ReviewRequest>({ action: 'submit' });
  const [comment, setComment] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const pending = useRef(false);
  if (request && request !== shown) { setShown(request); setComment(''); setFormError(''); }
  const { action, pillar } = request ?? shown;
  const scope = pillar ?? 'general';
  const reviewStatus = data.pillarReviews.find(review => review.pillar === pillar)?.status;
  const resubmit = action === 'submit' && reviewStatus === 'changes_requested';
  const open = comments?.threads.filter(t => !t.resolvedAt && (scope === 'general' || t.pillar === scope)) ?? [];
  // State comments travel with a change request; shared UBEC comments are only mentioned.
  const stateThreads = open.filter(t => t.scope === 'state'), ubecThreads = open.filter(t => t.scope === 'ubec');
  const noteOptional = action === 'request_changes' && stateThreads.length > 0;
  const where = scope === 'general' ? 'this plan' : 'this component';

  async function confirm() {
    if (!request || pending.current) return;
    pending.current = true; setSaving(true); setFormError('');
    try {
      const response = await fetch(currentPlanHref('/api/plans/review'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, version: data.plan.version, comment, ...(pillar ? { pillar } : {}) }) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error);
      toast.success(reviewActionLabels[action]); onDone();
    } catch (cause) { setFormError(cause instanceof Error ? cause.message : 'Unable to save. Please try again.'); }
    finally { pending.current = false; setSaving(false); }
  }

  return <Dialog open={Boolean(request)} onOpenChange={next => { if (!next && !saving) onClose(); }}>
    <DialogContent variant="inset-footer" className="sm:max-w-sm" showCloseButton={!saving} onEscapeKeyDown={e => { if (saving) e.preventDefault(); }} onInteractOutside={e => { if (saving) e.preventDefault(); }}>
      <DialogHeader>
        <DialogTitle>{action === 'submit' ? resubmit ? 'Resubmit to Director' : 'Submit to Director' : titles[action]}</DialogTitle>
        <DialogDescription>{describe(action, data, reviewStatus)}</DialogDescription>
      </DialogHeader>
      <form onSubmit={e => { e.preventDefault(); void confirm(); }}>
        <FieldGroup className="px-4 pb-5">
          {stateThreads.length > 0 && <div className="review-dialog-comments" data-action={action}>
            <p>{action === 'request_changes' ? `${commentCount(stateThreads.length)} will be sent with this request:` : `${commentCount(stateThreads.length)} on ${scope === 'general' ? 'this plan are' : 'this component are'} not resolved yet.`}</p>
            {action === 'request_changes' && <ul aria-label="Open comments">{stateThreads.map(t => <li key={t.id}><strong>{t.targetLabel}</strong><span>{t.body}</span></li>)}</ul>}
          </div>}
          {ubecThreads.length > 0 && <p className="review-dialog-ubec">{ubecCount(ubecThreads.length)} from UBEC {ubecThreads.length === 1 ? 'is' : 'are'} still open on {where}. {action === 'request_changes' ? 'They stay on the plan for Data Entry Staff to answer.' : 'Reply to or resolve them before the plan goes back to UBEC; UBEC sees your replies once it is resubmitted.'}</p>}
          <Field data-invalid={Boolean(formError)}>
            <FieldLabel htmlFor="review-comment">{noteOptional ? 'Note (optional)' : action === 'request_changes' ? 'Required changes' : resubmit ? 'Changes made' : 'Comment (optional)'}</FieldLabel>
            <Textarea id="review-comment" value={comment} onChange={e => setComment(e.target.value)} disabled={saving} required={(action === 'request_changes' && !noteOptional) || resubmit} maxLength={5000} aria-invalid={Boolean(formError)} />
            {formError && <FieldError>{formError}</FieldError>}
          </Field>
        </FieldGroup>
        <DialogFooter>
          <DialogClose asChild><Button variant="outline" type="button" disabled={saving}>Cancel</Button></DialogClose>
          <Button type="submit" disabled={saving}>{saving && <Spinner data-icon="inline-start" />}{submitLabels[action]}</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>;
}
