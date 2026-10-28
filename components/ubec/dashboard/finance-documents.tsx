'use client';
import '@/components/ubec/ubec-flow.css';
import { useEffect, useState } from 'react';
import { DownloadIcon } from 'lucide-react';
import { NoItemsArt, UbecEmpty } from '@/components/empty-art/ubec-flow';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { nationalStatusLabels } from '@/lib/ubec';
import type { FinancePlan } from '@/lib/finance-documents';

const date = new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium' });

/**
 * UBEC94: the SUBEB Finance documents of every plan sent to UBEC, for UBEC Finance (Oversight Director and Assessment
 * Officers) to download, like the RAT tools card (app/api/ubec/finance-documents). Missing documents are named.
 */
export function FinanceDocumentsOverview({ limit = 8 }: { limit?: number }) {
  const [plans, setPlans] = useState<FinancePlan[] | null>(null), [error, setError] = useState(''), [all, setAll] = useState(false);
  useEffect(() => {
    let active = true;
    void fetch('/api/ubec/finance-documents', { cache: 'no-store' }).then(async response => {
      const body = await response.json().catch(() => ({})) as { plans?: FinancePlan[]; error?: string };
      if (!response.ok) throw Error(body.error || 'Unable to load the finance documents');
      if (active) setPlans(body.plans ?? []);
    }).catch(cause => { if (active) setError(cause instanceof Error ? cause.message : 'Unable to load the finance documents'); });
    return () => { active = false; };
  }, []);
  const shown = plans ? (all ? plans : plans.slice(0, limit)) : [];
  return <Card className="rat-tools-card"><CardHeader><CardTitle>Finance documents {plans && <Badge variant="secondary">{plans.length}</Badge>}</CardTitle><CardDescription>Bank statement, notification of lodgement and 50% utilisation report of each plan sent to UBEC</CardDescription></CardHeader><CardContent>
    {error ? <p className="text-sm text-destructive" role="alert">{error}</p>
      : !plans ? <Skeleton className="h-32 w-full rounded-xl" />
      : !plans.length ? <UbecEmpty art={<NoItemsArt />} title="No plans sent to UBEC yet" compact>Finance documents appear here when a SUBEB sends its plan</UbecEmpty>
      : <>
        <ul className="rat-tools-list">{shown.map(plan => <li key={plan.planId}>
          <div><strong>{plan.state} · {plan.period}</strong><small>Sent {date.format(new Date(plan.submittedAt))} · {nationalStatusLabels[plan.status] ?? plan.status}{plan.missing.length ? ` · Missing: ${plan.missing.join(', ')}` : ''}</small></div>
          <span className="rat-tools-files">{plan.documents.length ? plan.documents.map(doc => <Button key={doc.id} asChild size="sm" variant="outline" className="rounded-full"><a href={`/api/plans/finance?plan=${plan.planId}&id=${doc.id}&download=1`} download={doc.name} title={doc.name}><DownloadIcon data-icon="inline-start" />{doc.label}</a></Button>) : <Badge variant="outline">None uploaded yet</Badge>}</span>
        </li>)}</ul>
        {plans.length > limit && <Button variant="ghost" size="sm" className="rounded-full mt-2" onClick={() => setAll(!all)}>{all ? 'Show fewer' : `Show all ${plans.length}`}</Button>}
      </>}
  </CardContent></Card>;
}
