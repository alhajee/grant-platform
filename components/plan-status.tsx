import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { planStatusLabels, type PlanStatus } from '@/lib/action-plans';
import { componentSections } from '@/lib/beap-pillars';
import type { PillarReview } from '@/lib/pillar-review';

const variantFor = (status: PlanStatus) => status === 'approved' || status === 'ubec_approved' ? 'default' : status === 'changes_requested' ? 'warning' : 'secondary';

/**
 * The plan status as the viewer should read it. With `reviews` (the components the viewer can see), "Changes requested"
 * lists the component(s) it applies to in `components`, and reads "In progress" when the changes were requested on
 * someone else's component.
 */
export function viewerPlanStatus(status: PlanStatus, reviews?: readonly PillarReview[]): { label: string; status: PlanStatus | 'in_progress'; components: string[] } {
  if (status !== 'changes_requested' || !reviews) return { label: planStatusLabels[status], status, components: [] };
  const components = reviews.filter(review => review.status === 'changes_requested').map(review => componentSections[review.pillar][0].name);
  if (!components.length) return { label: 'In progress', status: 'in_progress', components };
  return { label: planStatusLabels[status], status, components };
}

/** Plan status badge; "Changes requested" carries a count, and hovering or focusing it lists the components returned */
export function PlanStatusBadge({ status, reviews }: { status: PlanStatus; reviews?: readonly PillarReview[] }) {
  const view = viewerPlanStatus(status, reviews);
  const variant = view.status === 'in_progress' ? 'secondary' : variantFor(status);
  if (!view.components.length) return <Badge variant={variant}>{view.label}</Badge>;
  const count = view.components.length;
  return <Tooltip>
    <TooltipTrigger asChild>
      <Badge variant={variant} tabIndex={0} className="cursor-default gap-1.5" aria-label={`${view.label} on ${count} component${count === 1 ? '' : 's'}: ${view.components.join(', ')}`}>
        {view.label}
        <span aria-hidden="true" className="inline-grid min-w-4 place-items-center rounded-full bg-current/15 px-1 text-[0.7em] leading-4 tabular-nums">{count}</span>
      </Badge>
    </TooltipTrigger>
    <TooltipContent side="bottom" align="start">
      <p className="mb-1 font-medium">Changes requested on</p>
      <ul className="list-disc ps-4">{view.components.map(name => <li key={name}>{name}</li>)}</ul>
    </TooltipContent>
  </Tooltip>;
}
