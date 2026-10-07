// Maps DNEMIS (DHIS2) school census data to school register records. Pure functions only: lib/dnemis-sync.ts does
// the fetching and writing. Data elements are recognised by their names, so a new element id for the same question
// (DNEMIS has renamed category combos before) keeps working.
import type { ClassEnrolment, SchoolClassKey, SchoolFacilities, SchoolTeachers, UsableCount } from './school-register';

/** Yearly census datasets: Pre-primary & Primary, and Junior Secondary. */
export const censusForms = { primary: 'MLTLNUmvS8r', jss: 'uSw8GwPO417' } as const;
export type CensusForm = keyof typeof censusForms;

export type DhisOrgUnit = {
  id: string; code?: string; name: string; closedDate?: string;
  parent?: { name?: string; parent?: { name?: string } };
  organisationUnitGroups?: { id: string }[]; dataSets?: { id: string }[];
};
export type DhisDataValue = { dataElement: string; orgUnit: string; categoryOptionCombo?: string; value?: string };

export type ElementRole =
  | 'enrolEccde' | 'enrolPrimary' | 'enrolJss' | 'classrooms' | 'toilets' | 'waterPoints' | 'handWashing'
  | 'classroomsTotal' | 'classesOutside' | 'securityGuard' | 'waterSource' | 'power' | 'fence' | 'healthFacility'
  | 'location' | 'levelsOffered' | 'jssLevelsOffered' | 'teachers';

const rolePatterns: [ElementRole, RegExp][] = [
  ['enrolEccde', /^prp_c\.3 pre-primary enrolment/],
  ['enrolPrimary', /^prp_c\.5 primary enrolment/],
  ['enrolJss', /^jss_c\.3_? ?junior secondary enrolment/],
  ['classrooms', /^f\.2 facilities available_classrooms/],
  ['toilets', /^f\.2 facilities available_toilets/],
  ['waterPoints', /^f\.2 facilities available_water source/],
  ['handWashing', /^f\.2 facilities available_wash hand/],
  ['classroomsTotal', /^e\.1 how many classrooms/],
  ['classesOutside', /^e\.2 are any classes held outside/],
  ['securityGuard', /^b\.19 security guard/],
  ['waterSource', /^f\.1 source of safe drinking water$/],
  ['power', /^f\.5 sources of power$/],
  ['fence', /^f\.7 fence\/wall:/],
  ['healthFacility', /^f\.6 health facility$/],
  ['location', /^b\.2 location$/],
  ['levelsOffered', /^b\.3c prp levels of education offered/],
  ['jssLevelsOffered', /^b\.3a jss_? ?levels of education offered/],
  ['teachers', /^d\.2 how many teachers/],
];

export function elementRole(name: string): ElementRole | null {
  const text = name.trim().toLowerCase().replace(/\s+/g, ' ');
  return rolePatterns.find(([, pattern]) => pattern.test(text))?.[0] ?? null;
}

