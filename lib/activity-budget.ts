import { componentEnvelope, isSplitMode, toMinor, type EnvelopePlan } from './funding-policy';
import { formatMinor } from './money-format';
import { shareToKobo } from './money';
import { activityNames, activityShare, activityShareCaps, activityShareGroups, activityTitles, capActivities, isAdvisoryShare, type ActivityWorkstream } from './activity-plans';
import { ictModelSchoolsActivity, ictModelSchoolsCapMinor, isRetiredActivity } from './activity-extras';
import { choosesUpFront, isChosen, planSelection, scaledPercent, shareTotal, type ActivitySelection } from './activity-selection';

/** Components whose saved lines may not exceed their funding envelope (UBEC26-32). */
export const cappedWorkstreams = ['monitoring', 'gscci', 'curriculum', 'quality', 'ict', 'teachers', 'planning'] as const;
export type CappedWorkstream = typeof cappedWorkstreams[number];
export const isCapped = (workstream: string): workstream is CappedWorkstream => (cappedWorkstreams as readonly string[]).includes(workstream);
/**
 * Capped on this plan: the always-capped components, plus TLM in split mode (its own part of the Infrastructure & TLM pool,
 * migration 051) once the plan has funding (like the shared pool, no ceiling before that).
 */
export const isCappedFor = (workstream: string, plan: EnvelopePlan): workstream is CappedWorkstream | 'tlm' => isCapped(workstream) || (workstream === 'tlm' && isSplitMode(plan) && plan.stateLodgment != null);
export type BudgetLine = { activity: number; minor: bigint };

export { formatMinor };
export const lineMinor = (line: { unit_cost?: string; unitCost?: number; quantity: number }) => toMinor(line.unit_cost ?? Number(line.unitCost ?? 0)) * BigInt(line.quantity);

/**
 * The component's budget ceiling in minor units (lib/money.ts), the policy share plus its own funding sources, or null until the plan funding is set.
 * ICT and Teacher Development stay null until the shared Teacher Development & ICT budget is split (action_plans.ict_allocation);
 * in split mode TLM stays null until the Infrastructure & TLM pool is split (action_plans.tlm_allocation).
 */
export function componentEnvelopeMinor(plan: EnvelopePlan, workstream: ActivityWorkstream): bigint | null {
  if (workstream === 'teachers' && plan.ictAllocation == null) return null;
  const envelope = componentEnvelope(plan, workstream);
  return envelope == null ? null : toMinor(envelope);
}

/**
 * An activity's cap: its share of the envelope (or its group's, shared by the group's items), rounded to the kobo
 * (Curriculum, Quality Assurance). Quality Assurance shares are scaled to the chosen activities (migration 061).
 */
export function activityCapMinor(workstream: ActivityWorkstream, envelope: bigint, activity: number, selection?: ActivitySelection) {
  const total = BigInt(shareTotal(workstream, selection));
  return shareToKobo(envelope, BigInt(activityShare(workstream, activity) ?? 0), total);
}
/** An activity's share of the allocation as shown ("10%", or scaled to the chosen activities "28.57%"), or undefined when it has none. */
export const activityPercent = (workstream: ActivityWorkstream, activity: number, selection?: ActivitySelection) => {
  const share = activityShare(workstream, activity);
  return share === undefined ? undefined : scaledPercent(share, shareTotal(workstream, selection));
};
export const curriculumCapMinor = (envelope: bigint, activity: number) => activityCapMinor('curriculum', envelope, activity);

/** Fixed naira caps on one activity's lines together, in minor units: ICT Maintenance of Model Smart Schools & DLC (₦30,000,000). */
export const activityFixedCaps: Partial<Record<ActivityWorkstream, Record<number, bigint>>> = { ict: { [ictModelSchoolsActivity]: ictModelSchoolsCapMinor } };
export const ictAllocationNeeded = 'Ask the BEAP Chair to set how much of the shared Teacher Development & ICT budget ICT will use before adding ICT items';
export const teachersSplitNeeded = 'Ask the BEAP Chair to set how much of the shared Teacher Development & ICT budget Teacher Development will use before adding Teacher Development items';
export const tlmSplitNeeded = 'Ask the BEAP Chair to set how much of the shared Infrastructure & TLM budget TLM will use before adding TLM items';

/** An activity's own cap in minor units and what it is ("10% of the Curriculum allocation"), or null when it has none or the envelope is not set. */
export type ActivityCap = { minor: bigint; basis: string };
export function activityCap(workstream: ActivityWorkstream, envelope: bigint | null, activity: number, selection?: ActivitySelection): ActivityCap | null {
  const fixed = activityFixedCaps[workstream]?.[activity];
  if (fixed !== undefined) return { minor: fixed, basis: 'for all its items together' };
  const share = activityShare(workstream, activity);
  if (share === undefined || envelope === null) return null;
  const partners = capActivities(workstream, activity).filter(a => a !== activity).map(a => `‘${activityNames[workstream][a]}’`);
  return { minor: activityCapMinor(workstream, envelope, activity, selection), basis: `${activityPercent(workstream, activity, selection)} of the ${activityTitles[workstream]} allocation${partners.length ? `, shared with ${partners.join(' and ')}` : ''}` };
}
/**
 * pending: the lines include an item being added or changed (the editor and the save API), not only saved lines (send checks).
 * only: check just the cap that covers this activity (and the component envelope), so a plan already over on another
 * activity can still save; sending checks every cap.
 */
