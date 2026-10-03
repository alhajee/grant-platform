import { planPeriod } from './action-plans';
import { componentSections, type PillarId } from './beap-pillars';
import { reviewEventAnchor } from './notifications';

/** A state review event for the dashboard's Recent activity list (newest first, state scope only). */
export type PlanActivity = {
  id: number; planId: number; action: string; scope: string | null; actorName: string; actorRole: string;
  comment: string; createdAt: string; startYear: number; endYear: number; fundingQuarters: number[] | null;
};
export type ActivityKind = 'sent' | 'changes' | 'approved' | 'edited';
export type ActivityMessage = { text: string; kind: ActivityKind; plan: string; href: string };

export const RECENT_ACTIVITY_LIMIT = 5;
// Short names: the list sits in a narrow sidebar.
const shortNames: Partial<Record<PillarId, string>> = { infrastructure: 'Infrastructure', tlm: 'TLM', sports: 'Sports', sbmc: 'SBMC', monitoring: 'Supervision & Monitoring', gscci: 'Greening & Safeguards', curriculum: 'Curriculum', quality: 'Quality Assurance', ict: 'ICT' };
const componentName = (scope: string | null) => scope && scope in componentSections ? shortNames[scope as PillarId] ?? componentSections[scope as PillarId][0].name : null;

/** Action-first wording ("Sent Infrastructure to the BEAP Chair"), unlike notifications, which address the reader. */
export function describeActivity(item: PlanActivity): ActivityMessage {
  const target = componentName(item.scope) ?? 'the plan';
  const fromUbec = item.actorRole.startsWith('UBEC ');
  const [text, kind]: [string, ActivityKind] = (() => {
    switch (item.action) {
      case 'submit': return [fromUbec ? 'Sent the plan to UBEC' : `Sent ${target} for review`, 'sent'];
      case 'endorse': return [`Sent ${target} to the BEAP Chair`, 'sent'];
      case 'forward': return [`Sent ${componentName(item.scope) ?? 'the complete BEAP'} to the Executive Chairman`, 'sent'];
      case 'request_changes': return [fromUbec ? 'Returned the plan for changes' : `Requested changes on ${target}`, 'changes'];
      case 'approve': return [fromUbec ? 'Approved the plan' : `Completed the review of ${target}`, 'approved'];
      case 'edit': return ['Updated the plan details', 'edited'];
      default: return [`Updated ${target}`, 'edited'];
    }
  })();
  const anchor = item.comment ? reviewEventAnchor(item.id) : componentName(item.scope) ? `#review-${item.scope}` : '';
  return { text, kind, plan: planPeriod(item), href: `/beap/review?plan=${item.planId}${anchor}` };
}