const titleCase = (text: string) => text.toLowerCase().replace(/(^|[\s(/-])([a-z])/g, (_, lead: string, letter: string) => lead + letter.toUpperCase());
/** Title-cases names written all in capitals or all in lower case; mixed-case names are kept as DNEMIS spells them. */
const tidyCase = (text: string) => (text === text.toUpperCase() || text === text.toLowerCase()) && /[a-z]/i.test(text) ? titleCase(text) : text;
const collapse = (text: string) => text.replace(/\s+/g, ' ').trim();

/** "PRY Abakire Primary School (1350510001)" -> "Abakire Primary School". */
export function cleanSchoolName(name: string) {
  const text = collapse(name).replace(/^(?:PRY|PRP|JSS|ECCDE|ECCD|IQS|IQTE|PVT|SSS|TVET)\s+/, '').replace(/\s*\([A-Z0-9]{6,}\)$/, '');
  return tidyCase(collapse(text)) || collapse(name);
}

/** "yo Fune LGA" -> "Fune", "yo Katuzu Ward" -> "Katuzu". DNEMIS prefixes names with the state's two-letter code. */
export function cleanAreaName(name: string | undefined, kind: 'LGA' | 'Ward') {
  const suffix = kind === 'LGA' ? /\s+(?:L\.?G\.?A\.?|Local Government Area)$/i : /\s+Ward$/i;
  return tidyCase(collapse(collapse(name ?? '').replace(/^[a-z]{2}\s+/, '').replace(suffix, '')));
}

/** The DNEMIS state prefix ("yo Yobe State" -> "YO"), which matches the portal's state codes. */
export const statePrefix = (name: string) => collapse(name).split(' ')[0]?.toUpperCase() ?? '';

/** "PRY3, Female" -> P3/female; "JS1, Male" -> JSS1/male; "Nursery 2, Female" -> ECCDE/female. */
export function classFromCombo(combo: string): { key: SchoolClassKey; sex: 'male' | 'female' } | null {
  const sex = /\bfemale\b/i.test(combo) ? 'female' : /\bmale\b/i.test(combo) ? 'male' : null;
  if (!sex) return null;
  const primary = /\bPRY\s*([1-6])\b/i.exec(combo), jss = /\bJSS?\s*([1-3])\b/i.exec(combo);
  if (primary) return { key: `P${primary[1]}` as SchoolClassKey, sex };
  if (jss) return { key: `JSS${jss[1]}` as SchoolClassKey, sex };
  if (/nursery|kindergarten|eccd|pre-?primary/i.test(combo)) return { key: 'ECCDE', sex };
  return null;
}

const count = (value: string | undefined) => {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.round(number) : null;
};
const yesNo = (value: string | undefined) => {
  const text = (value ?? '').trim().toLowerCase();
  return ['true', 'yes', '1'].includes(text) ? true : ['false', 'no', '0'].includes(text) ? false : undefined;
};
const fenceLabels: Record<string, string> = { '1': 'Good condition', '2': 'Needs minor repair', '3': 'Needs major repair', '4': 'No fence or wall' };
const optionText = (role: ElementRole, value: string | undefined) => {
  const text = collapse(value ?? '');
  if (!text) return undefined;
  if (role === 'fence') return fenceLabels[text.match(/^\d/)?.[0] ?? ''] ?? text.slice(0, 60);
  if (/^no\b/i.test(text) || /^none$/i.test(text)) return 'None';
  return text.slice(0, 60);
};

export type SchoolCensus = {
  enrolment: ClassEnrolment; male: number; female: number; hasEnrolment: boolean;
  facilities: SchoolFacilities | null; teachers: SchoolTeachers | null;
  location: 'Urban' | 'Rural' | null; preprimaryOnly: boolean;
  /** Levels named by the "levels of education offered" answer (B.3c primary form, B.3a JSS form). */
  levelsAnswered: SchoolLevel[];
};

/** Sums one school's census values: enrolment by class and sex across the age rows, plus facilities and teachers. */
export function summariseCensus(values: DhisDataValue[], roles: ReadonlyMap<string, ElementRole>, combos: ReadonlyMap<string, string>): SchoolCensus {
  const enrolment: Partial<Record<SchoolClassKey, { male: number; female: number }>> = {};
  const usable: Partial<Record<'classrooms' | 'toilets' | 'waterPoints' | 'handWashing', UsableCount>> = {};
  const facilities: SchoolFacilities = {};
  let teachers: SchoolTeachers | null = null, location: SchoolCensus['location'] = null, preprimaryOnly = false;
  let levelsAnswered: SchoolLevel[] = [];
  for (const item of values) {
    const role = roles.get(item.dataElement);
    if (!role) continue;
    const combo = combos.get(item.categoryOptionCombo ?? '') ?? '';
    if (role === 'enrolEccde' || role === 'enrolPrimary' || role === 'enrolJss') {
      const target = classFromCombo(combo), learners = count(item.value);
      if (!target || learners === null) continue;
      const key = role === 'enrolEccde' ? 'ECCDE' : target.key;
      const current = enrolment[key] ?? { male: 0, female: 0 };
      enrolment[key] = { ...current, [target.sex]: current[target.sex] + learners };
    } else if (role === 'classrooms' || role === 'toilets' || role === 'waterPoints' || role === 'handWashing') {
      const amount = count(item.value), side = /not\s+use?able/i.test(combo) ? 'unusable' : /use?able/i.test(combo) ? 'usable' : null;
      if (amount === null || !side) continue;
      const current = usable[role] ?? { usable: 0, unusable: 0 };
      usable[role] = { ...current, [side]: current[side] + amount };
    } else if (role === 'teachers') {
      const amount = count(item.value), sex = /female/i.test(combo) ? 'female' : /male/i.test(combo) ? 'male' : null;
      if (amount === null || !sex) continue;
      const current: SchoolTeachers = teachers ?? { male: 0, female: 0 };
      teachers = { ...current, [sex]: current[sex] + amount };
    } else if (role === 'classroomsTotal') {
      const amount = count(item.value);
      if (amount !== null) facilities.classroomsTotal = amount;
    } else if (role === 'classesOutside' || role === 'securityGuard') {
      const answer = yesNo(item.value);
      if (answer !== undefined) facilities[role] = answer;
    } else if (role === 'waterSource' || role === 'power' || role === 'fence' || role === 'healthFacility') {
      const answer = optionText(role, item.value);
      if (answer) facilities[role] = answer;
    } else if (role === 'location') {
      const text = (item.value ?? '').trim().toLowerCase();
      location = text === '1' || text === 'urban' ? 'Urban' : text === '2' || text === 'rural' ? 'Rural' : location;
    } else if (role === 'levelsOffered') {
      const text = (item.value ?? '').trim().toLowerCase();
      preprimaryOnly = /^pre-?primary only$/.test(text);
      levelsAnswered = [...(/pre-?primary/.test(text) ? ['ECCDE' as const] : []), ...(/(^|\band )primary/.test(text) ? ['Primary' as const] : [])];
    } else if (role === 'jssLevelsOffered') {
      levelsAnswered = /senior/i.test(item.value ?? '') ? ['JSS', 'SSS'] : [];
    }
  }
  const ordered: ClassEnrolment = Object.fromEntries((['ECCDE', 'P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'JSS1', 'JSS2', 'JSS3'] as const)
    .filter(key => enrolment[key]).map(key => [key, enrolment[key]]));
  const totals = Object.values(ordered).reduce((sum, item) => ({ male: sum.male + (item?.male ?? 0), female: sum.female + (item?.female ?? 0) }), { male: 0, female: 0 });
  const allFacilities = { ...usable, ...facilities };
  return {
    enrolment: ordered, ...totals, hasEnrolment: Object.keys(ordered).length > 0,
    facilities: Object.keys(allFacilities).length ? allFacilities : null, teachers, location, preprimaryOnly, levelsAnswered,
  };
}

export type SchoolLevel = 'ECCDE' | 'Primary' | 'JSS' | 'SSS';
const levelOrder: readonly SchoolLevel[] = ['ECCDE', 'Primary', 'JSS', 'SSS'];
const orderedLevels = (levels: Iterable<SchoolLevel>) => { const set = new Set(levels); return levelOrder.filter(level => set.has(level)); };

export type SyncedSchool = {
  dnemisId: string; schoolCode: string | null; name: string; lga: string; ward: string; level: 'ECCDE' | 'Primary' | 'JSS';
  /** Every level the school offers, its main level included (schools.levels_offered). */
  levels: SchoolLevel[];
  location: 'Urban' | 'Rural' | null; male: number; female: number; enrolment: ClassEnrolment;
  facilities: SchoolFacilities | null; teachers: SchoolTeachers | null; year: number | null;
};

/**
 * One register record for a DNEMIS school. Level: the JSS form gives JSS; the primary form gives Primary, or ECCDE
 * when the school offers pre-primary only (or has pre-primary learners and no primary classes). Pre-primary learners
 * of a primary school are its ECCDE enrolment. Location comes from the Rural/Urban group, else the form's B.2 answer.
 */
export function toSyncedSchool(unit: DhisOrgUnit, form: CensusForm, census: SchoolCensus | null, year: number | null, groupLocation: 'Urban' | 'Rural' | null): SyncedSchool {
  const classes = Object.keys(census?.enrolment ?? {});
  const eccdeOnly = Boolean(census && (census.preprimaryOnly || (classes.includes('ECCDE') && !classes.some(key => key.startsWith('P')))));
  const code = (unit.code ?? '').trim().toUpperCase();
  const level = form === 'jss' ? 'JSS' : eccdeOnly ? 'ECCDE' : 'Primary';
  const taught: SchoolLevel[] = [...(classes.includes('ECCDE') ? ['ECCDE' as const] : []), ...(classes.some(key => /^P\d/.test(key)) ? ['Primary' as const] : []),
    ...(classes.some(key => key.startsWith('JSS')) ? ['JSS' as const] : [])];
  return {
    dnemisId: unit.id, schoolCode: /^[A-Z0-9][A-Z0-9/_.-]*$/.test(code) && code.length <= 40 ? code : null,
    name: cleanSchoolName(unit.name).slice(0, 200), lga: cleanAreaName(unit.parent?.parent?.name, 'LGA').slice(0, 80),
    ward: cleanAreaName(unit.parent?.name, 'Ward').slice(0, 120),
    level, levels: orderedLevels([level, ...taught, ...(census?.levelsAnswered ?? [])]),
    location: groupLocation ?? census?.location ?? null,
    male: census?.male ?? 0, female: census?.female ?? 0, enrolment: census?.enrolment ?? {},
    facilities: census?.facilities ?? null, teachers: census?.teachers ?? null, year,
  };
}

/**
 * DNEMIS keeps the primary and JSS sections of one school as separate records (different codes) with the same name
 * in the same ward. Each record gets the levels of all of them, so the register shows every level the school offers.
 */
export function mergeSectionLevels(records: SyncedSchool[]): SyncedSchool[] {
  const key = (record: SyncedSchool) => [record.name, record.lga, record.ward].map(value => collapse(value).toLowerCase()).join('|');
  const levels = new Map<string, SchoolLevel[]>();
  for (const record of records) levels.set(key(record), [...(levels.get(key(record)) ?? []), ...record.levels]);
  return records.map(record => ({ ...record, levels: orderedLevels(levels.get(key(record)) ?? record.levels) }));
}
