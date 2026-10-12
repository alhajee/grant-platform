import { z } from 'zod';
import { normalizeQuarters } from './line-quarters.ts';

// Expected start and due dates of a component line (migration 059): calendar days inside the line's timeline
// quarters, in the plan's implementation year (Q1 = January–March … Q4 = October–December). Dates are ISO
// "YYYY-MM-DD" strings everywhere (DATE columns, payloads, inputs), so no time zone is involved.

export type LineDates = { startDate: string | null; dueDate: string | null };
export type DateWindow = { min: string; max: string };

const isoPattern = /^\d{4}-\d{2}-\d{2}$/;
const pad = (n: number) => String(n).padStart(2, '0');
const lastDay = (year: number, month: number) => new Date(Date.UTC(year, month, 0)).getUTCDate();

/** True for a real calendar day written as YYYY-MM-DD. */
export function isIsoDate(value: string): boolean {
  if (!isoPattern.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  return m >= 1 && m <= 12 && d >= 1 && d <= lastDay(y, m);
}

/** The first and last day the quarters cover in that year, or null without a year or quarters. */
export function quarterWindow(year: number | null | undefined, quarters: readonly number[]): DateWindow | null {
  const q = normalizeQuarters(quarters);
  if (!year || !Number.isInteger(year) || !q.length) return null;
  const firstMonth = (q[0] - 1) * 3 + 1, lastMonth = q[q.length - 1] * 3;
  return { min: `${year}-${pad(firstMonth)}-01`, max: `${year}-${pad(lastMonth)}-${pad(lastDay(year, lastMonth))}` };
}

const dateField = z.string().trim().refine(isIsoDate, 'Enter the date as YYYY-MM-DD.');
/** Optional in the payload: older clients and scripts send none (resolveLineDates fills them). */
export const lineDatesShape = { startDate: dateField.nullish(), dueDate: dateField.nullish() };

const longDate = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
/** "3 Feb 2027". */
export const formatLineDate = (iso: string) => longDate.format(new Date(`${iso}T00:00:00Z`));
/** "3 Feb 2027 – 28 Jun 2027", or '' when the line has no dates (saved before migration 059). */
export function formatLineDates(dates: { startDate?: string | null; dueDate?: string | null }): string {
  return dates.startDate && dates.dueDate ? `${formatLineDate(dates.startDate)} – ${formatLineDate(dates.dueDate)}` : '';
}

/** Why the dates do not fit the timeline, or null. Both are required. */
export function lineDatesProblem(dates: LineDates, quarters: readonly number[], year: number | null | undefined): string | null {
  if (!dates.startDate) return 'Choose the expected start date';
  if (!dates.dueDate) return 'Choose the due date';
  const window = quarterWindow(year, quarters);
  if (!window) return null;
  const range = `${formatLineDate(window.min)} – ${formatLineDate(window.max)}`;
  if (dates.startDate < window.min || dates.startDate > window.max) return `The expected start date must fall within the timeline (${range})`;
  if (dates.dueDate < window.min || dates.dueDate > window.max) return `The due date must fall within the timeline (${range})`;
  if (dates.dueDate < dates.startDate) return 'The due date cannot be before the expected start date';
  return null;
}

/** Keeps dates that still fit the timeline and clears the others (used when the quarters change in a form). */
export function keepDatesInWindow(dates: LineDates, quarters: readonly number[], year: number | null | undefined): LineDates {
  const window = quarterWindow(year, quarters);
  if (!window) return dates;
  const inside = (d: string | null) => (d && d >= window.min && d <= window.max ? d : null);
  const startDate = inside(dates.startDate), dueDate = inside(dates.dueDate);
  return { startDate, dueDate: startDate && dueDate && dueDate < startDate ? null : dueDate };
}

/**
 * The dates to store for a saved line. Sent dates must fit the timeline. When none are sent (older clients,
 * scripts, inline cell edits), a line keeps its stored dates if they still fit, else gets the whole timeline.
 */
export function resolveLineDates(sent: Partial<LineDates>, stored: LineDates | null, quarters: readonly number[], year: number | null | undefined): { dates: LineDates; problem: string | null } {
  const window = quarterWindow(year, quarters);
  const sentAny = sent.startDate != null || sent.dueDate != null;
  if (sentAny) {
    const dates = { startDate: sent.startDate ?? null, dueDate: sent.dueDate ?? null };
    return { dates, problem: lineDatesProblem(dates, quarters, year) };
  }
  if (stored?.startDate && stored.dueDate && !lineDatesProblem(stored, quarters, year)) return { dates: stored, problem: null };
  return { dates: { startDate: window?.min ?? null, dueDate: window?.max ?? null }, problem: null };
}
