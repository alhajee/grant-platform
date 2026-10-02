import type { NextRequest } from 'next/server';
import type { Client } from 'pg';
import { getPostgres } from '@/lib/postgres';
import { maxImportBytes, schoolTotals, type ImportDuplicate, type ImportIssue, type ImportResult, type SchoolInput } from '@/lib/school-register';
import { identityKey, lockManager, managerMessage, noStoreJson, registerActor, stateLgas, validateImportRow } from '@/lib/school-register-server';
import { readSchoolRows, SchoolImportError } from '@/lib/school-register-xlsx';

const maxListed = 200;

// Bound the upload before parsing, including chunked requests.
async function uploadedFile(request: NextRequest) {
  if (!request.headers.get('content-type')?.startsWith('multipart/form-data;')) throw new SchoolImportError('Attach the filled school template.');
  const limit = maxImportBytes + 64 * 1024;
  if (Number(request.headers.get('content-length')) > limit) throw new SchoolImportError('The template must be no larger than 5 MB.');
  const reader = request.body?.getReader();
  if (!reader) throw new SchoolImportError('Attach the filled school template.');
  const chunks: Uint8Array[] = []; let size = 0;
  try { while (true) { const { done, value } = await reader.read(); if (done) break; size += value.length; if (size > limit) { await reader.cancel(); throw new SchoolImportError('The template must be no larger than 5 MB.'); } chunks.push(value); } }
  finally { reader.releaseLock(); }
  let form: FormData;
  try { form = await new Response(Buffer.concat(chunks), { headers: { 'Content-Type': request.headers.get('content-type')! } }).formData(); }
  catch { throw new SchoolImportError('The upload could not be read. Choose the file again.'); }
  const file = form.get('file');
  if (!file || typeof file === 'string' || !file.size) throw new SchoolImportError('Attach the filled school template.');
  if (!/\.xlsx$/i.test(file.name)) throw new SchoolImportError('Upload the school template as an Excel (.xlsx) file.');
  const bytes = await file.arrayBuffer();
  if (new Uint8Array(bytes.slice(0, 4)).join(',') !== '80,75,3,4') throw new SchoolImportError('Upload the school template as an Excel (.xlsx) file.');
  return bytes;
}

type Ready = { row: number; input: SchoolInput };
/** Validates every row, then splits valid rows into new schools and duplicates (in the file or already in the register). */
async function classify(db: Client, stateCode: string, bytes: ArrayBuffer) {
  const rows = await readSchoolRows(bytes);
  const lgas = await stateLgas(db, stateCode);
  const existing = (await db.query<{ name: string; lga: string; level: string; school_code: string | null }>('SELECT name,lga,level,school_code FROM schools WHERE state_code=$1', [stateCode])).rows;
  const byKey = new Map(existing.map(school => [identityKey(school), school.name]));
  const byCode = new Map(existing.filter(school => school.school_code).map(school => [school.school_code!, school.name]));
  const seenKey = new Map<string, number>(), seenCode = new Map<string, number>();
  const ready: Ready[] = [], duplicates: ImportDuplicate[] = [], errors: ImportIssue[] = [];
  for (const row of rows) {
    const result = validateImportRow(row, lgas);
    const name = String(row.base.name ?? '').trim();
    if ('messages' in result) { errors.push({ row: row.row, name, messages: result.messages }); continue; }
    const { input } = result, key = identityKey(input);
    const codeRow = input.schoolCode ? seenCode.get(input.schoolCode) : undefined, keyRow = seenKey.get(key);
    if (codeRow || keyRow) { errors.push({ row: row.row, name, messages: [`Same school as row ${codeRow ?? keyRow} of this file.`] }); continue; }
    if (input.schoolCode) seenCode.set(input.schoolCode, row.row);
    seenKey.set(key, row.row);
    if (input.schoolCode && byCode.has(input.schoolCode)) { duplicates.push({ row: row.row, name: input.name, reason: `School code ${input.schoolCode} is already in the register (${byCode.get(input.schoolCode)}).` }); continue; }
    if (byKey.has(key)) { duplicates.push({ row: row.row, name: input.name, reason: `Already in the register as ${byKey.get(key)} (${input.lga}, ${input.level}).` }); continue; }
    ready.push({ row: row.row, input });
  }
  return { rows: rows.length, ready, duplicates, errors };
}

/** Bulk entry: `?mode=preview` validates only; `?mode=commit` adds every new school in one transaction, refusing a file with errors. */
export async function POST(request: NextRequest) {
  try {
    const auth = await registerActor(request, { write: true });
    if ('error' in auth) return auth.error;
    const mode = request.nextUrl.searchParams.get('mode') === 'commit' ? 'commit' : 'preview';
    const bytes = await uploadedFile(request);
    const { workspace } = auth;
    return await getPostgres().transaction(async db => {
      const actor = await lockManager(db, workspace);
      if (!actor) return noStoreJson({ error: `Your access has changed. ${managerMessage}` }, 403);
      const { rows, ready, duplicates, errors } = await classify(db, workspace.stateCode, bytes);
      if (!rows) return noStoreJson({ error: 'The template has no schools. Enter one school per row, starting on row 3.' }, 400);
      const result: ImportResult = { mode, rows, ready: ready.length, created: 0, duplicates: duplicates.slice(0, maxListed), errors: errors.slice(0, maxListed), errorCount: errors.length, schools: [] };
      if (mode === 'preview') return noStoreJson(result);
      if (errors.length) return noStoreJson({ ...result, error: `Fix the ${errors.length === 1 ? 'row' : `${errors.length} rows`} with errors and upload the file again. No schools were added.` }, 400);
      if (ready.length) {
        const records = ready.map(({ input }) => { const totals = schoolTotals(input.enrolment ?? {}); return { school_code: input.schoolCode, name: input.name, town: input.town, lga: input.lga, level: input.level, category: input.category, location: input.location, latitude: input.latitude, longitude: input.longitude, enrolment_male: totals.male, enrolment_female: totals.female, enrolment_by_class: input.enrolment ?? {} }; });
        const inserted = (await db.query<{ id: number; name: string; lga: string; level: string }>(`INSERT INTO schools(state_code,school_code,name,town,lga,level,category,location,latitude,longitude,enrolment_male,enrolment_female,enrolment_by_class,updated_at,updated_by_name)
          SELECT $1,r.school_code,r.name,r.town,r.lga,r.level,r.category,r.location,r.latitude,r.longitude,r.enrolment_male,r.enrolment_female,r.enrolment_by_class,NOW(),$3
          FROM jsonb_to_recordset($2::jsonb) AS r(school_code text,name text,town text,lga text,level text,category text,location text,latitude text,longitude text,enrolment_male int,enrolment_female int,enrolment_by_class jsonb)
          RETURNING id,name,lga,level`, [workspace.stateCode, JSON.stringify(records), actor.full_name])).rows;
        result.created = inserted.length;
        result.schools = inserted.slice(0, maxListed);
      }
      return noStoreJson(result, result.created ? 201 : 200);
    });
  } catch (cause) {
    if (cause instanceof SchoolImportError) return noStoreJson({ error: cause.message }, 400);
    if ((cause as { code?: string }).code === '23505') return noStoreJson({ error: 'Another change added one of these schools at the same time. Upload the file again.' }, 409);
    console.error('School import failed', cause);
    return noStoreJson({ error: 'The schools could not be imported. Please try again.' }, 503);
  }
}
