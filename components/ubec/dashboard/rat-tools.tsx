'use client';
import '@/components/ubec/ubec-flow.css';
import { useEffect, useState } from 'react';
import { CheckIcon, DownloadIcon, FileSpreadsheetIcon, XIcon } from 'lucide-react';
import { toast } from 'sonner';
import { NoItemsArt, UbecEmpty } from '@/components/empty-art/ubec-flow';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { Textarea } from '@/components/ui/textarea';
import { Spinner } from '@/components/ui/spinner';
import { maxRatCommentLength, ratRejectionNeedsComment, type RatDecision } from '@/lib/rat-review';
import { nationalStatusLabels, type RatToolPlan } from '@/lib/ubec';

const date = new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium' });
const kb = (size: number) => size >= 1024 * 1024 ? `${(size / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(size / 1024))} KB`;

const open = (plan: RatToolPlan) => plan.status === 'received' || plan.status === 'reviewing';

/** UBEC205: Accept, or Reject with a comment (required), the RAT tool of a submission still with UBEC. */
function RatDecisionControls({ plan, onDecided }: { plan: RatToolPlan; onDecided: () => void }) {
  const [rejecting, setRejecting] = useState(false), [comment, setComment] = useState(''), [error, setError] = useState(''), [saving, setSaving] = useState(false);
  async function decide(decision: RatDecision, note = '') {
    if (saving) return;
    if (decision === 'reject' && !note.trim()) { setError(ratRejectionNeedsComment); return; }
    setSaving(true);
    try {
      const response = await fetch('/api/ubec/rat-review', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ roundId: plan.roundId, decision, comment: note }) });
      const body = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw Error(body.error || 'The RAT review could not be saved');
      toast.success(decision === 'accept' ? 'RAT tool accepted' : 'RAT tool rejected'); setRejecting(false); setComment(''); onDecided();
    } catch (cause) { const message = cause instanceof Error ? cause.message : 'The RAT review could not be saved'; if (decision === 'reject') setError(message); else toast.error(message); }
    finally { setSaving(false); }
  }
  return <span className="rat-tools-decide">
    <Button size="sm" variant={plan.review?.decision === 'accept' ? 'default' : 'outline'} className="rounded-full" disabled={saving || plan.review?.decision === 'accept'} onClick={() => void decide('accept')}><CheckIcon data-icon="inline-start" />Accept</Button>
    <Button size="sm" variant="outline" className="rounded-full rat-tools-reject" disabled={saving} onClick={() => { setComment(plan.review?.decision === 'reject' ? plan.review.comment : ''); setError(''); setRejecting(true); }}><XIcon data-icon="inline-start" />Reject…</Button>
    <Dialog open={rejecting} onOpenChange={value => { if (!saving) setRejecting(value); }}><DialogContent>
      <DialogHeader><DialogTitle>Reject the RAT tool</DialogTitle><DialogDescription>{plan.state} · {plan.period}. The SUBEB sees your comment once the plan is returned and must upload a corrected RAT</DialogDescription></DialogHeader>
      <Field data-invalid={!!error}><FieldLabel htmlFor={`rat-comment-${plan.roundId}`}>What needs correcting</FieldLabel><Textarea id={`rat-comment-${plan.roundId}`} autoFocus maxLength={maxRatCommentLength} value={comment} onChange={e => { setComment(e.target.value); setError(''); }} />{error && <FieldError>{error}</FieldError>}</Field>
      <DialogFooter><Button variant="outline" disabled={saving} onClick={() => setRejecting(false)}>Cancel</Button><Button variant="destructive" disabled={saving || !comment.trim()} onClick={() => void decide('reject', comment)}>{saving && <Spinner data-icon="inline-start" />}Reject RAT tool</Button></DialogFooter>
    </DialogContent></Dialog>
  </span>;
}

/** UBEC139/205: the RAT tool of every plan submitted to UBEC, for UBEC Planning (DPRS) to download, accept or reject (app/api/ubec/rat-tools). */
export function RatToolsCard({ limit = 8 }: { limit?: number }) {
  const [plans, setPlans] = useState<RatToolPlan[] | null>(null), [error, setError] = useState(''), [all, setAll] = useState(false);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    let active = true;
    void fetch('/api/ubec/rat-tools', { cache: 'no-store' }).then(async response => {
      const body = await response.json().catch(() => ({})) as { plans?: RatToolPlan[]; error?: string };
      if (!response.ok) throw Error(body.error || 'Unable to load the RAT tools');
      if (active) setPlans(body.plans ?? []);
    }).catch(cause => { if (active) setError(cause instanceof Error ? cause.message : 'Unable to load the RAT tools'); });
    return () => { active = false; };
  }, [reload]);
  const shown = plans ? (all ? plans : plans.slice(0, limit)) : [];
  return <Card className="rat-tools-card"><CardHeader><CardTitle>RAT tools {plans && <Badge variant="secondary">{plans.length}</Badge>}</CardTitle><CardDescription>The Rapid Assessment Tool of each plan sent to UBEC. Accept it, or reject it with a comment for the SUBEB to correct</CardDescription></CardHeader><CardContent>
    {error ? <p className="text-sm text-destructive" role="alert">{error}</p>
      : !plans ? <Skeleton className="h-32 w-full rounded-xl" />
      : !plans.length ? <UbecEmpty art={<NoItemsArt />} title="No plans sent to UBEC yet" compact>RAT tools appear here when a SUBEB sends its plan</UbecEmpty>
      : <>
        <ul className="rat-tools-list">{shown.map(plan => <li key={plan.planId}>
          <div><strong>{plan.state} · {plan.period}</strong><small>Sent {date.format(new Date(plan.submittedAt))} · {nationalStatusLabels[plan.status] ?? plan.status}</small>{plan.review && <small className="rat-tools-review" data-decision={plan.review.decision}>{plan.review.decision === 'accept' ? 'RAT accepted' : `RAT rejected: “${plan.review.comment}”`} · {plan.review.reviewerName}</small>}</div>
          <span className="rat-tools-files">{plan.documents.length ? plan.documents.map(doc => <Button key={doc.id} asChild size="sm" variant="outline" className="rounded-full"><a href={`/api/plans/documents?id=${doc.id}`} download={doc.name} title={doc.name}><FileSpreadsheetIcon data-icon="inline-start" /><span className="rat-tools-name">{doc.name}</span><small>{kb(doc.size)}</small><DownloadIcon data-icon="inline-end" /></a></Button>) : <small className="text-muted-foreground">No RAT uploaded</small>}{open(plan) && plan.documents.length > 0 && <RatDecisionControls plan={plan} onDecided={() => setReload(n => n + 1)} />}</span>
        </li>)}</ul>
        {plans.length > limit && <Button variant="ghost" size="sm" className="rounded-full mt-2" onClick={() => setAll(!all)}>{all ? 'Show fewer' : `Show all ${plans.length}`}</Button>}
      </>}
  </CardContent></Card>;
}
