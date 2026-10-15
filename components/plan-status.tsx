import { Badge } from '@/components/ui/badge';
import { planStatusLabels, type PlanStatus } from '@/lib/action-plans';
import { componentSections } from '@/lib/beap-pillars';
import { componentAccessNames } from '@/lib/component-access';
import type { PillarReview } from '@/lib/pillar-review';

const variantFor = (status: PlanStatus) => status === 'approved' || status === 'ubec_approved' ? 'default' : status === 'changes_requested' ? 'warning' : 'secondary';

/**
 * The plan status as the viewer should read it. With `reviews` (the components the viewer can see), "Changes requested"
 * names the component(s) it applies to (short names; full names in `components`), and reads "In progress" when the changes
 * were requested on someone else's component. `compact` (dashboard cards) names one component and counts more.
 */
export function viewerPlanStatus(status: PlanStatus, reviews?: readonly PillarReview[], compact = false): { label: string; status: PlanStatus | 'in_progress'; components: string[] } {
  if (status !== 'changes_requested' || !reviews) return { label: planStatusLabels[status], status, components: [] };
  const returned = reviews.filter(review => review.status === 'changes_requested');
  const components = returned.map(review => componentSections[review.pillar][0].name);
  if (!returned.length) return { label: 'In progress', status: 'in_progress', components };
  const named = returned.length > (compact ? 1 : 2) ? `${returned.length} components` : returned.map(review => componentAccessNames[review.pillar]).join(', ');
  return { label: `Changes requested · ${named}`, status, components };
}

export function PlanStatusBadge({ status, reviews, compact }: { status: PlanStatus; reviews?: readonly PillarReview[]; compact?: boolean }) {
  const view = viewerPlanStatus(status, reviews, compact);
  return <Badge variant={view.status === 'in_progress' ? 'secondary' : variantFor(status)} title={view.components.length ? `Changes requested on ${view.components.join(', ')}` : undefined}>{view.label}</Badge>;
}
