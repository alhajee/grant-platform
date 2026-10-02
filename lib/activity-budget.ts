import { componentEnvelope, toKobo, type EnvelopePlan } from './funding-policy';
import { activityNames, activityTitles, curriculumActivityShares, type ActivityWorkstream } from './activity-plans';

/** Components whose saved lines may not exceed their funding envelope (UBEC26-32). */
export const cappedWorkstreams = ['monitoring', 'gscci', 'curriculum'] as const;
export type CappedWorkstream = typeof cappedWorkstreams[number];
export const isCapped = (workstream: string): workstream is CappedWorkstream => (cappedWorkstreams as readonly string[]).includes(workstream);
export type BudgetLine = { activity: number; kobo: bigint };

export const formatKobo = (kobo: bigint) => {
  const absolute = kobo < 0 ? -kobo : kobo;
  return `₦${(absolute / BigInt(100)).toLocaleString('en-NG')}.${String(absolute % BigInt(100)).padStart(2, '0')}`;
};
export const lineKobo = (line: { unit_cost?: string; unitCost?: number; quantity: number }) => toKobo(line.unit_cost ?? Number(line.unitCost ?? 0).toFixed(2)) * BigInt(line.quantity);

/** The component's budget ceiling in kobo (policy share plus its own funding sources), or null until the plan funding is set. */
export function componentEnvelopeKobo(plan: EnvelopePlan, workstream: ActivityWorkstream): bigint | null {
  const envelope = componentEnvelope(plan, workstream);
  return envelope == null ? null : toKobo(envelope);
}

/** Each Curriculum activity's cap: its share of the envelope, rounded to the kobo. */
export const curriculumCapKobo = (envelope: bigint, activity: number) => (envelope * BigInt(curriculumActivityShares[activity] ?? 0) + BigInt(5000)) / BigInt(10000);

/** Why these lines cannot be saved or sent, or null. Lines above the envelope (or a Curriculum activity above its share) are blocked. */
export function activityBudgetProblem(workstream: ActivityWorkstream, lines: readonly BudgetLine[], plan: EnvelopePlan): string | null {
  if (!isCapped(workstream)) return null;
  const title = activityTitles[workstream], envelope = componentEnvelopeKobo(plan, workstream);
  if (envelope === null) return `Set the plan funding before allocating the ${title} budget.`;
  if (workstream === 'curriculum') for (const [activity, share] of curriculumActivityShares.entries()) {
    const cap = curriculumCapKobo(envelope, activity), total = lines.filter(l => l.activity === activity).reduce((sum, l) => sum + l.kobo, BigInt(0));
    if (total > cap) return `“${activityNames.curriculum[activity]}” may use up to ${share / 100}% of the Curriculum allocation (${formatKobo(cap)}). Its items exceed this by ${formatKobo(total - cap)}. Reduce them to continue.`;
  }
  const total = lines.reduce((sum, l) => sum + l.kobo, BigInt(0));
  if (total > envelope) return `You have exceeded the ${title} allocation (${formatKobo(envelope)}) by ${formatKobo(total - envelope)}. Reduce the budget to continue.`;
  return null;
}
