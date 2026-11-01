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

/**
 * UBEC161/163 (client, 1 November 2026): the items bought for schools are shared out across the distribution list by
 * quantity, like Sports allocations, replacing the naira share by enrolment. Each such line gives every school its
 * number of items (activity_line_schools.quantity); together they make up the line's quantity. These activities buy
 * items for schools: TLM Purchase (0) and the TLM item activities (5-22), Curriculum Procurement (0), and Greening
 * pillars 1-6, small animals and safeguards (0-7). Training, distribution, monitoring and Others lines are not shared out.
 */
export const distributedActivities: Record<DistributionWorkstream, readonly number[]> = {
  tlm: [0, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22],
  curriculum: [0],
  gscci: [0, 1, 2, 3, 4, 5, 6, 7],
};
export const isDistributedLine = (workstream: string, activity: number) => hasDistribution(workstream) && distributedActivities[workstream].includes(activity);
type AllocatedLine = { activity: number; quantity: number | string; description?: string; schools?: readonly { id: number; quantity?: number | null }[] };
export const allocatedItems = (line: AllocatedLine) => (line.schools ?? []).reduce((sum, s) => sum + (s.quantity ?? 0), 0);
const itemName = (line: AllocatedLine) => line.description?.trim() ? `“${line.description.trim()}”` : 'an item';
/**
 * Why a component's items are not shared out yet: an item whose schools' quantities do not add up to its quantity, or
 * a school on the list with no items (UBEC163: one item cannot go to several schools). Null when there is nothing to
 * share or the snapshot predates allocations (`withAllocations`, Snapshot.distributionAllocations).
 */
export function distributionAllocationProblem(workstream: string, lines: readonly AllocatedLine[], list: readonly { id: number; name: string }[] | undefined, withAllocations: boolean | undefined): string | null {
  if (!hasDistribution(workstream) || !list || !withAllocations) return null;
  const items = lines.filter(line => isDistributedLine(workstream, line.activity));
  if (!items.length) return null;
  for (const line of items) {
    const shared = allocatedItems(line), quantity = Number(line.quantity);
    if (shared !== quantity) return `Share all ${quantity.toLocaleString('en-NG')} items of ${itemName(line)} across the distribution schools before sending (${shared.toLocaleString('en-NG')} allocated)`;
  }
  const used = new Set(items.flatMap(line => (line.schools ?? []).map(s => s.id)));
  const idle = list.filter(s => !used.has(s.id));
  if (!idle.length) return null;
  return idle.length === 1 ? `${idle[0].name} has no ${distributionNames[workstream]} items allocated. Give it items or remove it from the distribution list before sending`
    : `${idle.length} schools on the ${distributionNames[workstream]} distribution list have no items allocated. Give them items or remove them from the list before sending`;
}
