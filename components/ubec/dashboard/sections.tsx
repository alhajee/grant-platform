'use client';
import { ArrowUpRight, Search } from 'lucide-react';
import { UbecPlanCard } from '@/components/ubec/ubec-plan-card';
import { DepartmentArt } from '@/components/ubec/department-art';
import { EmptyReviewTrailArt, EmptySubmissionsArt, EmptyWorkloadArt } from '@/components/empty-art/ubec';
import { NoAssignmentsArt, ObservationsArt, UbecEmpty } from '@/components/empty-art/ubec-flow';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import states from '@/lib/nigeria-map.json';
import { planPeriod } from '@/lib/action-plans';
import { normalizeStateCode } from '@/lib/national-analytics';
import { departmentLabel, nationalStatusLabels, ubecRoles, type UbecDashboard } from '@/lib/ubec';
import { componentName } from '@/lib/ubec-flow';
import { compactNairaFormat } from '@/lib/money-format';

// The parts of the UBEC dashboard, shared by the Overview, Plans, Submissions and Activity pages.
const money = compactNairaFormat(2);
const date = new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium' });
const actionLabels: Record<string, string> = { submit: 'Submitted to UBEC', release: 'Released to departments', assign_officer: 'Officers assigned', default_officers: 'Default officers assigned', complete_assessment: 'Assessment completed', send_oversight: 'Sent for oversight', observations_done: 'Observations done', ready_for_chair: 'Ready for BEAP Chair', return: 'Returned to SUBEB', approve: 'Approved by UBEC', assign: 'Departments assigned', feedback: 'Department review completed' };

export const isNational = (role: string) => role === ubecRoles.es || role === ubecRoles.chair;
export type PlanFilters = { search: string; status: string; state: string };
export const filterItems = (items: UbecDashboard['items'], { search, status, state }: PlanFilters) =>
  items.filter(p => (state === 'all' || normalizeStateCode(p.stateCode) === state) && (status === 'all' || p.status === status) && `${p.state} ${p.startYear} ${p.endYear}`.toLowerCase().includes(search.toLowerCase()));
const plansTitle = (role: string) => isNational(role) ? 'Action plans' : role === ubecRoles.officer ? 'Your assigned plans' : role === ubecRoles.oversight ? 'Plans in oversight' : 'Your department’s plans';
const seeAll = (href: string, label: string) => <Button asChild variant="ghost" size="sm"><a href={href}>{label}<ArrowUpRight data-icon="inline-end" /></a></Button>;

/** Search, stage and state filters for plans and submissions. */
export function PlanFiltersBar({ value, onChange, national }: { value: PlanFilters; onChange: (next: PlanFilters) => void; national: boolean }) {
  return <div className="national-table-tools">
    <InputGroup className="max-w-sm"><InputGroupInput aria-label="Search plans" placeholder="Search state or funding year…" value={value.search} onChange={e => onChange({ ...value, search: e.target.value })} /><InputGroupAddon><Search /></InputGroupAddon></InputGroup>
    <Select value={value.status} onValueChange={status => onChange({ ...value, status })}><SelectTrigger aria-label="Review stage"><SelectValue /></SelectTrigger><SelectContent><SelectGroup><SelectItem value="all">All stages</SelectItem>{Object.entries(nationalStatusLabels).map(([id, name]) => <SelectItem key={id} value={id}>{name}</SelectItem>)}</SelectGroup></SelectContent></Select>
    {national && <Select value={value.state} onValueChange={state => onChange({ ...value, state })}><SelectTrigger aria-label="State"><SelectValue /></SelectTrigger><SelectContent><SelectGroup><SelectItem value="all">All states</SelectItem>{states.map(s => <SelectItem key={s.code} value={s.code}>{s.name}</SelectItem>)}</SelectGroup></SelectContent></Select>}
  </div>;
}

