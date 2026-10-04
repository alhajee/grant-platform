// DNEMIS sync worker: the `worker` service in docker-compose.prod.yml (same image, `node worker/dnemis-worker.mjs`).
// * Every minute it queues the scheduled refresh when one is due (lib/dnemis-schedule.ts), claimed once in PostgreSQL.
// * It runs queued syncs: "Sync now" pushes the run id to the Redis list beapms:dnemis:jobs (BRPOP wakes it at once);
//   it also picks up any queued row it finds, so nothing is lost if Redis drops a message.
// * A Redis lock plus the PostgreSQL advisory lock in syncDnemisSchools keep runs from overlapping.
// * Heartbeat: Redis key beapms:dnemis:worker (the web app hands jobs over only while it exists) and /tmp/dnemis-worker-alive
//   (container health check).
// One-off CLI (also inside the image): node worker/dnemis-worker.mjs --once [--states=YO,KN] [--dry-run] [--years=2025,2024]
// Built by `npm run build:worker` (esbuild) into dist/worker/dnemis-worker.mjs. Never logs the DNEMIS token.
import { writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { getPostgres } from '../lib/postgres';
import { getRedis, newRedisConnection, redisReportError } from '../lib/redis';
import { failStaleRuns, jobsKey, lockKey, queueDueScheduledSync, runQueuedSync, workerKey } from '../lib/dnemis-jobs';
import { syncDnemisSchools } from '../lib/dnemis-sync';

const tickMs = 60_000, heartbeatFile = '/tmp/dnemis-worker-alive', workerId = randomUUID();
const log = (message: string) => console.log(`[dnemis-worker] ${new Date().toISOString()} ${message}`);
let stopping = false;

function argument(name: string) {
  const match = process.argv.find(item => item === `--${name}` || item.startsWith(`--${name}=`));
  return match === undefined ? undefined : match.includes('=') ? match.slice(match.indexOf('=') + 1) : '';
}

async function once() {
  const states = argument('states')?.split(',').filter(Boolean);
  const years = argument('years')?.split(',').map(Number).filter(Number.isInteger);
  const summary = await syncDnemisSchools({ states, years, dryRun: argument('dry-run') !== undefined, triggeredBy: 'Command line', log });
  console.log(JSON.stringify(summary, null, 1));
  process.exit(summary.ok ? 0 : 1);
}

async function heartbeat() {
  try { writeFileSync(heartbeatFile, new Date().toISOString()); } catch { /* read-only file system: health check falls back to the process */ }
  const redis = await getRedis();
  await redis?.set(workerKey, workerId, 'EX', 150).catch(redisReportError);
}

/** Runs one queued sync under the Redis lock (renewed while it runs). */
async function runLocked(runId: number) {
  const redis = await getRedis();
  if (redis) {
    const got = await redis.set(lockKey, workerId, 'PX', 10 * 60_000, 'NX').catch(cause => { redisReportError(cause); return 'OK'; });
    if (got !== 'OK') return;
  }
  const renew = setInterval(() => { void redis?.pexpire(lockKey, 10 * 60_000).catch(redisReportError); void heartbeat(); }, 60_000);
  try {
    log(`run ${runId} started`);
    const summary = await runQueuedSync(getPostgres(), runId, log);
    log(`run ${runId} ${summary ? `${summary.ok ? 'finished' : 'finished with errors'}: ${summary.message}` : 'skipped or failed (see the admin card)'}`);
  } finally {
    clearInterval(renew);
    // Release only our own lock.
    await redis?.eval(`if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end`, 1, lockKey, workerId).catch(redisReportError);
  }
}

async function runQueued() {
  const db = getPostgres();
  await failStaleRuns(db);
  const scheduled = await queueDueScheduledSync(db);
  if (scheduled) log(`scheduled run ${scheduled} queued`);
  const queued = (await db.query<{ id: number }>(`SELECT id FROM dnemis_sync_runs WHERE status = 'queued' ORDER BY id LIMIT 1`)).rows[0];
  if (queued) await runLocked(queued.id);
}

async function loop() {
  log('started');
  const blocking = await newRedisConnection();
  let lastTick = 0;
  while (!stopping) {
    await heartbeat();
    try {
      if (Date.now() - lastTick >= tickMs) { lastTick = Date.now(); await runQueued(); }
      if (blocking) {
        const job = await blocking.brpop(jobsKey, 30).catch(cause => { redisReportError(cause); return null; });
        if (job) await runQueued();
        else if (!blocking.status || blocking.status === 'end') await new Promise(resolve => setTimeout(resolve, 30_000));
      } else await new Promise(resolve => setTimeout(resolve, 30_000));
    } catch (cause) {
      log(`error: ${cause instanceof Error ? cause.message.slice(0, 300) : 'unknown error'}`);
      await new Promise(resolve => setTimeout(resolve, 30_000));
    }
  }
  blocking?.disconnect();
  process.exit(0);
}

for (const signal of ['SIGTERM', 'SIGINT'] as const) process.on(signal, () => { stopping = true; log(`${signal} received, stopping after the current step`); });

if (argument('once') !== undefined) void once().catch(cause => { console.error(cause instanceof Error ? cause.message : cause); process.exit(1); });
else void loop();
