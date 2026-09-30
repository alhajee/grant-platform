import { componentSections, implementedPillars, subebComponentDepartments as pillarDepartments, type ImplementedPillar } from '@/lib/beap-pillars';
import { hasDepartment } from '@/lib/user-departments';

export type PendingAction = { label: string; href: string };
export type PillarReviewRow = { plan_id: number; pillar: ImplementedPillar; status: string };
type Worker = { role: string; departments: string[]; isBeapChair: boolean };

const withUbec = ['submitted_ubec', 'ubec_review', 'ubec_approved'];

/** Work currently waiting for this state user on one plan, in workflow order. */
export function pendingActionsFor(workspace: Worker, plan: { id: number; status: string }, reviews: PillarReviewRow[]): PendingAction[] {
  if (withUbec.includes(plan.status)) return [];
  const statusOf = (pillar: ImplementedPillar) => reviews.find(r => r.plan_id === plan.id && r.pillar === pillar)?.status ?? 'draft';
  const actions: PendingAction[] = [];
  for (const pillar of implementedPillars) {
    const status = statusOf(pillar);
    const name = componentSections[pillar][0].name;
    const owns = hasDepartment(workspace.departments, pillarDepartments[pillar]);
    if (owns && workspace.role === 'Director' && status === 'director_review') actions.push({ label: `Review ${name}`, href: `/beap/review?plan=${plan.id}#review-${pillar}` });
    if (owns && workspace.role === 'Data Entry Staff' && ['draft', 'changes_requested'].includes(status)) actions.push({ label: `${status === 'changes_requested' ? 'Address feedback on' : 'Complete'} ${name}`, href: `${componentSections[pillar][0].href}?plan=${plan.id}` });
    if (workspace.role === 'Director' && workspace.isBeapChair && status === 'beap_review') actions.push({ label: `BEAP Chair review: ${name}`, href: `/beap/review?plan=${plan.id}#review-${pillar}` });
  }
  const ready = implementedPillars.filter(pillar => statusOf(pillar) === 'chairman_ready');
  if (workspace.role === 'Executive Chairman' && ready.length) actions.push({ label: ready.length === implementedPillars.length ? 'Executive review and send to UBEC' : 'Review components from BEAP Chair', href: `/beap/review?plan=${plan.id}` });
  return actions;
}
