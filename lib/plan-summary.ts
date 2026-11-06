import { implementedPillars, type ImplementedPillar, type PillarSummary } from './beap-pillars';
import type { Snapshot } from './plan-review';
import { MONEY_SCALE_NUMBER, lineMinor, minorOfNumber, minorToNaira } from './money';

export type PlanTotals = Record<ImplementedPillar, PillarSummary> & { total: PillarSummary };

type Costed = { quantity: number; unit_cost: string };
type SchoolKey = { name: string; lga: string; level: string };

const schoolKey = (school: SchoolKey) => JSON.stringify([school.name, school.lga, school.level]);
const summarize = (lines: readonly Costed[], schools: readonly string[] = []): PillarSummary => ({
  lineCount: lines.length,
  schoolCount: new Set(schools).size,
  // Minor units (1/10,000 naira, lib/money.ts) keep line totals exact before converting back to naira.
  budget: minorToNaira(lines.reduce((sum, line) => sum + lineMinor(line.unit_cost, line.quantity), BigInt(0))),
});

/**
 * Lines, distinct schools and proposed budget per component, and for the whole plan, from a plan snapshot
 * (current working plan or a saved submission). Schools are matched by name, LGA and level across components.
 */
export function summarizeSnapshot(snapshot: Snapshot): PlanTotals {
  const schools: Record<ImplementedPillar, string[]> = {
    infrastructure: snapshot.infrastructure.map(line => schoolKey(line.school)),
    // Sports: schools allocated equipment, and the PHE training schools (UBEC74).
    sports: [...snapshot.sports.flatMap(line => line.allocations.map(allocation => schoolKey(allocation.school))), ...(snapshot.pheDistribution ?? []).map(schoolKey)],
    tlm: (snapshot.tlmDistribution ?? []).map(schoolKey),
    curriculum: (snapshot.curriculumDistribution ?? []).map(schoolKey),
    gscci: (snapshot.gscciDistribution ?? []).map(schoolKey),
    ict: (snapshot.ict ?? []).flatMap(line => (line.schools ?? []).map(schoolKey)),
    sbmc: [], monitoring: [], quality: [], teachers: [], planning: [],
  };
  const lines: Record<ImplementedPillar, readonly Costed[]> = {
    infrastructure: snapshot.infrastructure, sports: snapshot.sports, sbmc: snapshot.sbmc ?? [], tlm: snapshot.tlm ?? [],
    monitoring: snapshot.monitoring ?? [], gscci: snapshot.gscci ?? [], curriculum: snapshot.curriculum ?? [],
    quality: snapshot.quality ?? [], ict: snapshot.ict ?? [], teachers: snapshot.teachers ?? [], planning: snapshot.planning ?? [],
  };
  const parts = Object.fromEntries(implementedPillars.map(pillar => [pillar, summarize(lines[pillar], schools[pillar])])) as Record<ImplementedPillar, PillarSummary>;
  const total: PillarSummary = {
    lineCount: implementedPillars.reduce((sum, pillar) => sum + parts[pillar].lineCount, 0),
    schoolCount: new Set(implementedPillars.flatMap(pillar => schools[pillar])).size,
    budget: implementedPillars.reduce((sum, pillar) => sum + minorOfNumber(parts[pillar].budget), 0) / MONEY_SCALE_NUMBER,
  };
  return { ...parts, total };
}
