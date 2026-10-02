'use client';

import type { CSSProperties } from 'react';
import type { InvestmentArea } from '@/components/investment-filter';
import { componentEnvelope } from '@/lib/funding-policy';
import type { PlanOverview } from '@/lib/action-plans';

/** One green family for every component, darkest for the largest envelopes; `ink` is the readable text colour on it. */
export const componentPalette: Record<InvestmentArea, { label: string; fill: string; ink: string }> = {
  infrastructure: { label: 'Infrastructure', fill: '#004540', ink: '#ffffff' },
  tlm: { label: 'TLM', fill: '#2c7a5e', ink: '#ffffff' },
  sports: { label: 'Sports', fill: '#a9d05a', ink: '#1d3a0e' },
  sbmc: { label: 'SBMC', fill: '#4bbf96', ink: '#0d3a2b' },
  curriculum: { label: 'Curriculum', fill: '#6e9c85', ink: '#ffffff' },
  monitoring: { label: 'Supervision & Monitoring', fill: '#d5e68c', ink: '#3a4810' },
  gscci: { label: 'Greening & Safeguards', fill: '#a4dcc4', ink: '#123f30' },
};

const compact = new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', notation: 'compact', maximumFractionDigits: 2 });

type Tile = { area: InvestmentArea; amount: number; ceiling: number; share: number | null };

/**
 * "Where your plans invest" as sized tiles: each component with proposals shows how much of its funding
 * ceiling (across the shown plans) is already proposed. Components with nothing proposed collapse into one line.
 */
export function ComponentBudgets({ plans, areas, amounts, totalFunding, unavailable }: { plans: PlanOverview[]; areas: InvestmentArea[]; amounts: Record<InvestmentArea, number>; totalFunding: number; unavailable: boolean }) {
  const total = areas.reduce((sum, area) => sum + amounts[area], 0);
  const tiles: Tile[] = areas.filter(area => amounts[area] > 0).map(area => {
    const ceiling = plans.reduce((sum, plan) => sum + Number(componentEnvelope(plan, area) ?? 0), 0);
    return { area, amount: amounts[area], ceiling, share: ceiling > 0 ? Math.round(amounts[area] / ceiling * 100) : null };
  }).sort((a, b) => b.amount - a.amount);
  const idle = areas.filter(area => !(amounts[area] > 0));
  const overall = totalFunding > 0 ? Math.round(total / totalFunding * 100) : null;

  return <div className="component-budgets">
    <div className="component-budgets-total">
      <strong>{unavailable ? '—' : compact.format(total)}</strong>
      <span>{unavailable ? 'Unavailable' : overall === null ? 'proposed' : <>proposed · <b>{overall}%</b> of {compact.format(totalFunding)}</>}</span>
    </div>
    {!unavailable && tiles.length > 0 && <ul className="component-tiles">
      {tiles.map((tile, index) => {
        const { label, fill, ink } = componentPalette[tile.area];
        return <li key={tile.area} data-lead={index === 0 || undefined} style={{ '--tile-fill': fill, '--tile-ink': ink } as CSSProperties}
          aria-label={`${label}: ${compact.format(tile.amount)} proposed${tile.share === null ? '' : `, ${tile.share}% of ${compact.format(tile.ceiling)}`}`}>
          <p className="tile-share">{tile.share === null ? compact.format(tile.amount) : <>{tile.share}<small>%</small></>}</p>
          <p className="tile-label">{label}</p>
          {tile.share !== null && <div className="tile-meter" aria-hidden="true"><span style={{ width: `${Math.min(tile.share, 100)}%` }} /></div>}
          {tile.share !== null && <p className="tile-amounts" aria-hidden="true"><span>{compact.format(tile.amount)}</span><span>{compact.format(tile.ceiling)}</span></p>}
        </li>;
      })}
    </ul>}
    {!unavailable && !tiles.length && <p className="component-budgets-empty">Nothing proposed yet. Amounts appear here as components are filled.</p>}
    {!unavailable && idle.length > 0 && <p className="component-budgets-idle"><span>Not started</span>{idle.map(area => componentPalette[area].label).join(' · ')}</p>}
  </div>;
}
