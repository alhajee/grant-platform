import type { NextRequest } from 'next/server';
import { getPostgres } from '@/lib/postgres';
import { stateDisplayName } from '@/lib/state-names';
import type { RegisterOptions } from '@/lib/school-register';
import { noStoreJson, registerActor, stateLgas } from '@/lib/school-register-server';

/** Whether the signed-in state user may manage schools, plus the state's LGAs for the entry form. */
export async function GET(request: NextRequest) {
  try {
    const auth = await registerActor(request, { allowViewer: true });
    if ('error' in auth) return auth.error;
    const lgas = auth.canManage ? await getPostgres().transaction(db => stateLgas(db, auth.workspace.stateCode)) : [];
    const body: RegisterOptions = { canManage: auth.canManage, stateName: stateDisplayName(auth.workspace.stateCode), lgas };
    return noStoreJson(body);
  } catch (cause) {
    console.error('School register options failed', cause);
    return noStoreJson({ error: 'Unable to load the school register.' }, 503);
  }
}
