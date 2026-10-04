// Queue, status and schedule for DNEMIS syncs, shared by the admin API and the worker (worker/dnemis-worker.ts).
// dnemis_sync_runs is the source of truth: "Sync now" and the schedule add a queued row; whoever runs it claims it.
// With REDIS_URL and a live worker (heartbeat in Redis), the run id is pushed to the worker's Redis list;
// otherwise the web process runs it itself. Nothing here is user-specific.
import type { QueryResult, QueryResultRow } from 'pg';
import { getRedis, redisReportError } from './redis';
import { defaultSyncSchedule, dueSlot, nextSlot, type SyncMode, type SyncSchedule } from './dnemis-schedule';
import { syncDnemisSchools, DnemisSyncBusyError, type SyncSummary } from './dnemis-sync';

type Db = { query<R extends QueryResultRow>(sql: string, values?: unknown[]): Promise<QueryResult<R>> };
export type SyncRun = {
  id: number; status: 'queued' | 'running' | 'ok' | 'failed'; scope: string; triggeredBy: string; queuedAt: string; startedAt: string | null;
  finishedAt: string | null; created: number; updated: number; unchanged: number; message: string | null;
};
export type SyncStatus = { latest: SyncRun | null; lastFinished: SyncRun | null; active: boolean; schedule: SyncSchedule; nextSync: string | null; worker: boolean };

export const jobsKey = 'beapms:dnemis:jobs';
export const workerKey = 'beapms:dnemis:worker';
export const lockKey = 'beapms:dnemis:lock';
/** A queued run nobody picked up within this time is marked failed, so the next "Sync now" is not blocked. */
const queuedTimeoutMinutes = 15;

const runFields = `id, status, scope, triggered_by AS "triggeredBy", queued_at AS "queuedAt", started_at AS "startedAt", finished_at AS "finishedAt",
  schools_created AS created, schools_updated AS updated, schools_skipped AS unchanged, message`;

/** Fails runs that can no longer finish: queued too long, or running without holding the sync lock (process gone). */
export async function failStaleRuns(db: Db) {
  await db.query(`UPDATE dnemis_sync_runs SET status = 'failed', finished_at = NOW(), message = 'The sync was not started in time. Try again.'
    WHERE status = 'queued' AND queued_at < NOW() - make_interval(mins => $1)`, [queuedTimeoutMinutes]);
  const running = (await db.query<{ id: number }>(`SELECT id FROM dnemis_sync_runs WHERE status = 'running'`)).rows;
  if (!running.length) return;
  const free = (await db.query<{ free: boolean }>(`SELECT CASE WHEN pg_try_advisory_lock(hashtext('beapms:dnemis-sync')) THEN pg_advisory_unlock(hashtext('beapms:dnemis-sync')) ELSE FALSE END AS free`)).rows[0]?.free;
  if (free) await db.query(`UPDATE dnemis_sync_runs SET status = 'failed', finished_at = NOW(), message = 'The sync stopped before it finished (the server restarted). Try again.' WHERE status = 'running'`);
}

export async function readSchedule(db: Db): Promise<SyncSchedule & { enabled: boolean; lastSlot: Date | null; updatedAt: Date | null }> {
  const row = (await db.query<{ mode: SyncMode; weekday: number; time: string; enabled: boolean; lastSlot: Date | null; updatedAt: Date | null }>(
    `SELECT sync_schedule AS mode, sync_weekday AS weekday, sync_time AS time, enabled AND token_ciphertext IS NOT NULL AS enabled,
      sync_last_slot AS "lastSlot", sync_schedule_updated_at AS "updatedAt" FROM integration_settings WHERE provider = 'dnemis'`)).rows[0];
  return row ? { ...row, weekday: Number(row.weekday) } : { ...defaultSyncSchedule, enabled: false, lastSlot: null, updatedAt: null };
}

export async function workerAlive() {
  const redis = await getRedis();
  if (!redis) return false;
  try { return Boolean(await redis.get(workerKey)); } catch (cause) { redisReportError(cause); return false; }
}

export async function readSyncStatus(db: Db): Promise<SyncStatus> {
  await failStaleRuns(db);
  const latest = (await db.query<SyncRun>(`SELECT ${runFields} FROM dnemis_sync_runs ORDER BY id DESC LIMIT 1`)).rows[0] ?? null;
  const lastFinished = latest && ['ok', 'failed'].includes(latest.status) ? latest
    : (await db.query<SyncRun>(`SELECT ${runFields} FROM dnemis_sync_runs WHERE status IN ('ok','failed') ORDER BY id DESC LIMIT 1`)).rows[0] ?? null;
  const schedule = await readSchedule(db);
  const next = schedule.enabled ? nextSlot(schedule, new Date()) : null;
  return {
    latest, lastFinished, active: latest?.status === 'queued' || latest?.status === 'running',
    schedule: { mode: schedule.mode, weekday: schedule.weekday, time: schedule.time }, nextSync: next?.toISOString() ?? null, worker: await workerAlive(),
  };
}

/** Adds a queued run. Throws DnemisSyncBusyError when one is already queued or running. */
export async function queueSync(db: Db, triggeredBy: string, scope = 'all') {
  await failStaleRuns(db);
  try {
    return (await db.query<{ id: number }>(`INSERT INTO dnemis_sync_runs(status, scope, triggered_by) VALUES('queued', $1, $2) RETURNING id`, [scope, triggeredBy.slice(0, 120)])).rows[0].id;
  } catch (cause) {
    if ((cause as { code?: string }).code === '23505') throw new DnemisSyncBusyError('A DNEMIS sync is already queued or running.');
    throw cause;
  }
}

/** Hands a queued run to the worker when one is alive; returns false when the caller should run it in-process. */
export async function dispatchToWorker(runId: number) {
  if (!await workerAlive()) return false;
  const redis = await getRedis();
  try { await redis!.lpush(jobsKey, String(runId)); return true; } catch (cause) { redisReportError(cause); return false; }
}

/** Runs a queued run here and now (worker, or the web process when there is no worker). Never throws. */
export async function runQueuedSync(db: Db, runId: number, log?: (message: string) => void): Promise<SyncSummary | null> {
  const run = (await db.query<{ scope: string; triggeredBy: string; status: string }>(`SELECT scope, triggered_by AS "triggeredBy", status FROM dnemis_sync_runs WHERE id = $1`, [runId])).rows[0];
  if (!run || run.status !== 'queued') return null;
  try {
    return await syncDnemisSchools({ runId, triggeredBy: run.triggeredBy, states: run.scope === 'all' ? undefined : run.scope.split(','), log });
  } catch (cause) {
    console.error('DNEMIS sync failed', cause instanceof Error ? cause.message.slice(0, 300) : 'unknown error');
    return null;
  }
}

/** Claims the current scheduled slot (once, across all workers) and queues a run for it. */
export async function queueDueScheduledSync(db: Db, now = new Date()) {
  const schedule = await readSchedule(db);
  if (!schedule.enabled) return null;
  const slot = dueSlot(schedule, now, schedule.lastSlot, schedule.updatedAt);
  if (!slot) return null;
  const claimed = (await db.query(`UPDATE integration_settings SET sync_last_slot = $1 WHERE provider = 'dnemis' AND (sync_last_slot IS NULL OR sync_last_slot < $1) RETURNING 1`, [slot])).rowCount;
  if (!claimed) return null;
  try { return await queueSync(db, 'Automatic refresh'); }
  catch (cause) { if (cause instanceof DnemisSyncBusyError) return null; throw cause; }
}
