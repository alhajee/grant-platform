'use client';

import { useId, useState } from 'react';
import { ArrowUpRight, CircleCheck, Clock3, CornerDownLeft, UsersRound } from 'lucide-react';
import { BudgetArtwork, PlansArtwork, SchoolsArtwork, StatesArtwork } from './metric-artwork';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Cell } from 'recharts';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectGroup, SelectItem } from '@/components/ui/select';
import { nationalStatusLabels, type UbecDashboard } from '@/lib/ubec';

const money = new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', notation: 'compact', maximumFractionDigits: 2 });

function BudgetMotif() {
  return <svg className="budget-motif" viewBox="0 0 180 180" fill="none" aria-hidden="true">
    <path d="M0 0h90v90C40.3 90 0 49.7 0 0Z" fill="currentColor" />
    <path d="M180 0v90H90c0-49.7 40.3-90 90-90Z" fill="currentColor" />
    <path d="M180 180H90V90c49.7 0 90 40.3 90 90Z" fill="currentColor" />
    <path d="M0 180V90h90c0 49.7-40.3 90-90 90Z" fill="currentColor" />
    <circle cx="90" cy="90" r="18" fill="var(--national-lime)" />
  </svg>;
}

export function UbecOverview({ data, onStage, children }: { data: UbecDashboard; onStage: (stage: string) => void; children?: React.ReactNode }) {
  const [months, setMonths] = useState('6');
  const stripeId = useId().replaceAll(':', '');
  const reviewer = data.user.role === 'UBEC Department Reviewer';
  const items = data.items;
  const budget = items.reduce((sum, plan) => sum + plan.budget, 0);
  const schools = new Set(items.flatMap(plan => plan.schools)).size;
  const states = new Set(items.map(plan => plan.stateCode)).size;
  const monthly = data.monthly.slice(-Number(months));
  const submissions = monthly.reduce((sum, month) => sum + month.submissions, 0);
  const stages = [
    { id: 'received', icon: Clock3 }, { id: 'reviewing', icon: UsersRound },
    { id: 'returned', icon: CornerDownLeft }, { id: 'approved', icon: CircleCheck },
  ];
  return <div className="ubec-overview">
    <section className="overview-bento" aria-label="National plan analytics">
      <Card className="overview-budget" data-tone="lavender">
        <CardHeader><CardTitle><BudgetArtwork />{reviewer ? 'Assigned budgets' : 'Proposed budget'}</CardTitle></CardHeader>
        <CardContent><strong className="overview-budget-value" title={budget.toLocaleString('en-NG', { style: 'currency', currency: 'NGN' })}>{money.format(budget)}</strong><p>Latest submission per plan</p><BudgetMotif /></CardContent>
        <CardFooter><Button asChild variant="outline"><a href="#submissions">View submissions<ArrowUpRight data-icon="inline-end" /></a></Button></CardFooter>
      </Card>



      {[{ label: 'Basic Education Action Plans', value: items.length, artwork: PlansArtwork, tone: 'white' }, { label: 'Targeted schools', value: schools, artwork: SchoolsArtwork, tone: 'lime' }, { label: 'States represented', value: states, artwork: StatesArtwork, tone: 'white' }].map(kpi => <Card className="overview-metric" data-tone={kpi.tone} key={kpi.label}><CardHeader><CardTitle><kpi.artwork />{kpi.label}</CardTitle></CardHeader><CardContent><strong>{kpi.value.toLocaleString()}</strong><a className="overview-round-link" href="#submissions" aria-label={`View ${kpi.label.toLowerCase()} in submissions`}><ArrowUpRight /></a></CardContent></Card>)}
    </section>
    {children}
    <div className="overview-secondary-grid">
      <Card className="overview-chart" data-tone="charcoal">
        <CardHeader><div className="overview-chart-heading"><CardTitle>Submission activity</CardTitle><Select value={months} onValueChange={setMonths}><SelectTrigger aria-label="Chart period"><SelectValue /></SelectTrigger><SelectContent><SelectGroup><SelectItem value="3">Last 3 months</SelectItem><SelectItem value="6">Last 6 months</SelectItem></SelectGroup></SelectContent></Select></div><div className="overview-chart-total"><strong>{submissions.toLocaleString()}</strong><span>submissions received<br />including resubmissions</span></div></CardHeader>
        <CardContent><ChartContainer className="overview-activity-chart" config={{ submissions: { label: 'Submissions', color: 'var(--national-purple)' } }}>
          <BarChart accessibilityLayer data={monthly} margin={{ left: -22, right: 4, top: 10 }}>
            <defs><pattern id={stripeId} patternUnits="userSpaceOnUse" width="7" height="7" patternTransform="rotate(40)"><rect width="3" height="7" fill="var(--national-purple)" opacity=".7" /></pattern></defs>
            <CartesianGrid vertical={false} strokeDasharray="4 6" />
            <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: 'var(--muted-foreground)' }} tickMargin={12} tickFormatter={v => v.slice(0, 3)} />
            <YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={{ fill: 'var(--muted-foreground)' }} domain={[0, 'auto']} />
            <ChartTooltip cursor={{ fill: 'var(--national-chart-hover)' }} content={<ChartTooltipContent />} />
            <Bar dataKey="submissions" radius={[16,16,0,0]} maxBarSize={48} isAnimationActive={false}>{monthly.map((month, i) => <Cell key={month.month} fill={i === monthly.length - 1 ? 'var(--national-purple)' : `url(#${stripeId})`} />)}</Bar>
          </BarChart>
        </ChartContainer></CardContent>
      </Card>
    <section className="overview-stages" aria-label="Review stages"><div className="overview-section-title"><h2>Review pipeline</h2><span>Latest submission per plan</span></div><div className="overview-stage-grid">{stages.map(stage => {
      const count = items.filter(plan => plan.status === stage.id).length;
      return <button key={stage.id} className="overview-stage" data-stage={stage.id} onClick={() => onStage(stage.id)}><span className="overview-stage-icon"><stage.icon /></span><span><span>{nationalStatusLabels[stage.id]}</span><strong>{count.toLocaleString()}</strong></span><ArrowUpRight className="overview-stage-arrow" /></button>;
    })}</div></section>
    </div>
  </div>;
}
