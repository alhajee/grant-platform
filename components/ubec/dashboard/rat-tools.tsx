'use client';
import '@/components/ubec/ubec-flow.css';
import { useEffect, useState } from 'react';
import { DownloadIcon, FileSpreadsheetIcon } from 'lucide-react';
import { NoItemsArt, UbecEmpty } from '@/components/empty-art/ubec-flow';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { nationalStatusLabels, type RatToolPlan } from '@/lib/ubec';

const date = new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium' });
const kb = (size: number) => size >= 1024 * 1024 ? `${(size / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(size / 1024))} KB`;

/** UBEC139: the RAT tool of every plan submitted to UBEC, for UBEC Planning (DPRS) to download (app/api/ubec/rat-tools). */
export function RatToolsCard({ limit = 8 }: { limit?: number }) {
  const [plans, setPlans] = useState<RatToolPlan[] | null>(null), [error, setError] = useState(''), [all, setAll] = useState(false);
  useEffect(() => {
    let active = true;
    void fetch('/api/ubec/rat-tools', { cache: 'no-store' }).then(async response => {
      const body = await response.json().catch(() => ({})) as { plans?: RatToolPlan[]; error?: string };
      if (!response.ok) throw Error(body.error || 'Unable to load the RAT tools');
      if (active) setPlans(body.plans ?? []);
    }).catch(cause => { if (active) setError(cause instanceof Error ? cause.message : 'Unable to load the RAT tools'); });
    return () => { active = false; };
  }, []);
  const shown = plans ? (all ? plans : plans.slice(0, limit)) : [];
  return <Card className="rat-tools-card"><CardHeader><CardTitle>RAT tools {plans && <Badge variant="secondary">{plans.length}</Badge>}</CardTitle><CardDescription>The Rapid Assessment Tool of each plan sent to UBEC</CardDescription></CardHeader><CardContent>
    {error ? <p className="text-sm text-destructive" role="alert">{error}</p>
      : !plans ? <Skeleton className="h-32 w-full rounded-xl" />
      : !plans.length ? <UbecEmpty art={<NoItemsArt />} title="No plans sent to UBEC yet" compact>RAT tools appear here when a SUBEB sends its plan</UbecEmpty>
      : <>
        <ul className="rat-tools-list">{shown.map(plan => <li key={plan.planId}>
          <div><strong>{plan.state} · {plan.period}</strong><small>Sent {date.format(new Date(plan.submittedAt))} · {nationalStatusLabels[plan.status] ?? plan.status}</small></div>
          <span className="rat-tools-files">{plan.documents.length ? plan.documents.map(doc => <Button key={doc.id} asChild size="sm" variant="outline" className="rounded-full"><a href={`/api/plans/documents?id=${doc.id}`} download={doc.name} title={doc.name}><FileSpreadsheetIcon data-icon="inline-start" /><span className="rat-tools-name">{doc.name}</span><small>{kb(doc.size)}</small><DownloadIcon data-icon="inline-end" /></a></Button>) : <small className="text-muted-foreground">No RAT uploaded</small>}</span>
        </li>)}</ul>
        {plans.length > limit && <Button variant="ghost" size="sm" className="rounded-full mt-2" onClick={() => setAll(!all)}>{all ? 'Show fewer' : `Show all ${plans.length}`}</Button>}
      </>}
  </CardContent></Card>;
}
