'use client';
import '@/components/plan-page/plan-page.css';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeftIcon, CheckIcon, CornerDownLeftIcon, HistoryIcon, MegaphoneIcon, SendIcon, UserMinusIcon } from 'lucide-react';
import { UbecShell } from '@/components/ubec-shell';
import { PlanReviewContent } from '@/components/plan-review-content';
import { PlanSummary } from '@/components/plan-page/plan-summary';
import { UbecComponentCards, type CardStep } from '@/components/ubec/ubec-component-cards';
import { ItemAssessment } from '@/components/ubec/item-assessment';
import { FlowDialog, type FlowRequest } from '@/components/ubec/flow-dialog';
import { StagePill } from '@/components/ubec/flow-bits';
import { NotReleasedArt, PipelineIdleArt, UbecEmpty } from '@/components/empty-art/ubec-flow';
import { Button } from '@/components/ui/button';
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
import { componentName, defaultAssignerName, superAdminRole, type PipelineComponent } from '@/lib/ubec-flow';
import { toast } from 'sonner';
import { Spinner } from '@/components/ui/spinner';

const date = new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' });
const trail: Record<string, string> = { submit: 'Submitted to UBEC', release: 'Released to the UBEC departments', assign_officer: 'Assessment Officers assigned', default_officers: 'Default Assessment Officers assigned', unassign_officer: 'Assessment Officer removed', complete_assessment: 'Assessment completed', send_oversight: 'Sent for oversight', observations_done: 'Observations done', ready_for_chair: 'Ready for the UBEC BEAP Chair', return: 'Returned to SUBEB', approve: 'Approved by UBEC', assign: 'Departments assigned (earlier flow)', feedback: 'Department review (earlier flow)' };

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
    } catch (cause) { if (ticket === requestId.current) setError(cause instanceof Error ? cause.message : 'Unable to load review.'); }
    finally { if (ticket === requestId.current) setLoading(false); }
  }, []);
  useEffect(() => { void Promise.resolve().then(() => load()); }, [load]);
  // State users follow the plan (and send it to UBEC) on their own plan page.
  useEffect(() => { if (data && !isUbec(data.role) && data.role !== superAdminRole) window.location.replace(`/beap/review?plan=${data.plan.id}`); }, [data]);
  // Notification links (#ubec-<component>) open that component's items.
  useEffect(() => {
    const fromHash = () => { const match = /^#ubec-([a-z]+)$/.exec(window.location.hash); if (match) { setTab(match[1]); requestAnimationFrame(() => document.getElementById('ubec-assessment')?.scrollIntoView({ block: 'start' })); } };
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
  const stepsFor = (pillar: ImplementedPillar): CardStep[] => !can ? [] : [
    ...(can.assign.includes(pillar) ? [{ label: 'Assign staff', kind: 'assign' as const, run: () => setRequest({ kind: 'assign', pillar }) }] : []),
    ...(can.assess.includes(pillar) ? [{ label: 'Assess items', kind: 'assess' as const, run: () => { window.location.hash = `ubec-${pillar}`; } }] : []),
    ...(can.sendOversight.includes(pillar) ? [{ label: 'Send for oversight', kind: 'oversight' as const, run: () => setRequest({ kind: 'oversight', pillar }) }] : []),
    ...(can.observe.includes(pillar) ? [{ label: 'Observations done', kind: 'observe' as const, run: () => setRequest({ kind: 'observe', pillar }) }] : []),
  ];
  const released = flow?.components ?? [];
  const activeTab = released.some(c => c.pillar === tab) ? tab : (released.find(c => can?.assess.includes(c.pillar) || can?.observe.includes(c.pillar)) ?? released[0])?.pillar ?? '';
  const role = data?.role ?? '', chair = role === ubecRoles.chair;
  const envelope = round?.snapshot.setup ? { id: data!.plan.id, startYear: data!.plan.start_year, endYear: data!.plan.end_year, createdAt: round.submitted_at, status: 'submitted_ubec', version: data!.plan.version, submissionNumber: round.state_submission, ...round.snapshot.setup } as ActionPlan : null;
  const arrived = released.filter(c => c.stage === 'chair').length;

  return <UbecShell review user={data?.user}>
    <div className="ubec-review-workspace plan-page ubec-plan-page">
      <Button asChild variant="ghost" size="sm" className="review-back"><a href={admin ? '/admin#ubec-officers' : '/ubec'}><ArrowLeftIcon data-icon="inline-start" />{admin ? 'Administration' : 'Dashboard'}</a></Button>
      <div className="national-page-title"><div><span className="national-eyebrow">{data?.plan.stateName ?? 'BASIC EDUCATION ACTION PLAN'}</span><h1>{data ? `${planPeriod({ startYear: data.plan.start_year, endYear: data.plan.end_year, fundingQuarters: data.plan.funding_quarters })} BEAP` : 'Plan review'}</h1></div>
        <div className="review-actions">
          {round && <Badge variant={round.status === 'returned' ? 'warning' : round.status === 'approved' ? 'default' : 'secondary'}>{nationalStatusLabels[round.status]}</Badge>}
          {data && data.rounds.length > 0 && <Select value={selected} onValueChange={value => void load(value)}><SelectTrigger aria-label="UBEC submission" className="rounded-full"><HistoryIcon /><SelectValue /></SelectTrigger><SelectContent><SelectGroup><SelectItem value="current">Current submission</SelectItem>{data.rounds.map(r => <SelectItem key={r.id} value={String(r.id)}>Submission {r.number} · {date.format(new Date(r.submitted_at))}</SelectItem>)}</SelectGroup></SelectContent></Select>}
        </div>
      </div>
      {error && <Alert variant="destructive"><AlertTitle>Review unavailable</AlertTitle><AlertDescription>{error}<Button variant="outline" onClick={() => load(selected)}>Retry</Button></AlertDescription></Alert>}
      {loading && !data ? <div className="plan-page-loading"><Skeleton className="h-36 w-full rounded-3xl" /><Skeleton className="h-64 w-full rounded-3xl" /></div> : data && round && flow && !error && <>
        {!current && <Alert><AlertTitle>Earlier submission</AlertTitle><AlertDescription>This submission is read-only.</AlertDescription></Alert>}
        {admin && <Alert className="ubec-role-note"><AlertTitle>Super Admin view</AlertTitle><AlertDescription>You can assign, remove or reassign Assessment Officers on components still with their Director, with the same rules as the Director. Every other step belongs to the UBEC review roles.</AlertDescription></Alert>}
        {role === ubecRoles.es && <Alert className="ubec-role-note"><AlertTitle>Supervisory view</AlertTitle><AlertDescription>You can see every component, stage and comment. Workflow steps are taken by the UBEC BEAP Chair, Directors, Oversight Directors and Assessment Officers.</AlertDescription></Alert>}
        {round.decision && <Alert className="ubec-decision-note" data-status={round.status}><AlertTitle>{round.status === 'returned' ? 'Returned to the SUBEB' : 'UBEC decision'}</AlertTitle><AlertDescription className="review-comment">{round.decision}</AlertDescription></Alert>}
        {flow.releasedAt && <div className="ubec-release-note"><MegaphoneIcon aria-hidden="true" /><p><strong>{flow.releasedByName}, UBEC BEAP Chair</strong><span>{flow.releaseComment}</span><small>Released {date.format(new Date(flow.releasedAt))}</small></p></div>}
        <div className="plan-glance">
          <h2 id="ubec-components-title" className="plan-section-title plan-glance-head">Components</h2>
          <section className="plan-components plan-glance-main" aria-labelledby="ubec-components-title">
            {cards.length ? <UbecComponentCards components={cards} planTotal={totals?.total.budget ?? 0} comments={comments} stepsFor={stepsFor} onView={pillar => { window.location.hash = `ubec-${pillar}`; setTab(pillar); }} />
              : <UbecEmpty art={<PipelineIdleArt />} title="No components to show">Nothing in this submission has reached you.</UbecEmpty>}
            {chair && current && <div className="workflow-bar ubec-chair-bar">
              {round.status === 'received' ? <><p><strong>Review the submission, then release it to the UBEC departments.</strong>{pillars.length} components go to {new Set(pillars.map(p => pillarDepartments[p])).size} departments.</p><Button className="rounded-full" disabled={!can?.release} onClick={() => setRequest({ kind: 'release' })}><SendIcon data-icon="inline-start" />Release to UBEC departments</Button></>
                : round.status === 'reviewing' ? <><p><strong>{arrived} of {released.length} components have reached you.</strong>{flow.allArrived ? flow.approvable ? 'Every item is accepted.' : 'Some items are rejected or undecided, so the plan can only be returned.' : 'Approve or return once every component has finished oversight.'}</p>
                  <span className="ubec-chair-actions"><Button variant="outline" className="rounded-full" disabled={!can?.decide} onClick={() => setRequest({ kind: 'return' })}><CornerDownLeftIcon data-icon="inline-start" />Return to SUBEB</Button><Button className="rounded-full" disabled={!can?.decide || !flow.approvable} onClick={() => setRequest({ kind: 'approve' })}><CheckIcon data-icon="inline-start" />Approve action plan</Button></span></>
                : <p><strong>{nationalStatusLabels[round.status]}.</strong>The SUBEB {round.status === 'returned' ? 'revises and resubmits the plan.' : 'has been notified.'}</p>}
            </div>}
          </section>
          <aside className="plan-glance-side" aria-label="Plan funding">
            {envelope && totals ? <PlanSummary plan={envelope} totals={totals} detailsOpen={detailsOpen} onDetailsOpenChange={setDetailsOpen} /> : null}
            <Card className="ubec-pipeline-card"><CardHeader><CardTitle>Review pipeline</CardTitle></CardHeader><CardContent>
              <ol className="ubec-pipeline-steps">{(['unreleased', 'director', 'oversight', 'chair'] as const).map(stage => { const n = cards.filter(c => c.stage === stage).length; return <li key={stage} data-active={n > 0 || undefined}><StagePill stage={stage} /><b>{n}</b></li>; })}</ol>
              <p className="ubec-pipeline-meta">Received {date.format(new Date(round.submitted_at))} · Submission {round.number}</p>
            </CardContent></Card>
          </aside>
        </div>

        <section id="ubec-assessment" className="ubec-assessment" aria-labelledby="ubec-assessment-title">
          <h2 id="ubec-assessment-title" className="plan-section-title">Item assessment</h2>
          {!released.length ? <Card><CardContent><UbecEmpty art={<NotReleasedArt />} title="Not released yet">{chair ? 'Add your comment and release the plan to the UBEC departments to start the assessment.' : 'The UBEC BEAP Chair releases the plan to the departments first.'}</UbecEmpty></CardContent></Card>
            : <Tabs value={activeTab} onValueChange={value => { setTab(value); history.replaceState(history.state, '', `${window.location.pathname}${window.location.search}#ubec-${value}`); }}>
              <div className="plan-workbook-tabs-scroll"><TabsList variant="line" className="admin-section-tabs ubec-assessment-tabs">{released.map(c => <TabsTrigger key={c.pillar} value={c.pillar}>{componentName(c.pillar)}{c.counts.rejected > 0 && <Badge variant="destructive" className="ml-1">{c.counts.rejected}</Badge>}</TabsTrigger>)}</TabsList></div>
              {released.map(c => <TabsContent key={c.pillar} value={c.pillar} className="ubec-assessment-panel">
                <ItemAssessment planId={data.plan.id} roundId={round.id} pillar={c.pillar} stage={c.stage} snapshot={round.snapshot} decisions={flow.decisions} previous={flow.previousDecisions} canDecide={!!can?.assess.includes(c.pillar)} comments={comments} onChanged={() => load()} />
                <ComponentPeople component={c} planId={data.plan.id} roundId={round.id} canComplete={!!can?.complete.includes(c.pillar)} canRemove={!!can?.assign.includes(c.pillar)} onComplete={() => setRequest({ kind: 'complete', pillar: c.pillar })} onChanged={() => void load()} />
              </TabsContent>)}
            </Tabs>}
        </section>

        <PlanReviewContent key={round.id} comments={comments} snapshot={round.snapshot} visiblePillars={pillars.length ? pillars : undefined} />
        {data.assignments.length > 0 && <Card className="mt-6"><CardHeader><CardTitle>Earlier department reviews</CardTitle></CardHeader><CardContent><ul className="ubec-legacy-reviews">{data.assignments.map(a => <li key={a.id}><strong>{departmentName(a.department)} · {componentName(a.pillar)}</strong><span>{a.completed_at ? a.recommendation === 'changes' ? 'Changes recommended' : 'Endorsed' : 'Not completed'}</span>{a.feedback && <p className="review-comment">{a.feedback}</p>}</li>)}</ul></CardContent></Card>}
        <Card className="mt-6"><CardHeader><CardTitle>Review trail</CardTitle></CardHeader><CardContent><ol className="national-activity">{data.events.map(e => <li key={e.id}><span className="national-activity-dot" /><div><strong>{trail[e.action] ?? e.action}{e.pillar ? ` · ${componentName(e.pillar)}` : ''}</strong><span>{e.actor} · {date.format(new Date(e.created_at))}</span>{e.comment && <p className="review-comment">{e.comment}</p>}</div></li>)}</ol></CardContent></Card>
        <FlowDialog admin={admin} request={request} planId={data.plan.id} version={data.plan.version} roundId={round.id} flow={flow} threads={comments?.threads ?? []} onClose={() => setRequest(null)} onDone={() => { setRequest(null); void load(); }} />
      </>}
    </div>
  </UbecShell>;
}

/** Who worked on a component: officers (assignment comment, completion note), the Director's comment and oversight notes. */
function ComponentPeople({ component, planId, roundId, canComplete, canRemove, onComplete, onChanged }: {
  component: NonNullable<UbecDetail['flow']>['components'][number]; planId: number; roundId: number; canComplete: boolean; canRemove: boolean; onComplete: () => void; onChanged: () => void;
}) {
  const [removing, setRemoving] = useState<number | null>(null);
  // The Director (or the Super Admin) can take an officer off while their assessment is still open.
  async function remove(assignmentId: number, name: string) {
    if (removing) return;
    setRemoving(assignmentId);
    try {
      const response = await fetch(`/api/ubec/components?plan=${planId}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'unassign_officer', roundId, pillar: component.pillar, assignmentId }) });
      const result = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(result.error || 'The officer could not be removed.');
      toast.success(`${name} removed from ${componentName(component.pillar)}`); onChanged();
    } catch (cause) { toast.error(cause instanceof Error ? cause.message : 'The officer could not be removed.'); }
    finally { setRemoving(null); }
  }
  const notes = [
    ...component.officers.map(o => ({ key: `o${o.id}`, who: o.officerName, role: 'Assessment Officer', text: o.completedAt ? o.completionNote || 'Assessment complete.' : o.assignedByName === defaultAssignerName ? o.comment : `Assigned by ${o.assignedByName}: ${o.comment}`, done: !!o.completedAt, remove: canRemove && !o.completedAt ? () => void remove(o.id, o.officerName) : null, busy: removing === o.id })),
    ...(component.directorComment ? [{ key: 'd', who: component.directorName ?? 'Director', role: `Director, ${departmentName(component.department)}`, text: component.directorComment, done: true, remove: null, busy: false }] : []),
    ...component.oversight.map(o => ({ key: o.department, who: o.reviewerName, role: `Director ${departmentName(o.department)}`, text: o.note || 'Observations done.', done: true, remove: null, busy: false })),
  ];
  return <div className="ubec-people">
    {notes.length ? <ul>{notes.map(n => <li key={n.key} data-done={n.done || undefined}><strong>{n.who}</strong><small>{n.role}</small><p>{n.text}</p>
      {n.remove && <Button variant="ghost" size="sm" className="ubec-people-remove" disabled={removing !== null} onClick={n.remove} aria-label={`Remove ${n.who} from ${componentName(component.pillar)}`}>{n.busy ? <Spinner data-icon="inline-start" /> : <UserMinusIcon data-icon="inline-start" />}Remove</Button>}</li>)}</ul> : <p className="ubec-people-empty">No Assessment Officer assigned yet.</p>}
    {canComplete && <Button className="rounded-full" onClick={onComplete}><CheckIcon data-icon="inline-start" />Complete assessment</Button>}
  </div>;
}
