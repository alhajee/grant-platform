'use client';

import { useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';
import { ConfirmStep, confirmMoney, useConfirmStep, type ConfirmFact, type ConfirmNote } from '@/components/confirm-step';
import type { CommentsController } from '@/components/plan-workbook/comments-context';
import { currentPlanHref, planPeriod } from '@/lib/action-plans';
import { componentSections, subebComponentDepartments, type ImplementedPillar } from '@/lib/beap-pillars';
import { summarizeSnapshot } from '@/lib/plan-summary';
import { reviewActionLabels, type PlanReview, type ReviewAction } from '@/lib/plan-review';
import { subebDepartmentName } from '@/lib/subeb-departments';

export const commentCount = (n: number) => `${n} open ${n === 1 ? 'comment' : 'comments'}`;
export const ubecCount = (n: number) => `${n} UBEC ${n === 1 ? 'comment' : 'comments'}`;

/** A workflow step the viewer started: the action, and the component it applies to (none = the whole plan). */
export type ReviewRequest = { action: ReviewAction; pillar?: ImplementedPillar };

const titles: Partial<Record<ReviewAction, string>> = { endorse: 'Send to BEAP Chair', forward: 'Send to Executive Chairman', request_changes: 'Request changes' };
const submitLabels: Partial<Record<ReviewAction, string>> = { submit: 'Send to Director', endorse: 'Send to BEAP Chair', forward: 'Send to Executive Chairman', request_changes: 'Send feedback' };

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

const nameOf = (pillar: ImplementedPillar) => componentSections[pillar][0].name;

/** Who receives the step: the next holder for a send, the previous one for a change request. */
function recipientOf(action: ReviewAction, pillar: ImplementedPillar | undefined, reviewStatus: string | undefined) {
  if (action === 'submit') return pillar ? `${subebDepartmentName(subebComponentDepartments[pillar])} Director` : 'Department Director';
  if (action === 'endorse') return 'BEAP Chair';
  if (action === 'forward') return 'Executive Chairman';
  if (reviewStatus === 'chairman_ready') return 'BEAP Chair';
  if (reviewStatus === 'beap_review') return pillar ? `${subebDepartmentName(subebComponentDepartments[pillar])} Director` : 'Department Director';
  return 'Data Entry Staff';
}

type Confirmation = { title: string; description: string; facts: ConfirmFact[]; notes: ConfirmNote[]; confirm: string };

/** What the confirmation step says: the component(s), amount, recipient and what changes for the sender. */
function confirmation(action: ReviewAction, pillar: ImplementedPillar | undefined, data: PlanReview, reviewStatus: string | undefined, openState: number, openUbec: number): Confirmation {
  const totals = summarizeSnapshot(data.snapshot), recipient = recipientOf(action, pillar, reviewStatus);
  const shortRecipient = action === 'submit' || (action === 'request_changes' && reviewStatus === 'beap_review') ? 'Director' : recipient;
  // The collated BEAP Chair send carries every component the Directors have sent up.
  const pillars = pillar ? [pillar] : data.pillarReviews.filter(review => review.status === 'beap_review').map(review => review.pillar);
  const amount = pillars.reduce((sum, p) => sum + totals[p].budget, 0);
  const what = pillar ? nameOf(pillar) : 'the complete BEAP';
  const facts: ConfirmFact[] = [
    { label: 'Plan', value: `${planPeriod(data.plan)} BEAP` },
    pillar ? { label: 'Component', value: nameOf(pillar) } : { label: 'Components', value: <ul>{pillars.map(p => <li key={p}>{nameOf(p)} <small>· {confirmMoney.format(totals[p].budget)}</small></li>)}</ul> },
    { label: pillar ? 'Proposed amount' : 'Total proposed', value: confirmMoney.format(amount) },
    { label: action === 'request_changes' ? 'Returns to' : 'Goes to', value: recipient },
  ];
  if (openState > 0) facts.push({ label: 'Open comments', value: action === 'request_changes' ? `${openState} sent with this request` : `${openState} not resolved yet` });
  if (openUbec > 0) facts.push({ label: 'UBEC comments', value: `${openUbec} still open` });
  if (action === 'request_changes') return {
    title: `Return ${what} to the ${shortRecipient}?`, confirm: `Yes, return to ${shortRecipient}`, facts,
    description: `The ${recipient} is notified and makes the changes you ask for.`,
    notes: [{ kind: 'lock', text: `It leaves your review until the ${recipient} sends it back to you.` }],
  };
  const lockedFor = action === 'submit' ? 'You can’t edit it' : 'You can’t edit it or request changes';
  const returnedBy = action === 'forward' ? 'the Executive Chairman' : `the ${shortRecipient}`;
  return {
    title: `Send ${what} to the ${shortRecipient}?`, confirm: `Yes, send to ${shortRecipient}`, facts,
    description: `${pillar ? 'This component' : 'Every listed component'} goes to the ${recipient} for review.`,
    notes: [
      { kind: 'lock', text: `${lockedFor} while it is with ${returnedBy}, unless it is returned to you.` },
      ...(!pillar ? [{ kind: 'info' as const, text: 'All components travel together as one collated submission.' }] : []),
    ],
  };
}

/**
 * One review step (send on, or request changes) in two steps: the note (optional or required) with the open
 * comments that travel with it, then a confirmation of what will happen. Calls onDone after the server
 * accepts the step.
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
  const step = useConfirmStep('review-comment');
  if (request && request !== shown) { setShown(request); setComment(''); setFormError(''); step.reset(); }
  const { action, pillar } = request ?? shown;
  const scope = pillar ?? 'general';
  const reviewStatus = data.pillarReviews.find(review => review.pillar === pillar)?.status;
  const resubmit = action === 'submit' && reviewStatus === 'changes_requested';
  const open = comments?.threads.filter(t => !t.resolvedAt && (scope === 'general' || t.pillar === scope)) ?? [];
  // State comments travel with a change request; shared UBEC comments are only mentioned.
  const stateThreads = open.filter(t => t.scope === 'state'), ubecThreads = open.filter(t => t.scope === 'ubec');
  const noteOptional = action === 'request_changes' && stateThreads.length > 0;
  const where = scope === 'general' ? 'this plan' : 'this component';
  const summary = useMemo(() => confirmation(action, pillar, data, reviewStatus, stateThreads.length, ubecThreads.length), [action, pillar, data, reviewStatus, stateThreads.length, ubecThreads.length]);

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
    <DialogContent variant="inset-footer" className="sm:max-w-md" showCloseButton={!saving} onEscapeKeyDown={e => step.escape(e, saving)} onInteractOutside={e => { if (saving) e.preventDefault(); }}>
      {step.confirming ? <ConfirmStep title={summary.title} description={summary.description} facts={summary.facts} notes={summary.notes} confirmLabel={summary.confirm} comment={comment} commentLabel={action === 'request_changes' ? 'Required changes' : resubmit ? 'Changes made' : 'Your comment'}
        saving={saving} error={formError} bodyClassName="px-4 pb-5" onBack={() => { setFormError(''); step.back(); }} onConfirm={() => void confirm()} /> : <>
      <DialogHeader className={step.commentStepClass}>
        <DialogTitle>{action === 'submit' ? resubmit ? 'Resubmit to Director' : 'Send to Director' : titles[action]}</DialogTitle>
        <DialogDescription>{describe(action, data, reviewStatus)}</DialogDescription>
      </DialogHeader>
      <form className={step.commentStepClass} onSubmit={e => { e.preventDefault(); setFormError(''); step.review(); }}>
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
      </>}
    </DialogContent>
  </Dialog>;
}
