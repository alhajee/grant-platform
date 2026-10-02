'use client';

import type { Snapshot } from '@/lib/plan-review';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { InfrastructureDocumentLinks } from '@/components/infrastructure-package-details';
import { PlanSetupSummary } from '@/components/plan-setup-summary';
import { DocumentFiles } from '@/components/document-files';
import { PlanWorkbook } from '@/components/plan-workbook/plan-workbook';
import type { CommentsController } from '@/components/plan-workbook/comments-context';
import type { RequestChangesHandlers } from '@/components/plan-workbook/plan-workbook';
import { implementedPillars } from '@/lib/beap-pillars';

const allPillars = implementedPillars;
type EditHrefs = { infrastructureEditHref?: string; sportsEditHref?: string; sbmcEditHref?: string; tlmEditHref?: string; monitoringEditHref?: string; gscciEditHref?: string; curriculumEditHref?: string };

export function PlanReviewContent({ snapshot, showPlanReference = true, visiblePillars = allPillars, comments = null, requestChanges, ...links }: { comments?: CommentsController | null; requestChanges?: RequestChangesHandlers; snapshot: Snapshot; showPlanReference?: boolean; visiblePillars?: readonly string[] } & EditHrefs) {
  const proformas = (snapshot.componentDocuments ?? []).filter(d => d.component === 'monitoring' && visiblePillars.includes('monitoring'));
  return <div className="review-sections">
    {showPlanReference && snapshot.setup && <PlanSetupSummary setup={snapshot.setup} compact />}
    <PlanWorkbook snapshot={snapshot} visiblePillars={visiblePillars} links={links} comments={comments} requestChanges={requestChanges} />
    {!!snapshot.infrastructureDocuments?.length && <Card className="review-dossier"><CardHeader><CardTitle>Infrastructure technical dossier</CardTitle></CardHeader><div className="px-6"><InfrastructureDocumentLinks documents={snapshot.infrastructureDocuments}/></div></Card>}
    {proformas.length > 0 && <Card className="review-dossier"><CardHeader><CardTitle>Supervision & Monitoring proforma invoices</CardTitle></CardHeader><div className="px-6"><DocumentFiles documents={proformas.map(doc => ({ ...doc, url: '/api/activities/documents?id=' + doc.id, description: 'Proforma invoice' }))}/></div></Card>}
  </div>;
}
