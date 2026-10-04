'use client';

import type { Snapshot } from '@/lib/plan-review';
import { PlanSetupSummary } from '@/components/plan-setup-summary';
import { PlanDocuments } from '@/components/plan-page/plan-documents';
import { PlanWorkbook } from '@/components/plan-workbook/plan-workbook';
import type { CommentsController } from '@/components/plan-workbook/comments-context';
import type { RequestChangesHandlers } from '@/components/plan-workbook/plan-workbook';
import { implementedPillars } from '@/lib/beap-pillars';

const allPillars = implementedPillars;
type EditHrefs = { infrastructureEditHref?: string; sportsEditHref?: string; sbmcEditHref?: string; tlmEditHref?: string; monitoringEditHref?: string; gscciEditHref?: string; curriculumEditHref?: string; qualityEditHref?: string; ictEditHref?: string; teachersEditHref?: string; planningEditHref?: string };

export function PlanReviewContent({ snapshot, showPlanReference = true, showDocuments = true, visiblePillars = allPillars, comments = null, requestChanges, ...links }: { /** The plan page lays the documents out beside its review history instead. */ showDocuments?: boolean; comments?: CommentsController | null; requestChanges?: RequestChangesHandlers; snapshot: Snapshot; showPlanReference?: boolean; visiblePillars?: readonly string[] } & EditHrefs) {
  return <div className="review-sections">
    {showPlanReference && snapshot.setup && <PlanSetupSummary setup={snapshot.setup} compact />}
    <PlanWorkbook snapshot={snapshot} visiblePillars={visiblePillars} links={links} comments={comments} requestChanges={requestChanges} />
    {showDocuments && <PlanDocuments snapshot={snapshot} visiblePillars={visiblePillars} />}
  </div>;
}
