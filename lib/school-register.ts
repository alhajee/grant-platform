import { z } from 'zod';

// Shared by the School register page, the plan-creation "new schools" step and /api/schools.
// Public pre-primary, primary and JSS schools come from DNEMIS (lib/dnemis-sync.ts, `dnemis: true`); managers can
// still add and edit schools by hand. The sync overwrites the DNEMIS fields of DNEMIS schools and never touches the rest.

export const schoolClasses = [
  { key: 'ECCDE', label: 'ECCDE' },
  { key: 'P1', label: 'Primary 1' }, { key: 'P2', label: 'Primary 2' }, { key: 'P3', label: 'Primary 3' },
  { key: 'P4', label: 'Primary 4' }, { key: 'P5', label: 'Primary 5' }, { key: 'P6', label: 'Primary 6' },
  { key: 'JSS1', label: 'JSS 1' }, { key: 'JSS2', label: 'JSS 2' }, { key: 'JSS3', label: 'JSS 3' },
] as const;
export type SchoolClassKey = typeof schoolClasses[number]['key'];
export const schoolLevels = ['ECCDE', 'Primary', 'JSS'] as const;
/** Senior secondary schools exist in the original Yobe directory; they can be kept but not added. */
export const legacyLevels = ['SSS'] as const;
export const schoolTypes = ['Public', 'Private'] as const;
export const schoolLocations = ['Urban', 'Rural'] as const;
export const maxImportRows = 5000;
export const maxImportBytes = 5 * 1024 * 1024;
export const registerPageSizes = [10, 25, 50, 100] as const;
export const defaultRegisterPageSize = 25;
const maxLearnersPerClass = 20000;

export type ClassEnrolment = Partial<Record<SchoolClassKey, { male: number; female: number }>>;
/** Counts from the census form's "useable / not useable" questions. */
export type UsableCount = { usable: number; unusable: number };
/** Facilities summary from the DNEMIS census form (schools.facilities). Every field is optional: forms are often incomplete. */
export type SchoolFacilities = {
  classrooms?: UsableCount; toilets?: UsableCount; waterPoints?: UsableCount; handWashing?: UsableCount;
  classroomsTotal?: number; classesOutside?: boolean; securityGuard?: boolean;
  waterSource?: string; power?: string; fence?: string; healthFacility?: string;
};
/** Teachers working at the school (census question D.2), stored in schools.teachers. */
export type SchoolTeachers = { male: number; female: number };
export type RegisterSchool = {
  id: number; schoolCode: string | null; name: string; town: string; ward: string; lga: string; level: string; category: string; location: string;
  /** Every level the school offers (DNEMIS); empty for schools added by hand, which offer `level` only. */
  levels: string[];
  /** Imported from DNEMIS: the sync refreshes its details. */
  dnemis: boolean;
  latitude: string; longitude: string; male: number; female: number; enrolment: ClassEnrolment; updatedAt: string | null; updatedBy: string | null;
};
export type RegisterFacet = { value: string; count: number };
export type RegisterFacets = { lgas: RegisterFacet[]; levels: RegisterFacet[]; types: RegisterFacet[]; locations: RegisterFacet[]; gaps: RegisterFacet[] };
/** Data-quality filters: schools missing coordinates, enrolment or a school code. */
export const schoolGaps = ['coordinates', 'enrolment', 'code'] as const;
export type SchoolGap = typeof schoolGaps[number];
export const schoolGapLabels: Record<SchoolGap, string> = { coordinates: 'Missing coordinates', enrolment: 'Missing enrolment', code: 'No school code' };
/** Most schools one bulk action (or "select all matching") can cover; the largest state has about 7,000. */
export const maxSelection = 20000;
export type RegisterPage = { items: RegisterSchool[]; total: number; page: number; pageSize: number; facets: RegisterFacets };
export type RegisterOptions = { canManage: boolean; stateName: string; lgas: string[] };
export type ImportIssue = { row: number; name: string; messages: string[] };
export type ImportDuplicate = { row: number; name: string; reason: string };
export type ImportResult = { mode: 'preview' | 'commit'; rows: number; ready: number; created: number; duplicates: ImportDuplicate[]; errors: ImportIssue[]; errorCount: number; schools: Pick<RegisterSchool, 'id' | 'name' | 'lga' | 'level'>[] };

