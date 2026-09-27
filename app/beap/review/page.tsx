"use client";
import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeftIcon, MessageSquareIcon, SendIcon, HistoryIcon } from 'lucide-react';
import { SubebHeader } from '@/components/subeb-header';
import { PlanStatusBadge } from '@/components/plan-status';
import { PlanReviewContent } from '@/components/plan-review-content';
import { Button } from '@/components/ui/button';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Field, FieldGroup, FieldLabel, FieldError } from '@/components/ui/field';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectGroup, SelectItem } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { currentPlanHref, planHref, planPeriod } from '@/lib/action-plans';
import { reviewActionLabels, type PlanReview, type ReviewAction } from '@/lib/plan-review';
import { toast } from 'sonner';
import { componentSections, implementedPillars, type ImplementedPillar } from '@/lib/beap-pillars';
import { subebComponentDepartments as pillarDepartments } from '@/lib/beap-pillars';
import { subebDepartmentName as departmentName } from '@/lib/subeb-departments';
import { mayEditPillar, pillarReviewLabels, statePlanOpen } from '@/lib/pillar-review';
import { Badge } from '@/components/ui/badge';
import { PillarIllustration } from '@/components/pillar-illustration';
import { InfrastructureIllustration } from '@/components/infrastructure-illustration';

