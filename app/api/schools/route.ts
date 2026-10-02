import type { NextRequest } from 'next/server';
import { getPostgres } from '@/lib/postgres';
import { escapeLike } from '@/lib/admin-activity';
import { maxSelection, registerQuerySchema, schoolCreateSchema, schoolSelectionSchema, type SchoolDeleteResult, schoolEditSchema, schoolIssues, schoolTotals, type RegisterFacets, type RegisterSort, type SchoolGap, type SchoolInput } from '@/lib/school-register';
import { findConflict, lockManager, managerMessage, matchLga, noStoreJson, registerActor, registerFieldsSql, stateLgas } from '@/lib/school-register-server';

// A school is missing a value when it is blank; enrolment counts as missing when no learners are recorded.
const gapSql: Record<SchoolGap, string> = {
  coordinates: "(coalesce(latitude,'') = '' OR coalesce(longitude,'') = '')",
  enrolment: '(enrolment_male + enrolment_female) = 0',
  code: "coalesce(school_code,'') = ''",
};

const sortColumns: Record<RegisterSort, string> = {
  name: 'lower(name)', lga: 'lower(lga)', level: 'level', learners: '(enrolment_male + enrolment_female)', updated: 'updated_at',
};

/** One page of the state's school register with facet counts over the whole state (managers only). */
export async function GET(request: NextRequest) {
  try {
    const auth = await registerActor(request);
    if ('error' in auth) return auth.error;
    const parsed = registerQuerySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
    if (!parsed.success) return noStoreJson({ error: 'Choose valid filters and sorting.' }, 400);
    const { page, pageSize, q, lga, level, type, location, gap, ids, id, sort, dir } = parsed.data;
    const params: unknown[] = [auth.workspace.stateCode], where = ['state_code = $1'];
    const add = (value: unknown, sql: (ref: string) => string) => { params.push(value); where.push(sql(`$${params.length}`)); };
    if (q) add(`%${escapeLike(q)}%`, ref => `(name ILIKE ${ref} OR town ILIKE ${ref} OR lga ILIKE ${ref} OR school_code ILIKE ${ref})`);
    if (id) add(id, ref => `id = ${ref}`);
    if (lga.length) add(lga, ref => `lga = ANY(${ref}::text[])`);
    if (level.length) add(level, ref => `level = ANY(${ref}::text[])`);
    if (type.length) add(type, ref => `category = ANY(${ref}::text[])`);
    if (location.length) add(location, ref => `location = ANY(${ref}::text[])`);
    if (gap.length) where.push(`(${gap.map(key => gapSql[key]).join(' OR ')})`);
    const whereSql = where.join(' AND ');
    return await getPostgres().transaction(async db => {
      if (ids) return noStoreJson({ ids: (await db.query<{ id: number }>(`SELECT id FROM schools WHERE ${whereSql} ORDER BY id LIMIT ${maxSelection}`, params)).rows.map(row => row.id) });
      const total = (await db.query<{ total: number }>(`SELECT COUNT(*)::int AS total FROM schools WHERE ${whereSql}`, params)).rows[0]?.total ?? 0;
      const served = Math.min(page, Math.max(1, Math.ceil(total / pageSize)));
      const items = total ? (await db.query(`SELECT ${registerFieldsSql} FROM schools WHERE ${whereSql}
        ORDER BY ${sortColumns[sort]} ${dir === 'asc' ? 'ASC' : 'DESC'} NULLS LAST, lower(name), id LIMIT $${params.length + 1} OFFSET $${params.length + 2}`, [...params, pageSize, (served - 1) * pageSize])).rows : [];
      const facet = async (column: string) => (await db.query<{ value: string; count: number }>(`SELECT ${column} AS value, COUNT(*)::int AS count FROM schools WHERE state_code=$1 AND ${column}<>'' GROUP BY ${column} ORDER BY ${column}`, [auth.workspace.stateCode])).rows;
      const gapCounts = (await db.query<Record<SchoolGap, number>>(`SELECT ${Object.entries(gapSql).map(([key, sql]) => `COUNT(*) FILTER (WHERE ${sql})::int AS ${key}`).join(', ')} FROM schools WHERE state_code=$1`, [auth.workspace.stateCode])).rows[0];
      const gaps = (Object.keys(gapSql) as SchoolGap[]).map(key => ({ value: key, count: gapCounts?.[key] ?? 0 }));
      const facets: RegisterFacets = { lgas: await facet('lga'), levels: await facet('level'), types: await facet('category'), locations: await facet('location'), gaps };
      return noStoreJson({ items, total, page: served, pageSize, facets });
    });
  } catch (cause) {
    console.error('School register list failed', cause);
    return noStoreJson({ error: 'Unable to load the school register.' }, 503);
  }
}