/** Plan cards; `limit` with `moreHref` shows a preview with a link to the Plans page. */
export function PlansSection({ data, items, limit, moreHref, filtered }: { data: UbecDashboard; items: UbecDashboard['items']; limit?: number; moreHref?: string; filtered?: boolean }) {
  const role = data.user.role, national = isNational(role), shown = limit ? items.slice(0, limit) : items;
  return <section className="ubec-plans" aria-labelledby="ubec-plans-title">
    <div className="national-section-heading"><h2 id="ubec-plans-title">{plansTitle(role)} <Badge variant="secondary">{items.length}</Badge></h2>{moreHref && items.length > shown.length ? seeAll(moreHref, 'All plans') : <span>Latest submission per plan</span>}</div>
    {shown.length ? <div className="dashboard-plan-list ubec-plan-list">{shown.map(item => <UbecPlanCard key={item.id} item={item} action={role === ubecRoles.chair && item.status === 'received' ? 'Review and release' : undefined} />)}</div>
      : <Card><CardContent>{filtered && data.items.length ? <UbecEmpty art={<NoAssignmentsArt />} title="No plans match your filters">Clear the search, stage or state filter</UbecEmpty>
        : national ? <UbecEmpty art={<EmptySubmissionsArt label="No plans submitted yet" />} title="No plans submitted yet">Submissions from SUBEB Executive Chairmen appear here</UbecEmpty>
        : role === ubecRoles.oversight ? <UbecEmpty art={<ObservationsArt />} title="Nothing sent for oversight yet">Directors send components here once their officers finish</UbecEmpty>
        : <UbecEmpty art={<NoAssignmentsArt />} title={role === ubecRoles.officer ? 'No components assigned to you yet' : 'No components released to your department yet'}>{role === ubecRoles.officer ? 'Your Director assigns components with a comment' : 'The UBEC BEAP Chair releases submitted plans to the departments'}</UbecEmpty>}</CardContent></Card>}
  </section>;
}

/** Every submission in a table. */
export function SubmissionsTable({ data, items }: { data: UbecDashboard; items: UbecDashboard['items'] }) {
  return <Table><TableHeader><TableRow><TableHead>State / period</TableHead><TableHead>Stage</TableHead><TableHead>Received</TableHead><TableHead>Components</TableHead><TableHead className="text-right">Proposed</TableHead><TableHead><span className="sr-only">Open</span></TableHead></TableRow></TableHeader><TableBody>
    {items.map(p => <TableRow key={p.id}><TableCell><strong>{p.state}</strong><small>{planPeriod(p)} · Submission {p.round}</small></TableCell><TableCell><Badge variant={p.status === 'returned' ? 'warning' : p.status === 'approved' ? 'default' : 'secondary'}>{nationalStatusLabels[p.status]}</Badge></TableCell><TableCell>{date.format(new Date(p.submittedAt))}</TableCell><TableCell>{p.status === 'received' ? `${p.components?.length ?? 0} to release` : `${p.completed} of ${p.components?.length ?? 0} with BEAP Chair`}</TableCell><TableCell className="text-right tabular-nums">{money.format(p.budget)}</TableCell><TableCell><Button asChild variant="ghost" size="sm"><a href={`/ubec/review?plan=${p.planId}`}>Open<ArrowUpRight data-icon="inline-end" /></a></Button></TableCell></TableRow>)}
    {!items.length && <TableRow><TableCell colSpan={6} className="national-empty"><div className="ubec-empty"><EmptySubmissionsArt label={data.items.length ? 'No submissions match your filters' : 'No submissions yet'} />{data.items.length ? 'No submissions match your filters' : 'No submissions yet'}</div></TableCell></TableRow>}
  </TableBody></Table>;
}

/** Components in department assessment per department. */
export function WorkloadCard({ data }: { data: UbecDashboard }) {
  return <Card id="departments"><CardHeader><CardTitle>Department workload</CardTitle><CardDescription>Components in department assessment, latest submissions</CardDescription></CardHeader><CardContent>
    {data.workload.length ? <div className="national-workload">{data.workload.map(d => <div key={d.department}><span className="department-with-art"><DepartmentArt department={d.department} className="department-art-md" />{departmentLabel(d.department)}</span><Badge variant="secondary">{d.pending} assessing</Badge><small>{d.completed} sent on</small></div>)}</div>
      : <figure className="ubec-empty"><EmptyWorkloadArt /><figcaption>No components released yet</figcaption></figure>}
  </CardContent></Card>;
}

/** The latest review steps; `limit` with `moreHref` shows a preview with a link to the Activity page. */
export function ActivityCard({ data, limit, moreHref }: { data: UbecDashboard; limit?: number; moreHref?: string }) {
  const events = limit ? data.activity.slice(0, limit) : data.activity;
  return <Card id="activity"><CardHeader><CardTitle>Recent activity</CardTitle>{moreHref && data.activity.length > events.length && <CardDescription>{seeAll(moreHref, 'All activity')}</CardDescription>}</CardHeader><CardContent>
    <ol className="national-activity">{events.map(e => <li key={e.id}><span className="national-activity-dot" /><div><a href={`/ubec/review?plan=${e.plan_id}`}>{actionLabels[e.action] ?? e.action}{e.pillar ? ` · ${componentName(e.pillar)}` : ''} <ArrowUpRight /></a><span>{e.stateName} · {e.actor}</span><small>{date.format(new Date(e.created_at))}</small></div></li>)}</ol>
    {!data.activity.length && <figure className="ubec-empty"><EmptyReviewTrailArt /><figcaption>No review activity yet</figcaption></figure>}
  </CardContent></Card>;
}
