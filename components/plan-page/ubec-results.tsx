'use client';
import '@/components/ubec/ubec-flow.css';

import { useEffect, useState } from 'react';
import { CheckIcon, ChevronRightIcon, FileSpreadsheetIcon, XIcon } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { compactNaira } from '@/components/dashboard/plan-figures';
import { DecisionBar, DecisionPill } from '@/components/ubec/flow-bits';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { departmentName } from '@/lib/ubec';
import { componentName, type UbecResults } from '@/lib/ubec-flow';

/** The latest decided UBEC round for the SUBEB plan page (GET /api/ubec/results), shared by the cards and this card. */
export function useUbecResults(planId: number, reloadKey: unknown, enabled: boolean): UbecResults | null {
  const [data, setData] = useState<UbecResults | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    void fetch(`/api/ubec/results?plan=${planId}`, { cache: 'no-store' }).then(r => r.ok ? r.json() as Promise<UbecResults> : null).catch(() => null).then(result => { if (live) setData(result); });
    return () => { live = false; };
  }, [planId, reloadKey, enabled]);
  return enabled ? data : null;
}

/** The editor link of one rejected item (UBEC188/191): `?line=` opens it in the form. */
export const itemEditHref = (editHref: string | undefined, rowRef: string) => editHref ? `${editHref}${editHref.includes('?') ? '&' : '?'}line=${encodeURIComponent(rowRef)}` : undefined;

/**
 * The SUBEB's view of UBEC's assessment once the UBEC BEAP Chair has decided. UBEC192: compact, showing only the rejected
 * items with the officers' reasons (accepted ones on request); each rejected item opens in its form when the viewer may
 * edit the component. The UBEC Director's comment and the oversight notes follow.
 */
export function UbecResultsCard({ data, editHrefFor, onEditPlan }: { data: UbecResults | null; editHrefFor?: (pillar: string) => string | undefined; /** UBEC205: opens Edit plan to replace a rejected RAT */ onEditPlan?: () => void }) {
  const [showAccepted, setShowAccepted] = useState<string[]>([]);
  if (!data?.round || (!data.components.length && !data.rat)) return null;
  const rejected = data.components.reduce((sum, c) => sum + c.counts.rejected, 0);
  return <Card className="ubec-results" id="ubec-results">
    <CardHeader><CardTitle><h2>UBEC assessment · submission {data.round.number}</h2></CardTitle>
      <CardDescription>{data.round.status === 'returned' ? `Returned for changes${rejected ? `: ${rejected} ${rejected === 1 ? 'item was' : 'items were'} rejected` : ''}. Correct the rejected items and answer the shared UBEC comments, then resubmit.` : 'Approved by UBEC.'}</CardDescription></CardHeader>
    <CardContent>{data.rat?.review.decision === 'reject' && <Alert variant={data.rat.replacedSince ? 'default' : 'destructive'} className="ubec-results-rat"><FileSpreadsheetIcon /><AlertTitle>{data.rat.replacedSince ? 'RAT tool rejected · a new RAT has been uploaded' : 'UBEC Planning rejected the RAT tool'}</AlertTitle><AlertDescription><span>“{data.rat.review.comment}” · {data.rat.review.reviewerName}</span>{!data.rat.replacedSince && data.round.status === 'returned' && <span>Upload a corrected RAT in Edit plan before sending the plan to UBEC again{onEditPlan && <> · <Button variant="link" className="h-auto p-0" onClick={onEditPlan}>Replace the RAT</Button></>}</span>}</AlertDescription></Alert>}
      {data.rat?.review.decision === 'accept' && <p className="ubec-results-rat-ok"><CheckIcon aria-hidden="true" />RAT tool accepted by {data.rat.review.reviewerName}</p>}
      <ul className="ubec-results-list">{data.components.map(c => {
      const editHref = editHrefFor?.(c.pillar), open = showAccepted.includes(c.pillar);
      const items = c.items.filter(i => i.decision !== 'accept'), accepted = c.items.filter(i => i.decision === 'accept');
      return <li key={c.pillar} data-rejected={c.counts.rejected > 0 || undefined}>
        <Collapsible defaultOpen={c.counts.rejected > 0}>
          <CollapsibleTrigger className="ubec-results-trigger"><strong>{componentName(c.pillar)}</strong><span className="ubec-results-counts"><span><CheckIcon aria-hidden="true" />{c.counts.accepted}</span><span data-kind="reject"><XIcon aria-hidden="true" />{c.counts.rejected}</span></span></CollapsibleTrigger>
          <DecisionBar counts={c.counts} compact />
          <CollapsibleContent className="ubec-results-body">
            {items.length > 0 ? <ul className="ubec-results-items">{items.map(item => { const href = itemEditHref(editHref, item.rowRef);
              const body = <><span><b>{item.title}</b>{item.note && <small>“{item.note}”</small>}<span className="ubec-results-meta"><span className="tabular-nums">{compactNaira.format(item.amount)}</span><DecisionPill decision={item.decision} /></span></span>{href && <ChevronRightIcon className="ubec-results-go" aria-hidden="true" />}</>;
              return <li key={item.rowRef}>{href ? <a href={href} className="ubec-results-item-link" title="Open this item in the form to correct it">{body}</a> : <div className="ubec-results-item-link">{body}</div>}</li>; })}</ul>
              : <p className="ubec-results-none">No items rejected</p>}
            {accepted.length > 0 && <Button variant="ghost" size="sm" className="ubec-results-more" onClick={() => setShowAccepted(list => open ? list.filter(p => p !== c.pillar) : [...list, c.pillar])}>{open ? 'Hide accepted items' : `Show ${accepted.length} accepted ${accepted.length === 1 ? 'item' : 'items'}`}</Button>}
            {open && <ul className="ubec-results-items" data-accepted>{accepted.map(item => <li key={item.rowRef}><div className="ubec-results-item-link"><span><b>{item.title}</b><span className="ubec-results-meta"><span className="tabular-nums">{compactNaira.format(item.amount)}</span><DecisionPill decision={item.decision} /></span></span></div></li>)}</ul>}
            {c.directorComment && <p className="ubec-results-note"><Badge variant="outline">UBEC Director</Badge>{c.directorComment}</p>}
            {c.oversight.filter(o => o.note).map(o => <p key={o.department} className="ubec-results-note"><Badge variant="outline">{departmentName(o.department)}</Badge>{o.note}</p>)}
          </CollapsibleContent>
        </Collapsible>
      </li>; })}</ul></CardContent>
  </Card>;
}
