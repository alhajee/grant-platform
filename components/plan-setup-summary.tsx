import { CalendarDaysIcon, FilesIcon } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { DocumentFiles } from '@/components/document-files';
import { PlansArtwork } from '@/components/metric-artwork';
import { formatQuarters } from '@/lib/format-quarters';
import type { PlanSetup } from '@/lib/plan-setup';

const money = new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' });
export function PlanSetupSummary({ setup, compact = false }: { setup: Partial<PlanSetup>; compact?: boolean }) {
  if (!setup.beapName) return null;
  const documents = (setup.documents??[]).map(document=>({...document,url:`/api/plans/documents?id=${document.id}`}));
  const amount = (value: string | null | undefined) => value != null && Number.isFinite(Number(value)) ? money.format(Number(value)) : '—';
  const reference = setup.fundingQuarters?.length
    ? setup.beapName.replace(/Q[1-4](?:\+Q[1-4])+/g, formatQuarters(setup.fundingQuarters))
    : setup.beapName;

  if (compact) return <Card className="plan-setup-summary plan-setup-summary-compact">
    <CardHeader>
      <div className="plan-summary-emblem"><PlansArtwork /></div>
      <div className="plan-summary-identity"><CardDescription>Action plan reference</CardDescription><CardTitle>{reference}</CardTitle></div>
      <Badge variant="secondary"><CalendarDaysIcon aria-hidden="true" />Implementation {setup.implementationYear ?? '—'}</Badge>
    </CardHeader>
    <CardContent>
      <section className="plan-funding-snapshot" aria-label="Funding summary">
        <div className="plan-funding-total"><span>Total funding</span><strong>{amount(setup.fundingTotal)}</strong></div>
        <dl>{[
          ['State contribution', amount(setup.stateLodgment)],
          ['UBEC match', amount(setup.stateLodgment)],
          ['Other funding', amount(setup.otherFunding)],
        ].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
      </section>
      <section className="plan-assessment-files" aria-label="Assessment documents">
        <header><FilesIcon aria-hidden="true" /><div><h3>Assessment {documents.length === 1 ? 'document' : 'documents'}</h3><p>{documents.length ? `${documents.length} supporting ${documents.length === 1 ? 'file' : 'files'} attached` : 'No files attached'}</p></div></header>
        <DocumentFiles compact documents={documents}/>
      </section>
    </CardContent>
  </Card>;

  return <Card><CardHeader><CardTitle>Plan details</CardTitle><CardDescription>{setup.beapName}</CardDescription></CardHeader><CardContent className="flex flex-col gap-4">
    <dl className="grid grid-cols-2 gap-4 text-sm lg:grid-cols-5">{[
      ['Implementation year', setup.implementationYear],
      ['State contribution', money.format(Number(setup.stateLodgment))],
      ['UBEC match', money.format(Number(setup.stateLodgment))],
      ['Other funding', money.format(Number(setup.otherFunding))],
      ['Total funding', money.format(Number(setup.fundingTotal))],
    ].map(([label, value]) => <div key={label} className="min-w-0"><dt className="text-muted-foreground">{label}</dt><dd className="mt-1 break-words font-medium tabular-nums">{value}</dd></div>)}</dl>
    <DocumentFiles documents={documents}/>
  </CardContent></Card>;
}
