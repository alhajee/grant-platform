'use client';

import type { Snapshot } from '@/lib/plan-review';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { InfrastructureDocumentLinks } from '@/components/infrastructure-package-details';
import { PlanSetupSummary } from '@/components/plan-setup-summary';
import { PlanWorkbook } from '@/components/plan-workbook/plan-workbook';
import type { CommentsController } from '@/components/plan-workbook/comments-context';
import type { RequestChangesHandlers } from '@/components/plan-workbook/plan-workbook';

const allPillars = ['infrastructure', 'sports', 'sbmc', 'tlm'] as const;

export function PlanReviewContent({ snapshot, infrastructureEditHref, sportsEditHref, sbmcEditHref, tlmEditHref, showPlanReference = true, visiblePillars = allPillars, comments = null, requestChanges }: { comments?: CommentsController | null; requestChanges?: RequestChangesHandlers; snapshot: Snapshot; infrastructureEditHref?: string; sportsEditHref?: string; sbmcEditHref?: string; tlmEditHref?: string; showPlanReference?: boolean; visiblePillars?: readonly string[] }) {
  return <div className="review-sections">
    {showPlanReference && snapshot.setup && <PlanSetupSummary setup={snapshot.setup} compact />}
    <PlanWorkbook snapshot={snapshot} visiblePillars={visiblePillars} links={{ infrastructureEditHref, sportsEditHref, sbmcEditHref, tlmEditHref }} comments={comments} requestChanges={requestChanges} />
    {!!snapshot.infrastructureDocuments?.length && <Card className="review-dossier"><CardHeader><CardTitle>Infrastructure technical dossier</CardTitle></CardHeader><div className="px-6"><InfrastructureDocumentLinks documents={snapshot.infrastructureDocuments}/></div></Card>}
  </div>;
}
