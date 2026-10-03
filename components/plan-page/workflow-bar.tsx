import { SendIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { implementedPillars } from '@/lib/beap-pillars';
import { statePlanOpen } from '@/lib/pillar-review';
import type { PlanReview } from '@/lib/plan-review';

/**
 * The whole-plan step for the BEAP Chair (collate and send to the Executive Chairman) and the Executive
 * Chairman (send to UBEC), with how many components have reached them. Nothing for other roles.
 */
export function WorkflowBar({ data, available, onForward, onSendToUbec }: { data: PlanReview; available: boolean; onForward: () => void; onSendToUbec: () => void }) {
  if (!statePlanOpen(data.plan.status)) return null;
  const count = (statuses: string[]) => data.pillarReviews.filter(review => statuses.includes(review.status)).length;
  const of = `of ${implementedPillars.length} components`;
  if (data.role === 'Director' && data.isBeapChair) {
    if (data.beapChairSubmissionMode !== 'complete_plan') return <div className="workflow-bar"><p><strong>Send reviewed components individually.</strong>{count(['chairman_ready'])} {of} sent to the Executive Chairman.</p></div>;
    return <div className="workflow-bar">
      <p><strong>Collate all department components into the complete SUBEB BEAP.</strong>{count(['beap_review', 'chairman_ready'])} {of} reviewed by Directors. All components are sent together in one submission.</p>
      <Button className="rounded-full" disabled={!data.readyForExecutiveChairman || !available} onClick={onForward}><SendIcon data-icon="inline-start" />Send to Executive Chairman</Button>
    </div>;
  }
  if (data.role !== 'Executive Chairman') return null;
  return <div className="workflow-bar">
    <p>{count(['chairman_ready'])} {of} ready{data.ubecSubmissionMode === 'reviewed_components' ? '. Only ready components are sent to UBEC.' : ''}</p>
    {data.readyForUbec && available
      ? <Button className="rounded-full" onClick={onSendToUbec}><SendIcon data-icon="inline-start" />Send to UBEC</Button>
      : <Button className="rounded-full" disabled><SendIcon data-icon="inline-start" />Send to UBEC</Button>}
  </div>;
}
