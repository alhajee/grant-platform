'use client';
import '@/components/plan-page/plan-page.css';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeftIcon, CheckIcon, CornerDownLeftIcon, HistoryIcon, MegaphoneIcon, SendIcon, Undo2Icon, UserMinusIcon } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field, FieldLabel } from '@/components/ui/field';
import { Textarea } from '@/components/ui/textarea';
import { UbecShell } from '@/components/ubec-shell';
import { PlanReviewContent } from '@/components/plan-review-content';
import { PlanSummary } from '@/components/plan-page/plan-summary';
import { UbecComponentCards, type CardStep } from '@/components/ubec/ubec-component-cards';
import { FlowDialog, type FlowRequest } from '@/components/ubec/flow-dialog';
import { DecisionBar, StagePill } from '@/components/ubec/flow-bits';
import type { RowDecision, WorkbookAssessment } from '@/components/plan-workbook/assessment-context';
import { NotReleasedArt, PipelineIdleArt, UbecEmpty } from '@/components/empty-art/ubec-flow';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectGroup, SelectItem } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { usePlanComments } from '@/components/plan-workbook/comments-context';
import { planPeriod, type ActionPlan } from '@/lib/action-plans';
import type { ImplementedPillar } from '@/lib/beap-pillars';
import { summarizeSnapshot } from '@/lib/plan-summary';
import { activePillars, departmentName, isUbec, nationalStatusLabels, pillarDepartments, ubecRoles, type UbecDetail } from '@/lib/ubec';
import { componentName, defaultAssignerName, needsValidationReport, superAdminRole, type ItemDecision, type ItemDecisionValue, type PipelineComponent } from '@/lib/ubec-flow';
import { toast } from 'sonner';
import { Spinner } from '@/components/ui/spinner';

const date = new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' });
const trail: Record<string, string> = { submit: 'Submitted to UBEC', release: 'Released to the UBEC departments', assign_officer: 'Assessment Officers assigned', reopen_assessment: 'Assessment sent back to the officer', assign_observer: 'Oversight officers assigned', unassign_observer: 'Oversight officer removed', default_officers: 'Default Assessment Officers assigned', unassign_officer: 'Assessment Officer removed', complete_assessment: 'Assessment completed', send_oversight: 'Sent for oversight', observations_done: 'Observations done', ready_for_chair: 'Ready for the UBEC BEAP Chair', return: 'Returned to SUBEB', approve: 'Approved by UBEC', assign: 'Departments assigned (earlier flow)', feedback: 'Department review (earlier flow)' };

