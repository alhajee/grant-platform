import { compulsoryActivities, hasLineSchools, lineDocumentLabel, qualityIctActivityNames } from './activity-extras';

// What must be in place before a Quality Assurance or ICT component can be sent on (migration 038):
// every compulsory activity has a line, every line that needs schools has some, and every line that needs a
// document has one. Shared by the editor, the plan page and every send step on the server.
type ReadinessLine = { id: number; activity: number; description: string; schools?: readonly unknown[]; documents?: readonly unknown[] };

/** Compulsory activities of this component with no budget line yet, in activity order. */
export function missingCompulsory(workstream: string, lines: readonly { activity: number }[]) {
  return (compulsoryActivities[workstream] ?? []).filter(activity => !lines.some(line => line.activity === activity));
}
export const compulsoryNames = (workstream: string, activities: readonly number[]) =>
  activities.map(activity => qualityIctActivityNames[workstream]?.[activity] ?? `Activity ${activity + 1}`);

/** Why this component cannot be sent yet, or null. */
export function componentReadinessProblem(workstream: string, lines: readonly ReadinessLine[]): string | null {
  const missing = missingCompulsory(workstream, lines);
  if (missing.length) return `Add at least one budget line to each compulsory activity before sending: ${compulsoryNames(workstream, missing).join('; ')}.`;
  const noSchools = lines.find(line => hasLineSchools(workstream, line.activity) && !line.schools?.length);
  if (noSchools) return `Choose the schools for “${noSchools.description}” before sending.`;
  const noDocument = lines.find(line => lineDocumentLabel(workstream, line.activity) && !line.documents?.length);
  if (noDocument) return `Upload the ${lineDocumentLabel(workstream, noDocument.activity)!.toLowerCase()} for “${noDocument.description}” before sending.`;
  return null;
}
export const hasReadinessRules = (workstream: string): workstream is 'quality' | 'ict' => workstream === 'quality' || workstream === 'ict';
