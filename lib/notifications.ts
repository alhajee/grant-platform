import { planPeriod } from './action-plans';
import { componentSections, type PillarId } from './beap-pillars';
import { subebDisplayName } from './state-names';
import type { PendingAction } from './pending-actions';

export type NotificationSource = 'state' | 'ubec';
export type NotificationItem = {
  id: number; planId: number; eventId: number | null; source: NotificationSource; action: string; scope: string | null;
  actorName: string; actorRole: string; comment: string; stateCode: string;
  startYear: number; endYear: number; fundingQuarters: number[] | null; createdAt: string; readAt: string | null;
};
export type NotificationTodo = PendingAction & { planId: number; period: string };
export type NotificationFeed = { notifications: NotificationItem[]; unreadCount: number; todos: NotificationTodo[] };
/** What happened, for the avatar badge. */
export type NotificationKind = 'sent' | 'changes' | 'approved' | 'assigned' | 'feedback';
/** A notification rendered as "<verb> <target> <suffix>" by <actor>, grouped under its plan context. */
export type NotificationMessage = { actor: string; verb: string; target: string; suffix: string; kind: NotificationKind; context: string; href: string };
type Wording = Pick<NotificationMessage, 'verb' | 'target' | 'suffix' | 'kind'>;

export const NOTIFICATION_PAGE_SIZE = 30;
/** Element id of a review event in the review page's history, used as a link target. */
export const reviewEventAnchor = (eventId: number) => `#review-event-${eventId}`;

const componentName = (scope: string | null) => scope && scope in componentSections ? componentSections[scope as PillarId][0].name : null;
const planName = (item: Pick<NotificationItem, 'startYear' | 'endYear' | 'fundingQuarters'>) => `${planPeriod(item)} BEAP`;

function stateWording(item: NotificationItem): Wording {
  const component = componentName(item.scope);
  const target = component ?? 'the plan';
  const fromUbec = item.actorRole.startsWith('UBEC ');
  switch (item.action) {
    case 'submit': return { verb: 'Sent you', target, suffix: 'to review', kind: 'sent' };
    case 'endorse': return { verb: 'Sent', target, suffix: 'to the BEAP Chair', kind: 'sent' };
    case 'forward': return { verb: 'Sent', target: component ?? 'the complete BEAP', suffix: 'to the Executive Chairman', kind: 'sent' };
    case 'request_changes': return fromUbec ? { verb: 'Returned', target: 'the plan', suffix: 'for changes', kind: 'changes' } : { verb: 'Requested changes on', target, suffix: '', kind: 'changes' };
    case 'approve': return fromUbec ? { verb: 'Approved', target: 'the plan', suffix: '', kind: 'approved' } : { verb: 'Completed the review of', target, suffix: '', kind: 'approved' };
    default: return { verb: 'Updated', target, suffix: '', kind: 'sent' };
  }
}

function ubecWording(item: NotificationItem): Wording {
  const component = componentName(item.scope) ?? 'a component';
  switch (item.action) {
    case 'submit': return { verb: 'Sent', target: 'the plan', suffix: 'to UBEC for review', kind: 'sent' };
    case 'release': return { verb: 'Released', target: 'the plan', suffix: 'to the UBEC departments', kind: 'assigned' };
    // The Super Admin's assignments also reach the Director, so the wording fits both readers.
    case 'assign_officer': return item.actorRole === 'Super Admin' ? { verb: 'Assigned Assessment Officers to', target: component, suffix: '', kind: 'assigned' } : { verb: 'Assigned you', target: component, suffix: 'to assess', kind: 'assigned' };
    case 'default_officers': return { verb: 'Assigned', target: component, suffix: 'to its default Assessment Officers', kind: 'assigned' };
    case 'complete_assessment': return { verb: 'Completed the assessment of', target: component, suffix: '', kind: 'feedback' };
    case 'send_oversight': return { verb: 'Sent', target: component, suffix: 'for your observations', kind: 'sent' };
    case 'observations_done': return { verb: 'Finished observations on', target: component, suffix: '', kind: 'feedback' };
    case 'ready_for_chair': return { verb: 'Cleared', target: component, suffix: 'for your decision', kind: 'approved' };
    case 'return': return { verb: 'Returned', target: 'the plan', suffix: 'to the SUBEB', kind: 'changes' };
    case 'approve': return { verb: 'Approved', target: 'the plan', suffix: '', kind: 'approved' };
    // Earlier flow (before migration 055).
    case 'assign': return { verb: 'Assigned', target: 'a component', suffix: 'to your department', kind: 'assigned' };
    case 'feedback': return { verb: 'Finished', target: 'a department review', suffix: '', kind: 'feedback' };
    default: return { verb: 'Updated', target: 'the plan', suffix: '', kind: 'sent' };
  }
}

export function describeNotification(item: NotificationItem): NotificationMessage {
  if (item.source === 'ubec') {
    const state = subebDisplayName(item.stateCode);
    const anchor = componentName(item.scope) ? `#ubec-${item.scope}` : '';
    return { ...ubecWording(item), actor: item.action === 'submit' ? state : item.actorName, context: `${state} · ${planName(item)}`, href: `/ubec/review?plan=${item.planId}${anchor}` };
  }
  // A note lands on its entry in the review page's history; otherwise open the component's sheet.
  const anchor = item.comment && item.eventId ? reviewEventAnchor(item.eventId) : componentName(item.scope) ? `#review-${item.scope}` : '';
  return { ...stateWording(item), actor: item.actorName, context: planName(item), href: `/beap/review?plan=${item.planId}${anchor}` };
}

/** One line suitable for a browser (OS) notification body. */
export function notificationText(item: NotificationItem) {
  const { actor, verb, target, suffix } = describeNotification(item);
  return `${actor}: ${[verb, target, suffix].filter(Boolean).join(' ')}`;
}

/** Consecutive notifications for the same plan share one heading. */
export function groupByPlan<T extends { planId: number }>(items: T[], context: (item: T) => string) {
  return items.reduce<{ key: string; context: string; items: T[] }[]>((groups, item) => {
    const last = groups[groups.length - 1];
    if (last?.items[0].planId === item.planId) return [...groups.slice(0, -1), { ...last, items: [...last.items, item] }];
    return [...groups, { key: `${item.planId}-${groups.length}`, context: context(item), items: [item] }];
  }, []);
}

const relative = new Intl.RelativeTimeFormat('en-GB', { numeric: 'auto', style: 'short' });
export function timeAgo(value: string, now = Date.now()) {
  const seconds = Math.round((new Date(value).getTime() - now) / 1000);
  const steps: [Intl.RelativeTimeFormatUnit, number][] = [['second', 60], ['minute', 60], ['hour', 24], ['day', 7], ['week', 4.35], ['month', 12], ['year', Infinity]];
  let amount = seconds;
  for (const [unit, size] of steps) {
    if (Math.abs(amount) < size) return unit === 'second' && Math.abs(amount) < 45 ? 'just now' : relative.format(Math.round(amount), unit);
    amount /= size;
  }
  return '';
}
