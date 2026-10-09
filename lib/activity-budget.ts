import { componentEnvelope, isSplitMode, toKobo, type EnvelopePlan } from './funding-policy';
import { activityNames, activityShareCaps, activityTitles, type ActivityWorkstream } from './activity-plans';
import { ictModelSchoolsActivity, ictModelSchoolsCapKobo } from './activity-extras';

/** Components whose saved lines may not exceed their funding envelope (UBEC26-32). */
export const cappedWorkstreams = ['monitoring', 'gscci', 'curriculum', 'quality', 'ict', 'teachers', 'planning'] as const;
export type CappedWorkstream = typeof cappedWorkstreams[number];
export const isCapped = (workstream: string): workstream is CappedWorkstream => (cappedWorkstreams as readonly string[]).includes(workstream);
/**
 * Capped on this plan: the always-capped components, plus TLM in split mode (its own part of the Infrastructure & TLM pool,
 * migration 051) once the plan has funding (like the shared pool, no ceiling before that).
 */
export const isCappedFor = (workstream: string, plan: EnvelopePlan): workstream is CappedWorkstream | 'tlm' => isCapped(workstream) || (workstream === 'tlm' && isSplitMode(plan) && plan.stateLodgment != null);
export type BudgetLine = { activity: number; kobo: bigint };

export const formatKobo = (kobo: bigint) => {
  const absolute = kobo < 0 ? -kobo : kobo;
  return `₦${(absolute / BigInt(100)).toLocaleString('en-NG')}.${String(absolute % BigInt(100)).padStart(2, '0')}`;
};
export const lineKobo = (line: { unit_cost?: string; unitCost?: number; quantity: number }) => toKobo(line.unit_cost ?? Number(line.unitCost ?? 0).toFixed(2)) * BigInt(line.quantity);

/**
 * The component's budget ceiling in kobo (policy share plus its own funding sources), or null until the plan funding is set.
 * ICT and Teacher Development stay null until the shared Teacher Development & ICT budget is split (action_plans.ict_allocation);
 * in split mode TLM stays null until the Infrastructure & TLM pool is split (action_plans.tlm_allocation).
 */
export function componentEnvelopeKobo(plan: EnvelopePlan, workstream: ActivityWorkstream): bigint | null {
  if (workstream === 'teachers' && plan.ictAllocation == null) return null;
  const envelope = componentEnvelope(plan, workstream);
  return envelope == null ? null : toKobo(envelope);
}

/** An activity's cap: its share of the envelope, rounded to the kobo (Curriculum activities, SBMC monitoring). */
export const activityCapKobo = (workstream: ActivityWorkstream, envelope: bigint, activity: number) => (envelope * BigInt(activityShareCaps[workstream]?.[activity] ?? 0) + BigInt(5000)) / BigInt(10000);
export const curriculumCapKobo = (envelope: bigint, activity: number) => activityCapKobo('curriculum', envelope, activity);

/** Fixed naira caps on one activity's lines together, in kobo: ICT Maintenance of Model Smart Schools (₦30,000,000). */
export const activityFixedCaps: Partial<Record<ActivityWorkstream, Record<number, bigint>>> = { ict: { [ictModelSchoolsActivity]: ictModelSchoolsCapKobo } };
export const ictAllocationNeeded = 'Set how much of the shared Teacher Development & ICT budget ICT will use before adding ICT items.';
export const teachersSplitNeeded = 'Set how much of the shared Teacher Development & ICT budget Teacher Development will use before adding Teacher Development items.';
export const tlmSplitNeeded = 'Set how much of the shared Infrastructure & TLM budget TLM will use before adding TLM items.';

/** An activity's own cap in kobo and what it is ("10% of the Curriculum allocation"), or null when it has none or the envelope is not set. */
export type ActivityCap = { kobo: bigint; basis: string };
export function activityCap(workstream: ActivityWorkstream, envelope: bigint | null, activity: number): ActivityCap | null {
  const fixed = activityFixedCaps[workstream]?.[activity];
  if (fixed !== undefined) return { kobo: fixed, basis: 'for all its items together' };
  const share = activityShareCaps[workstream]?.[activity];
  if (share === undefined || envelope === null) return null;
  return { kobo: activityCapKobo(workstream, envelope, activity), basis: `${share / 100}% of the ${activityTitles[workstream]} allocation` };
}
/** The lines include an item being added or changed (the editor and the save API), not only saved lines (send checks). */
export type BudgetProblemOptions = { pending?: boolean };
const overBy = (total: bigint, cap: bigint, pending: boolean) => pending
  ? `With this item it would come to ${formatKobo(total)}, which is ${formatKobo(total - cap)} over.`
  : `Its items come to ${formatKobo(total)}, which is ${formatKobo(total - cap)} over. Reduce them to continue.`;

/** Why these lines cannot be saved or sent, or null. Lines above the envelope (capped components) or an activity above its share or fixed cap are blocked. */
export function activityBudgetProblem(workstream: ActivityWorkstream, lines: readonly BudgetLine[], plan: EnvelopePlan, options: BudgetProblemOptions = {}): string | null {
  const shares = activityShareCaps[workstream];
  const capped = isCappedFor(workstream, plan);
  if (!capped && !shares) return null;
  const pending = options.pending === true;
  const title = activityTitles[workstream], envelope = componentEnvelopeKobo(plan, workstream);
  if (envelope === null && workstream === 'ict' && plan.stateLodgment != null) return ictAllocationNeeded;
  if (envelope === null && workstream === 'teachers' && plan.stateLodgment != null) return teachersSplitNeeded;
  if (envelope === null && workstream === 'tlm' && plan.stateLodgment != null) return tlmSplitNeeded;
  if (envelope === null) return `Set the plan funding before allocating the ${title} budget.`;
  const activities = [...Object.keys(activityFixedCaps[workstream] ?? {}), ...Object.keys(shares ?? {})].map(Number);
  for (const activity of activities) {
    const cap = activityCap(workstream, envelope, activity);
    const total = lines.filter(l => l.activity === activity).reduce((sum, l) => sum + l.kobo, BigInt(0));
    if (cap && total > cap.kobo) return `‘${activityNames[workstream][activity]}’ can use up to ${formatKobo(cap.kobo)} (${cap.basis}). ${overBy(total, cap.kobo, pending)}`;
  }
  if (!capped) return null;
  const total = lines.reduce((sum, l) => sum + l.kobo, BigInt(0));
  if (total > envelope) return `You have exceeded the ${title} allocation (${formatKobo(envelope)}) by ${formatKobo(total - envelope)}. Reduce the budget to continue.`;
  return null;
}
