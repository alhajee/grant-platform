// Dependency-free so pure rule modules (lib/pillar-review.ts) and scripts/test-department-review-rules.mjs can import it.
/** Workstreams with a required school distribution list (stored in tlm_distribution by workstream). */
export const distributionWorkstreams = ['tlm', 'curriculum', 'gscci'] as const;
export type DistributionWorkstream = typeof distributionWorkstreams[number];
export const hasDistribution = (workstream: string): workstream is DistributionWorkstream => (distributionWorkstreams as readonly string[]).includes(workstream);
/** Snapshot field holding each workstream's distribution list. */
export const distributionSnapshotKeys = { tlm: 'tlmDistribution', curriculum: 'curriculumDistribution', gscci: 'gscciDistribution' } as const satisfies Record<DistributionWorkstream, string>;
/** Short names used in distribution messages and sheet labels. */
export const distributionNames: Record<DistributionWorkstream, string> = { tlm: 'TLM', curriculum: 'Curriculum', gscci: 'Greening' };
/** The send-step error when a component's distribution list is empty. */
export const emptyDistributionMessage = (workstream: DistributionWorkstream) => `Add at least one school to the ${distributionNames[workstream]} distribution list before sending it`;

/**
 * UBEC74 (migration 079): Training of PHE Officers lines (Sports, Quiz & Debate) name the schools the training is for, a
 * list like TLM's kept in tlm_distribution with workstream 'phe'. Required while the plan has training lines; snapshots
 * from before the list (no pheDistribution) are not checked.
 */
export const pheTrainingName = 'Training of PHE Officers';
export const isPheTrainingLine = (line: { section: string; activity_type: string }) => line.section === 'equipment' && line.activity_type.trim().toLowerCase() === pheTrainingName.toLowerCase();
export function pheDistributionProblem(snapshot: { sports?: readonly { section: string; activity_type: string }[]; pheDistribution?: readonly unknown[] }): string | null {
  if (snapshot.pheDistribution === undefined) return null;
  return (snapshot.sports ?? []).some(isPheTrainingLine) && !snapshot.pheDistribution.length ? 'Add at least one school to the PHE training distribution list before sending it' : null;
}
