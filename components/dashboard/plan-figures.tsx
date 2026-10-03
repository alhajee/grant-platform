'use client';
import './plan-figures.css';

import { useState } from 'react';
import type { InvestmentArea } from '@/components/investment-filter';
import { componentPalette } from '@/components/dashboard/component-budgets';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

/** Shared figures of the dashboard plan card and the plan page: the large amount, the tick gauge and the pills. */
export const amountFormat = new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', minimumFractionDigits: 0, maximumFractionDigits: 2 });
export const compactNaira = new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', notation: 'compact', maximumFractionDigits: 2 });

const TICKS = 32;
/** Gauge order: largest envelopes first, matching the dashboard tiles. */
export const mixOrder = ['infrastructure', 'tlm', 'quality', 'sbmc', 'teachers', 'ict', 'sports', 'curriculum', 'monitoring', 'gscci'] as const satisfies readonly InvestmentArea[];
export type ComponentAmounts = Partial<Record<InvestmentArea, number>>;

/** The amount with a quieter naira sign and kobo, so the figure itself carries the weight. */
export function Amount({ value }: { value: number }) {
  return <>{amountFormat.formatToParts(value).map((part, index) => part.type === 'currency' ? <span key={index} className="plan-amount-sign">{part.value}</span>
    : part.type === 'decimal' || part.type === 'fraction' ? <span key={index} className="plan-amount-minor">{part.value}</span> : part.value)}</>;
}

type GaugeGroup = { area: InvestmentArea | null; ticks: number; amount: number };

/** Ticks per component (at least one each, so small components still show), then the unspent rest. */
function gaugeGroups(amounts: ComponentAmounts, budget: number, funding: number): GaugeGroup[] {
  const base = Math.max(funding, budget, 1);
  const parts = mixOrder.filter(area => (amounts[area] ?? 0) > 0).map(area => ({ area, amount: amounts[area]!, ticks: Math.max(1, Math.round(amounts[area]! / base * TICKS)) }));
  while (parts.reduce((sum, part) => sum + part.ticks, 0) > TICKS) { const largest = parts.reduce((max, part) => part.ticks > max.ticks ? part : max); largest.ticks -= 1; }
  const used = parts.reduce((sum, part) => sum + part.ticks, 0);
  return [...parts, ...(used < TICKS ? [{ area: null, amount: Math.max(funding - budget, 0), ticks: TICKS - used }] : [])];
}

/**
 * Proposed spend as a tick gauge: 32 ticks of the available funding, grouped by component. Hovering or
 * focusing a group highlights it and shows its amount; the pale group is what is still unallocated.
 */
export function FundingGauge({ amounts, budget, funding }: { amounts: ComponentAmounts; budget: number; funding: number }) {
  const [active, setActive] = useState<string | null>(null);
  const groups = gaugeGroups(amounts, budget, funding);
  const percent = (amount: number) => funding > 0 ? `${Math.round(amount / funding * 100)}%` : '';
  return <div className="plan-gauge" data-active={active ?? undefined} onPointerLeave={() => setActive(null)}>
    {groups.map(group => {
      const key = group.area ?? 'unallocated', label = group.area ? componentPalette[group.area].label : 'Not yet proposed';
      return <Tooltip key={key} delayDuration={0} open={active === key} onOpenChange={open => setActive(current => open ? key : current === key ? null : current)}>
        <TooltipTrigger asChild>
          <button type="button" className="gauge-group" data-key={key} data-current={active === key || undefined} style={{ flexGrow: group.ticks }}
            aria-label={`${label}: ${compactNaira.format(group.amount)}${percent(group.amount) ? `, ${percent(group.amount)} of funding` : ''}`}
            onPointerEnter={() => setActive(key)} onFocus={() => setActive(key)} onBlur={() => setActive(null)}>
            {Array.from({ length: group.ticks }, (_, index) => <span key={index} style={group.area ? { background: componentPalette[group.area].fill } : undefined} />)}
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" sideOffset={8} className="gauge-tip">
          <span className="gauge-tip-swatch" style={{ background: group.area ? componentPalette[group.area].fill : '#dfe3d3' }} />
          <span>{label}</span><b>{compactNaira.format(group.amount)}</b>{percent(group.amount) && <small>{percent(group.amount)}</small>}
        </TooltipContent>
      </Tooltip>;
    })}
  </div>;
}
