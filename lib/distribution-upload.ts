// UBEC248: distribution lists from an uploaded template. Each row names a school by its DNEMIS code and its name; both
// must agree with the School list before the school is added. Dependency-free so the unit test can import it.

/** The workstreams whose school lists take a template: the three distribution lists and the PHE training schools. */
export const uploadListWorkstreams = ['tlm', 'curriculum', 'gscci', 'phe', 'sports'] as const;
export type UploadListWorkstream = typeof uploadListWorkstreams[number];
export const uploadListNames: Record<UploadListWorkstream, string> = { tlm: 'TLM distribution list', curriculum: 'Curriculum distribution list', gscci: 'Greening distribution list', phe: 'PHE training schools', sports: 'Sports beneficiary schools' };
/** The component whose edit rights cover each list. */
export const uploadListComponent = (workstream: UploadListWorkstream) => workstream === 'phe' ? 'sports' as const : workstream;
export const maxUploadRows = 10000;

export type UploadRow = { row: number; code: string; name: string };
export type UploadSchool = { id: number; name: string; code: string | null; lga: string; level: string };
export type UploadMatch = {
  /** Code and name agree with the School list; these are added. */
  matched: { row: number; school: UploadSchool }[];
  /** Already on the list; nothing to do. */
  listed: { row: number; school: UploadSchool }[];
  /** The code is in the School list but the name is another school's. */
  mismatched: { row: number; code: string; name: string; school: UploadSchool }[];
  /** No school in the state has this code. */
  unknown: { row: number; code: string; name: string }[];
  /** A row without a DNEMIS code. */
  noCode: { row: number; name: string }[];
  /** The same school again (by code) further down the file. */
  duplicates: { row: number; code: string; name: string; firstRow: number }[];
};

/** DNEMIS codes as typed: spaces and a trailing ".0" (a number cell) dropped. */
export const normalCode = (code: string) => code.replace(/\s+/g, '').replace(/\.0+$/, '').toUpperCase();
/** School names compared on letters and digits only: case, spaces and punctuation are ignored, "&" reads "and". */
export const normalName = (name: string) => name.toLowerCase().replace(/&/g, 'and').normalize('NFKD').replace(/[^a-z0-9]/g, '');
export const namesAgree = (typed: string, register: string) => normalName(typed) === normalName(register);

/** Sorts the uploaded rows against the state's schools (with codes) and the schools already on the list. */
export function matchUploadRows(rows: readonly UploadRow[], schools: readonly UploadSchool[], listedIds: ReadonlySet<number>): UploadMatch {
  const byCode = new Map<string, UploadSchool>();
  for (const school of schools) if (school.code) byCode.set(normalCode(school.code), school);
  const result: UploadMatch = { matched: [], listed: [], mismatched: [], unknown: [], noCode: [], duplicates: [] };
  const seen = new Map<string, number>();
  for (const { row, code: rawCode, name: rawName } of rows) {
    const code = normalCode(rawCode), name = rawName.trim();
    if (!code && !name) continue;
    if (!code) { result.noCode.push({ row, name }); continue; }
    const first = seen.get(code);
    if (first !== undefined) { result.duplicates.push({ row, code, name, firstRow: first }); continue; }
    seen.set(code, row);
    const school = byCode.get(code);
    if (!school) result.unknown.push({ row, code, name });
    else if (!namesAgree(name, school.name)) result.mismatched.push({ row, code, name, school });
    else if (listedIds.has(school.id)) result.listed.push({ row, school });
    else result.matched.push({ row, school });
  }
  return result;
}
