import { textbookClasses, type DistributionSchool } from './activity-plans.ts';

// Textbooks are one per learner of the chosen classes, from DNEMIS (UBEC88, client 25 October 2026); a quantity above
// those learners is warned about, not refused (UBEC73, 24 October 2026).
type TextbookClass = typeof textbookClasses[number];
const classKeys: Record<TextbookClass, string> = { ECCDE: 'ECCDE', 'Primary 1': 'P1', 'Primary 2': 'P2', 'Primary 3': 'P3', 'Primary 4': 'P4', 'Primary 5': 'P5', 'Primary 6': 'P6', 'JSS 1': 'JSS1', 'JSS 2': 'JSS2', 'JSS 3': 'JSS3' };

/** One textbook per learner (UBEC88): each distribution school's DNEMIS learners in the chosen classes, largest first (schools with none left out). */
export function textbookAllocation(classes: readonly string[], schools: readonly DistributionSchool[]): { school: DistributionSchool; learners: number }[] {
  return schools.map(school => ({ school, learners: textbookLearners(classes, [school]) })).filter(row => row.learners > 0).sort((a, b) => b.learners - a.learners || a.school.name.localeCompare(b.school.name));
}

/** DNEMIS learners in the chosen classes across the distribution schools (schools without class figures add none). */
export function textbookLearners(classes: readonly string[], schools: readonly DistributionSchool[]): number {
  const keys = classes.map(c => classKeys[c as TextbookClass]).filter(Boolean);
  return schools.reduce((sum, school) => sum + keys.reduce((n, key) => {
    const row = school.enrolmentByClass?.[key];
    return n + Math.max(0, row?.male ?? 0) + Math.max(0, row?.female ?? 0);
  }, 0), 0);
}

/** The warning for a textbook quantity above those learners, or null (also when there are no class figures to compare with). */
export function textbookQuantityWarning(quantity: number, classes: readonly string[], schools: readonly DistributionSchool[]): string | null {
  const learners = textbookLearners(classes, schools);
  if (!learners || !(quantity > learners)) return null;
  const count = new Intl.NumberFormat('en-NG');
  return `${count.format(quantity)} textbooks is more than the ${count.format(learners)} learners in the chosen classes across the ${count.format(schools.length)} distribution school${schools.length === 1 ? '' : 's'} (DNEMIS figures). You can still save it`;
}
