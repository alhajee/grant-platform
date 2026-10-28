'use client';
import './level-mapping-card.css';
import { SchoolIcon } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { schoolLevelKeys, schoolLevelLabels, type LevelMapping } from '@/lib/level-mapping';
import { compactNairaFormat, nairaFormat } from '@/lib/money-format';

const compact = compactNairaFormat(1);
const pct = (part: number, whole: number) => whole > 0 ? Math.round(part / whole * 1000) / 10 : 0;

/**
 * Resource mapping by school level (UBEC127): one part-to-whole bar of the proposed budget across ECCDE, Primary, JSS and
 * not school-specific, with every part labelled (amount and share) below it, so colour never carries the meaning alone.
 * How lines are shared out: lib/level-mapping.ts.
 */
export function LevelMappingCard({ mapping, title = 'Spending by school level', description, className }: { mapping: LevelMapping | null | undefined; title?: string; description?: string; className?: string }) {
  const total = mapping?.total ?? 0;
  return <Card className={['level-mapping', className].filter(Boolean).join(' ')}>
    <CardHeader><CardTitle><h2 className="level-mapping-title"><SchoolIcon aria-hidden="true" />{title}</h2></CardTitle>
      <CardDescription>{description ?? 'Proposed budget for ECCDE, Primary, JSS and Others (not tied to a school level)'}</CardDescription></CardHeader>
    <CardContent className="level-mapping-body">
      {!mapping || total <= 0 ? <p className="level-mapping-empty">Nothing proposed yet</p> : <>
        <div className="level-mapping-bar" role="img" aria-label={schoolLevelKeys.map(key => `${schoolLevelLabels[key]} ${pct(mapping[key], total)}%`).join(', ')}>
          {schoolLevelKeys.filter(key => mapping[key] > 0).map(key => <Tooltip key={key}><TooltipTrigger asChild>
            <span className="level-mapping-segment" data-level={key} style={{ flexGrow: mapping[key] }} />
          </TooltipTrigger><TooltipContent><strong>{schoolLevelLabels[key]}</strong> · {nairaFormat.format(mapping[key])} · {pct(mapping[key], total)}%</TooltipContent></Tooltip>)}
        </div>
        <table className="level-mapping-table">
          <thead className="sr-only"><tr><th>School level</th><th>Amount</th><th>Share</th></tr></thead>
          <tbody>{schoolLevelKeys.map(key => <tr key={key} data-empty={mapping[key] <= 0 || undefined}>
            <th scope="row"><i data-level={key} aria-hidden="true" />{schoolLevelLabels[key]}</th>
            <td title={nairaFormat.format(mapping[key])}>{compact.format(mapping[key])}</td>
            <td>{pct(mapping[key], total)}%</td>
          </tr>)}</tbody>
          <tfoot><tr><th scope="row">Total</th><td title={nairaFormat.format(total)}>{compact.format(total)}</td><td>100%</td></tr></tfoot>
        </table>
      </>}
    </CardContent>
  </Card>;
}
