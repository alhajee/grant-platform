import type { Snapshot } from './plan-review';

/**
 * UBEC234 (6 November 2026): every school a plan touches, with what touches it, for the "N schools" lists on the plan
 * page and the SUBEB dashboard. Built from a (visible) snapshot with the same rule as the school totals in
 * lib/plan-summary.ts, so the list always matches the count: Infrastructure packages ("Schools intervened"), and the
 * TLM, Curriculum and Greening distribution lists, ICT line schools, Sports allocations and PHE training schools
 * ("Beneficiary schools"). Schools are matched by name, LGA and level, as in the totals.
 */
export type PlanSchoolUse = { kind: 'intervened' | 'beneficiary'; label: string };
export type PlanSchool = { key: string; name: string; lga: string; level: string; uses: PlanSchoolUse[]; intervened: boolean };
type SchoolLike = { name: string; lga: string; level: string };

const keyOf = (school: SchoolLike) => JSON.stringify([school.name, school.lga, school.level]);
const levelOrder = ['ECCDE', 'Primary', 'JSS', 'SSS'];
const levelRank = (level: string) => { const index = levelOrder.indexOf(level); return index < 0 ? levelOrder.length : index; };

/** The plan's schools, intervened first, then by name; each use listed once. */
export function planSchools(snapshot: Snapshot): PlanSchool[] {
  const schools = new Map<string, PlanSchool>();
  const add = (school: SchoolLike | null | undefined, use: PlanSchoolUse) => {
    if (!school?.name) return;
    const key = keyOf(school), found = schools.get(key);
    if (!found) { schools.set(key, { key, name: school.name, lga: school.lga ?? '', level: school.level ?? '', uses: [use], intervened: use.kind === 'intervened' }); return; }
    if (found.uses.some(u => u.kind === use.kind && u.label === use.label)) return;
    schools.set(key, { ...found, uses: [...found.uses, use], intervened: found.intervened || use.kind === 'intervened' });
  };
  for (const line of snapshot.infrastructure) add(line.school, { kind: 'intervened', label: `Infrastructure · ${line.construction?.name || 'Package'}` });
  for (const school of snapshot.tlmDistribution ?? []) add(school, { kind: 'beneficiary', label: 'TLM distribution' });
  for (const school of snapshot.curriculumDistribution ?? []) add(school, { kind: 'beneficiary', label: 'Curriculum distribution' });
  for (const school of snapshot.gscciDistribution ?? []) add(school, { kind: 'beneficiary', label: 'Greening distribution' });
  for (const line of snapshot.ict ?? []) for (const school of line.schools ?? []) add(school, { kind: 'beneficiary', label: 'ICT item' });
  for (const line of snapshot.sports) for (const allocation of line.allocations) add(allocation.school, { kind: 'beneficiary', label: 'Sports allocation' });
  for (const school of snapshot.pheDistribution ?? []) add(school, { kind: 'beneficiary', label: 'PHE training' });
  return [...schools.values()].sort((a, b) => Number(b.intervened) - Number(a.intervened) || a.name.localeCompare(b.name) || levelRank(a.level) - levelRank(b.level));
}

/** Several plans' schools in one list (dashboard): a school in more than one plan is listed once with every use. */
export function mergePlanSchools(lists: readonly (readonly PlanSchool[])[]): PlanSchool[] {
  const merged = new Map<string, PlanSchool>();
  for (const school of lists.flat()) {
    const found = merged.get(school.key);
    if (!found) { merged.set(school.key, school); continue; }
    const uses = [...found.uses, ...school.uses.filter(use => !found.uses.some(u => u.kind === use.kind && u.label === use.label))];
    merged.set(school.key, { ...found, uses, intervened: found.intervened || school.intervened });
  }
  return [...merged.values()].sort((a, b) => Number(b.intervened) - Number(a.intervened) || a.name.localeCompare(b.name) || levelRank(a.level) - levelRank(b.level));
}

/** CSV of the list (name, LGA, level, group, uses), quoted where needed. */
export function planSchoolsCsv(schools: readonly PlanSchool[]): string {
  const cell = (value: string) => /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
  const rows = schools.map(s => [s.name, s.lga, s.level, s.intervened ? 'Intervened' : 'Beneficiary', s.uses.map(u => u.label).join('; ')].map(cell).join(','));
  return ['School,LGA,Level,Group,Interventions', ...rows].join('\n');
}
