import { Badge } from '@/components/ui/badge';
import { planStatusLabels, type PlanStatus } from '@/lib/action-plans';
export function PlanStatusBadge({ status }: { status: PlanStatus }) {
  return <Badge variant={status === 'approved' || status === 'ubec_approved' ? 'default' : status === 'changes_requested' ? 'warning' : 'secondary'}>{planStatusLabels[status]}</Badge>;
}
