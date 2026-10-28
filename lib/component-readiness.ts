import { compulsoryFor, hasLineSchools, isRetiredActivity, qualityIctActivityNames, missingLineDocument } from './activity-extras';
import { activityBudgetProblem, lineKobo } from './activity-budget';
import { activityShareCaps, type ActivityWorkstream } from './activity-plans';
import { infrastructureSplitProblem } from './budget-pairs';
import { isSplitMode, type EnvelopePlan } from './funding-policy';
import type { Snapshot } from './plan-review';

// What must be in place before a Quality Assurance, ICT, Teacher Development or Planning component can be sent on
// (migrations 038, 040 and 041): every compulsory activity has a line, every line that needs schools has some, every
// line that needs a document has one (only while the Super Admin requires supporting documents, migration 052),
// and Teacher Development has its share of the shared budget set.
// Shared by the editor, the plan page and every send step on the server.
type ReadinessLine = { id: number; activity: number; description: string; custom_activity?: string; customActivity?: string; beneficiary?: string | null; schools?: readonly unknown[]; documents?: readonly { kind?: string }[] };
/** The plan setup fields readiness reads (a snapshot's setup or an ActionPlan). */
type ReadinessSetup = { ictAllocation?: string | null; qualityActivities?: readonly number[] | null; ictConnect?: 'has' | 'needs' | null; ictConnectWaivers?: number } | null | undefined;
/** Platform settings readiness depends on: whether supporting documents (ICT, Teacher Development, Infrastructure except land documents) are required (migration 052). */
/** fullAllocation: every component must use its whole allocation before it is sent (UBEC79, migration 076). */
export type ReadinessOptions = { documentsRequired: boolean; fullAllocation?: boolean };

export const readinessWorkstreams = ['quality', 'ict', 'teachers', 'planning', 'tlm'] as const;
export type ReadinessWorkstream = typeof readinessWorkstreams[number];
export const hasReadinessRules = (workstream: string): workstream is ReadinessWorkstream => (readinessWorkstreams as readonly string[]).includes(workstream);

/** Compulsory activities of this component with no budget line yet, in activity order. */
export function missingCompulsory(workstream: string, lines: readonly { activity: number }[], setup?: ReadinessSetup) {
  return compulsoryFor(workstream, setup).filter(activity => !lines.some(line => line.activity === activity));
}
export const compulsoryNames = (workstream: string, activities: readonly number[]) =>
  activities.map(activity => qualityIctActivityNames[workstream]?.[activity] ?? `Activity ${activity + 1}`);
/**
 * Required activities first: while a compulsory activity has no item, a new item on an optional activity (or an item moved
 * onto one) is refused, so optional items cannot use up the envelope the required ones need (ICT, Planning). Components
 * whose every activity has its own share cap (Quality Assurance) already keep each required activity's share, so they
 * are exempt. `others` = the component's other lines (without the one being saved); `previousActivity` = the saved
 * line's activity when it is an edit.
 */
export function requiredFirstProblem(workstream: string, others: readonly { activity: number }[], activity: number, previousActivity?: number, setup?: ReadinessSetup): string | null {
  const required = compulsoryFor(workstream, setup);
  if (!required.length || activityShareCaps[workstream as ActivityWorkstream] || required.includes(activity) || previousActivity === activity) return null;
  const missing = missingCompulsory(workstream, others, setup);
  if (!missing.length) return null;
  return `Budget the required activities first: ${compulsoryNames(workstream, missing).join('; ')}. Optional activities can be added once each required activity has an item`;
}
/** How a line is named in messages: its description, else its own activity name (Others), else the activity. */
const lineName = (workstream: string, line: ReadinessLine) =>
  line.description || line.custom_activity || line.customActivity || qualityIctActivityNames[workstream]?.[line.activity] || `Activity ${line.activity + 1}`;

const retiredName = (workstream: string, activity: number) => qualityIctActivityNames[workstream]?.[activity] ?? `Activity ${activity + 1}`;

/** Why this component cannot be sent yet, or null. `setup` lets Teacher Development check that the budget split is set. */
export function componentReadinessProblem(workstream: string, lines: readonly ReadinessLine[], setup: ReadinessSetup, options: ReadinessOptions): string | null {
  const retired = lines.find(line => isRetiredActivity(workstream, line.activity));
  if (retired) return `“${lineName(workstream, retired)}” is under “${retiredName(workstream, retired.activity)}”, which is no longer an allowable activity. Move it to a listed activity or remove it before sending.`;
  // ICT: whether the state has UBEC-SUBEB Connect is answered first (migration 070); older snapshots have no answer (undefined).
  if (workstream === 'ict' && setup && setup.ictConnect === null) return 'Say whether the state already has UBEC-SUBEB Connect before sending';
  if (workstream === 'ict' && setup?.ictConnect === 'has' && !setup.ictConnectWaivers) return 'Upload the UBEC HQ waiver for UBEC-SUBEB Connect before sending';
  const missing = missingCompulsory(workstream, lines, setup);
  if (missing.length) return `Add at least one budget line to each compulsory activity before sending: ${compulsoryNames(workstream, missing).join('; ')}.`;
  if (workstream === 'quality' && setup && setup.qualityActivities === null) return 'Choose the Quality Assurance activities before sending';
  if (workstream === 'teachers' && lines.length && setup && setup.ictAllocation == null) return 'Ask the BEAP Chair to set how much of the shared Teacher Development & ICT budget Teacher Development will use before sending';
  const noSchools = lines.find(line => hasLineSchools(workstream, line.activity, line.beneficiary) && !line.schools?.length);
  if (noSchools) return `Choose the schools for “${lineName(workstream, noSchools)}” before sending`;
  if (!options.documentsRequired) return null;
  // Only the governed documents; optional supporting documents (migration 057) never block a send.
  for (const line of lines) {
    const slot = missingLineDocument(workstream, line.activity, line.documents);
    if (slot) return `Upload the ${slot.label === 'BOQ' ? 'BOQ' : slot.label.toLowerCase()} for “${lineName(workstream, line)}” before sending`;
  }
  return null;
}

/** Infrastructure and TLM, in split mode (migration 051): readiness also needs the split set and each side within its part. */
export const splitReadinessPillars = ['infrastructure', 'tlm'] as const;
type SplitSnapshot = Pick<Snapshot, 'setup' | 'infrastructure' | 'tlm'>;
/**
 * Why Infrastructure or TLM cannot be sent in split mode (split not set, or above its own part of the pool), or null.
 * Shared-pool mode is checked at each send step with infrastructurePoolProblem, as before.
 */
export function splitReadinessProblem(pillar: string, snapshot: SplitSnapshot): string | null {
  const setup = snapshot.setup as EnvelopePlan | undefined;
  if (!setup || !isSplitMode(setup) || setup.stateLodgment == null || (pillar !== 'infrastructure' && pillar !== 'tlm')) return null;
  const items = pillar === 'infrastructure' ? snapshot.infrastructure ?? [] : snapshot.tlm ?? [];
  if (!items.length) return null;
  const name = pillar === 'infrastructure' ? 'Infrastructure' : 'TLM';
  if (setup.tlmAllocation == null) return `Ask the BEAP Chair to set how much of the shared Infrastructure & TLM budget ${name} will use before sending`;
  if (pillar === 'infrastructure') return infrastructureSplitProblem(setup, items.reduce((sum, item) => sum + lineKobo(item), BigInt(0)));
  return activityBudgetProblem('tlm', (snapshot.tlm ?? []).map(line => ({ activity: line.activity, kobo: lineKobo(line) })), setup);
}
