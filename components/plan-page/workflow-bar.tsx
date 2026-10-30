import { CircleAlertIcon, ScanEyeIcon, SendIcon } from 'lucide-react';
import { rejectionProblem } from '@/lib/ubec-corrections';
import { componentName } from '@/lib/ubec-flow';
import { Button } from '@/components/ui/button';
import { implementedPillars } from '@/lib/beap-pillars';
import { statePlanOpen } from '@/lib/pillar-review';
import type { PlanReview } from '@/lib/plan-review';

/**
 * The whole-plan step for the BEAP Chair (collate and send to the Executive Chairman) and the Executive
 * Chairman (send to UBEC), with how many components have reached them. Nothing for other roles.
 */
export function WorkflowBar({ data, available, onForward, onSendToUbec, onSendSeveral, onRequestObservations }: { data: PlanReview; available: boolean; onForward: () => void; onSendToUbec: () => void;
  /** Individual-components mode: send several reviewed components at once (V2-04). */
  onSendSeveral?: () => void;
  /** The Executive Chairman's optional request for observations from UBEC Audit, Procurement and Finance (row 156); omitted while one is open. */
  onRequestObservations?: () => void }) {
  if (!statePlanOpen(data.plan.status)) return null;
  const count = (statuses: string[]) => data.pillarReviews.filter(review => statuses.includes(review.status)).length;
  const of = `of ${implementedPillars.length} components`;
  if (data.role === 'Director' && data.isBeapChair) {
    // Why the button is disabled (any send rule the plan fails), so the BEAP Chair knows what to fix or return.
    const blocked = !data.readyForExecutiveChairman ? data.executiveChairmanProblem : null;
    if (data.beapChairSubmissionMode !== 'complete_plan') return <div className="workflow-bar"><p><strong>Send reviewed components individually or together</strong>{count(['chairman_ready'])} {of} sent to the Executive Chairman · {count(['beap_review'])} waiting for you.</p>
      {onSendSeveral && count(['beap_review']) > 1 && <Button className="rounded-full" disabled={!available} onClick={onSendSeveral}><SendIcon data-icon="inline-start" />Send several…</Button>}</div>;
    return <div className="workflow-bar">
      <p><strong>Collate all department components into the complete SUBEB BEAP.</strong>{count(['beap_review', 'chairman_ready'])} {of} reviewed by Directors. All components are sent together in one submission.</p>
      <Button className="rounded-full" disabled={!data.readyForExecutiveChairman || !available} aria-describedby={blocked ? 'workflow-blocked' : undefined} onClick={onForward}><SendIcon data-icon="inline-start" />Send to Executive Chairman</Button>
      {blocked && <p id="workflow-blocked" role="status" className="workflow-blocked flex items-start gap-1.5 text-sm text-destructive"><CircleAlertIcon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />{blocked}</p>}
    </div>;
  }
  if (data.role !== 'Executive Chairman') return null;
  // Observations asked of UBEC Audit, Procurement or Finance hold the send until they are in and resolved.
  // UBEC189: and so do items UBEC rejected that nobody has changed or removed yet.
  const rejected = data.pillarReviews.filter(r => r.status === 'chairman_ready').map(r => rejectionProblem(componentName(r.pillar), data.ubecOpenRejections?.[r.pillar])).find(Boolean) ?? null;
  // UBEC205: and a RAT tool UBEC rejected that has not been replaced.
  const observations = data.observationProblem ?? data.ratProblem ?? rejected;
  return <div className="workflow-bar">
    <p>{count(['chairman_ready'])} {of} ready{data.ubecSubmissionMode === 'reviewed_components' ? '. Only ready components are sent to UBEC.' : ''}</p>
    <div className="flex flex-wrap gap-2">
      {onRequestObservations && <Button variant="outline" className="rounded-full" disabled={!available} onClick={onRequestObservations}><ScanEyeIcon data-icon="inline-start" />Ask UBEC for observations</Button>}
      {data.readyForUbec && available && !observations
        ? <Button className="rounded-full" onClick={onSendToUbec}><SendIcon data-icon="inline-start" />Send to UBEC</Button>
        : <Button className="rounded-full" disabled aria-describedby={observations ? 'workflow-observations' : undefined}><SendIcon data-icon="inline-start" />Send to UBEC</Button>}
    </div>
    {observations && <p id="workflow-observations" role="status" className="workflow-blocked flex items-start gap-1.5 text-sm text-destructive"><CircleAlertIcon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />{observations}</p>}
  </div>;
}
