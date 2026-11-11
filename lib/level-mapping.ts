import type { Snapshot } from './plan-review';
import { isDistributedLine, isPheTrainingLine } from './distribution-lists.ts';
import { MONEY_SCALE_NUMBER, lineMinor, minorOfNumber } from './money.ts';
import { isEccdeItem } from './infrastructure-deliverables.ts';

// Resource mapping by school level (UBEC127, client 26 October 2026): how much of a plan's proposed budget goes to ECCDE,
// Primary and JSS, and how much is not school-specific (training, census, equipment, SUBEB activities…). Shown on the plan
// page and on the SUBEB and UBEC dashboards. Each line's amount is shared out, in whole minor units (1/10,000 naira, lib/money.ts), by what the line says:
//   Infrastructure      items plainly for ECCDE (ECCDE classrooms and blocks, ECCDE furniture, play equipment, kindergarten
//                       beds) as ECCDE; classrooms, their furniture and toilets (or a lump-sum New Construction package) by
//                       the levels its target groups name, split by the school's enrolment (UBEC254), else the school's
//                       level; the shared parts (fence, water, power, VAT…) by the school's level;
//   Sports              each allocation's school level by quantity allocated (the unallocated rest: not school-specific);
//   lines with schools  evenly across the chosen schools' levels (ICT and any other line that names schools);
//   Textbooks (TLM)     by the classes chosen (Primary 1-6 → Primary, JSS 1-3 → JSS);
//   Teacher Development evenly across the school levels chosen (SUBEB → not school-specific);
//   TLM, Curriculum and Greening items shared out to schools otherwise follow their distribution list, by the number of
//                       schools at each level (UBEC245: their other items follow target groups, else Others);
//   everything else     not school-specific.

export const schoolLevelKeys = ['eccde', 'primary', 'jss', 'none'] as const;
export type SchoolLevelKey = typeof schoolLevelKeys[number];
export const schoolLevelLabels: Record<SchoolLevelKey, string> = { eccde: 'ECCDE', primary: 'Primary', jss: 'JSS', none: 'Others' }; // UBEC153: "Not school-specific" is shown as Others
/** Naira per level, with the plan total. */
export type LevelMapping = Record<SchoolLevelKey, number> & { total: number };
type Weights = Partial<Record<SchoolLevelKey, number>>;

/** ECCDE / Primary / JSS from a school level or class name; anything else (SSS, SUBEB, blank) is not school-specific. */
export function levelOf(value: string | null | undefined): SchoolLevelKey {
  const text = String(value ?? '').trim().toLowerCase();
  if (text.startsWith('eccde') || text.startsWith('pre-primary') || text.startsWith('nursery')) return 'eccde';
  if (text.startsWith('primary') || /^p[1-6]$/.test(text)) return 'primary';
  if (text.startsWith('jss') || text.startsWith('js')) return 'jss';
  return 'none';
}
const count = (levels: readonly string[]): Weights => levels.reduce<Weights>((weights, level) => { const key = levelOf(level); return { ...weights, [key]: (weights[key] ?? 0) + 1 }; }, {});

/** Shares `minor` by `weights` in whole minor units; the remainder goes to the largest weight so the parts add up exactly. */
function share(minor: number, weights: Weights): Record<SchoolLevelKey, number> {
  const parts = { eccde: 0, primary: 0, jss: 0, none: 0 };
  const entries = schoolLevelKeys.map(key => [key, weights[key] ?? 0] as const).filter(([, weight]) => weight > 0);
  const whole = entries.reduce((sum, [, weight]) => sum + weight, 0);
  if (!whole) return { ...parts, none: minor };
  let given = 0;
  for (const [key, weight] of entries) { const part = Math.floor(minor * weight / whole); parts[key] = part; given += part; }
  const largest = entries.reduce((best, entry) => entry[1] > best[1] ? entry : best)[0];
  return { ...parts, [largest]: parts[largest] + minor - given };
}
/**
 * UBEC231: a line with no schools, classes or distribution list follows its target groups when they name a school level
 * ("ECCDE Learners", "ECCDE Learners and Teachers" → ECCDE; Primary and JSS the same), evenly across those levels;
 * other groups (Schools, Teachers, State level…) say nothing about the level, so such lines stay not school-specific.
 */
