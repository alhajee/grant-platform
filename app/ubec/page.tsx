'use client';
import { useEffect, useState, useCallback, useRef } from 'react';
import { planPeriod } from '@/lib/action-plans';
import { ArrowUpRight, ClipboardCheckIcon, Gavel, Search, RefreshCw, SendIcon, ShieldCheckIcon, UserRoundPlusIcon } from 'lucide-react';
import { UbecOverview } from '@/components/ubec-overview';
import { UbecShell } from '@/components/ubec-shell';
import { UbecStateMap } from '@/components/ubec-state-map';
import { UbecPlanCard } from '@/components/ubec/ubec-plan-card';
import { EmptyReviewTrailArt, EmptySubmissionsArt, EmptyWorkloadArt } from '@/components/empty-art/ubec';
import { NoAssignmentsArt, ObservationsArt, QueueClearArt, UbecEmpty } from '@/components/empty-art/ubec-flow';
import states from '@/lib/nigeria-map.json';
import { normalizeStateCode } from '@/lib/national-analytics';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { InputGroup, InputGroupInput, InputGroupAddon } from '@/components/ui/input-group';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectGroup, SelectItem } from '@/components/ui/select';
import { Table, TableHeader, TableHead, TableRow, TableBody, TableCell } from '@/components/ui/table';
import { departmentLabel, nationalStatusLabels, ubecRoleTitle, ubecRoles, type UbecDashboard, type UbecQueueItem } from '@/lib/ubec';
import { componentName } from '@/lib/ubec-flow';

const money = new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', notation: 'compact', maximumFractionDigits: 2 });
const date = new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium' });
const actionLabels: Record<string, string> = { submit: 'Submitted to UBEC', release: 'Released to departments', assign_officer: 'Officers assigned', default_officers: 'Default officers assigned', complete_assessment: 'Assessment completed', send_oversight: 'Sent for oversight', observations_done: 'Observations done', ready_for_chair: 'Ready for BEAP Chair', return: 'Returned to SUBEB', approve: 'Approved by UBEC', assign: 'Departments assigned', feedback: 'Department review completed' };
const queueIcons: Record<UbecQueueItem['kind'], typeof SendIcon> = { release: SendIcon, decide: Gavel, assign: UserRoundPlusIcon, consolidate: SendIcon, assess: ClipboardCheckIcon, observe: ShieldCheckIcon, oversight: ShieldCheckIcon };
const queueTitles: Record<string, { title: string; empty: string; help: string }> = {
  [ubecRoles.chair]: { title: 'Waiting for you', empty: 'Nothing is waiting for you', help: 'New submissions to release and plans ready for your decision appear here.' },
  [ubecRoles.director]: { title: 'Your department’s queue', empty: 'Nothing needs your attention', help: 'Components to staff and assessments ready to send for oversight appear here.' },
  [ubecRoles.oversight]: { title: 'Awaiting your observations', empty: 'No components are awaiting your observations', help: 'Components appear here when a Director sends them for oversight.' },
  [ubecRoles.officer]: { title: 'Items to assess', empty: 'No assessments waiting', help: 'Components your Director assigns to you appear here.' },
};