const date = new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' });
export default function ReviewPage() {
  const [data, setData] = useState<PlanReview | null>(null);
  const [selected, setSelected] = useState('current');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [action, setAction] = useState<ReviewAction | null>(null);
  const [dialogAction, setDialogAction] = useState<ReviewAction>('submit');
  const [dialogResubmit, setDialogResubmit] = useState(false);
  const [comment, setComment] = useState('');
  const [scope, setScope] = useState('general');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const pending = useRef(false);
  const requestId = useRef(0);
  const load = useCallback(async (version = 'current') => {
    const id = ++requestId.current;
    setLoading(true); setError('');
    try {
      const url = new URL(currentPlanHref('/api/plans/review'), window.location.origin);
      if (version !== 'current') url.searchParams.set('submission', version);
      const response = await fetch(url, { cache: 'no-store' });
      if (response.status === 401) { window.location.replace('/'); return; }
      const result = await response.json() as PlanReview & { error?: string };
      if (!response.ok) throw new Error(result.error);
      if (id !== requestId.current) return;
      setData(result); setSelected(version);
      void fetch('/api/plans/notifications', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ planId: result.plan.id }) });
    } catch (cause) { if (id === requestId.current) setError(cause instanceof Error ? cause.message : 'Unable to load this plan.'); }
    finally { if (id === requestId.current) setLoading(false); }
  }, []);
  useEffect(() => { void Promise.resolve().then(() => load()); }, [load]);
  const plan = data?.plan;
  const editable = data && implementedPillars.some(p => mayEditPillar(data.role,data.department,p,data.plan.status,data.pillarReviews));
  const available = !loading && !error && selected === 'current';
  const latestFeedback = data?.events.find(e => e.action === 'request_changes');
  const actionReviewStatus = data?.pillarReviews.find(review => review.pillar === scope)?.status;
  const openAction = (value: ReviewAction, pillar?: ImplementedPillar) => { setDialogResubmit(pillar ? data?.pillarReviews.find(r=>r.pillar===pillar)?.status === 'changes_requested' : false); setDialogAction(value); setAction(value); setComment(''); setScope(pillar ?? 'general'); setFormError(''); };
  async function confirm() {
    if (!action || !data || pending.current) return;
    pending.current = true; setSaving(true); setFormError('');
    try {
      const response = await fetch(currentPlanHref('/api/plans/review'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, version: data.plan.version, comment, ...(scope !== 'general' ? { pillar: scope } : {}) }) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error);
      setAction(null); toast.success(reviewActionLabels[action]); await load();
    } catch (cause) { setFormError(cause instanceof Error ? cause.message : 'Unable to save. Please try again.'); }
    finally { pending.current = false; setSaving(false); }
  }
  const scopeLabel = (value: string) => value === 'general' ? 'Whole plan' : value === 'infrastructure' ? 'Infrastructure' : value === 'sports' ? 'Sports activities' : value.replace(':', ' · line ');
  return <div className="beap-page beap-review-page"><SubebHeader plan />
    <main className="beap-main review-main"><div className="review-page-summary"><Button asChild variant="ghost" size="sm" className="review-back"><a href={plan ? planHref('/beap', plan.id) : '/dashboard'}><ArrowLeftIcon data-icon="inline-start" />Back to pillars</a></Button>
      <div className="review-heading"><div><h1>{plan ? `${planPeriod(plan)} action plan` : 'Action plan review'}</h1>{plan && <PlanStatusBadge status={plan.status} />}</div><div className="review-actions">
        {data && !error && <div className="review-version"><Select value={selected} onValueChange={value => void load(value)} disabled={saving || loading}><SelectTrigger id="submission-version" aria-label="Plan version" className="rounded-full"><HistoryIcon /><SelectValue /></SelectTrigger><SelectContent><SelectGroup><SelectItem value="current">{'Current working plan'}</SelectItem>{data.submissions.map(s => <SelectItem key={s.number} value={String(s.number)}>Submission {s.number} · {date.format(new Date(s.createdAt))}</SelectItem>)}</SelectGroup></SelectContent></Select></div>}
        {data && !error && !statePlanOpen(data.plan.status) && <Button asChild variant="outline" className="rounded-full"><a href={planHref('/ubec/review',data.plan.id)}>View UBEC review</a></Button>}
      </div></div>
      </div>
      {error && <Alert variant="destructive"><AlertTitle>Review unavailable</AlertTitle><AlertDescription>{error}<Button variant="outline" onClick={() => load(selected)}>Try again</Button></AlertDescription></Alert>}
      {loading ? <Skeleton className="h-64 w-full" /> : data && !error && <>
        {plan?.status === 'changes_requested' && latestFeedback && <Alert className="mb-6"><MessageSquareIcon /><AlertTitle>Changes requested · {scopeLabel(latestFeedback.scope)}</AlertTitle><AlertDescription><p className="review-comment">{latestFeedback.comment}</p>{editable && <Button asChild variant="outline"><a href={planHref('/beap', data.plan.id)}>Edit plan</a></Button>}</AlertDescription></Alert>}
        {selected !== 'current' && <Alert className="mb-6"><AlertTitle>Saved submission {data.selectedSubmission}</AlertTitle><AlertDescription>This version is read-only. Select the current version to take action.</AlertDescription></Alert>}
        <section className="department-reviews" aria-labelledby="department-reviews-title">
          <div className="beap-section-heading"><h2 id="department-reviews-title">All budgeted activities</h2></div>
          <div className="pillar-card-grid department-review-grid">
            {data.pillarReviews.map(review => {
              const pillar = componentSections[review.pillar][0];
              const owns = data.department === pillarDepartments[review.pillar];
              const open = available && statePlanOpen(data.plan.status);
              const staffCanSend = open && owns && data.role==='Data Entry Staff' && ['draft','changes_requested'].includes(review.status);
              const directorCanReview = open && owns && data.role==='Director' && review.status==='director_review';
              const beapChairCanReview = open && data.role==='Director' && data.isBeapChair && review.status==='beap_review';
              const executiveChairmanCanReturn = open && data.role==='Executive Chairman' && review.status==='chairman_ready';
              return <Card key={review.pillar} className="pillar-component-card department-review-card" data-component={review.pillar}>
                <CardHeader>
                  <div className="pillar-card-artwork">{review.pillar === 'infrastructure' ? <InfrastructureIllustration kind="new" /> : <PillarIllustration pillar={review.pillar} standalone />}</div>
                  <CardTitle><h3>{pillar.name}</h3></CardTitle>
                  <p className="pillar-department">{departmentName(pillarDepartments[review.pillar])}</p>
                </CardHeader>
                <CardContent>
                  <Badge variant="secondary">{pillarReviewLabels[review.status]}</Badge>
                  <div className="department-review-actions">
                  {directorCanReview && <Button asChild variant="outline" size="sm"><a href={planHref(pillar.href!,data.plan.id)}>Edit component</a></Button>}
                  {(directorCanReview || beapChairCanReview || executiveChairmanCanReturn) && <Button variant="outline" size="sm" onClick={()=>openAction('request_changes',review.pillar)}>Request changes</Button>}
                  {staffCanSend && <Button size="sm" disabled={!data.snapshot[review.pillar]?.length || (review.pillar==='tlm'&&!data.snapshot.tlmDistribution?.length)} onClick={()=>openAction('submit',review.pillar)}>Send to Director</Button>}
                  {directorCanReview && <Button size="sm" onClick={()=>openAction('endorse',review.pillar)}>Send to BEAP Chair</Button>}
                  </div>
                </CardContent>
              </Card>;
            })}
          </div>
            {data.role==='Director' && data.isBeapChair && statePlanOpen(data.plan.status) && <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
              <p className="text-sm text-muted-foreground">{data.pillarReviews.filter(r=>['beap_review','chairman_ready'].includes(r.status)).length} of {implementedPillars.length} components reviewed by Directors</p>
              <Button disabled={!data.readyForExecutiveChairman || !available} onClick={()=>openAction('forward')}><SendIcon data-icon="inline-start" />Send plan to Executive Chairman</Button>
            </div>}
            {data.role==='Executive Chairman' && statePlanOpen(data.plan.status) && <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
              <p className="text-sm text-muted-foreground">{data.pillarReviews.filter(r=>r.status==='chairman_ready').length} of {implementedPillars.length} components ready</p>
              {data.readyForUbec && available ? <Button asChild><a href={planHref('/ubec/review',data.plan.id)}><SendIcon data-icon="inline-start" />Send to UBEC</a></Button> : <Button disabled>Send to UBEC</Button>}
            </div>}
        </section>
        <div className="review-layout"><PlanReviewContent showPlanReference={false} snapshot={data.snapshot} visiblePillars={data.visiblePillars} tlmEditHref={available && mayEditPillar(data.role, data.department, 'tlm', data.plan.status, data.pillarReviews) ? planHref('/beap/tlm', data.plan.id) : undefined} sbmcEditHref={available && mayEditPillar(data.role, data.department, 'sbmc', data.plan.status, data.pillarReviews) ? planHref('/beap/sbmc', data.plan.id) : undefined} /><Card className="review-history"><CardHeader><CardTitle>Review history</CardTitle></CardHeader><CardContent>{!data.events.length ? <p>No submissions yet.</p> : <ol>{data.events.map(event => <li key={event.id}><strong>{event.action === 'approve' && event.actorRole === 'UBEC Executive Secretary' ? 'Approved by UBEC' : reviewActionLabels[event.action]}</strong><span>Submission {event.submissionNumber} · {event.actorName}</span><span>{event.actorRole} · {date.format(new Date(event.createdAt))}</span>{event.scope !== 'general' && <span>{scopeLabel(event.scope)}</span>}{event.comment && <p className="review-comment">{event.comment}</p>}</li>)}</ol>}</CardContent></Card></div>
      </>}
    </main>
    <Dialog open={Boolean(action)} onOpenChange={open => { if (!open && !saving) setAction(null); }}><DialogContent variant="inset-footer" className="sm:max-w-sm" showCloseButton={!saving} onEscapeKeyDown={e => { if (saving) e.preventDefault(); }} onInteractOutside={e => { if (saving) e.preventDefault(); }}><DialogHeader><DialogTitle>{dialogAction === 'submit' ? dialogResubmit ? 'Resubmit to Director' : 'Submit to Director' : dialogAction === 'endorse' ? 'Send to BEAP Chair' : dialogAction === 'forward' ? 'Send plan to Executive Chairman' : 'Request changes'}</DialogTitle><DialogDescription>{dialogAction === 'submit' ? 'Saved entries in this component will be sent to your department Director. Other departments can continue working.' : dialogAction === 'endorse' ? 'Send this department’s reviewed component to the nominated BEAP Chair for state-level consolidation.' : dialogAction === 'forward' ? 'Send the consolidated plan to the SUBEB Executive Chairman for the final state-level review before UBEC submission.' : actionReviewStatus === 'chairman_ready' ? 'Return this component to the BEAP Chair with the changes required by the Executive Chairman.' : actionReviewStatus === 'beap_review' ? 'Return this component to its department Director with the changes required by the BEAP Chair.' : 'Return this component to the department’s Data Entry Staff with the Director’s required changes.'}</DialogDescription></DialogHeader>
      <form onSubmit={e => { e.preventDefault(); void confirm(); }}><FieldGroup className="px-4 pb-5">
        <Field data-invalid={Boolean(formError)}><FieldLabel htmlFor="review-comment">{dialogAction === 'request_changes' ? 'Required changes' : dialogAction === 'submit' && dialogResubmit ? 'Changes made' : 'Comment (optional)'}</FieldLabel><Textarea id="review-comment" value={comment} onChange={e => setComment(e.target.value)} disabled={saving} required={dialogAction === 'request_changes' || (dialogAction === 'submit' && dialogResubmit)} maxLength={5000} aria-invalid={Boolean(formError)} />{formError && <FieldError>{formError}</FieldError>}</Field></FieldGroup><DialogFooter><DialogClose asChild><Button variant="outline" type="button" disabled={saving}>Cancel</Button></DialogClose><Button type="submit" disabled={saving}>{saving && <Spinner data-icon="inline-start" />}{dialogAction === 'submit' ? 'Submit to Director' : dialogAction === 'endorse' ? 'Send to BEAP Chair' : dialogAction === 'forward' ? 'Send to Executive Chairman' : 'Send feedback'}</Button></DialogFooter></form>
    </DialogContent></Dialog>
  </div>;
}
