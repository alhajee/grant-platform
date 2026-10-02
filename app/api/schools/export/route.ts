import type { NextRequest } from 'next/server';
import { getPostgres } from '@/lib/postgres';
import { stateDisplayName } from '@/lib/state-names';
import { schoolSelectionSchema, type RegisterSchool } from '@/lib/school-register';
import { noStoreJson, registerActor, registerFieldsSql, stateLgas } from '@/lib/school-register-server';
import { buildSchoolTemplate } from '@/lib/school-register-xlsx';

/** The ticked schools as a filled school list, in the same layout as the bulk-entry template. */
export async function POST(request: NextRequest) {
  try {
    const auth = await registerActor(request, { write: true });
    if ('error' in auth) return auth.error;
    const parsed = schoolSelectionSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return noStoreJson({ error: 'Choose the schools to export.' }, 400);
    const { stateCode } = auth.workspace, stateName = stateDisplayName(stateCode);
    const { schools, lgas } = await getPostgres().transaction(async db => ({
      schools: (await db.query<RegisterSchool>(`SELECT ${registerFieldsSql} FROM schools WHERE state_code=$1 AND id = ANY($2::int[]) ORDER BY lower(lga), lower(name), id`, [stateCode, parsed.data.ids])).rows,
      lgas: await stateLgas(db, stateCode),
    }));
    if (!schools.length) return noStoreJson({ error: 'None of the selected schools are in your state register.' }, 404);
    const bytes = await buildSchoolTemplate(stateName, lgas, schools);
    const filename = `${stateName.replace(/[^A-Za-z0-9]+/g, '-')}-schools-${schools.length}.xlsx`;
    return new Response(bytes, { headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    } });
  } catch (cause) {
    console.error('School export failed', cause);
    return noStoreJson({ error: 'The schools could not be exported. Please try again.' }, 503);
  }
}
