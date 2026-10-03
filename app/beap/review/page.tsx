"use client";
import '@/components/plan-page/plan-page.css';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeftIcon, HistoryIcon, PencilIcon } from 'lucide-react';
import { SubebHeader } from '@/components/subeb-header';
import { PlanStatusBadge } from '@/components/plan-status';
import { PlanReviewContent } from '@/components/plan-review-content';
import { EditPlanDialog } from '@/components/edit-plan-dialog';
import { PlanSummary } from '@/components/plan-page/plan-summary';
import { ComponentCards, type CardActions } from '@/components/plan-page/component-cards';
import { WorkflowBar } from '@/components/plan-page/workflow-bar';
import { ReviewHistory } from '@/components/plan-page/review-history';
import { PlanDocuments } from '@/components/plan-page/plan-documents';
import { StatusPanel } from '@/components/plan-page/status-panel';
import { ReviewActionDialog, type ReviewRequest } from '@/components/plan-page/review-action-dialog';
import { Button } from '@/components/ui/button';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectGroup, SelectItem } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { currentPlanHref, planHref, planPeriod } from '@/lib/action-plans';
import type { PlanReview } from '@/lib/plan-review';
import { componentSections, implementedPillars, subebComponentDepartments as pillarDepartments, type ImplementedPillar } from '@/lib/beap-pillars';
import { mayEditPillar, statePlanOpen, type PillarReview } from '@/lib/pillar-review';
import { summarizeSnapshot } from '@/lib/plan-summary';
import { componentReadinessProblem, hasReadinessRules } from '@/lib/component-readiness';
import { hasDepartment } from '@/lib/user-departments';
import { usePlanComments } from '@/components/plan-workbook/comments-context';

const date = new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' });
const scopeLabel = (value: string) => value === 'general' ? 'Whole plan' : value === 'infrastructure' ? 'Infrastructure' : value === 'sports' ? 'Sports activities' : componentSections[value as ImplementedPillar]?.[0]?.name ?? value.replace(':', ' · line ');
// Quality Assurance and ICT: compulsory activities, line schools and documents must be in place before any send step.
const readiness = (data: PlanReview, pillar: ImplementedPillar) => hasReadinessRules(pillar) ? componentReadinessProblem(pillar, data.snapshot[pillar] ?? []) : null;
const nothingToSend = (data: PlanReview, pillar: ImplementedPillar) => !data.snapshot[pillar]?.length || (pillar === 'tlm' && !data.snapshot.tlmDistribution?.length) || (pillar === 'curriculum' && !data.snapshot.curriculumDistribution?.length);

