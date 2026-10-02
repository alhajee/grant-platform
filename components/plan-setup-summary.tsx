import { BanknoteIcon, CalendarDaysIcon, FilesIcon, LandmarkIcon, RefreshCwIcon, WalletCardsIcon } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { DocumentFiles } from '@/components/document-files';
import { PlansArtwork } from '@/components/metric-artwork';
import { formatQuarters } from '@/lib/format-quarters';
import { OtherFundingInfo } from '@/components/funding-sources-field';
import { otherFundingTotal, type PlanSetup } from '@/lib/plan-setup';

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
      <div className="plan-summary-identity"><CardDescription>Basic Education Action Plan reference</CardDescription><CardTitle>{reference}</CardTitle></div>
      <Badge variant="secondary"><CalendarDaysIcon aria-hidden="true" />Implementation {setup.implementationYear ?? '—'}</Badge>
    </CardHeader>
    <CardContent>
      <section className="plan-funding-snapshot" aria-label="Funding summary">
        <dl>{[
          { label: 'Total funding', value: amount(setup.fundingTotal), Icon: BanknoteIcon, primary: true },
          { label: 'State contribution', value: amount(setup.stateLodgment), Icon: LandmarkIcon },
          { label: 'UBEC match', value: amount(setup.stateLodgment), Icon: RefreshCwIcon },
          { label: 'Other funding', value: amount(otherFundingTotal(setup)), Icon: WalletCardsIcon, info: true },
        ].map(({ label, value, Icon, primary, info }) => <div key={label} data-primary={primary || undefined}><span className="plan-source-icon"><Icon aria-hidden="true" /></span><div><dt>{label}{info && <OtherFundingInfo setup={setup} />}</dt><dd>{value}</dd></div></div>)}</dl>
      </section>
    </CardContent>
    <CardFooter className="plan-assessment-files">
      <header><span className="plan-document-icon"><FilesIcon aria-hidden="true" /></span><div><h3>Assessment {documents.length === 1 ? 'document' : 'documents'}</h3><p>{documents.length ? `${documents.length} ${documents.length === 1 ? 'file' : 'files'} attached` : 'No files attached'}</p></div></header>
      <DocumentFiles compact documents={documents}/>
    </CardFooter>
  </Card>;

  return <Card><CardHeader><CardTitle>Plan details</CardTitle><CardDescription>{setup.beapName}</CardDescription></CardHeader><CardContent className="flex flex-col gap-4">
    <dl className="grid grid-cols-2 gap-4 text-sm lg:grid-cols-5">{[
      ['Implementation year', setup.implementationYear],
      ['State contribution', money.format(Number(setup.stateLodgment))],
      ['UBEC match', money.format(Number(setup.stateLodgment))],
      ['Other funding', <>{money.format(Number(otherFundingTotal(setup)))}<OtherFundingInfo setup={setup} /></>],
      ['Total funding', money.format(Number(setup.fundingTotal))],
    ].map(([label, value]) => <div key={String(label)} className="min-w-0"><dt className="text-muted-foreground">{label}</dt><dd className="mt-1 break-words font-medium tabular-nums">{value}</dd></div>)}</dl>
    <DocumentFiles documents={documents}/>
  </CardContent></Card>;
}
