import { activityShareCaps, activityShareGroups, selectableActivityIndexes, type ActivityWorkstream } from './activity-plans.ts';
import { compulsoryActivities } from './activity-extras.ts';

// Components whose optional activities are chosen up front (action_plans.quality_activities, migration 061).
// The compulsory activities are always in; the activity caps are scaled so the chosen activities share the whole
// allocation: an activity's cap is its share ÷ the shares of every chosen activity (a group counted once).

/** The stored choice: the optional activities chosen; null = not chosen yet; undefined = a plan or snapshot from before (caps unscaled). */
export type ActivitySelection = readonly number[] | null | undefined;
export const choosesUpFront = (workstream: string): workstream is 'quality' => workstream === 'quality';
/** The plan field holding the choice. */
export type SelectionPlan = { qualityActivities?: readonly number[] | null };
export const planSelection = (workstream: string, plan: SelectionPlan | null | undefined): ActivitySelection =>
  choosesUpFront(workstream) ? plan?.qualityActivities : undefined;

const selectable = (workstream: ActivityWorkstream) => selectableActivityIndexes[workstream] as readonly number[];
const compulsory = (workstream: string) => compulsoryActivities[workstream] ?? [];
/** The activities a state may leave out. */
export const optionalActivities = (workstream: ActivityWorkstream): number[] => selectable(workstream).filter(a => !compulsory(workstream).includes(a));
/** The activities this plan works with: every selectable one, or for an up-front component the compulsory ones plus the chosen ones. */
export function chosenActivities(workstream: ActivityWorkstream, selection: ActivitySelection): number[] {
  if (!choosesUpFront(workstream) || selection === undefined) return [...selectable(workstream)];
  const chosen = new Set([...compulsory(workstream), ...(selection ?? [])]);
  return selectable(workstream).filter(a => chosen.has(a));
}
export const isChosen = (workstream: ActivityWorkstream, selection: ActivitySelection, activity: number) => chosenActivities(workstream, selection).includes(activity);

/** Each cap once: a group's activities share one, every other capped activity has its own. */
export const capUnits = (workstream: ActivityWorkstream): { activities: readonly number[]; share: number }[] => [
  ...(activityShareGroups[workstream] ?? []),
  ...Object.entries(activityShareCaps[workstream] ?? {}).map(([activity, share]) => ({ activities: [Number(activity)], share })),
];
/** What the shares are divided by, in basis points: 10000, or for an up-front component the shares of the chosen activities. */
export function shareTotal(workstream: ActivityWorkstream, selection: ActivitySelection): number {
  if (!choosesUpFront(workstream) || selection === undefined) return 10000;
  const chosen = chosenActivities(workstream, selection);
  const total = capUnits(workstream).filter(u => u.activities.some(a => chosen.includes(a))).reduce((sum, u) => sum + u.share, 0);
  return total > 0 ? total : 10000;
}
/** A share in basis points as a percentage of the allocation once scaled ("10%", "28.57%"). */
export const scaledPercent = (share: number, total: number) => `${Number((share * 100 / total).toFixed(2))}%`;

/** Why this choice cannot be stored, or null: only optional activities, each once. */
export function selectionProblem(workstream: ActivityWorkstream, activities: readonly number[]): string | null {
  const optional = optionalActivities(workstream);
  if (activities.some(a => !optional.includes(a))) return 'Choose only from the optional activities';
  if (new Set(activities).size !== activities.length) return 'Choose each activity once';
  return null;
}
