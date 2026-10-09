import { compulsoryActivities, hasLineSchools, qualityIctActivityNames, requiredLineDocumentLabel } from './activity-extras';
import { activityBudgetProblem, lineKobo } from './activity-budget';
import { infrastructureSplitProblem } from './budget-pairs';
import { isSplitMode, type EnvelopePlan } from './funding-policy';
import type { Snapshot } from './plan-review';

// What must be in place before a Quality Assurance, ICT, Teacher Development or Planning component can be sent on
// (migrations 038, 040 and 041): every compulsory activity has a line, every line that needs schools has some, every
// line that needs a document has one (only while the Super Admin requires supporting documents, migration 052),
// and Teacher Development has its share of the shared budget set.
// Shared by the editor, the plan page and every send step on the server.
type ReadinessLine = { id: number; activity: number; description: string; custom_activity?: string; customActivity?: string; schools?: readonly unknown[]; documents?: readonly unknown[] };
/** The plan setup fields readiness reads (a snapshot's setup or an ActionPlan). */
type ReadinessSetup = { ictAllocation?: string | null } | null | undefined;
/** Platform settings readiness depends on: whether supporting documents (ICT, Teacher Development, Infrastructure except land documents) are required (migration 052). */
export type ReadinessOptions = { documentsRequired: boolean };

export const readinessWorkstreams = ['quality', 'ict', 'teachers', 'planning'] as const;
export type ReadinessWorkstream = typeof readinessWorkstreams[number];
export const hasReadinessRules = (workstream: string): workstream is ReadinessWorkstream => (readinessWorkstreams as readonly string[]).includes(workstream);

/** Compulsory activities of this component with no budget line yet, in activity order. */
export function missingCompulsory(workstream: string, lines: readonly { activity: number }[]) {
  return (compulsoryActivities[workstream] ?? []).filter(activity => !lines.some(line => line.activity === activity));
}
export const compulsoryNames = (workstream: string, activities: readonly number[]) =>
  activities.map(activity => qualityIctActivityNames[workstream]?.[activity] ?? `Activity ${activity + 1}`);
/** How a line is named in messages: its description, else its own activity name (Others), else the activity. */
const lineName = (workstream: string, line: ReadinessLine) =>
  line.description || line.custom_activity || line.customActivity || qualityIctActivityNames[workstream]?.[line.activity] || `Activity ${line.activity + 1}`;

/** Why this component cannot be sent yet, or null. `setup` lets Teacher Development check that the budget split is set. */
export function componentReadinessProblem(workstream: string, lines: readonly ReadinessLine[], setup: ReadinessSetup, options: ReadinessOptions): string | null {
  const missing = missingCompulsory(workstream, lines);
  if (missing.length) return `Add at least one budget line to each compulsory activity before sending: ${compulsoryNames(workstream, missing).join('; ')}.`;
  if (workstream === 'teachers' && lines.length && setup && setup.ictAllocation == null) return 'Set how much of the shared Teacher Development & ICT budget Teacher Development will use before sending.';
  const noSchools = lines.find(line => hasLineSchools(workstream, line.activity) && !line.schools?.length);
  if (noSchools) return `Choose the schools for “${lineName(workstream, noSchools)}” before sending.`;
  if (!options.documentsRequired) return null;
  // Only the governed documents; optional supporting documents (migration 057) never block a send.
  const noDocument = lines.find(line => requiredLineDocumentLabel(workstream, line.activity) && !line.documents?.length);
  if (noDocument) return `Upload the ${requiredLineDocumentLabel(workstream, noDocument.activity)!.toLowerCase()} for “${lineName(workstream, noDocument)}” before sending.`;
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
  if (setup.tlmAllocation == null) return `Set how much of the shared Infrastructure & TLM budget ${name} will use before sending.`;
  if (pillar === 'infrastructure') return infrastructureSplitProblem(setup, items.reduce((sum, item) => sum + lineKobo(item), BigInt(0)));
  return activityBudgetProblem('tlm', (snapshot.tlm ?? []).map(line => ({ activity: line.activity, kobo: lineKobo(line) })), setup);
}
