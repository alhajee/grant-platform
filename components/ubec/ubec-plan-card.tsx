'use client';
import '@/components/dashboard/plan-card.css';

import { ArrowUpRightIcon, LayersIcon, SchoolIcon } from 'lucide-react';
import { Amount, FundingGauge, amountFormat, compactNaira } from '@/components/dashboard/plan-figures';
import { PlanCardGuilloche, planCardTilt } from '@/components/plan-card-surface';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { planPeriod } from '@/lib/action-plans';
import { nationalStatusLabels, type NationalItem } from '@/lib/ubec';
import { componentName } from '@/lib/ubec-flow';
import { StagePill, percentOf } from './flow-bits';

const date = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

/**
 * One submitted plan on a UBEC dashboard, in the SUBEB plan card style: state, funding, the component gauge, then
 * the components this viewer works on with their stage, cost and share of the plan.
 */
export function UbecPlanCard({ item, action }: { item: NationalItem; action?: string }) {
  const funding = item.fundingTotal ?? 0, href = `/ubec/review?plan=${item.planId}`;
  const components = item.components ?? [];
  return <Card className="dashboard-plan-card ubec-plan-card" {...planCardTilt}>
    <PlanCardGuilloche seed={item.startYear + item.planId} />
    <CardHeader className="plan-card-header">
      <div className="min-w-0"><CardTitle><h3>{item.state}</h3></CardTitle><CardDescription>{planPeriod(item)} BEAP · Submission {item.round}</CardDescription></div>
      <Badge variant={item.status === 'returned' ? 'warning' : item.status === 'approved' ? 'default' : 'secondary'}>{nationalStatusLabels[item.status]}</Badge>
    </CardHeader>
    <CardContent>
      <p className="plan-funding-label">{funding ? 'Available funding' : 'Proposed'}</p>
      <p className="plan-funding" aria-label={amountFormat.format(funding || item.budget)}><Amount value={funding || item.budget} /></p>
      {item.budget > 0 && <div className="plan-proposed">
        <FundingGauge amounts={item.amounts ?? {}} budget={item.budget} funding={funding || item.budget} />
        <p><strong>{compactNaira.format(item.budget)}</strong> {components.length < 11 && item.status !== 'received' ? 'in your components' : 'proposed'}{funding > 0 && <span>{percentOf(item.budget, funding)}% of funding</span>}</p>
      </div>}
      <ul className="plan-pills" aria-label="Plan contents">
        <li><LayersIcon aria-hidden="true" /><b>{components.length}</b>{components.length === 1 ? 'component' : 'components'}</li>
        {item.schools.length > 0 && <li><SchoolIcon aria-hidden="true" /><b>{item.schools.length}</b>{item.schools.length === 1 ? 'school' : 'schools'}</li>}
      </ul>
      {components.length > 0 && components.length <= 6 && <ul className="ubec-card-components">{components.map(c => <li key={c.pillar}>
        <a href={`${href}#ubec-${c.pillar}`}><span>{componentName(c.pillar)}</span><small>{compactNaira.format(c.amount)} · {percentOf(c.amount, item.budget)}%</small></a><StagePill stage={c.stage} />
      </li>)}</ul>}
      <div className="plan-card-bottom">
        <time dateTime={item.submittedAt}>Received {date.format(new Date(item.submittedAt))}</time>
        <span className="plan-card-actions"><Button asChild size="sm" variant="ghost" className="plan-open"><a href={href}>{action ?? 'Open plan'}<ArrowUpRightIcon /></a></Button></span>
      </div>
    </CardContent>
  </Card>;
}