/** The levels to show for a school: every level it offers, or its one level when none are recorded. */
export const offeredLevels = (school: Pick<RegisterSchool, 'level' | 'levels'>) => school.levels?.length ? school.levels : [school.level];
export const schoolTotals = (enrolment: ClassEnrolment) => Object.values(enrolment).reduce((sum, item) => ({ male: sum.male + (item?.male ?? 0), female: sum.female + (item?.female ?? 0) }), { male: 0, female: 0 });
export const collapseSpaces = (value: string) => value.replace(/\s+/g, ' ').trim();
export const sameText = (a: string, b: string) => collapseSpaces(a).toLowerCase() === collapseSpaces(b).toLowerCase();

const learners = z.number({ invalid_type_error: 'Enter whole numbers for learners.' }).int('Enter whole numbers for learners.').min(0, 'Learner figures cannot be negative.').max(maxLearnersPerClass, `A class cannot have more than ${maxLearnersPerClass.toLocaleString()} learners.`);
const classKeys = schoolClasses.map(item => item.key) as [SchoolClassKey, ...SchoolClassKey[]];
export const enrolmentSchema = z.record(z.enum(classKeys), z.object({ male: learners, female: learners }).strict())
  .transform(value => Object.fromEntries(classKeys.filter(key => value[key]).map(key => [key, value[key]])) as ClassEnrolment);

// Nigeria lies roughly between 4°N–14°N and 2.6°E–14.7°E; the margin allows border schools.
const coordinate = (label: 'Latitude' | 'Longitude', min: number, max: number) => z.string().max(30).transform(value => value.trim()).refine(value => {
  if (!value) return true;
  const number = Number(value);
  return /^-?\d+(\.\d+)?$/.test(value) && number >= min && number <= max;
}, `${label} must be a decimal number between ${min} and ${max} for a school in Nigeria. Check that latitude and longitude are not swapped.`);

export const schoolInputSchema = z.object({
  schoolCode: z.string().max(40).optional().nullable().transform(value => collapseSpaces(value ?? '').toUpperCase() || null)
    .refine(value => value === null || /^[A-Z0-9][A-Z0-9/_.-]*$/.test(value), 'School code may contain only letters, numbers, /, -, _ and .'),
  name: z.string().transform(collapseSpaces).pipe(z.string().min(3, 'Enter the school name (at least 3 characters).').max(200, 'School name is too long.')),
  town: z.string().max(120, 'Town is too long.').optional().default('').transform(collapseSpaces),
  lga: z.string().transform(collapseSpaces).pipe(z.string().min(1, 'Choose the LGA.').max(80)),
  category: z.enum(schoolTypes, { errorMap: () => ({ message: 'Choose Public or Private for the type of school.' }) }),
  location: z.enum(schoolLocations, { errorMap: () => ({ message: 'Choose Urban or Rural for the location.' }) }),
  level: z.enum([...schoolLevels, ...legacyLevels], { errorMap: () => ({ message: 'Choose ECCDE, Primary or JSS for the level.' }) }),
  latitude: coordinate('Latitude', 3.5, 14.5).default(''),
  longitude: coordinate('Longitude', 2.5, 15).default(''),
  /** Omitted or null on an edit keeps the current figures (used for schools without a class breakdown). */
  enrolment: enrolmentSchema.nullable().optional(),
}).strict();
export type SchoolInput = z.infer<typeof schoolInputSchema>;
export const schoolCreateSchema = schoolInputSchema;
export const schoolEditSchema = schoolInputSchema.extend({ id: z.number().int().positive() }).strict();

