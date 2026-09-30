import type { ActivitySession } from '@/lib/admin-activity';

const dateTime = new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' });
const endReasons: Record<string, string> = { returned_to_admin: 'Returned to admin', switched_user: 'Switched user', signed_out: 'Signed out' };

const dateOnly = new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium' });
const timeOnly = new Intl.DateTimeFormat('en-GB', { timeStyle: 'short' });
export const formatDateTime = (value: string) => dateTime.format(new Date(value));
export const formatDate = (value: string) => dateOnly.format(new Date(value));
export const formatTime = (value: string) => timeOnly.format(new Date(value));
export const statusLabel = (status: ActivitySession['status']) => status === 'active' ? 'Active' : status === 'ended' ? 'Ended' : 'Expired';
export const endReasonLabel = (reason: string | null) => reason ? endReasons[reason] ?? reason.replaceAll('_', ' ').replace(/^./, first => first.toUpperCase()) : 'Ended';

/** When the session stopped (or will stop) acting as the user. */
export function sessionEnd(session: Pick<ActivitySession, 'status' | 'endedAt' | 'expiresAt'>, now: number) {
  if (session.endedAt) return new Date(session.endedAt).getTime();
  return session.status === 'expired' ? new Date(session.expiresAt).getTime() : now;
}

export function formatDuration(milliseconds: number) {
  const minutes = Math.max(0, Math.round(milliseconds / 60_000));
  if (minutes < 1) return 'Under 1 min';
  const hours = Math.floor(minutes / 60), rest = minutes % 60;
  return hours ? `${hours} h${rest ? ` ${rest} min` : ''}` : `${rest} min`;
}