/** The UBEC dashboard: every role sees its queue and plan cards; the ES and BEAP Chair also the national overview. */
export default function Dashboard() {
  const [data, setData] = useState<UbecDashboard | null>(null), [error, setError] = useState(''), [loading, setLoading] = useState(true);
  const [search, setSearch] = useState(''), [status, setStatus] = useState('all'), [year, setYear] = useState('all'), [state, setState] = useState('all');
  const requestId = useRef(0);
  const load = useCallback(async () => {
    const id = ++requestId.current; setLoading(true); setError('');
    try {
      const response = await fetch(`/api/ubec/dashboard${year === 'all' ? '' : `?year=${year}`}`, { cache: 'no-store' });
      if (response.status === 401) { window.location.replace('/'); return; }
      const result = await response.json() as UbecDashboard & { error?: string };
      if (id !== requestId.current) return;
      if (!response.ok) throw new Error(result.error);
      setData(result);
    } catch (e) { if (id === requestId.current) setError(e instanceof Error ? e.message : 'Unable to load dashboard.'); }
    finally { if (id === requestId.current) setLoading(false); }
  }, [year]);
  useEffect(() => { void Promise.resolve().then(load); }, [load]);
  const items = data?.items ?? [], role = data?.user.role ?? '', national = role === ubecRoles.es || role === ubecRoles.chair;
  const visible = items.filter(p => (state === 'all' || normalizeStateCode(p.stateCode) === state) && (status === 'all' || p.status === status) && `${p.state} ${p.startYear} ${p.endYear}`.toLowerCase().includes(search.toLowerCase()));
  const queueCopy = queueTitles[role];
  const eyebrow = data ? (data.user.department ? departmentLabel(data.user.department) : role === ubecRoles.es ? 'NATIONAL OVERVIEW' : 'UBEC') : '';
  const heading = data ? ubecRoleTitle(role, data.user.department).replace(/ · .*/, '') : 'Overview';
  return <UbecShell user={data?.user}>
    <div className="national-page-title"><div><span className="national-eyebrow">{eyebrow}</span><h1>{role === ubecRoles.es ? 'Overview' : heading}</h1></div><div className="national-dashboard-filters"><Select value={year} onValueChange={value => { setYear(value); setState('all'); setStatus('all'); setSearch(''); }}><SelectTrigger aria-label="Funding year"><SelectValue placeholder="Funding year" /></SelectTrigger><SelectContent><SelectGroup><SelectItem value="all">All funding years</SelectItem>{(data?.years ?? []).map(value => <SelectItem key={value} value={String(value)}>{value}</SelectItem>)}</SelectGroup></SelectContent></Select><Button variant="outline" size="sm" onClick={load} disabled={loading}><RefreshCw data-icon="inline-start" />Refresh</Button></div></div>
    {year !== 'all' && <p className="national-period-note">Plans covering {year} · Whole-plan budgets, not annual allocations</p>}
    {error && <Alert variant="destructive"><AlertTitle>Dashboard unavailable</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
    {loading && !data ? <div className="national-kpis"><Skeleton className="h-44" /><Skeleton className="h-44" /><Skeleton className="h-44" /></div> : data && !error && <>
      {queueCopy && <Card className="ubec-queue" id="queue"><CardHeader><CardTitle>{queueCopy.title} <Badge variant="secondary">{data.queue.length}</Badge></CardTitle><CardDescription>{queueCopy.help}</CardDescription></CardHeader><CardContent>
        {data.queue.length ? <ul className="ubec-queue-list">{data.queue.map((q, index) => { const Icon = queueIcons[q.kind]; return <li key={`${q.href}-${index}`} data-kind={q.kind}><a href={q.href}><span className="ubec-queue-icon"><Icon aria-hidden="true" /></span><span><strong>{q.label}</strong><small>{q.detail}</small></span><ArrowUpRight className="ubec-queue-arrow" aria-hidden="true" /></a></li>; })}</ul>
          : <UbecEmpty art={role === ubecRoles.oversight ? <ObservationsArt /> : <QueueClearArt />} title={queueCopy.empty}>You are all caught up.</UbecEmpty>}
      </CardContent></Card>}
      {national && <UbecOverview data={data} onStage={stage => { setStatus(stage); document.getElementById('submissions')?.scrollIntoView(); }}>
        <section className="national-geographic-grid ubec-map-only" aria-label="Geographic coverage"><UbecStateMap items={items} reviewer={false} selectedState={state} onState={code => { setState(code); setStatus('all'); setSearch(''); }} /></section>
      </UbecOverview>}
      <section className="ubec-plans" id="plans" aria-labelledby="ubec-plans-title">
        <div className="national-section-heading"><h2 id="ubec-plans-title">{national ? 'Action plans' : role === ubecRoles.officer ? 'Your assigned plans' : role === ubecRoles.oversight ? 'Plans in oversight' : 'Your department’s plans'} <Badge variant="secondary">{visible.length}</Badge></h2><span>Latest submission per plan</span></div>
        {visible.length ? <div className="dashboard-plan-list ubec-plan-list">{visible.slice(0, national ? 6 : 24).map(item => <UbecPlanCard key={item.id} item={item} action={role === ubecRoles.chair && item.status === 'received' ? 'Review and release' : undefined} />)}</div>
          : <Card><CardContent>{items.length ? <UbecEmpty art={<NoAssignmentsArt />} title="No plans match your filters">Clear the search, stage or state filter.</UbecEmpty>
            : national ? <UbecEmpty art={<EmptySubmissionsArt label="No plans submitted yet" />} title="No plans submitted yet">Submissions from SUBEB Executive Chairmen appear here.</UbecEmpty>
            : role === ubecRoles.oversight ? <UbecEmpty art={<ObservationsArt />} title="Nothing sent for oversight yet">Directors send components here once their officers finish.</UbecEmpty>
            : <UbecEmpty art={<NoAssignmentsArt />} title={role === ubecRoles.officer ? 'No components assigned to you yet' : 'No components released to your department yet'}>{role === ubecRoles.officer ? 'Your Director assigns components with a comment.' : 'The UBEC BEAP Chair releases submitted plans to the departments.'}</UbecEmpty>}</CardContent></Card>}
      </section>
      {national && <div className="national-state-filter"><Select value={state} onValueChange={setState}><SelectTrigger aria-label="Filter submissions by state"><SelectValue /></SelectTrigger><SelectContent><SelectGroup><SelectItem value="all">All states</SelectItem>{states.map(s => <SelectItem key={s.code} value={s.code}>{s.name}</SelectItem>)}</SelectGroup></SelectContent></Select>{state !== 'all' && <Button variant="ghost" size="sm" onClick={() => setState('all')}>Clear state filter</Button>}</div>}
      <section id="submissions" className="national-panel"><div className="national-section-heading"><h2>Submissions <Badge variant="secondary">{visible.length}</Badge></h2><span>Proposed, not disbursed funding</span></div><div className="national-table-tools"><InputGroup className="max-w-sm"><InputGroupInput aria-label="Search submissions" placeholder="Search state or funding year…" value={search} onChange={e => setSearch(e.target.value)} /><InputGroupAddon><Search /></InputGroupAddon></InputGroup><Select value={status} onValueChange={setStatus}><SelectTrigger aria-label="Review status"><SelectValue /></SelectTrigger><SelectContent><SelectGroup><SelectItem value="all">All stages</SelectItem>{Object.entries(nationalStatusLabels).map(([id, name]) => <SelectItem key={id} value={id}>{name}</SelectItem>)}</SelectGroup></SelectContent></Select></div>
        <Table><TableHeader><TableRow><TableHead>State / period</TableHead><TableHead>Stage</TableHead><TableHead>Received</TableHead><TableHead>Components</TableHead><TableHead className="text-right">Proposed</TableHead><TableHead><span className="sr-only">Open</span></TableHead></TableRow></TableHeader><TableBody>
          {visible.map(p => <TableRow key={p.id}><TableCell><strong>{p.state}</strong><small>{planPeriod(p)} · Submission {p.round}</small></TableCell><TableCell><Badge variant={p.status === 'returned' ? 'warning' : p.status === 'approved' ? 'default' : 'secondary'}>{nationalStatusLabels[p.status]}</Badge></TableCell><TableCell>{date.format(new Date(p.submittedAt))}</TableCell><TableCell>{p.status === 'received' ? `${p.components?.length ?? 0} to release` : `${p.completed} of ${p.components?.length ?? 0} with BEAP Chair`}</TableCell><TableCell className="text-right tabular-nums">{money.format(p.budget)}</TableCell><TableCell><Button asChild variant="ghost" size="sm"><a href={`/ubec/review?plan=${p.planId}`}>Open<ArrowUpRight data-icon="inline-end" /></a></Button></TableCell></TableRow>)}
          {!visible.length && <TableRow><TableCell colSpan={6} className="national-empty"><div className="ubec-empty"><EmptySubmissionsArt label={items.length ? 'No submissions match your filters' : 'No submissions yet'} />{items.length ? 'No submissions match your filters.' : 'No submissions yet'}</div></TableCell></TableRow>}
        </TableBody></Table></section>
      <div className="national-lower-grid"><Card id="departments"><CardHeader><CardTitle>Department workload</CardTitle><CardDescription>Components in department assessment, latest submissions</CardDescription></CardHeader><CardContent>{data.workload.length ? <div className="national-workload">{data.workload.map(d => <div key={d.department}><span>{departmentLabel(d.department)}</span><Badge variant="secondary">{d.pending} assessing</Badge><small>{d.completed} sent on</small></div>)}</div> : <figure className="ubec-empty"><EmptyWorkloadArt /><figcaption>No components released yet</figcaption></figure>}</CardContent></Card>
        <Card id="activity"><CardHeader><CardTitle>Recent activity</CardTitle></CardHeader><CardContent><ol className="national-activity">{data.activity.map(e => <li key={e.id}><span className="national-activity-dot" /><div><a href={`/ubec/review?plan=${e.plan_id}`}>{actionLabels[e.action] ?? e.action}{e.pillar ? ` · ${componentName(e.pillar)}` : ''} <ArrowUpRight /></a><span>{e.stateName} · {e.actor}</span><small>{date.format(new Date(e.created_at))}</small></div></li>)}</ol>{!data.activity.length && <figure className="ubec-empty"><EmptyReviewTrailArt /><figcaption>No review activity yet</figcaption></figure>}</CardContent></Card></div>
    </>}
  </UbecShell>;
}