/** First message per field, in form order, for one invalid school. */
export function schoolIssues(error: z.ZodError) {
  const seen = new Set<string>(), messages: string[] = [];
  for (const issue of error.issues) { const field = String(issue.path[0] ?? ''); if (!seen.has(field)) { seen.add(field); messages.push(issue.message); } }
  return messages;
}
export const fieldIssues = (error: z.ZodError) => Object.fromEntries(error.issues.map(issue => [String(issue.path[0] ?? ''), issue.message]).reverse()) as Record<string, string>;

const present = (value: unknown) => value !== undefined && value !== null && value !== '';
const listParam = <T extends z.ZodTypeAny>(item: T, max: number) => z.preprocess(value => {
  const text = typeof value === 'string' ? value.trim() : '';
  return text ? [...new Set(text.split(',').map(part => part.trim()).filter(Boolean))] : [];
}, z.array(item).max(max));
export const registerSorts = ['name', 'lga', 'level', 'learners', 'updated'] as const;
export type RegisterSort = typeof registerSorts[number];
export const registerQuerySchema = z.object({
  page: z.preprocess(value => { const number = Math.trunc(Number(value)); return present(value) && Number.isFinite(number) ? Math.min(Math.max(number, 1), 100000) : 1; }, z.number().int()),
  pageSize: z.preprocess(value => { const number = Number(value); return present(value) && Number.isFinite(number) ? registerPageSizes.reduce((best, size) => Math.abs(size - number) < Math.abs(best - number) ? size : best, registerPageSizes[0]) : defaultRegisterPageSize; }, z.number().int()),
  q: z.string().optional().transform(value => (value ?? '').trim().slice(0, 100)),
  lga: listParam(z.string().max(80), 100),
  level: listParam(z.enum([...schoolLevels, ...legacyLevels]), 4),
  type: listParam(z.enum(schoolTypes), 2),
  location: listParam(z.enum(schoolLocations), 2),
  gap: listParam(z.enum(schoolGaps), 3),
  /** `ids=1`: return only the ids of every matching school (for select all matching). */
  ids: z.preprocess(value => value === '1', z.boolean()),
  id: z.preprocess(value => present(value) ? Number(value) : undefined, z.number().int().positive().optional()),
  sort: z.enum(registerSorts).default('name'),
  dir: z.enum(['asc', 'desc']).optional(),
}).transform(query => ({ ...query, dir: query.dir ?? (query.sort === 'learners' || query.sort === 'updated' ? 'desc' : 'asc') as 'asc' | 'desc' }));

/** Ticked schools for a bulk action (export or delete). */
export const schoolSelectionSchema = z.object({ ids: z.array(z.number().int().positive()).min(1).max(maxSelection) }).strict()
  .transform(value => ({ ids: [...new Set(value.ids)] }));
export type SchoolDeleteResult = { deleted: number; kept: { id: number; name: string }[] };

/** Lenient spellings accepted from uploaded templates. */
export function canonicalLevel(value: string) {
  const text = collapseSpaces(value).toLowerCase().replace(/[.]/g, '');
  if (['eccde', 'ecce', 'ecde', 'pre-primary', 'preprimary', 'nursery'].includes(text)) return 'ECCDE';
  if (['primary', 'pry', 'pri', 'primary school'].includes(text)) return 'Primary';
  if (['jss', 'js', 'jhs', 'junior secondary', 'junior secondary school'].includes(text)) return 'JSS';
  return collapseSpaces(value);
}
export const canonicalOption = <T extends string>(options: readonly T[], value: string) => options.find(option => sameText(option, value)) ?? collapseSpaces(value);

/** A school register API path; the Super Admin's national register adds the chosen `state`. */
export function schoolApiPath(path: string, stateCode?: string) {
  if (!stateCode) return path;
  const url = new URL(path, 'http://register.local');
  url.searchParams.set('state', stateCode);
  return `${url.pathname}${url.search}`;
}
