import type { NextRequest } from 'next/server';
import { getPostgres } from '@/lib/postgres';
import { stateDisplayName } from '@/lib/state-names';
import { noStoreJson, registerActor, stateLgas } from '@/lib/school-register-server';
import { buildSchoolTemplate } from '@/lib/school-register-xlsx';

/** The sample bulk-entry template, with the state's LGAs in its dropdown. */
export async function GET(request: NextRequest) {
  try {
    const auth = await registerActor(request);
    if ('error' in auth) return auth.error;
    const stateName = stateDisplayName(auth.workspace.stateCode);
    const lgas = await getPostgres().transaction(db => stateLgas(db, auth.workspace.stateCode));
    const bytes = await buildSchoolTemplate(stateName, lgas);
    const filename = `${stateName.replace(/[^A-Za-z0-9]+/g, '-')}-school-register-template.xlsx`;
    return new Response(bytes, { headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    } });
  } catch (cause) {
    console.error('School template failed', cause);
    return noStoreJson({ error: 'The template could not be prepared. Please try again.' }, 503);
  }
}
