'use client';
import './plan-card.css';

import { useState } from 'react';
import { ArrowUpRightIcon, HandCoinsIcon, PencilIcon, SchoolIcon } from 'lucide-react';
import { componentPalette } from '@/components/dashboard/component-budgets';
import { OtherFundingInfo } from '@/components/funding-sources-field';
import type { InvestmentArea } from '@/components/investment-filter';
import { PlanCardGuilloche, planCardTilt } from '@/components/plan-card-surface';
import { PlanStatusBadge } from '@/components/plan-status';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
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

type GaugeGroup = { area: InvestmentArea | null; ticks: number; amount: number };

/** Ticks per component (at least one each, so small components still show), then the unspent rest. */
function gaugeGroups(plan: PlanOverview, funding: number): GaugeGroup[] {
  const amounts = planAmounts(plan), base = Math.max(funding, plan.budget, 1);
  const parts = mixOrder.filter(area => amounts[area] > 0).map(area => ({ area, amount: amounts[area], ticks: Math.max(1, Math.round(amounts[area] / base * TICKS)) }));
  while (parts.reduce((sum, part) => sum + part.ticks, 0) > TICKS) { const largest = parts.reduce((max, part) => part.ticks > max.ticks ? part : max); largest.ticks -= 1; }
  const used = parts.reduce((sum, part) => sum + part.ticks, 0);
  return [...parts, ...(used < TICKS ? [{ area: null, amount: Math.max(funding - plan.budget, 0), ticks: TICKS - used }] : [])];
}

/**
 * Proposed spend as a tick gauge: 32 ticks of the available funding, grouped by component. Hovering or
 * focusing a group highlights it and shows its amount; the pale group is what is still unallocated.
 */
function FundingGauge({ plan, funding }: { plan: PlanOverview; funding: number }) {
  const [active, setActive] = useState<string | null>(null);
  const groups = gaugeGroups(plan, funding);
  const percent = (amount: number) => funding > 0 ? `${Math.round(amount / funding * 100)}%` : '';
  return <div className="plan-gauge" data-active={active ?? undefined} onPointerLeave={() => setActive(null)}>
    {groups.map(group => {
      const key = group.area ?? 'unallocated', label = group.area ? componentPalette[group.area].label : 'Not yet proposed';
      return <Tooltip key={key} delayDuration={0} open={active === key} onOpenChange={open => setActive(current => open ? key : current === key ? null : current)}>
        <TooltipTrigger asChild>
          <button type="button" className="gauge-group" data-key={key} data-current={active === key || undefined} style={{ flexGrow: group.ticks }}
            aria-label={`${label}: ${compact.format(group.amount)}${percent(group.amount) ? `, ${percent(group.amount)} of funding` : ''}`}
            onPointerEnter={() => setActive(key)} onFocus={() => setActive(key)} onBlur={() => setActive(null)}>
            {Array.from({ length: group.ticks }, (_, index) => <span key={index} style={group.area ? { background: componentPalette[group.area].fill } : undefined} />)}
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" sideOffset={8} className="gauge-tip">
          <span className="gauge-tip-swatch" style={{ background: group.area ? componentPalette[group.area].fill : '#dfe3d3' }} />
          <span>{label}</span><b>{compact.format(group.amount)}</b>{percent(group.amount) && <small>{percent(group.amount)}</small>}
        </TooltipContent>
      </Tooltip>;
    })}
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
      <div className="min-w-0"><CardTitle><h3>{planPeriod(plan)} BEAP</h3></CardTitle>{plan.endYear > plan.startYear && <CardDescription>{plan.endYear - plan.startYear + 1}-year plan</CardDescription>}</div>
      <PlanStatusBadge status={plan.status} />
    </CardHeader>
    <CardContent>
      <p className="plan-funding-label">Available funding</p>
      <p className="plan-funding" aria-label={amountFormat.format(funding)}><Amount value={funding} /></p>
      {proposed ? <div className="plan-proposed">
        <FundingGauge plan={plan} funding={funding} />
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