/** The UBEC plan page: summary, component cards, the BEAP Chair's steps, item assessment, the workbook and the trail. */
export default function UbecReviewPage() {
  const [data, setData] = useState<UbecDetail | null>(null), [error, setError] = useState(''), [loading, setLoading] = useState(true), [selected, setSelected] = useState('current');
  const [request, setRequest] = useState<FlowRequest | null>(null), [tab, setTab] = useState<string>(''), [detailsOpen, setDetailsOpen] = useState(false);
  const requestId = useRef(0);
  const path = () => `/api/ubec/review?plan=${encodeURIComponent(new URLSearchParams(window.location.search).get('plan') ?? '')}`;
  const load = useCallback(async (value = 'current') => {
    const ticket = ++requestId.current; setLoading(true); setError('');
    try {
      const response = await fetch(path() + (value === 'current' ? '' : `&round=${value}`), { cache: 'no-store' });
      if (response.status === 401) { window.location.replace('/'); return; }
      const result = await response.json() as UbecDetail & { error?: string };
      if (!response.ok) throw new Error(result.error);
      if (ticket === requestId.current) { setData(result); setSelected(value); }
    } catch (cause) { if (ticket === requestId.current) setError(cause instanceof Error ? cause.message : 'Unable to load review'); }
    finally { if (ticket === requestId.current) setLoading(false); }
  }, []);
  useEffect(() => { void Promise.resolve().then(() => load()); }, [load]);
  // State users follow the plan (and send it to UBEC) on their own plan page.
  useEffect(() => { if (data && !isUbec(data.role) && data.role !== superAdminRole) window.location.replace(`/beap/review?plan=${data.plan.id}`); }, [data]);
  // Notification links (#ubec-<component>) open that component's items.
  useEffect(() => {
    const fromHash = () => { const match = /^#ubec-([a-z]+)$/.exec(window.location.hash); if (match) { setTab(match[1]); window.location.replace(`#review-${match[1]}`); } };
    fromHash(); window.addEventListener('hashchange', fromHash); return () => window.removeEventListener('hashchange', fromHash);
  }, [data]);

  const current = selected === 'current', round = data?.round ?? null, flow = data?.flow ?? null;
  // The Super Admin only manages officer assignments here; UBEC comments stay with the UBEC review roles.
  const admin = data?.role === superAdminRole;
  const comments = usePlanComments(data?.plan.id, !!round && !loading && !error && !admin, `${data?.plan.version}:${selected}:${flow?.decisions.length}`, { scope: 'ubec', roundId: current ? null : round?.id ?? null });
  const totals = useMemo(() => round && summarizeSnapshot(round.snapshot), [round]);
  const pillars = useMemo(() => round ? activePillars(round.snapshot) : [], [round]);
  const cards: PipelineComponent[] = useMemo(() => pillars.map(pillar => {
    const c = flow?.components.find(x => x.pillar === pillar);
    return { pillar, department: c?.department ?? pillarDepartments[pillar], stage: c?.stage ?? 'unreleased', amount: totals?.[pillar].budget ?? 0, counts: c?.counts ?? { accepted: 0, rejected: 0, undecided: 0, total: 0 },
      officers: (c?.officers ?? []).map(o => ({ name: o.officerName, completed: !!o.completedAt, mine: false })), oversightDone: c?.oversight.map(o => o.department) ?? [] };
  }), [pillars, flow, totals]);
  const can = current && flow ? flow.abilities : null;
  const [reportBusy, setReportBusy] = useState(false);
  // Officers decide items in the workbook: each released component's sheet carries its decisions.
  const assessment = useMemo<WorkbookAssessment | null>(() => {
    if (!round || !flow?.components.length) return null;
    const byPillar = (list: readonly ItemDecision[]) => (pillar: ImplementedPillar) => new Map<string, RowDecision>(list.filter(d => d.pillar === pillar).map(d => [d.rowRef, d]));
    const decide = async (pillar: ImplementedPillar, rowRefs: readonly string[], decision: ItemDecisionValue | null, note = '') => {
      let problem = '';
      for (const rowRef of rowRefs) {
        try {
          const response = await fetch(`/api/ubec/decisions?plan=${data!.plan.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ roundId: round.id, pillar, rowRef, decision, note }) });
          if (!response.ok) { problem = ((await response.json().catch(() => ({}))) as { error?: string }).error || 'The decision could not be saved'; break; }
        } catch { problem = 'You appear to be offline. The decision was not saved.'; break; }
      }
      await load();
      if (problem) toast.error(problem);
      return !problem;
    };
    return { pillars: flow.components.map(c => c.pillar), decisions: byPillar(flow.decisions), previous: byPillar(flow.previousDecisions),
      canDecide: pillar => !!can?.assess.includes(pillar) || !!can?.override?.includes(pillar), decide, canComplete: pillar => !!can?.complete.includes(pillar), complete: pillar => setRequest({ kind: 'complete', pillar }),
      canObserve: pillar => !!can?.observe.includes(pillar), observe: pillar => setRequest({ kind: 'observe', pillar }), canComment: pillar => !!can?.comment?.includes(pillar),
      oversightDone: pillar => flow.components.find(c => c.pillar === pillar)?.oversight.map(o => o.department) ?? [],
      validation: pillar => {
        const c = flow.components.find(x => x.pillar === pillar);
        if (!c || !needsValidationReport(pillar) || !data) return null;
        const url = `/api/ubec/validation-reports?plan=${data.plan.id}`;
        return { reports: c.validationReports, mine: c.validationReports.filter(r => r.officerId === flow.viewerId), busy: reportBusy, href: id => `${url}&id=${id}`,
          upload: async files => {
            setReportBusy(true);
            try {
              for (const file of files) {
                const form = new FormData(); form.set('roundId', String(round.id)); form.set('pillar', pillar); form.set('file', file);
                const response = await fetch(url, { method: 'POST', body: form });
                if (!response.ok) { toast.error(((await response.json().catch(() => ({}))) as { error?: string }).error || `${file.name} could not be uploaded`); break; }
              }
            } catch { toast.error('You appear to be offline. The report was not uploaded.'); }
            finally { setReportBusy(false); await load(); }
          },
          remove: async id => {
            setReportBusy(true);
            try {
              const response = await fetch(`${url}&id=${id}`, { method: 'DELETE' });
              if (!response.ok) toast.error(((await response.json().catch(() => ({}))) as { error?: string }).error || 'The report could not be removed');
            } catch { toast.error('You appear to be offline. The report was not removed.'); }
            finally { setReportBusy(false); await load(); }
          } };
      } };
  }, [round, flow, can, data, load, reportBusy]);
  // "Assign staff" first; "Add officers" while someone of the department is free; "Manage officers" once all are on it.
  const assignLabel = (pillar: ImplementedPillar) => {
    const c = flow?.components.find(x => x.pillar === pillar);
    if (!c?.officers.length) return 'Assign staff';
    return flow!.officers.some(o => o.department === c.department && !c.officers.some(a => a.officerId === o.id)) ? 'Add officers' : 'Manage officers';
  };
  const stepsFor = (pillar: ImplementedPillar): CardStep[] => !can ? [] : [
    ...(can.assign.includes(pillar) ? [{ label: assignLabel(pillar), kind: 'assign' as const, run: () => setRequest({ kind: 'assign', pillar }) }] : []),
    ...(can.assess.includes(pillar) ? [{ label: 'Assess items', kind: 'assess' as const, run: () => { window.location.hash = `review-${pillar}`; } }] : []),
    ...(can.sendOversight.includes(pillar) ? [{ label: 'Send for oversight', kind: 'oversight' as const, run: () => setRequest({ kind: 'oversight', pillar }) }] : []),
    ...(can.assignObservers?.includes(pillar) ? [{ label: flow?.components.find(x => x.pillar === pillar)?.observers.some(o => o.department === data?.department) ? 'Manage officers' : 'Assign officers', kind: 'assign' as const, run: () => setRequest({ kind: 'observers', pillar }) }] : []),
    ...(can.comment?.includes(pillar) ? [{ label: 'Comment on items', kind: 'assess' as const, run: () => { window.location.hash = `review-${pillar}`; } }] : []),
    ...(can.observe.includes(pillar) ? [{ label: 'Observations done', kind: 'observe' as const, run: () => setRequest({ kind: 'observe', pillar }) }] : []),
  ];
  const released = flow?.components ?? [];
  const activeTab = released.some(c => c.pillar === tab) ? tab : (released.find(c => can?.assess.includes(c.pillar) || can?.observe.includes(c.pillar) || can?.comment?.includes(c.pillar)) ?? released[0])?.pillar ?? '';
  const role = data?.role ?? '', chair = role === ubecRoles.chair;
  const envelope = round?.snapshot.setup ? { id: data!.plan.id, startYear: data!.plan.start_year, endYear: data!.plan.end_year, createdAt: round.submitted_at, status: 'submitted_ubec', version: data!.plan.version, submissionNumber: round.state_submission, ...round.snapshot.setup } as ActionPlan : null;
  const arrived = released.filter(c => c.stage === 'chair').length;

  // With one or two components the cards leave the main column mostly empty: the team summary moves up beside the funding card.
  const fewComponents = cards.length > 0 && cards.length <= 2;
  const assessmentSection = data && round && flow ? <>
  <section id="ubec-assessment" className="ubec-assessment" aria-labelledby="ubec-assessment-title">
    <h2 id="ubec-assessment-title" className="plan-section-title">Assessment team</h2>
    {!released.length ? <Card><CardContent><UbecEmpty art={<NotReleasedArt />} title="Not released yet" compact>{chair ? 'Items open for assessment once you release the plan' : 'The UBEC BEAP Chair releases the plan to the departments first'}</UbecEmpty></CardContent></Card>
      : <Tabs value={activeTab} onValueChange={value => { setTab(value); history.replaceState(history.state, '', `${window.location.pathname}${window.location.search}#ubec-${value}`); }}>
        <div className="plan-workbook-tabs-scroll"><TabsList variant="line" className="admin-section-tabs ubec-assessment-tabs">{released.map(c => <TabsTrigger key={c.pillar} value={c.pillar}>{componentName(c.pillar)}{c.counts.rejected > 0 && <Badge variant="destructive" className="ml-1">{c.counts.rejected}</Badge>}</TabsTrigger>)}</TabsList></div>
        {released.map(c => <TabsContent key={c.pillar} value={c.pillar} className="ubec-assessment-panel">
          <div className="ubec-assessment-summary"><StagePill stage={c.stage} /><DecisionBar counts={c.counts} /><Button variant="outline" size="sm" className="rounded-full" onClick={() => { window.location.hash = `review-${c.pillar}`; }}>{can?.assess.includes(c.pillar) ? 'Assess in the workbook' : can?.observe.includes(c.pillar) || can?.comment?.includes(c.pillar) ? 'Review in the workbook' : 'View in the workbook'}</Button></div>
          <ComponentPeople component={c} planId={data.plan.id} roundId={round.id} viewerId={flow.viewerId} canSendBack={!!can?.override?.includes(c.pillar)} canComplete={!!can?.complete.includes(c.pillar)} canRemove={!!can?.assign.includes(c.pillar)} removableObservers={can?.assignObservers?.includes(c.pillar) ? data.department : null} onComplete={() => setRequest({ kind: 'complete', pillar: c.pillar })} onChanged={() => void load()} />
        </TabsContent>)}
      </Tabs>}
  </section>
  </> : null;

  return <UbecShell review user={data?.user}>
    <div className="ubec-review-workspace plan-page ubec-plan-page">
      <Button asChild variant="ghost" size="sm" className="review-back"><a href={admin ? '/admin?section=officers' : '/ubec'}><ArrowLeftIcon data-icon="inline-start" />{admin ? 'Administration' : 'Dashboard'}</a></Button>
      <div className="national-page-title"><div><span className="national-eyebrow">{data?.plan.stateName ?? 'BASIC EDUCATION ACTION PLAN'}</span><h1>{data ? `${planPeriod({ startYear: data.plan.start_year, endYear: data.plan.end_year, fundingQuarters: data.plan.funding_quarters })} BEAP` : 'Plan review'}</h1></div>
        <div className="review-actions">
          {flow?.releasedAt && <Popover><PopoverTrigger asChild><Button variant="outline" size="sm" className="rounded-full"><MegaphoneIcon data-icon="inline-start" />Chair’s note</Button></PopoverTrigger>
            <PopoverContent align="end" className="ubec-release-note"><strong>{flow.releasedByName === 'UBEC BEAP Chair' ? flow.releasedByName : `${flow.releasedByName}, UBEC BEAP Chair`}</strong>{flow.releaseComment && <p>{flow.releaseComment}</p>}<small>Released {date.format(new Date(flow.releasedAt))}</small></PopoverContent></Popover>}
          {round && <Badge variant={round.status === 'returned' ? 'warning' : round.status === 'approved' ? 'default' : 'secondary'}>{nationalStatusLabels[round.status]}</Badge>}
          {data && data.rounds.length > 0 && <Select value={selected} onValueChange={value => void load(value)}><SelectTrigger aria-label="UBEC submission" className="rounded-full"><HistoryIcon /><SelectValue /></SelectTrigger><SelectContent><SelectGroup><SelectItem value="current">Current submission</SelectItem>{data.rounds.map(r => <SelectItem key={r.id} value={String(r.id)}>Submission {r.number} · {date.format(new Date(r.submitted_at))}</SelectItem>)}</SelectGroup></SelectContent></Select>}
        </div>
      </div>
      {error && <Alert variant="destructive"><AlertTitle>Review unavailable</AlertTitle><AlertDescription>{error}<Button variant="outline" onClick={() => load(selected)}>Retry</Button></AlertDescription></Alert>}
      {loading && !data ? <div className="plan-page-loading"><Skeleton className="h-36 w-full rounded-3xl" /><Skeleton className="h-64 w-full rounded-3xl" /></div> : data && round && flow && !error && <>
        {!current && <Alert><AlertTitle>Earlier submission</AlertTitle><AlertDescription>This submission is read-only</AlertDescription></Alert>}
        {admin && <Alert className="ubec-role-note"><AlertTitle>Super Admin view</AlertTitle><AlertDescription>You can assign, remove or reassign Assessment Officers on components still with their Director, with the same rules as the Director. Every other step belongs to the UBEC review roles.</AlertDescription></Alert>}
        {role === ubecRoles.es && <Alert className="ubec-role-note"><AlertTitle>Supervisory view</AlertTitle><AlertDescription>You can see every component, stage and comment. Workflow steps are taken by the UBEC BEAP Chair, Directors, Oversight Directors and Assessment Officers.</AlertDescription></Alert>}
        {round.decision && <Alert className="ubec-decision-note" data-status={round.status}><AlertTitle>{round.status === 'returned' ? 'Returned to the SUBEB' : 'UBEC decision'}</AlertTitle><AlertDescription className="review-comment">{round.decision}</AlertDescription></Alert>}
        <div className="plan-glance">
          <h2 id="ubec-components-title" className="plan-section-title plan-glance-head">Components</h2>
          <section className="plan-components plan-glance-main" aria-labelledby="ubec-components-title">
            {cards.length ? <UbecComponentCards components={cards} planTotal={totals?.total.budget ?? 0} comments={comments} stepsFor={stepsFor} onView={pillar => { window.location.hash = `review-${pillar}`; setTab(pillar); }} />
              : <UbecEmpty art={<PipelineIdleArt />} title="No components to show">Nothing in this submission has reached you</UbecEmpty>}
            {chair && current && <div className="workflow-bar ubec-chair-bar">
              {round.status === 'received' ? <><div className="ubec-chair-cta"><span className="ubec-chair-cta-icon"><SendIcon aria-hidden="true" /></span><p><strong>Ready to release</strong><span>{pillars.length} components go to {new Set(pillars.map(p => pillarDepartments[p])).size} department Directors</span></p></div><Button className="rounded-full" disabled={!can?.release} onClick={() => setRequest({ kind: 'release' })}><SendIcon data-icon="inline-start" />Release to UBEC departments</Button></>
                : round.status === 'reviewing' ? <><p><strong>{arrived} of {released.length} components have reached you.</strong>{flow.allArrived ? flow.approvable ? 'Every item is accepted' : flow.openOversightComments && flow.components.every(c => c.counts.rejected === 0 && c.counts.undecided === 0) ? `${flow.openOversightComments} ${flow.openOversightComments === 1 ? 'comment' : 'comments'} from Audit, Procurement and Finance ${flow.openOversightComments === 1 ? 'is still open. Resolve it' : 'are still open. Resolve them'} before approving` : 'Some items are rejected or undecided, so the plan can only be returned' : 'Approve or return once every component has finished oversight'}</p>
                  <span className="ubec-chair-actions"><Button variant="outline" className="rounded-full" disabled={!can?.decide} onClick={() => setRequest({ kind: 'return' })}><CornerDownLeftIcon data-icon="inline-start" />Return to SUBEB</Button><Button className="rounded-full" disabled={!can?.decide || !flow.approvable} onClick={() => setRequest({ kind: 'approve' })}><CheckIcon data-icon="inline-start" />Approve action plan</Button></span></>
                : <p><strong>{nationalStatusLabels[round.status]}.</strong>The SUBEB {round.status === 'returned' ? 'revises and resubmits the plan.' : 'has been notified.'}</p>}
            </div>}
            {fewComponents && assessmentSection}
          </section>
          <aside className="plan-glance-side" aria-label="Plan funding">
            {envelope && totals ? <PlanSummary plan={envelope} totals={totals} detailsOpen={detailsOpen} onDetailsOpenChange={setDetailsOpen} /> : null}
            <Card className="ubec-pipeline-card"><CardHeader><CardTitle>Review pipeline</CardTitle></CardHeader><CardContent>
              <ol className="ubec-pipeline-steps">{(['unreleased', 'director', 'oversight', 'chair'] as const).map(stage => { const n = cards.filter(c => c.stage === stage).length; return <li key={stage} data-active={n > 0 || undefined}><StagePill stage={stage} /><b>{n}</b></li>; })}</ol>
              <p className="ubec-pipeline-meta">Received {date.format(new Date(round.submitted_at))} · Submission {round.number}</p>
            </CardContent></Card>
          </aside>
        </div>

        {!fewComponents && assessmentSection}

        <PlanReviewContent key={round.id} showPlanReference={false} comments={comments} assessment={assessment} snapshot={round.snapshot} visiblePillars={pillars.length ? pillars : undefined} />
        {data.assignments.length > 0 && <Card className="mt-6"><CardHeader><CardTitle>Earlier department reviews</CardTitle></CardHeader><CardContent><ul className="ubec-legacy-reviews">{data.assignments.map(a => <li key={a.id}><strong>{departmentName(a.department)} · {componentName(a.pillar)}</strong><span>{a.completed_at ? a.recommendation === 'changes' ? 'Changes recommended' : 'Endorsed' : 'Not completed'}</span>{a.feedback && <p className="review-comment">{a.feedback}</p>}</li>)}</ul></CardContent></Card>}
        <Card className="mt-6"><CardHeader><CardTitle>Review trail</CardTitle></CardHeader><CardContent><ol className="national-activity">{data.events.map(e => <li key={e.id}><span className="national-activity-dot" /><div><strong>{trail[e.action] ?? e.action}{e.pillar ? ` · ${componentName(e.pillar)}` : ''}</strong><span>{e.actor} · {date.format(new Date(e.created_at))}</span>{e.comment && <p className="review-comment">{e.comment}</p>}</div></li>)}</ol></CardContent></Card>
        <FlowDialog admin={admin} request={request} planId={data.plan.id} plan={`${data.plan.stateName ? `${data.plan.stateName} ` : ''}${planPeriod({ startYear: data.plan.start_year, endYear: data.plan.end_year, fundingQuarters: data.plan.funding_quarters })} BEAP`} version={data.plan.version} roundId={round.id} flow={flow} components={cards} threads={comments?.threads ?? []} onClose={() => setRequest(null)} onDone={() => { setRequest(null); void load(); }} onChanged={() => void load()} />
      </>}
    </div>
  </UbecShell>;
}

/** Who worked on a component: officers (assignment comment, completion note), the Director's comment and oversight notes. */
function ComponentPeople({ component, planId, roundId, viewerId, canComplete, canRemove, removableObservers = null, canSendBack, onComplete, onChanged }: {
  component: NonNullable<UbecDetail['flow']>['components'][number]; planId: number; roundId: number; viewerId: number; canComplete: boolean; canRemove: boolean;
  /** The Oversight Director's department, whose officers they may take off the component (migration 071). */
  removableObservers?: string | null;
  /** The component's Director: send a completed assessment back to its officer (UBEC143). */
  canSendBack: boolean; onComplete: () => void; onChanged: () => void;
}) {
  const [removing, setRemoving] = useState<number | null>(null);
  const missingReport = needsValidationReport(component.pillar) && !component.validationReports.some(r => r.officerId === viewerId);
  // The Director (or the Super Admin) can take an officer off while their assessment is still open.
  async function remove(assignmentId: number, name: string, action: 'unassign_officer' | 'unassign_observer' = 'unassign_officer') {
    if (removing) return;
    setRemoving(assignmentId);
    try {
      const response = await fetch(`/api/ubec/components?plan=${planId}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, roundId, pillar: component.pillar, assignmentId }) });
      const result = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(result.error || 'The officer could not be removed');
      toast.success(`${name} removed from ${componentName(component.pillar)}`); onChanged();
    } catch (cause) { toast.error(cause instanceof Error ? cause.message : 'The officer could not be removed'); }
    finally { setRemoving(null); }
  }
  const [sendBack, setSendBack] = useState<{ id: number; name: string } | null>(null), [why, setWhy] = useState(''), [sending, setSending] = useState(false), [sendError, setSendError] = useState('');
  async function reopen() {
    if (!sendBack || sending) return;
    if (!why.trim()) { setSendError('Say what the officer should look at again'); return; }
    setSending(true); setSendError('');
    try {
      const response = await fetch(`/api/ubec/components?plan=${planId}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'reopen_assessment', roundId, pillar: component.pillar, assignmentId: sendBack.id, comment: why.trim() }) });
      const result = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(result.error || 'The assessment could not be sent back');
      toast.success(`Sent back to ${sendBack.name}`); setSendBack(null); setWhy(''); onChanged();
    } catch (cause) { setSendError(cause instanceof Error ? cause.message : 'The assessment could not be sent back'); }
    finally { setSending(false); }
  }
  const notes = [
    ...component.officers.map(o => ({ key: `o${o.id}`, back: canSendBack && o.completedAt ? () => { setSendError(''); setSendBack({ id: o.id, name: o.officerName }); } : null, who: o.officerName, role: 'Assessment Officer', text: o.completedAt ? o.completionNote || 'Assessment complete' : o.assignedByName === defaultAssignerName ? o.comment : `Assigned by ${o.assignedByName}: ${o.comment}`, done: !!o.completedAt, remove: canRemove && !o.completedAt ? () => void remove(o.id, o.officerName) : null, busy: removing === o.id })),
    ...(component.directorComment ? [{ key: 'd', who: component.directorName ?? 'Director', role: `Director, ${departmentName(component.department)}`, text: component.directorComment, done: true, remove: null, busy: false }] : []),
    ...component.observers.map(o => ({ key: `x${o.id}`, back: null, who: o.officerName, role: `Assessment Officer, ${departmentName(o.department)}`, text: `Assigned by ${o.assignedByName}: ${o.comment}`, done: component.oversight.some(r => r.department === o.department), remove: removableObservers === o.department ? () => void remove(o.id, o.officerName, 'unassign_observer') : null, busy: removing === o.id })),
    ...component.oversight.map(o => ({ key: o.department, who: o.reviewerName, role: `Director ${departmentName(o.department)}`, text: o.note || 'Observations done', done: true, remove: null, busy: false })),
  ];
  return <div className="ubec-people">
    {notes.length ? <ul>{notes.map(n => <li key={n.key} data-done={n.done || undefined}><strong>{n.who}</strong><small>{n.role}</small><p>{n.text}</p>
      {n.remove && <Button variant="ghost" size="sm" className="ubec-people-remove" disabled={removing !== null} onClick={n.remove} aria-label={`Remove ${n.who} from ${componentName(component.pillar)}`}>{n.busy ? <Spinner data-icon="inline-start" /> : <UserMinusIcon data-icon="inline-start" />}Remove</Button>}
      {'back' in n && n.back && <Button variant="ghost" size="sm" className="ubec-people-remove" onClick={n.back} aria-label={`Send ${componentName(component.pillar)} back to ${n.who}`}><Undo2Icon data-icon="inline-start" />Send back</Button>}</li>)}</ul> : <p className="ubec-people-empty">No Assessment Officer assigned yet</p>}
    {canComplete && <Button className="rounded-full" disabled={component.counts.undecided > 0 || missingReport} title={component.counts.undecided ? `Decide the remaining ${component.counts.undecided} items in the workbook first` : missingReport ? 'Upload your Validation Report on the sheet first' : undefined} onClick={onComplete}><CheckIcon data-icon="inline-start" />Complete assessment</Button>}
    <Dialog open={!!sendBack} onOpenChange={open => { if (!open && !sending) setSendBack(null); }}><DialogContent className="national-dialog sm:max-w-lg" showCloseButton={!sending}>
      <DialogHeader><DialogTitle>Send back to {sendBack?.name}</DialogTitle><DialogDescription>{componentName(component.pillar)} goes back to the officer, who can change decisions and complete the assessment again. You can also change a decision yourself on the sheet</DialogDescription></DialogHeader>
      <Field data-invalid={!!sendError || undefined}><FieldLabel htmlFor="send-back-why">What should they look at again?</FieldLabel><Textarea id="send-back-why" rows={4} maxLength={5000} value={why} disabled={sending} onChange={e => setWhy(e.target.value)} aria-invalid={!!sendError || undefined} />{sendError && <p className="text-sm text-destructive" role="alert">{sendError}</p>}</Field>
      <DialogFooter><Button type="button" variant="outline" disabled={sending} onClick={() => setSendBack(null)}>Cancel</Button><Button type="button" disabled={sending} onClick={() => void reopen()}>{sending ? <Spinner data-icon="inline-start" /> : <Undo2Icon data-icon="inline-start" />}Send back</Button></DialogFooter>
    </DialogContent></Dialog>
  </div>;
}
