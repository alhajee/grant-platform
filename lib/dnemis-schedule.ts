// Automatic DNEMIS refresh schedule (integration_settings.sync_*), shared by the admin card, the API and the worker.
// Times are Africa/Lagos wall-clock times. Lagos is UTC+1 all year (no daylight saving), so a fixed offset is exact.
import { z } from 'zod';

export const syncModes = ['off', 'daily', 'weekly'] as const;
export type SyncMode = typeof syncModes[number];
export type SyncSchedule = { mode: SyncMode; weekday: number; time: string };
export const weekdayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;
export const defaultSyncSchedule: SyncSchedule = { mode: 'off', weekday: 1, time: '02:00' };
/** A slot missed while the worker was down still runs if the worker is back within this window. */
export const catchUpMs = 6 * 60 * 60 * 1000;

const lagosOffsetMs = 60 * 60 * 1000;
const dayMs = 24 * 60 * 60 * 1000;

export const syncScheduleSchema = z.object({
  mode: z.enum(syncModes),
  weekday: z.number().int().min(0).max(6),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
}).strict();

/** The most recent scheduled time at or before `now`, or null when the schedule is off. */
export function latestSlot(schedule: SyncSchedule, now: Date): Date | null {
  if (schedule.mode === 'off') return null;
  const [hours, minutes] = schedule.time.split(':').map(Number);
  const local = new Date(now.getTime() + lagosOffsetMs); // Lagos wall clock, read with the UTC getters
  let slot = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(), hours, minutes) - lagosOffsetMs;
  if (schedule.mode === 'weekly') slot -= ((local.getUTCDay() - schedule.weekday + 7) % 7) * dayMs;
  if (slot > now.getTime()) slot -= schedule.mode === 'weekly' ? 7 * dayMs : dayMs;
  return new Date(slot);
}

/** The next scheduled time after `now`, or null when the schedule is off. */
export function nextSlot(schedule: SyncSchedule, now: Date): Date | null {
  const latest = latestSlot(schedule, now);
  return latest ? new Date(latest.getTime() + (schedule.mode === 'weekly' ? 7 : 1) * dayMs) : null;
}

/**
 * The slot the worker should run now, if any: the latest slot, not yet run, set before it came round
 * (changing the schedule never fires a slot that has already passed) and missed by less than catchUpMs.
 */
export function dueSlot(schedule: SyncSchedule, now: Date, lastSlot: Date | null, scheduleUpdatedAt: Date | null): Date | null {
  const slot = latestSlot(schedule, now);
  if (!slot || now.getTime() - slot.getTime() > catchUpMs) return null;
  if (lastSlot && lastSlot.getTime() >= slot.getTime()) return null;
  if (scheduleUpdatedAt && scheduleUpdatedAt.getTime() > slot.getTime()) return null;
  return slot;
}

const lagosFormat = new Intl.DateTimeFormat('en-NG', { timeZone: 'Africa/Lagos', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false });
/** "Tue 6 Oct, 02:00 WAT": always Africa/Lagos time, whatever the browser's time zone. */
export const formatLagos = (value: Date | string) => `${lagosFormat.format(new Date(value))} WAT`;
