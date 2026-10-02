'use client';
import './plan-card.css';

import { ArrowUpRightIcon, HandCoinsIcon, ListChecksIcon, PencilIcon, SchoolIcon } from 'lucide-react';
import { componentPalette } from '@/components/dashboard/component-budgets';
import { OtherFundingInfo } from '@/components/funding-sources-field';
import type { InvestmentArea } from '@/components/investment-filter';
import { PlanCardGuilloche, planCardTilt } from '@/components/plan-card-surface';
import { PlanStatusBadge } from '@/components/plan-status';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { planHref, planPeriod, type PlanOverview } from '@/lib/action-plans';
import { statePlanOpen } from '@/lib/pillar-review';
import { otherFundingTotal } from '@/lib/plan-setup';

export type PlanCardProps = { plan: PlanOverview; isOfficer: boolean; canEdit: boolean; onEdit: (planId: number) => void };

const amountFormat = new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', minimumFractionDigits: 0, maximumFractionDigits: 2 });
const compact = new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', notation: 'compact', maximumFractionDigits: 2 });
const date = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
const relative = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
const DAY_MS = 86_400_000, TICKS = 32;
const mixOrder = ['infrastructure', 'tlm', 'sports', 'sbmc', 'curriculum', 'monitoring', 'gscci'] as const satisfies readonly InvestmentArea[];

/** "today", "yesterday", "4 days ago"; older than a month falls back to the date. */
function updatedAgo(value: string) {
  const then = new Date(value), days = Math.round((new Date().setHours(0, 0, 0, 0) - new Date(then).setHours(0, 0, 0, 0)) / DAY_MS);
  return days >= 0 && days <= 30 ? relative.format(-days, 'day') : `on ${date.format(then)}`;
}

/** The amount with a quieter naira sign and kobo, so the figure itself carries the weight. */
function Amount({ value }: { value: number }) {
  return <>{amountFormat.formatToParts(value).map((part, index) => part.type === 'currency' ? <span key={index} className="plan-amount-sign">{part.value}</span>
    : part.type === 'decimal' || part.type === 'fraction' ? <span key={index} className="plan-amount-minor">{part.value}</span> : part.value)}</>;
}

const planAmounts = (plan: PlanOverview): Record<InvestmentArea, number> => ({ infrastructure: plan.infrastructureBudget, tlm: plan.tlmBudget ?? 0, sports: plan.sportsBudget, sbmc: plan.sbmcBudget ?? 0, curriculum: plan.curriculumBudget ?? 0, monitoring: plan.monitoringBudget ?? 0, gscci: plan.gscciBudget ?? 0 });

/**
 * Proposed spend as a tick gauge: each tick is 1/32 of the available funding, coloured by the component
 * whose proposals reach that far; unspent ticks stay pale.
 */
function FundingGauge({ plan, funding }: { plan: PlanOverview; funding: number }) {
  const amounts = planAmounts(plan), base = Math.max(funding, plan.budget, 1);
  const parts = mixOrder.filter(area => amounts[area] > 0);
  const ends = parts.reduce<number[]>((list, area) => [...list, (list.at(-1) ?? 0) + amounts[area]], []);
  const ticks = Array.from({ length: TICKS }, (_, index) => {
    const at = (index + 0.5) / TICKS * base, slot = ends.findIndex(end => at <= end);
    return slot === -1 ? null : parts[slot];
  });
  return <div className="plan-gauge" role="img" aria-label={`Proposed by component: ${parts.map(area => `${componentPalette[area].label} ${compact.format(amounts[area])}`).join(', ')}`}>
    {ticks.map((area, index) => <span key={index} title={area ? `${componentPalette[area].label}: ${compact.format(amounts[area])}` : undefined} style={area ? { background: componentPalette[area].fill } : undefined} />)}
  </div>;
}

function actionLabel(plan: PlanOverview, isOfficer: boolean) {
  if (!isOfficer && ['awaiting_review', 'awaiting_beap_chair'].includes(plan.status)) return 'Review plan';
  if (!isOfficer || ['awaiting_review', 'awaiting_beap_chair', 'awaiting_chairman', 'approved'].includes(plan.status)) return 'View plan';
  return plan.lineCount ? 'Continue' : 'Start planning';
}

/** One action plan on the dashboard: the funding figure first, then where it goes and what it holds. */
export function PlanCard({ plan, isOfficer, canEdit, onEdit }: PlanCardProps) {
  const funding = Number(plan.fundingTotal ?? 0), other = Number(otherFundingTotal(plan));
  const share = funding > 0 ? Math.round(plan.budget / funding * 100) : 0;
  const href = planHref(isOfficer && ['draft', 'changes_requested'].includes(plan.status) ? '/beap' : '/beap/review', plan.id);
  const proposed = plan.lineCount > 0 || plan.budget > 0;
  return <Card className="dashboard-plan-card" {...planCardTilt}>
    <PlanCardGuilloche seed={plan.startYear} />
    <CardHeader className="plan-card-header">
      <div className="min-w-0"><CardTitle><h3>{planPeriod(plan)} BEAP</h3></CardTitle><CardDescription>{plan.startYear === plan.endYear ? 'Annual' : `${plan.endYear - plan.startYear + 1}-year`} plan · Matching Grant</CardDescription></div>
      <PlanStatusBadge status={plan.status} />
    </CardHeader>
    <CardContent>
      <p className="plan-funding-label">Available funding</p>
      <p className="plan-funding" aria-label={amountFormat.format(funding)}><Amount value={funding} /></p>
      {proposed ? <div className="plan-proposed">
        <FundingGauge plan={plan} funding={funding} />
        <p><strong>{compact.format(plan.budget)}</strong> proposed<span>{share}% of funding</span></p>
      </div> : <p className="plan-proposed-empty">Nothing proposed yet</p>}
      {(plan.lineCount > 0 || plan.schoolCount > 0 || other > 0) && <ul className="plan-pills" aria-label="Plan contents">
        {plan.lineCount > 0 && <li title="Budget lines"><ListChecksIcon aria-hidden="true" /><b>{plan.lineCount}</b>{plan.lineCount === 1 ? "line" : "lines"}</li>}
        {plan.schoolCount > 0 && <li><SchoolIcon aria-hidden="true" /><b>{plan.schoolCount}</b>{plan.schoolCount === 1 ? "school" : "schools"}</li>}
        {other > 0 && <li><HandCoinsIcon aria-hidden="true" /><b>+{compact.format(other)}</b>other funding<OtherFundingInfo setup={plan} /></li>}
      </ul>}
      <div className="plan-card-bottom">
        <time dateTime={plan.updatedAt} title={date.format(new Date(plan.updatedAt))}>Updated {updatedAgo(plan.updatedAt)}</time>
        <span className="plan-card-actions">
          {canEdit && statePlanOpen(plan.status) && <Button size="sm" variant="ghost" className="plan-edit" onClick={() => onEdit(plan.id)}><PencilIcon />Edit plan</Button>}
          <Button asChild size="sm" variant="ghost" className="plan-open"><a href={href}>{actionLabel(plan, isOfficer)}<ArrowUpRightIcon /></a></Button>
        </span>
      </div>
    </CardContent>
  </Card>;
}
