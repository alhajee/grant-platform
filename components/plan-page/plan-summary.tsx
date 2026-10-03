'use client';

import { CalendarDaysIcon, ChevronDownIcon, HandCoinsIcon, ListIcon, SchoolIcon } from 'lucide-react';
import { Amount, FundingGauge, amountFormat, compactNaira, mixOrder } from '@/components/dashboard/plan-figures';
import { OtherFundingInfo } from '@/components/funding-sources-field';
import { FundingDetails } from './funding-details';
import { Card, CardContent } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import type { ActionPlan } from '@/lib/action-plans';
import { otherFundingTotal } from '@/lib/plan-setup';
import type { PlanTotals } from '@/lib/plan-summary';

const plural = (n: number, one: string, many: string) => n === 1 ? one : many;

/**
 * The plan's funding in a narrow side card: available funding as the key figure, the proposed amount as a
 * component-coloured gauge, a 2x2 list of facts, and funding details and documents folding open below.
 */
export function PlanSummary({ plan, totals, detailsOpen, onDetailsOpenChange }: { plan: ActionPlan; totals: PlanTotals; detailsOpen: boolean; onDetailsOpenChange: (open: boolean) => void }) {
  const funding = plan.fundingTotal != null ? Number(plan.fundingTotal) : null;
  const other = Number(otherFundingTotal(plan));
  const { budget, schoolCount, lineCount } = totals.total;
  const amounts = Object.fromEntries(mixOrder.map(area => [area, totals[area].budget]));
  const share = funding ? Math.round(budget / funding * 100) : null;
  const facts = [
    { key: 'schools', Icon: SchoolIcon, value: String(schoolCount), label: plural(schoolCount, 'school', 'schools') },
    { key: 'lines', Icon: ListIcon, value: String(lineCount), label: plural(lineCount, 'budget line', 'budget lines') },
    ...(other > 0 ? [{ key: 'other', Icon: HandCoinsIcon, value: `+${compactNaira.format(other)}`, label: 'other funding', info: true }] : []),
    ...(plan.implementationYear != null ? [{ key: 'year', Icon: CalendarDaysIcon, value: String(plan.implementationYear), label: 'implementation' }] : []),
  ];
  return <Card className="plan-summary">
    <CardContent>
      <p className="plan-summary-label">Available funding</p>
      <p className="plan-funding" aria-label={funding == null ? 'Not set' : amountFormat.format(funding)}>{funding == null ? '—' : <Amount value={funding} />}</p>
      {budget > 0 ? <div className="plan-summary-mix">
        <FundingGauge amounts={amounts} budget={budget} funding={funding ?? 0} />
        <p className="plan-summary-proposed"><strong>{compactNaira.format(budget)}</strong> proposed{share != null && <span>{share}%</span>}</p>
      </div> : <p className="plan-summary-proposed">Nothing proposed yet</p>}
      <dl className="plan-summary-facts">
        {facts.map(({ key, Icon, value, label, info }) => <div key={key}>
          <dt><Icon aria-hidden="true" />{label}{info && <OtherFundingInfo setup={plan} />}</dt>
          <dd>{value}</dd>
        </div>)}
      </dl>
      {plan.beapName && <Collapsible className="plan-summary-details" open={detailsOpen} onOpenChange={onDetailsOpenChange}>
        <CollapsibleTrigger className="plan-summary-details-trigger"><ChevronDownIcon aria-hidden="true" />Funding details & documents</CollapsibleTrigger>
        <CollapsibleContent><FundingDetails setup={plan} /></CollapsibleContent>
      </Collapsible>}
    </CardContent>
  </Card>;
}
