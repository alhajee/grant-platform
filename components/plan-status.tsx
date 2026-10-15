import { Badge } from '@/components/ui/badge';
import { planStatusLabels, type PlanStatus } from '@/lib/action-plans';
import { componentSections } from '@/lib/beap-pillars';
import type { PillarReview } from '@/lib/pillar-review';

const variantFor = (status: PlanStatus) => status === 'approved' || status === 'ubec_approved' ? 'default' : status === 'changes_requested' ? 'warning' : 'secondary';

/**
 * The plan status as the viewer should read it. With `reviews` (the components the viewer can see), "Changes requested"
 * names the component(s) it applies to, and reads "In progress" when the changes were requested on someone else's component.
 */
export function viewerPlanStatus(status: PlanStatus, reviews?: readonly PillarReview[]): { label: string; status: PlanStatus | 'in_progress'; components: string[] } {
  if (status !== 'changes_requested' || !reviews) return { label: planStatusLabels[status], status, components: [] };
  const components = reviews.filter(review => review.status === 'changes_requested').map(review => componentSections[review.pillar][0].name);
  if (!components.length) return { label: 'In progress', status: 'in_progress', components };
  const named = components.length > 2 ? `${components.length} components` : components.join(', ');
  return { label: `Changes requested · ${named}`, status, components };
}

export function PlanStatusBadge({ status, reviews }: { status: PlanStatus; reviews?: readonly PillarReview[] }) {
  const view = viewerPlanStatus(status, reviews);
  return <Badge variant={view.status === 'in_progress' ? 'secondary' : variantFor(status)} title={view.components.length > 2 ? `Changes requested on ${view.components.join(', ')}` : undefined}>{view.label}</Badge>;
}
