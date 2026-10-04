// Per-state cache of the school lists read by the School register and the component editors' school pickers.
// Only state-wide data that every caller already passed its permission check for is cached; nothing per user.
// Keys: beapms:schools:<state>:v<version>:<list>. Invalidation bumps the state's version, so old entries simply
// expire. Without Redis (or while it is down) every read goes straight to PostgreSQL.
import { getRedis, redisReportError } from './redis';

const ttlSeconds = 60 * 60;
const prefix = 'beapms:schools';
const versionKey = (stateCode: string) => `${prefix}:${stateCode}:version`;

export type SchoolList = 'sports' | 'activities' | 'infrastructure' | 'register-facets' | 'lgas';

export async function cachedSchoolList<T>(stateCode: string, list: SchoolList, load: () => Promise<T>): Promise<T> {
  const redis = await getRedis();
  if (!redis) return load();
  let key: string | null = null;
  try {
    key = `${prefix}:${stateCode}:v${(await redis.get(versionKey(stateCode))) ?? '0'}:${list}`;
    const hit = await redis.get(key);
    if (hit) return JSON.parse(hit) as T;
  } catch (cause) { redisReportError(cause); key = null; }
  const value = await load();
  if (key) await redis.set(key, JSON.stringify(value), 'EX', ttlSeconds).catch(redisReportError);
  return value;
}

/** Call after any change to a state's schools has committed (sync, add, edit, delete, import, purge). */
export async function invalidateSchoolLists(stateCodes: Iterable<string>) {
  const states = [...new Set(stateCodes)];
  const redis = states.length ? await getRedis() : null;
  if (!redis) return;
  try {
    const pipeline = redis.pipeline();
    for (const state of states) pipeline.incr(versionKey(state));
    await pipeline.exec();
  } catch (cause) { redisReportError(cause); }
}
