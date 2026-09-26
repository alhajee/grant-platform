import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { DocumentFiles } from '@/components/document-files';
import type { PlanSetup } from '@/lib/plan-setup';

const money = new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' });
export function PlanSetupSummary({ setup, compact = false }: { setup: Partial<PlanSetup>; compact?: boolean }) {
  if (!setup.beapName) return null;
  return <Card><CardHeader><CardTitle>Plan details</CardTitle><CardDescription>{setup.beapName}</CardDescription></CardHeader><CardContent className="flex flex-col gap-4">
    <dl className="grid grid-cols-2 gap-4 text-sm lg:grid-cols-5">{[
      ['Implementation year', setup.implementationYear],
      ['State contribution', money.format(Number(setup.stateLodgment))],
      ['UBEC match', money.format(Number(setup.stateLodgment))],
      ['Other funding', money.format(Number(setup.otherFunding))],
      ['Total funding', money.format(Number(setup.fundingTotal))],
    ].map(([label, value]) => <div key={label} className="min-w-0"><dt className="text-muted-foreground">{label}</dt><dd className="mt-1 break-words font-medium tabular-nums">{value}</dd></div>)}</dl>
    <DocumentFiles compact={compact} documents={(setup.documents??[]).map(document=>({...document,url:`/api/plans/documents?id=${document.id}`}))}/>
  </CardContent></Card>;
}