export function targetGroupWeights(targetGroup: string | null | undefined): Weights {
  return count(String(targetGroup ?? '').split(',').map(group => group.trim()).filter(group => levelOf(group) !== 'none'));
}
/** The components made of activity lines (every component but Infrastructure and Sports). */
const activityComponents = ['sbmc', 'tlm', 'monitoring', 'gscci', 'curriculum', 'quality', 'ict', 'teachers', 'planning'] as const;
const minorOf = (line: { quantity: number; unit_cost: string }) => Number(lineMinor(line.unit_cost, line.quantity));

/** Infrastructure items built for one level's learners: classrooms and classroom blocks, their furniture and toilets. */
const learnerItemKeys = new Set(['classroomPri', 'toilet', 'dualDesk', 'magneticBoard', 'teachersFurniture', 'classBlock6', 'classBlock9', 'block3os', 'block6os', 'block9os']);
const isLearnerItem = (key: string) => learnerItemKeys.has(key.replace(/-(renovate|construct)$/, '')) || /^block-(construct|renovate)-/.test(key);
type PackageSchool = { level?: string; enrolmentByClass?: Record<string, { male?: number; female?: number } | null> | null };
/** The school's ECCDE, Primary and JSS learners (DNEMIS enrolment by class). */
function enrolmentByLevel(school: PackageSchool | undefined): Weights {
  const learners: Weights = {};
  for (const [key, value] of Object.entries(school?.enrolmentByClass ?? {})) {
    const level: SchoolLevelKey | null = key.startsWith('ECCDE') ? 'eccde' : key.startsWith('JSS') ? 'jss' : /^P\d/.test(key) ? 'primary' : null;
    if (level) learners[level] = (learners[level] ?? 0) + (Number(value?.male) || 0) + (Number(value?.female) || 0);
  }
  return learners;
}
/** The levels the target groups name, weighed by the school's learners at those levels (evenly when it has none there). */
function namedLevelWeights(targetGroup: string | null | undefined, school: PackageSchool | undefined): Weights | null {
  const named = Object.keys(targetGroupWeights(targetGroup)) as SchoolLevelKey[];
  if (!named.length) return null;
  const learners = enrolmentByLevel(school);
  const weighed = Object.fromEntries(named.map(level => [level, learners[level] ?? 0])) as Weights;
  return Object.values(weighed).some(n => (n ?? 0) > 0) ? weighed : Object.fromEntries(named.map(level => [level, 1]));
}
/**
 * UBEC254 (client answers, 11 November 2026): one Infrastructure package by level.
 *   - items plainly for ECCDE count as ECCDE by their own amounts (never more than the package);
 *   - items built for one level's learners (classrooms and blocks, their furniture, toilets) follow the levels the package's
 *     target groups name, split by the school's enrolment at those levels (evenly without enrolment), else the school's level;
 *   - the shared parts of the package (fence, gate house, water, power, other facilities, VAT) follow the school's level.
 * A lump-sum New Construction package has no per-item amounts, so all of it follows the target groups (else the school's level).
 */