async function save(request: NextRequest, creating: boolean) {
  try {
    const auth = await registerActor(request, { write: true });
    if ('error' in auth) return auth.error;
    const parsed = (creating ? schoolCreateSchema : schoolEditSchema).safeParse(await request.json().catch(() => null));
    if (!parsed.success) return noStoreJson({ error: schoolIssues(parsed.error)[0] ?? 'Enter valid school details.', issues: parsed.error.issues.map(issue => ({ field: String(issue.path[0] ?? ''), message: issue.message })) }, 400);
    const { workspace } = auth;
    return await getPostgres().transaction(async db => {
      const actor = await lockManager(db, workspace);
      if (!actor) return noStoreJson({ error: `Your access has changed. ${managerMessage}` }, 403);
      const { id = 0, ...fields } = parsed.data as SchoolInput & { id?: number };
      const current = id ? (await db.query<{ level: string; enrolment_male: number; enrolment_female: number; enrolment_by_class: object }>('SELECT level,enrolment_male,enrolment_female,enrolment_by_class FROM schools WHERE id=$1 AND state_code=$2 FOR UPDATE', [id, workspace.stateCode])).rows[0] : null;
      if (id && !current) return noStoreJson({ error: 'School not found in your state register.' }, 404);
      if (fields.level === 'SSS' && current?.level !== 'SSS') return noStoreJson({ error: 'Choose ECCDE, Primary or JSS for the level.', issues: [{ field: 'level', message: 'Choose ECCDE, Primary or JSS for the level.' }] }, 400);
      const lga = matchLga(await stateLgas(db, workspace.stateCode), fields.lga);
      if (!lga) return noStoreJson({ error: `Choose one of your state's LGAs.`, issues: [{ field: 'lga', message: `Choose one of your state's LGAs.` }] }, 400);
      const input = { ...fields, lga };
      const conflict = await findConflict(db, workspace.stateCode, input, id);
      if (conflict) return noStoreJson({ error: conflict }, 409);
      const enrolment = input.enrolment ?? (current ? null : {});
      const totals = enrolment ? schoolTotals(enrolment) : { male: current!.enrolment_male, female: current!.enrolment_female };
      const values = [input.schoolCode, input.name, input.town, input.lga, input.level, input.category, input.location, input.latitude, input.longitude, totals.male, totals.female, enrolment ? JSON.stringify(enrolment) : JSON.stringify(current!.enrolment_by_class), actor.full_name];
      const school = creating
        ? (await db.query(`INSERT INTO schools(school_code,name,town,lga,level,category,location,latitude,longitude,enrolment_male,enrolment_female,enrolment_by_class,updated_by_name,updated_at,state_code)
            VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13,NOW(),$14) RETURNING ${registerFieldsSql}`, [...values, workspace.stateCode])).rows[0]
        : (await db.query(`UPDATE schools SET school_code=$1,name=$2,town=$3,lga=$4,level=$5,category=$6,location=$7,latitude=$8,longitude=$9,enrolment_male=$10,enrolment_female=$11,enrolment_by_class=$12::jsonb,updated_by_name=$13,updated_at=NOW()
            WHERE id=$14 AND state_code=$15 RETURNING ${registerFieldsSql}`, [...values, id, workspace.stateCode])).rows[0];
      return noStoreJson({ school }, creating ? 201 : 200);
    });
  } catch (cause) {
    if ((cause as { code?: string }).code === '23505') return noStoreJson({ error: 'This school is already in the register.' }, 409);
    console.error('School register save failed', cause);
    return noStoreJson({ error: 'The school could not be saved. Please try again.' }, 503);
  }
}

export const POST = (request: NextRequest) => save(request, true);
export const PATCH = (request: NextRequest) => save(request, false);

/** Deletes ticked schools from the state register; schools already used in any plan are kept and listed. */
export async function DELETE(request: NextRequest) {
  try {
    const auth = await registerActor(request, { write: true });
    if ('error' in auth) return auth.error;
    const parsed = schoolSelectionSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return noStoreJson({ error: 'Choose the schools to delete.' }, 400);
    const { workspace } = auth, { ids } = parsed.data;
    return await getPostgres().transaction(async db => {
      if (!await lockManager(db, workspace)) return noStoreJson({ error: `Your access has changed. ${managerMessage}` }, 403);
      const schools = (await db.query<{ id: number; name: string }>('SELECT id, name FROM schools WHERE state_code=$1 AND id = ANY($2::int[]) FOR UPDATE', [workspace.stateCode, ids])).rows;
      // Every table that references a school (plans, packages, documents...), read from the catalogue so new ones are covered.
      const references = (await db.query<{ tbl: string; col: string }>(`SELECT c.conrelid::regclass::text AS tbl, a.attname AS col FROM pg_constraint c
        JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1] WHERE c.contype = 'f' AND c.confrelid = 'schools'::regclass`)).rows;
      const used = new Set<number>();
      for (const { tbl, col } of references) {
        const rows = (await db.query<{ id: number }>(`SELECT DISTINCT "${col.replaceAll('"', '""')}" AS id FROM ${tbl} WHERE "${col.replaceAll('"', '""')}" = ANY($1::int[])`, [schools.map(school => school.id)])).rows;
        rows.forEach(row => used.add(row.id));
      }
      const removable = schools.filter(school => !used.has(school.id)).map(school => school.id);
      const deleted = removable.length ? (await db.query('DELETE FROM schools WHERE state_code=$1 AND id = ANY($2::int[])', [workspace.stateCode, removable])).rowCount ?? 0 : 0;
      const result: SchoolDeleteResult = { deleted, kept: schools.filter(school => used.has(school.id)) };
      return noStoreJson(result);
    });
  } catch (cause) {
    if ((cause as { code?: string }).code === '23503') return noStoreJson({ error: 'A selected school was just added to a plan. Please try again.' }, 409);
    console.error('School register delete failed', cause);
    return noStoreJson({ error: 'The schools could not be deleted. Please try again.' }, 503);
  }
}
