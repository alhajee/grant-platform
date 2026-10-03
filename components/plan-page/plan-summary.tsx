'use client';

import { CalendarDaysIcon, ChevronDownIcon, HandCoinsIcon, ListIcon, SchoolIcon } from 'lucide-react';
import { Amount, FundingGauge, amountFormat, compactNaira, mixOrder } from '@/components/dashboard/plan-figures';
import { OtherFundingInfo } from '@/components/funding-sources-field';
import { PlanSetupSummary } from '@/components/plan-setup-summary';
import { Card, CardContent } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import type { ActionPlan } from '@/lib/action-plans';
import { otherFundingTotal } from '@/lib/plan-setup';
import type { PlanTotals } from '@/lib/plan-summary';

const plural = (n: number, one: string, many: string) => n === 1 ? one : many;

/**
 * The plan at a glance: available funding as the key figure, the proposed amount as a component-coloured
 * gauge, and small pills for schools, lines and other funding. Funding details and documents fold away below.
 */
export function PlanSummary({ plan, totals }: { plan: ActionPlan; totals: PlanTotals }) {
  const funding = plan.fundingTotal != null ? Number(plan.fundingTotal) : null;
  const other = Number(otherFundingTotal(plan));
  const { budget, schoolCount, lineCount } = totals.total;
  const amounts = Object.fromEntries(mixOrder.map(area => [area, totals[area].budget]));
  const share = funding ? Math.round(budget / funding * 100) : null;
  return <Card className="plan-summary">
    <CardContent>
      <div className="plan-summary-figure">
        <p className="plan-summary-label">Available funding</p>
        <p className="plan-funding" aria-label={funding == null ? 'Not set' : amountFormat.format(funding)}>{funding == null ? '—' : <Amount value={funding} />}</p>
      </div>
      <div className="plan-summary-mix">
        {budget > 0 ? <>
          <FundingGauge amounts={amounts} budget={budget} funding={funding ?? 0} />
          <p className="plan-summary-proposed"><strong>{compactNaira.format(budget)}</strong> proposed{share != null && <span>{share}% of funding</span>}</p>
        </> : <p className="plan-summary-proposed">Nothing proposed yet</p>}
        <ul className="plan-pills" aria-label="Plan contents">
          <li><SchoolIcon aria-hidden="true" /><b>{schoolCount}</b>{plural(schoolCount, 'school', 'schools')}</li>
          <li><ListIcon aria-hidden="true" /><b>{lineCount}</b>{plural(lineCount, 'budget line', 'budget lines')}</li>
          {other > 0 && <li><HandCoinsIcon aria-hidden="true" /><b>+{compactNaira.format(other)}</b>other funding<OtherFundingInfo setup={plan} /></li>}
          {plan.implementationYear != null && <li><CalendarDaysIcon aria-hidden="true" />Implementation<b>{plan.implementationYear}</b></li>}
        </ul>
      </div>
      {plan.beapName && <Collapsible className="plan-summary-details">
        <CollapsibleTrigger className="plan-summary-details-trigger"><ChevronDownIcon aria-hidden="true" />Funding details & documents</CollapsibleTrigger>
        <CollapsibleContent><PlanSetupSummary setup={plan} compact /></CollapsibleContent>
      </Collapsible>}
    </CardContent>
  </Card>;
}
