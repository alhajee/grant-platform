'use client';
import '@/components/ubec/ubec-flow.css';

import { useEffect, useState } from 'react';
import { CheckIcon, XIcon } from 'lucide-react';
import { compactNaira } from '@/components/dashboard/plan-figures';
import { DecisionBar, DecisionPill } from '@/components/ubec/flow-bits';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { departmentName } from '@/lib/ubec';
import { componentName, type UbecResults } from '@/lib/ubec-flow';

/**
 * The SUBEB's view of UBEC's assessment once the UBEC BEAP Chair has decided: per component the accepted and
 * rejected items with the officers' reasons, the UBEC Director's comment and the oversight notes.
 */
export function UbecResultsCard({ planId, reloadKey }: { planId: number; reloadKey: unknown }) {
  const [data, setData] = useState<UbecResults | null>(null);
  useEffect(() => {
    let live = true;
    void fetch(`/api/ubec/results?plan=${planId}`, { cache: 'no-store' }).then(r => r.ok ? r.json() as Promise<UbecResults> : null).catch(() => null).then(result => { if (live) setData(result); });
    return () => { live = false; };
  }, [planId, reloadKey]);
  if (!data?.round || !data.components.length) return null;
  const rejected = data.components.reduce((sum, c) => sum + c.counts.rejected, 0);
  return <Card className="ubec-results" id="ubec-results">
    <CardHeader><CardTitle><h2>UBEC assessment · submission {data.round.number}</h2></CardTitle>
      <CardDescription>{data.round.status === 'returned' ? `Returned for changes${rejected ? `: ${rejected} ${rejected === 1 ? 'item was' : 'items were'} rejected` : ''}. Address the rejected items and the shared UBEC comments, then resubmit.` : 'Approved by UBEC.'}</CardDescription></CardHeader>
    <CardContent><ul className="ubec-results-list">{data.components.map(c => <li key={c.pillar}>
      <Collapsible defaultOpen={c.counts.rejected > 0}>
        <CollapsibleTrigger className="ubec-results-trigger"><strong>{componentName(c.pillar)}</strong><span className="ubec-results-counts"><span><CheckIcon aria-hidden="true" />{c.counts.accepted}</span><span data-kind="reject"><XIcon aria-hidden="true" />{c.counts.rejected}</span></span></CollapsibleTrigger>
        <DecisionBar counts={c.counts} compact />
        <CollapsibleContent className="ubec-results-body">
          <ul className="ubec-results-items">{c.items.filter(i => i.decision !== 'accept').concat(c.items.filter(i => i.decision === 'accept')).map(item => <li key={item.rowRef}><span><b>{item.title}</b>{item.note && <small>“{item.note}”</small>}</span><span className="tabular-nums">{compactNaira.format(item.amount)}</span><DecisionPill decision={item.decision} /></li>)}</ul>
          {c.directorComment && <p className="ubec-results-note"><Badge variant="outline">UBEC Director</Badge>{c.directorComment}</p>}
          {c.oversight.filter(o => o.note).map(o => <p key={o.department} className="ubec-results-note"><Badge variant="outline">{departmentName(o.department)}</Badge>{o.note}</p>)}
        </CollapsibleContent>
      </Collapsible>
    </li>)}</ul></CardContent>
  </Card>;
}
