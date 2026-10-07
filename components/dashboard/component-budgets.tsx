'use client';

import type { CSSProperties } from 'react';
import type { InvestmentArea } from '@/components/investment-filter';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { componentEnvelope, isSplitMode } from '@/lib/funding-policy';
import { isPoolComponent } from '@/lib/infrastructure-pool';
import type { PlanOverview } from '@/lib/action-plans';

/** One green family for every component, darkest for the largest envelopes; `ink` is the readable text colour on it. */
export const componentPalette: Record<InvestmentArea, { label: string; fill: string; ink: string }> = {
  // \u00ad: a soft hyphen, so the narrow tiles break it as Infra-structure.
  infrastructure: { label: 'Infra\u00adstructure', fill: '#004540', ink: '#ffffff' },
  tlm: { label: 'TLM', fill: '#2c7a5e', ink: '#ffffff' },
  sports: { label: 'Sports', fill: '#a9d05a', ink: '#1d3a0e' },
  sbmc: { label: 'SBMC', fill: '#4bbf96', ink: '#0d3a2b' },
  curriculum: { label: 'Curriculum', fill: '#6e9c85', ink: '#ffffff' },
  monitoring: { label: 'Supervision & Monitoring', fill: '#d5e68c', ink: '#3a4810' },
  gscci: { label: 'Greening & Safeguards', fill: '#a4dcc4', ink: '#123f30' },
  quality: { label: 'Quality Assurance', fill: '#3d6b4f', ink: '#ffffff' },
  teachers: { label: 'Teacher Development', fill: '#5c9a4a', ink: '#ffffff' },
  ict: { label: 'ICT', fill: '#c3e3a8', ink: '#24420f' },
  planning: { label: 'Planning', fill: '#5aa57a', ink: '#0d3a2b' },
};

const compact = new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', notation: 'compact', maximumFractionDigits: 2 });

/** Empty state: the tile columns waiting to be filled, in the component greens. */
function EmptyTiles() {
  const columns = [
    { x: 0, fill: componentPalette.infrastructure.fill, level: 0.62 },
    { x: 1, fill: componentPalette.sbmc.fill, level: 0.4 },
    { x: 2, fill: componentPalette.sports.fill, level: 0.78 },
  ];
  const width = 92, gap = 8, height = 132;
  return <figure className="component-budgets-empty">
    <svg viewBox={`0 0 ${width * 3 + gap * 2} ${height}`} role="img" aria-label="Nothing proposed yet">
      <defs>
        {columns.map(column => <pattern key={column.x} id={`empty-tile-${column.x}`} width="12" height="12" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="12" height="12" fill={column.fill} fillOpacity=".07" />
          <rect width="6" height="12" fill={column.fill} fillOpacity=".12" />
        </pattern>)}
      </defs>
      {columns.map(column => {
        const x = column.x * (width + gap), top = height * (1 - column.level);
        return <g key={column.x}>
          <rect x={x} y="0" width={width} height={height} rx="12" fill={`url(#empty-tile-${column.x})`} />
          <rect x={x + 1} y={top} width={width - 2} height={height - top - 1} rx="11" fill="#fff" fillOpacity=".55"
            stroke={column.fill} strokeOpacity=".45" strokeWidth="1.5" strokeDasharray="5 5" />
          <rect x={x + 12} y={height - 34} width="34" height="7" rx="3.5" fill={column.fill} fillOpacity=".28" />
          <rect x={x + 12} y={height - 21} width="52" height="6" rx="3" fill={column.fill} fillOpacity=".16" />
        </g>;
      })}
    </svg>
    <figcaption>Nothing proposed yet</figcaption>
  </figure>;
}

type Tile = { area: InvestmentArea; amount: number; ceiling: number; share: number | null };

/**
 * "Where your plans invest" as sized tiles: each component with proposals shows how much of its funding
 * ceiling (across the shown plans) is already proposed. Components with nothing proposed collapse into one line.
 */
export function ComponentBudgets({ plans, areas, amounts, totalFunding, unavailable, selected = [], onToggle }: {
  plans: PlanOverview[]; areas: InvestmentArea[]; amounts: Record<InvestmentArea, number>; totalFunding: number; unavailable: boolean;
  /** Components the dashboard is filtered to; clicking a tile toggles it. */
  selected?: InvestmentArea[]; onToggle?: (area: InvestmentArea) => void;
}) {
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
    {!unavailable && tiles.length > 0 && <ul className="component-tiles" data-filtered={selected.length > 0 || undefined}>
      {tiles.map(tile => {
        const { label, fill, ink } = componentPalette[tile.area], on = selected.includes(tile.area);
        // The column is the ceiling; the solid block rises to the share proposed (never so short the text cannot fit).
        const level = tile.share === null ? 100 : Math.max(Math.min(tile.share, 100), 60);
        // Shared-pool mode: Infrastructure and TLM share one pool (their ceiling), so what is left counts both sides; in split mode each has its own part.
        const left = Math.max(tile.ceiling - (isPoolComponent(tile.area) && !plans.some(isSplitMode) ? amounts.infrastructure + amounts.tlm : tile.amount), 0);
        return <li key={tile.area} data-selected={on || undefined} style={{ '--tile-fill': fill, '--tile-ink': ink } as CSSProperties}>
          <Tooltip delayDuration={0}>
            <TooltipTrigger asChild>
              <button type="button" aria-pressed={on} onClick={() => onToggle?.(tile.area)}
                aria-label={`${label}: ${compact.format(tile.amount)} proposed${tile.share === null ? '' : ` of ${compact.format(tile.ceiling)}, ${compact.format(left)} left`}. ${on ? 'Showing only plans with it; select to show all plans' : 'Select to show only plans with it'}`}>
                <span className="tile-block" style={{ height: `${level}%` }}>
                  <span className="tile-share">{tile.share === null ? compact.format(tile.amount) : <>{tile.share}<small>%</small></>}</span>
                  <span className="tile-label">{label}</span>
                  <span className="tile-amount">{compact.format(tile.amount)}</span>
                </span>
              </button>
            </TooltipTrigger>
            <TooltipContent side="top" sideOffset={6} className="tile-tip">
              <strong>{label}</strong>
              <span>{compact.format(tile.amount)} proposed{tile.share === null ? '' : ` of ${compact.format(tile.ceiling)}`}</span>
              {tile.share !== null && <span>{compact.format(left)} left</span>}
              <small>{on ? 'Click to show all plans' : 'Click to show plans with it'}</small>
            </TooltipContent>
          </Tooltip>
        </li>;
      })}
    </ul>}
    {!unavailable && !tiles.length && <EmptyTiles />}
    {!unavailable && idle.length > 0 && <p className="component-budgets-idle"><span>Not started</span>{idle.map(area => componentPalette[area].label).join(' · ')}</p>}
  </div>;
}