function infrastructureLevels(line: Snapshot['infrastructure'][number]): Record<SchoolLevelKey, number> {
  const minor = minorOf(line), school = (line.package?.school ?? line.school) as PackageSchool | undefined;
  const items = line.package?.result?.items ?? [];
  const own = { [levelOf(line.school?.level)]: 1 } as Weights, named = namedLevelWeights(line.target_group, school) ?? own;
  const costed = items.filter(item => item.key !== 'package' && (Number(item.total) || 0) > 0);
  if (line.package?.kind === 'new' && !costed.length) return share(minor, named);
  const amount = (keep: (item: typeof items[number]) => boolean) => items.filter(keep).reduce((sum, item) => sum + minorOfNumber(Number(item.total) || 0), 0);
  const eccde = Math.min(minor, amount(isEccdeItem));
  const learners = Math.min(minor - eccde, amount(item => !isEccdeItem(item) && isLearnerItem(item.key)));
  const parts = [share(learners, named), share(minor - eccde - learners, own)];
  return Object.fromEntries(schoolLevelKeys.map(key => [key, parts[0][key] + parts[1][key] + (key === 'eccde' ? eccde : 0)])) as Record<SchoolLevelKey, number>;
}
/** The plan's proposed budget by school level, from a snapshot (or the part of one the viewer may see). */
export function levelMapping(snapshot: Snapshot): LevelMapping {
  const totals = { eccde: 0, primary: 0, jss: 0, none: 0 };
  const add = (parts: Record<SchoolLevelKey, number>) => { for (const key of schoolLevelKeys) totals[key] += parts[key]; };
  for (const line of snapshot.infrastructure ?? []) add(infrastructureLevels(line));
  for (const line of snapshot.sports ?? []) {
    const minor = minorOf(line), allocated = (line.allocations ?? []).reduce((sum, a) => sum + Number(a.quantity), 0);
    const weights = (line.allocations ?? []).reduce<Weights>((w, a) => { const key = levelOf(a.school?.level); return { ...w, [key]: (w[key] ?? 0) + Number(a.quantity) }; }, {});
    // UBEC74: PHE officer training is shared across the levels of its training schools.
    if (isPheTrainingLine(line) && snapshot.pheDistribution?.length) { add(share(minor, count(snapshot.pheDistribution.map(s => s.level)))); continue; }
    // Equipment not yet allocated to schools stays not school-specific.
    const unallocated = Math.max(Number(line.quantity) - allocated, 0);
    add(share(minor, unallocated > 0 ? { ...weights, none: (weights.none ?? 0) + unallocated } : weights));
  }
  const distribution: Partial<Record<string, readonly { level: string }[] | undefined>> = { tlm: snapshot.tlmDistribution, curriculum: snapshot.curriculumDistribution, gscci: snapshot.gscciDistribution };
  for (const pillar of activityComponents) {
    for (const line of snapshot[pillar] ?? []) {
      const minor = minorOf(line);
      // UBEC160: items allocated per school weigh by their quantity; otherwise each school counts once.
      if (line.schools?.some(s => s.quantity)) add(share(minor, line.schools.reduce<Weights>((w, s) => { const key = levelOf(s.level); return { ...w, [key]: (w[key] ?? 0) + (s.quantity ?? 0) }; }, {})));
      else if (line.schools?.length) add(share(minor, count(line.schools.map(s => s.level))));
      else if (line.textbook_classes?.length) add(share(minor, count(line.textbook_classes)));
      else if (pillar === 'teachers' && line.school_levels?.length) add(share(minor, count(line.school_levels)));
      // UBEC245: only items shared out to schools follow the distribution list; the rest (training, monitoring, Greening
      // communities…) follow their target groups, else Others.
      else if (isDistributedLine(pillar, line.activity) && distribution[pillar]?.length) add(share(minor, count(distribution[pillar]!.map(s => s.level))));
      else add(share(minor, targetGroupWeights(line.target_group)));
    }
  }
  const naira = Object.fromEntries(schoolLevelKeys.map(key => [key, totals[key] / MONEY_SCALE_NUMBER])) as Record<SchoolLevelKey, number>;
  return { ...naira, total: schoolLevelKeys.reduce((sum, key) => sum + totals[key], 0) / MONEY_SCALE_NUMBER };
}

/** Adds several mappings (dashboards: every plan shown). */
export function sumMappings(mappings: readonly LevelMapping[]): LevelMapping {
  const minor = (key: SchoolLevelKey | 'total') => mappings.reduce((sum, m) => sum + minorOfNumber(m[key]), 0) / MONEY_SCALE_NUMBER;
  return { eccde: minor('eccde'), primary: minor('primary'), jss: minor('jss'), none: minor('none'), total: minor('total') };
}