export type BudgetProblemOptions = { pending?: boolean; only?: number };
const overBy = (total: bigint, cap: bigint, pending: boolean) => pending
  ? `With this item it would come to ${formatMinor(total)}, which is ${formatMinor(total - cap)} over.`
  : `Its items come to ${formatMinor(total)}, which is ${formatMinor(total - cap)} over. Reduce them to continue.`;

/** Why these lines cannot be saved or sent, or null. Lines above the envelope (capped components) or an activity above its share or fixed cap are blocked. */
export function activityBudgetProblem(workstream: ActivityWorkstream, lines: readonly BudgetLine[], plan: EnvelopePlan, options: BudgetProblemOptions = {}): string | null {
  const shares = activityShareCaps[workstream] ?? activityShareGroups[workstream];
  const capped = isCappedFor(workstream, plan);
  if (!capped && !shares) return null;
  const pending = options.pending === true;
  const title = activityTitles[workstream], envelope = componentEnvelopeMinor(plan, workstream);
  if (envelope === null && workstream === 'ict' && plan.stateLodgment != null) return ictAllocationNeeded;
  if (envelope === null && workstream === 'teachers' && plan.stateLodgment != null) return teachersSplitNeeded;
  if (envelope === null && workstream === 'tlm' && plan.stateLodgment != null) return tlmSplitNeeded;
  if (envelope === null) return `Set the plan funding before allocating the ${title} budget`;
  // Quality Assurance: items only on the activities chosen up front (migration 061); lines on retired activities are reported by readiness.
  const selection = planSelection(workstream, plan as { qualityActivities?: readonly number[] | null });
  if (choosesUpFront(workstream) && selection === null) return `Choose the ${title} activities before adding items`;
  const unchosen = lines.find(l => (options.only === undefined || l.activity === options.only) && !isRetiredActivity(workstream, l.activity) && !isChosen(workstream, selection, l.activity));
  if (unchosen) return `‘${activityNames[workstream][unchosen.activity]}’ is not one of the chosen ${title} activities. Add it under Choose activities first.`;
  // One check per cap: fixed caps, each activity's own share, then each group (its first activity stands for the group).
  const activities = [...Object.keys(activityFixedCaps[workstream] ?? {}), ...Object.keys(activityShareCaps[workstream] ?? {})].map(Number)
    .concat((activityShareGroups[workstream] ?? []).map(g => g.activities[0]));
  for (const activity of activities) {
    // Guide shares (UBEC162/173) are shown but never block; fixed naira caps always do.
    if (isAdvisoryShare(workstream, activity) && !(activityFixedCaps[workstream] ?? {})[activity]) continue;
    const cap = activityCap(workstream, envelope, activity, selection), group = capActivities(workstream, activity);
    if (options.only !== undefined && !group.includes(options.only)) continue;
    const total = lines.filter(l => group.includes(l.activity)).reduce((sum, l) => sum + l.minor, BigInt(0));
    const name = group.map(a => `‘${activityNames[workstream][a]}’`).join(' and ');
    if (cap && total > cap.minor) return group.length > 1
      ? `${name} together can use up to ${formatMinor(cap.minor)} (${activityPercent(workstream, activity, selection)} of the ${title} allocation). ${overBy(total, cap.minor, pending)}`
      : `${name} can use up to ${formatMinor(cap.minor)} (${cap.basis}). ${overBy(total, cap.minor, pending)}`;
  }
  if (!capped) return null;
  const total = lines.reduce((sum, l) => sum + l.minor, BigInt(0));
  if (total > envelope) return `You have exceeded the ${title} allocation (${formatMinor(envelope)}) by ${formatMinor(total - envelope)}. Reduce the budget to continue.`;
  return null;
}

/** The share caps these lines go over (each named by its first activity), for comparing two choices of activities. */
export function overShareCaps(workstream: ActivityWorkstream, lines: readonly BudgetLine[], envelope: bigint, selection: ActivitySelection): number[] {
  return [...(activityShareGroups[workstream] ?? []).map(g => g.activities[0]), ...Object.keys(activityShareCaps[workstream] ?? {}).map(Number)].filter(activity => !isAdvisoryShare(workstream, activity)).filter(activity => {
    const group = capActivities(workstream, activity), total = lines.filter(l => group.includes(l.activity)).reduce((sum, l) => sum + l.minor, BigInt(0));
    return total > activityCapMinor(workstream, envelope, activity, selection);
  });
}