/** The plan page: summary, components, workflow steps, the plan workbook and its review history. */
export default function PlanPage() {
  const [data, setData] = useState<PlanReview | null>(null);
  const [selected, setSelected] = useState('current');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [request, setRequest] = useState<ReviewRequest | null>(null);
  const [canEditSetup, setCanEditSetup] = useState(false);
  const [editing, setEditing] = useState(false);
  // One toggle opens the funding details and the full status panel together, so the two cards stay level.
  const [detailsOpen, setDetailsOpen] = useState(false);
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
  const planId = data?.plan.id;
  // Plan details (period and funding) can be edited by plan creators; the dialog explains any lock.
  useEffect(() => {
    if (!planId) return;
    void fetch(`/api/plans/setup?plan=${planId}`, { cache: 'no-store' }).then(r => r.ok ? r.json() as Promise<{ allowed?: boolean }> : null).catch(() => null).then(setup => setCanEditSetup(Boolean(setup?.allowed)));
  }, [planId]);
  // Notification links target a history entry (#review-event-N), which only exists once the review has loaded.
  useEffect(() => {
    if (!data) return;
    const reveal = () => {
      if (!/^#review-event-\d+$/.test(window.location.hash)) return;
      document.getElementById(window.location.hash.slice(1))?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'center' });
    };
    requestAnimationFrame(reveal);
    window.addEventListener('hashchange', reveal);
    return () => window.removeEventListener('hashchange', reveal);
  }, [data]);
  const plan = data?.plan;
  // Comments belong to the current working plan only; saved submissions hide them.
  const comments = usePlanComments(data?.plan.id, !!data && !error && selected === 'current', data?.plan.version);
  const totals = useMemo(() => data && summarizeSnapshot(data.snapshot), [data]);
  const available = !loading && !error && selected === 'current';
  const open = !!data && available && statePlanOpen(data.plan.status);
  const latestFeedback = data?.events.find(e => e.action === 'request_changes');
  const editHref = (pillar: ImplementedPillar) => data && available && mayEditPillar(data.role, data.departments, pillar, data.plan.status, data.pillarReviews) ? planHref(componentSections[pillar][0].href!, data.plan.id) : undefined;
  // Request changes lives in each sheet's toolbar, for whoever currently holds that component.
  const holds = (review: PillarReview) => {
    if (!data || !open) return false;
    if (data.role === 'Director' && !data.isBeapChair) return review.status === 'director_review' && hasDepartment(data.departments, pillarDepartments[review.pillar]);
    if (data.role === 'Director' && data.isBeapChair) return review.status === 'beap_review';
    return data.role === 'Executive Chairman' && review.status === 'chairman_ready';
  };
  const requestChangesHandlers = Object.fromEntries((data?.pillarReviews ?? []).filter(holds).map(review => [review.pillar, () => setRequest({ action: 'request_changes', pillar: review.pillar })]));
  const actionsFor = (review: PillarReview): CardActions => {
    const { pillar, status } = review, actions: CardActions = { editHref: editHref(pillar) };
    if (!data || !open) return actions;
    const owns = hasDepartment(data.departments, pillarDepartments[pillar]);
    // Nothing saved yet means nothing to send: the card then only offers its editor.
    if (data.role === 'Data Entry Staff' && owns && ['draft', 'changes_requested'].includes(status)) return nothingToSend(data, pillar) ? actions : { ...actions, step: { label: 'Send to Director', run: () => setRequest({ action: 'submit', pillar }), blocked: readiness(data, pillar) } };
    if (data.role === 'Director' && !data.isBeapChair && owns && status === 'director_review') return { ...actions, step: { label: 'Send to BEAP Chair', run: () => setRequest({ action: 'endorse', pillar }), blocked: readiness(data, pillar) } };
    if (data.role === 'Director' && data.isBeapChair && status === 'beap_review' && data.beapChairSubmissionMode === 'individual_components') return { ...actions, step: { label: 'Send to Executive Chairman', run: () => setRequest({ action: 'forward', pillar }), blocked: readiness(data, pillar) } };
    return actions;
  };
  const workbookLinks = data ? Object.fromEntries(implementedPillars.map(p => [`${p}EditHref`, editHref(p)])) : {};

  return <div className="beap-page beap-review-page"><SubebHeader plan />
    <main className="beap-main review-main plan-page" id="main-content">
      <div className="review-page-summary">
        <Button asChild variant="ghost" size="sm" className="review-back"><a href="/dashboard"><ArrowLeftIcon data-icon="inline-start" />Dashboard</a></Button>
        <div className="review-heading"><div><h1>{plan ? `${planPeriod(plan).replace(' · ', ' ')} BEAP` : 'BEAP'}</h1>{plan && <PlanStatusBadge status={plan.status} />}</div><div className="review-actions">
          {data && !error && <div className="review-version"><Select value={selected} onValueChange={value => void load(value)} disabled={loading}><SelectTrigger id="submission-version" aria-label="Plan version" className="rounded-full"><HistoryIcon /><SelectValue /></SelectTrigger><SelectContent><SelectGroup><SelectItem value="current">Current working plan</SelectItem>{data.submissions.map(s => <SelectItem key={s.number} value={String(s.number)}>Submission {s.number} · {date.format(new Date(s.createdAt))}</SelectItem>)}</SelectGroup></SelectContent></Select></div>}
          {data && !error && canEditSetup && <Button variant="outline" className="rounded-full" onClick={() => setEditing(true)}><PencilIcon data-icon="inline-start" />Edit plan</Button>}
          {data && !error && !statePlanOpen(data.plan.status) && <Button asChild variant="outline" className="rounded-full"><a href={planHref('/ubec/review', data.plan.id)}>View UBEC review</a></Button>}
        </div></div>
      </div>
      {error && <Alert variant="destructive"><AlertTitle>Plan unavailable</AlertTitle><AlertDescription>{error}<Button variant="outline" onClick={() => load(selected)}>Try again</Button></AlertDescription></Alert>}
      {loading && !data ? <div className="plan-page-loading"><Skeleton className="h-36 w-full rounded-3xl" /><Skeleton className="h-64 w-full rounded-3xl" /></div> : data && totals && !error && <>
        {selected !== 'current' && <Alert><AlertTitle>Saved submission {data.selectedSubmission}</AlertTitle><AlertDescription>This version is read-only. Select the current version to take action.</AlertDescription></Alert>}
        {/* Components in the main column; the plan's funding and status sit in a sticky column on the right. */}
        <div className="plan-glance">
          {/* The heading has its own row, so the cards and the right-hand cards start on the same line. */}
          <h2 id="plan-components-title" className="plan-section-title plan-glance-head">Components</h2>
          <section className="plan-components plan-glance-main" id="plan-components" aria-labelledby="plan-components-title">
            <ComponentCards data={data} totals={totals} comments={comments} actionsFor={actionsFor} />
            <WorkflowBar data={data} available={available} onForward={() => setRequest({ action: 'forward' })} />
          </section>
          <aside className="plan-glance-side" aria-label="Plan funding and status">
            <PlanSummary plan={data.plan} totals={totals} detailsOpen={detailsOpen} onDetailsOpenChange={setDetailsOpen} />
            <StatusPanel feedback={plan?.status === 'changes_requested' ? latestFeedback : undefined} events={data.events} scopeLabel={scopeLabel} />
          </aside>
        </div>
        <div className="review-layout">
          <PlanReviewContent showPlanReference={false} showDocuments={false} comments={comments} requestChanges={requestChangesHandlers} snapshot={data.snapshot} visiblePillars={data.visiblePillars} {...workbookLinks} />
          {/* Documents and the review history share a row; each takes the full width on narrow screens. */}
          <div className="plan-records">
            <PlanDocuments snapshot={data.snapshot} visiblePillars={data.visiblePillars} />
            <ReviewHistory events={data.events} scopeLabel={scopeLabel} />
          </div>
        </div>
      </>}
    </main>
    {data && <ReviewActionDialog request={request} data={data} comments={comments} onClose={() => setRequest(null)} onDone={() => { setRequest(null); void load(); }} />}
    {editing && data && <EditPlanDialog planId={data.plan.id} onClose={() => setEditing(false)} onSaved={() => void load(selected)} />}
  </div>;
}
