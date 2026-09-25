import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { DownloadIcon } from 'lucide-react';
import type { PlanSetup } from '@/lib/plan-setup';

const money = new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' });
export function PlanSetupSummary({ setup }: { setup: Partial<PlanSetup> }) {
  if (!setup.beapName) return null;
  return <Card><CardHeader><CardTitle>Plan details</CardTitle><CardDescription>{setup.beapName}</CardDescription></CardHeader><CardContent className="flex flex-col gap-4">
    <dl className="grid grid-cols-2 gap-4 text-sm lg:grid-cols-5">{[
      ['Implementation year', setup.implementationYear],
      ['State lodgment', money.format(Number(setup.stateLodgment))],
      ['UBEC counterpart', money.format(Number(setup.stateLodgment))],
      ['Other funding', money.format(Number(setup.otherFunding))],
      ['Funding envelope', money.format(Number(setup.fundingTotal))],
    ].map(([label, value]) => <div key={label} className="min-w-0"><dt className="text-muted-foreground">{label}</dt><dd className="mt-1 break-words font-medium tabular-nums">{value}</dd></div>)}</dl>
    <div className="flex flex-wrap gap-2">{setup.documents?.map(document => <Button asChild variant="outline" size="sm" key={document.id}><a href={`/api/plans/documents?id=${document.id}`}><DownloadIcon data-icon="inline-start" /><span className="max-w-56 truncate">{document.name}</span></a></Button>)}</div>
  </CardContent></Card>;
}
