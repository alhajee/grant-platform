import { componentEnvelope, toKobo, type EnvelopePlan } from './funding-policy';
import { activityNames, activityShareCaps, activityTitles, type ActivityWorkstream } from './activity-plans';
import { ictModelSchoolsActivity, ictModelSchoolsCapKobo } from './activity-extras';

/** Components whose saved lines may not exceed their funding envelope (UBEC26-32). */
export const cappedWorkstreams = ['monitoring', 'gscci', 'curriculum', 'quality', 'ict'] as const;
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

/** An activity's cap: its share of the envelope, rounded to the kobo (Curriculum activities, SBMC monitoring). */
export const activityCapKobo = (workstream: ActivityWorkstream, envelope: bigint, activity: number) => (envelope * BigInt(activityShareCaps[workstream]?.[activity] ?? 0) + BigInt(5000)) / BigInt(10000);
export const curriculumCapKobo = (envelope: bigint, activity: number) => activityCapKobo('curriculum', envelope, activity);

/** Fixed naira caps on one activity's lines together, in kobo: ICT Maintenance of Model Smart Schools (₦30,000,000). */
export const activityFixedCaps: Partial<Record<ActivityWorkstream, Record<number, bigint>>> = { ict: { [ictModelSchoolsActivity]: ictModelSchoolsCapKobo } };
export const ictAllocationNeeded = 'Set how much of the shared Teacher Development & ICT budget ICT will use before adding ICT items.';

/** Why these lines cannot be saved or sent, or null. Lines above the envelope (capped components) or an activity above its share or fixed cap are blocked. */
export function activityBudgetProblem(workstream: ActivityWorkstream, lines: readonly BudgetLine[], plan: EnvelopePlan): string | null {
  const shares = activityShareCaps[workstream];
  if (!isCapped(workstream) && !shares) return null;
  const title = activityTitles[workstream], envelope = componentEnvelopeKobo(plan, workstream);
  if (envelope === null && workstream === 'ict' && plan.stateLodgment != null) return ictAllocationNeeded;
  if (envelope === null) return `Set the plan funding before allocating the ${title} budget.`;
  for (const [key, cap] of Object.entries(activityFixedCaps[workstream] ?? {})) {
    const activity = Number(key), total = lines.filter(l => l.activity === activity).reduce((sum, l) => sum + l.kobo, BigInt(0));
    if (total > cap) return `“${activityNames[workstream][activity]}” may use up to ${formatKobo(cap)} in total. Its items exceed this by ${formatKobo(total - cap)}. Reduce them to continue.`;
  }
  for (const [key, share] of Object.entries(shares ?? {})) {
    const activity = Number(key), cap = activityCapKobo(workstream, envelope, activity), total = lines.filter(l => l.activity === activity).reduce((sum, l) => sum + l.kobo, BigInt(0));
    if (total > cap) return `“${activityNames[workstream][activity]}” may use up to ${share / 100}% of the ${title} allocation (${formatKobo(cap)}). Its items exceed this by ${formatKobo(total - cap)}. Reduce them to continue.`;
  }
  if (!isCapped(workstream)) return null;
  const total = lines.reduce((sum, l) => sum + l.kobo, BigInt(0));
  if (total > envelope) return `You have exceeded the ${title} allocation (${formatKobo(envelope)}) by ${formatKobo(total - envelope)}. Reduce the budget to continue.`;
  return null;
}
