import { NextResponse, type NextRequest } from 'next/server';
import type { Client } from 'pg';
import { getWorkspaceState } from './workspace-state';
import { isSameRequestOrigin } from './request-origin';
import { canManageSchoolRegister, subebRoles } from './subeb-access';
import { canonicalLevel, canonicalOption, collapseSpaces, schoolClasses, schoolInputSchema, schoolIssues, schoolLocations, schoolTypes, type ClassEnrolment, type SchoolInput } from './school-register';
import type { ParsedSchoolRow } from './school-register-xlsx';

export const noStoreJson = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
export const registerFieldsSql = `id, school_code AS "schoolCode", name, town, lga, level, category, location, latitude, longitude,
  enrolment_male AS male, enrolment_female AS female, enrolment_by_class AS enrolment, updated_at AS "updatedAt", updated_by_name AS "updatedBy"`;
export const managerMessage = 'Only the Executive Chairman, the BEAP Chair or staff they authorise can manage the school register.';
type Workspace = NonNullable<Awaited<ReturnType<typeof getWorkspaceState>>>;

/** Signed-in state user (writes: same origin) who may manage the register; `allowViewer` returns non-managers too. */
export async function registerActor(request: NextRequest, { write = false, allowViewer = false } = {}): Promise<{ error: NextResponse } | { workspace: Workspace; canManage: boolean }> {
  if (write && !isSameRequestOrigin(request)) return { error: noStoreJson({ error: 'This action must come from the portal.' }, 403) };
  const workspace = await getWorkspaceState(request);
  if (!workspace) return { error: noStoreJson({ error: 'Sign in to continue.' }, 401) };
  if (!(subebRoles as readonly string[]).includes(workspace.role)) return { error: noStoreJson({ error: 'The school register belongs to SUBEB workspaces.' }, 403) };
  const canManage = canManageSchoolRegister(workspace.role, workspace.isBeapChair, workspace.canManageSchools);
  if (!canManage && !allowViewer) return { error: noStoreJson({ error: managerMessage }, 403) };
  return { workspace, canManage };
}

/** Re-reads the actor inside a write transaction and serialises register changes per state. */
export async function lockManager(db: Client, workspace: Workspace) {
  await db.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`schools:${workspace.stateCode}`]);
  const actor = (await db.query<{ role: string; is_beap_chair: boolean; can_manage_schools: boolean; full_name: string }>('SELECT role,is_beap_chair,can_manage_schools,full_name FROM users WHERE id=$1 AND active AND session_version=$2 AND state_code=$3 FOR SHARE', [workspace.userId, workspace.sessionVersion, workspace.stateCode])).rows[0];
  return actor && canManageSchoolRegister(actor.role, actor.is_beap_chair, actor.can_manage_schools) ? actor : null;
}

export async function stateLgas(db: Client, stateCode: string) {
  return (await db.query<{ lga: string }>('SELECT DISTINCT lga FROM schools WHERE state_code=$1 AND lga<>\'\' ORDER BY lga', [stateCode])).rows.map(row => row.lga);
}

/** Uses the register's spelling of an LGA; unknown LGAs are rejected once the state has any. */
export function matchLga(lgas: string[], value: string) {
  const wanted = collapseSpaces(value).toLowerCase();
  return lgas.find(lga => collapseSpaces(lga).toLowerCase() === wanted) ?? (lgas.length ? null : collapseSpaces(value));
}

const toText = (value: string | number | undefined) => value === undefined ? '' : String(value).trim();
function learnerCount(value: string | number | undefined, label: string, messages: string[]) {
  if (value === undefined || value === '') return 0;
  const number = typeof value === 'number' ? value : Number(String(value).replace(/,/g, ''));
  if (!Number.isInteger(number) || number < 0) { messages.push(`${label}: enter a whole number of learners.`); return 0; }
  return number;
}

/** Turns one uploaded row into a valid school input, or the reasons it cannot be added. */
const coordinate = (value: unknown) => { const text = toText(value as never); return Number(text) === 0 && text !== '' ? '' : text; };
export function validateImportRow(row: ParsedSchoolRow, lgas: string[]): { input: SchoolInput } | { messages: string[] } {
  const messages: string[] = [];
  const enrolment: ClassEnrolment = {};
  let sum = 0;
  for (const item of schoolClasses) {
    const cells = row.classes[item.key];
    if (!cells || (cells.male === undefined && cells.female === undefined)) continue;
    const male = learnerCount(cells.male, `${item.label} male`, messages), female = learnerCount(cells.female, `${item.label} female`, messages);
    if (typeof cells.total === 'number' && cells.total !== male + female) messages.push(`${item.label}: total ${cells.total} does not match ${male} male + ${female} female.`);
    enrolment[item.key] = { male, female }; sum += male + female;
  }
  if (typeof row.total === 'number' && row.total !== sum) messages.push(`Total enrolment ${row.total} does not match the class figures (${sum}).`);
  const rawLga = toText(row.base.lga), lga = rawLga ? matchLga(lgas, rawLga) : '';
  if (rawLga && lga === null) messages.push(`LGA "${rawLga}" is not an LGA in this state's register.`);
  // Level is optional in the client's layout: work it out from the classes with learners when blank.
  const inferredLevel = Object.keys(enrolment).some(key => key.startsWith('P')) ? 'Primary' : Object.keys(enrolment).some(key => key.startsWith('JSS')) ? 'JSS' : enrolment.ECCDE ? 'ECCDE' : '';
  const level = canonicalLevel(toText(row.base.level) || inferredLevel);
  if (level === 'SSS') messages.push('Senior secondary schools cannot be added. Choose ECCDE, Primary or JSS.');
  const parsed = schoolInputSchema.safeParse({
    schoolCode: toText(row.base.schoolCode) || null, name: toText(row.base.name), town: toText(row.base.town), lga: lga ?? rawLga,
    category: canonicalOption(schoolTypes, toText(row.base.category)), location: canonicalOption(schoolLocations, toText(row.base.location)), level,
    // Lists often use 0 for an unknown coordinate; treat it as blank.
    latitude: coordinate(row.base.latitude), longitude: coordinate(row.base.longitude), enrolment,
  });
  if (!parsed.success) messages.push(...schoolIssues(parsed.error).filter(message => !(lga === null && message.startsWith('Choose the LGA'))));
  return messages.length || !parsed.success ? { messages: [...new Set(messages)] } : { input: parsed.data };
}

export const identityKey = (school: { name: string; lga: string; level: string }) => [school.name, school.lga, school.level].map(value => collapseSpaces(value).toLowerCase()).join('|');

/** Finds the register school a new or edited school would duplicate (same code, or same name, LGA and level). */
export async function findConflict(db: Client, stateCode: string, input: SchoolInput, exceptId = 0) {
  const found = (await db.query<{ id: number; name: string; lga: string; level: string; school_code: string | null }>(
    `SELECT id,name,lga,level,school_code FROM schools WHERE state_code=$1 AND id<>$2 AND ((school_code IS NOT NULL AND school_code=$3)
      OR (lower(regexp_replace(btrim(name),'\\s+',' ','g'))=lower($4) AND lower(btrim(lga))=lower($5) AND level=$6)) ORDER BY (school_code IS NOT DISTINCT FROM $3) DESC LIMIT 1`,
    [stateCode, exceptId, input.schoolCode, input.name, input.lga, input.level])).rows[0];
  if (!found) return null;
  return input.schoolCode && found.school_code === input.schoolCode ? `School code ${input.schoolCode} is already used by ${found.name}.` : `${found.name} (${found.lga}, ${found.level}) is already in the register.`;
}
