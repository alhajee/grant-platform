'use client';
import './plan-card.css';

import { ArrowUpRightIcon, HandCoinsIcon, PencilIcon, SchoolIcon } from 'lucide-react';
import { Amount, FundingGauge, amountFormat, compactNaira as compact } from '@/components/dashboard/plan-figures';
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

const date = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
const relative = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
const DAY_MS = 86_400_000;

/** "today", "yesterday", "4 days ago"; older than a month falls back to the date. */
function updatedAgo(value: string) {
  const then = new Date(value), days = Math.round((new Date().setHours(0, 0, 0, 0) - new Date(then).setHours(0, 0, 0, 0)) / DAY_MS);
  return days >= 0 && days <= 30 ? relative.format(-days, 'day') : `on ${date.format(then)}`;
}

const planAmounts = (plan: PlanOverview): Record<InvestmentArea, number> => ({ infrastructure: plan.infrastructureBudget, tlm: plan.tlmBudget ?? 0, sports: plan.sportsBudget, sbmc: plan.sbmcBudget ?? 0, curriculum: plan.curriculumBudget ?? 0, monitoring: plan.monitoringBudget ?? 0, gscci: plan.gscciBudget ?? 0 });

function actionLabel(plan: PlanOverview, isOfficer: boolean) {
  if (!isOfficer && ['awaiting_review', 'awaiting_beap_chair'].includes(plan.status)) return 'Review plan';
  if (!isOfficer || ['awaiting_review', 'awaiting_beap_chair', 'awaiting_chairman', 'approved'].includes(plan.status)) return 'View plan';
  return plan.lineCount ? 'Continue' : 'Start planning';
}

/** One action plan on the dashboard: the funding figure first, then where it goes and what it holds. */
export function PlanCard({ plan, isOfficer, canEdit, onEdit }: PlanCardProps) {
  const funding = Number(plan.fundingTotal ?? 0), other = Number(otherFundingTotal(plan));
  const share = funding > 0 ? Math.round(plan.budget / funding * 100) : 0;
  const href = planHref('/beap/review', plan.id);
  const proposed = plan.lineCount > 0 || plan.budget > 0;
  return <Card className="dashboard-plan-card" {...planCardTilt}>
    <PlanCardGuilloche seed={plan.startYear} />
    <CardHeader className="plan-card-header">
      <div className="min-w-0"><CardTitle><h3>{planPeriod(plan)} BEAP</h3></CardTitle>{plan.endYear > plan.startYear && <CardDescription>{plan.endYear - plan.startYear + 1}-year plan</CardDescription>}</div>
      <PlanStatusBadge status={plan.status} />
    </CardHeader>
    <CardContent>
      <p className="plan-funding-label">Available funding</p>
      <p className="plan-funding" aria-label={amountFormat.format(funding)}><Amount value={funding} /></p>
      {proposed ? <div className="plan-proposed">
        <FundingGauge amounts={planAmounts(plan)} budget={plan.budget} funding={funding} />
        <p><strong>{compact.format(plan.budget)}</strong> proposed<span>{share}% of funding</span></p>
      </div> : <p className="plan-proposed-empty">Nothing proposed yet</p>}
      {(plan.schoolCount > 0 || other > 0) && <ul className="plan-pills" aria-label="Plan contents">
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
