import { z } from 'zod';
import { formatQuarters } from './format-quarters.ts';

// Timeline: the quarters in which a component line is implemented (migration 050). Every activity line, sports
// budget line and infrastructure package has at least one, all within its plan's quarters.
export { formatQuarters };
export const allQuarters = [1, 2, 3, 4] as const;

/** Sorted, distinct, valid quarters. */
export const normalizeQuarters = (quarters: readonly number[]): number[] =>
  [...new Set(quarters)].filter(q => Number.isInteger(q) && q >= 1 && q <= 4).sort((a, b) => a - b);

/** A plan's quarters; a legacy plan without quarters covers the whole year (same rule as migration 050). */
export function planQuarters(plan: { fundingQuarters?: readonly number[] | null } | null | undefined): number[] {
  const quarters = normalizeQuarters(plan?.fundingQuarters ?? []);
  return quarters.length ? quarters : [...allQuarters];
}

/**
 * A line's timeline as the APIs take it. Optional in the payload: a client that sends none (older clients and
 * scripts) gets the plan's quarters (resolveLineQuarters). An empty list is refused.
 */
export const lineQuartersSchema = z.array(z.number().int().min(1, 'Choose quarters between Q1 and Q4.').max(4, 'Choose quarters between Q1 and Q4.'))
  .min(1, 'Choose at least one quarter for the timeline.').max(4, 'Choose at most four quarters.')
  .refine(q => new Set(q).size === q.length, 'Choose each quarter once.')
  .transform(q => [...q].sort((a, b) => a - b));

/** Why a timeline does not fit the plan, or null. */
export function lineQuartersProblem(quarters: readonly number[], plan: { fundingQuarters?: readonly number[] | null }): string | null {
  if (!quarters.length) return 'Choose at least one quarter for the timeline.';
  const allowed = planQuarters(plan), outside = normalizeQuarters(quarters).filter(q => !allowed.includes(q));
  if (!outside.length) return null;
  return `${formatQuarters(outside)} ${outside.length === 1 ? 'is' : 'are'} not in this plan (${formatQuarters(allowed)}). Choose quarters within the plan.`;
}

/** The quarters to store for a saved line: the ones sent, or the plan's when none were sent. */
export function resolveLineQuarters(sent: readonly number[] | undefined, plan: { fundingQuarters?: readonly number[] | null }): { quarters: number[]; problem: string | null } {
  const quarters = sent === undefined ? planQuarters(plan) : normalizeQuarters(sent);
  return { quarters, problem: lineQuartersProblem(quarters, plan) };
}

/** How many saved lines use each timeline (GET /api/plans/setup): enough to count the lines a quarter removal would break. */
export type QuarterUsage = { quarters: number[]; lines: number }[];

/** Why a plan edit cannot drop quarters that saved lines still use, or null. */
export function quarterRemovalProblem(before: readonly number[] | null | undefined, after: readonly number[], usage: QuarterUsage): string | null {
  const kept = new Set(after), removed = planQuarters({ fundingQuarters: before }).filter(q => !kept.has(q));
  if (!removed.length) return null;
  const affected = usage.filter(u => u.quarters.some(q => removed.includes(q)));
  const lines = affected.reduce((sum, u) => sum + u.lines, 0);
  if (!lines) return null;
  const used = normalizeQuarters(affected.flatMap(u => u.quarters).filter(q => removed.includes(q)));
  return `${lines.toLocaleString('en-NG')} ${lines === 1 ? 'line uses' : 'lines use'} ${formatQuarters(used)} in ${lines === 1 ? 'its timeline' : 'their timelines'}. Remove ${used.length === 1 ? 'that quarter' : 'those quarters'} from the lines first or keep ${used.length === 1 ? 'it' : 'them'} in the plan.`;
}
