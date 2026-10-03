import { compulsoryActivities, hasLineSchools, lineDocumentLabel, qualityIctActivityNames } from './activity-extras';

// What must be in place before a Quality Assurance, ICT or Teacher Development component can be sent on
// (migrations 038 and 040): every compulsory activity has a line, every line that needs schools has some, every
// line that needs a document has one, and Teacher Development has its share of the shared budget set.
// Shared by the editor, the plan page and every send step on the server.
type ReadinessLine = { id: number; activity: number; description: string; custom_activity?: string; customActivity?: string; schools?: readonly unknown[]; documents?: readonly unknown[] };
/** The plan setup fields readiness reads (a snapshot's setup or an ActionPlan). */
type ReadinessSetup = { ictAllocation?: string | null } | null | undefined;

export const readinessWorkstreams = ['quality', 'ict', 'teachers'] as const;
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
export function componentReadinessProblem(workstream: string, lines: readonly ReadinessLine[], setup?: ReadinessSetup): string | null {
  const missing = missingCompulsory(workstream, lines);
  if (missing.length) return `Add at least one budget line to each compulsory activity before sending: ${compulsoryNames(workstream, missing).join('; ')}.`;
  if (workstream === 'teachers' && lines.length && setup && setup.ictAllocation == null) return 'Set how much of the shared Teacher Development & ICT budget Teacher Development will use before sending.';
  const noSchools = lines.find(line => hasLineSchools(workstream, line.activity) && !line.schools?.length);
  if (noSchools) return `Choose the schools for “${lineName(workstream, noSchools)}” before sending.`;
  const noDocument = lines.find(line => lineDocumentLabel(workstream, line.activity) && !line.documents?.length);
  if (noDocument) return `Upload the ${lineDocumentLabel(workstream, noDocument.activity)!.toLowerCase()} for “${lineName(workstream, noDocument)}” before sending.`;
  return null;
}
