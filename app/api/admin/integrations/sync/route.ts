import { after, type NextRequest } from 'next/server';
import { z } from 'zod';
import { getPostgres } from '@/lib/postgres';
import { isSameRequestOrigin } from '@/lib/request-origin';
import { noStoreJson as json, requireSuperAdmin } from '@/lib/admin-activity-server';
import { getDnemisConfig } from '@/lib/dnemis';
import { syncScheduleSchema } from '@/lib/dnemis-schedule';
import { DnemisSyncBusyError } from '@/lib/dnemis-sync';
import { dispatchToWorker, queueSync, readSyncStatus, runQueuedSync } from '@/lib/dnemis-jobs';
import { SecretBoxConfigError, SecretBoxDecryptError } from '@/lib/secret-box';
import { stateDisplayName } from '@/lib/state-names';

// Super Admin: DNEMIS school sync status (GET), "Sync now" (POST) and the automatic refresh schedule (PUT).
// GET only reads (it may mark dead runs failed); it never queues or starts a sync. Scheduled runs start only in the worker.
// A sync goes to the worker service when one is running (REDIS_URL + heartbeat), otherwise it runs in this process
// after the response (next/server `after`). Status is polled from dnemis_sync_runs.
// `states` (e.g. ['YO']) limits a run to some states, for checks; the card always syncs every state.
const startSchema = z.object({ action: z.literal('start'), states: z.array(z.string().regex(/^[A-Z]{2}$/).refine(code => stateDisplayName(code) !== code)).min(1).max(37).optional() }).strict();

export async function GET(request: NextRequest) {
  try {
    const auth = await requireSuperAdmin(request);
    if (auth.error) return auth.error;
    return json({ status: await readSyncStatus(getPostgres()) });
  } catch (cause) {
    console.error('DNEMIS sync status could not be loaded', cause instanceof Error ? cause.message : 'unknown error');
    return json({ error: 'Unable to load the DNEMIS sync status.' }, 503);
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!isSameRequestOrigin(request)) return json({ error: 'This action must come from the portal.' }, 403);
    const auth = await requireSuperAdmin(request);
    if (auth.error) return auth.error;
    const parsed = startSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return json({ error: 'Unknown action.' }, 400);
    const db = getPostgres();
    let config;
    try { config = await getDnemisConfig(db); }
    catch (cause) {
      if (cause instanceof SecretBoxDecryptError || cause instanceof SecretBoxConfigError) return json({ error: 'The saved access token can no longer be read. Enter the token again.' }, 409);
      throw cause;
    }
    if (!config?.token || !config.enabled) return json({ error: 'Turn on the DNEMIS connection and save an access token first.' }, 409);
    let runId: number;
    try { runId = await queueSync(db, auth.actor.name, parsed.data.states ? [...new Set(parsed.data.states)].sort().join(',') : 'all'); }
    catch (cause) {
      if (cause instanceof DnemisSyncBusyError) return json({ error: 'A DNEMIS sync is already running.', status: await readSyncStatus(db) }, 409);
      throw cause;
    }
    if (!await dispatchToWorker(runId)) after(runQueuedSync(db, runId));
    return json({ status: await readSyncStatus(db) }, 202);
  } catch (cause) {
    console.error('DNEMIS sync could not start', cause instanceof Error ? cause.message : 'unknown error');
    return json({ error: 'Unable to start the DNEMIS sync.' }, 503);
  }
}

export async function PUT(request: NextRequest) {
  try {
    if (!isSameRequestOrigin(request)) return json({ error: 'This action must come from the portal.' }, 403);
    const auth = await requireSuperAdmin(request);
    if (auth.error) return auth.error;
    const parsed = syncScheduleSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return json({ error: 'Choose how often and when to refresh.' }, 400);
    const { mode, weekday, time } = parsed.data;
    const saved = (await getPostgres().query(`UPDATE integration_settings SET sync_schedule = $1, sync_weekday = $2, sync_time = $3, sync_schedule_updated_at = NOW()
      WHERE provider = 'dnemis' RETURNING 1`, [mode, weekday, time])).rowCount;
    if (!saved) return json({ error: 'Save the DNEMIS connection first.' }, 409);
    return json({ status: await readSyncStatus(getPostgres()) });
  } catch (cause) {
    console.error('DNEMIS schedule could not be saved', cause instanceof Error ? cause.message : 'unknown error');
    return json({ error: 'Unable to save the refresh schedule.' }, 503);
  }
}
