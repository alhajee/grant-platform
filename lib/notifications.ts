import { planPeriod } from './action-plans';
import { componentSections, type PillarId } from './beap-pillars';
import { subebDisplayName } from './state-names';
import type { PendingAction } from './pending-actions';

export type NotificationSource = 'state' | 'ubec';
export type NotificationItem = {
  id: number; planId: number; source: NotificationSource; action: string; scope: string | null;
  actorName: string; actorRole: string; comment: string; stateCode: string;
  startYear: number; endYear: number; fundingQuarters: number[] | null; createdAt: string; readAt: string | null;
};
export type NotificationTodo = PendingAction & { planId: number; period: string };
export type NotificationFeed = { notifications: NotificationItem[]; unreadCount: number; todos: NotificationTodo[] };
/** A notification rendered as "<actor> <text> <target>" with a context line and destination. */
export type NotificationMessage = { actor: string; text: string; target: string; context: string; href: string };

export const NOTIFICATION_PAGE_SIZE = 30;

const componentName = (scope: string | null) => scope && scope in componentSections ? componentSections[scope as PillarId][0].name : null;
const planName = (item: Pick<NotificationItem, 'startYear' | 'endYear' | 'fundingQuarters'>) => `${planPeriod(item)} BEAP`;

function stateMessage(item: NotificationItem): Omit<NotificationMessage, 'context' | 'href'> {
  const component = componentName(item.scope);
  const target = component ?? planName(item);
  const fromUbec = item.actorRole.startsWith('UBEC ');
  switch (item.action) {
    case 'submit': return { actor: item.actorName, text: 'sent you', target: `${target} to review` };
    case 'endorse': return { actor: item.actorName, text: 'sent', target: `${target} to the BEAP Chair` };
    case 'forward': return { actor: item.actorName, text: 'sent', target: `${component ?? 'the complete BEAP'} to the Executive Chairman` };
    case 'request_changes': return fromUbec ? { actor: item.actorName, text: 'returned', target: `${planName(item)} for changes` } : { actor: item.actorName, text: 'requested changes on', target };
    case 'approve': return { actor: item.actorName, text: fromUbec ? 'approved' : 'completed the review of', target: planName(item) };
    default: return { actor: item.actorName, text: 'updated', target };
  }
}

function ubecMessage(item: NotificationItem): Omit<NotificationMessage, 'context' | 'href'> {
  const state = subebDisplayName(item.stateCode);
  switch (item.action) {
    case 'submit': return { actor: state, text: 'sent its plan to UBEC:', target: planName(item) };
    case 'assign': return { actor: item.actorName, text: 'assigned your department to review', target: `${state} ${planName(item)}` };
    case 'feedback': return { actor: item.actorName, text: 'finished a department review of', target: `${state} ${planName(item)}` };
    default: return { actor: item.actorName, text: 'updated', target: `${state} ${planName(item)}` };
  }
}

export function describeNotification(item: NotificationItem): NotificationMessage {
  if (item.source === 'ubec') return { ...ubecMessage(item), context: subebDisplayName(item.stateCode), href: `/ubec/review?plan=${item.planId}` };
  const anchor = componentName(item.scope) ? `#review-${item.scope}` : '';
  return { ...stateMessage(item), context: planName(item), href: `/beap/review?plan=${item.planId}${anchor}` };
}

/** One line suitable for a browser (OS) notification body. */
export function notificationText(item: NotificationItem) {
  const message = describeNotification(item);
  return `${message.actor} ${message.text} ${message.target}`;
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
