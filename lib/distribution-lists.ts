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
export const emptyDistributionMessage = (workstream: DistributionWorkstream) => `Add at least one school to the ${distributionNames[workstream]} distribution list before sending it.`;
