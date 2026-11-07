/** School picker filters shared by the editors: LGA and a search over name, LGA, level and DNEMIS school code */

/** "All" or one LGA */
export type SchoolLgaChoice = string;
export const allLgas: SchoolLgaChoice = 'all';

type Located = { level: string; lga?: string | null };
type Searchable = Located & { name: string; code?: string | null };

/** The schools in the chosen LGA ("all" keeps every school) */
export function filterByLga<T extends Located>(schools: readonly T[], lga: SchoolLgaChoice): T[] {
  return lga === allLgas ? [...schools] : schools.filter(school => (school.lga ?? '') === lga);
}

/** The schools of the chosen level ("all" keeps every level) and LGA */
export function filterSchools<T extends Located>(schools: readonly T[], level: string, lga: SchoolLgaChoice = allLgas): T[] {
  return filterByLga(level === 'all' ? schools : schools.filter(school => school.level === level), lga);
}

/** True when every word of the search is in the school's name, LGA, level or DNEMIS school code */
export function schoolMatches(school: Searchable, query: string): boolean {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const text = `${school.name} ${school.lga ?? ''} ${school.level} ${school.code ?? ''}`.toLowerCase();
  return words.every(word => text.includes(word));
}

/** The LGAs present in a school list, alphabetically */
export function lgasIn(schools: readonly Located[]): string[] {
  return [...new Set(schools.map(school => school.lga ?? '').filter(Boolean))].sort((a, b) => a.localeCompare(b));
}
