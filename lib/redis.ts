// Optional Redis connection (REDIS_URL). Everything that uses it must also work without it:
// no REDIS_URL (local dev, tests) means no cache and DNEMIS syncs run in the web process.
// ioredis is loaded only when REDIS_URL is set, so the Workers-based dev server never imports it.
// The URL may hold a password, so it is never logged.
import type { Redis } from 'ioredis';

let connection: Promise<Redis | null> | null = null;
let warned = false;

export const redisConfigured = () => Boolean(process.env.REDIS_URL?.trim());

function warn(cause: unknown) {
  if (warned) return;
  warned = true;
  console.error('Redis is unavailable; continuing without it', cause instanceof Error ? cause.message.slice(0, 200) : 'unknown error');
}

async function connect(): Promise<Redis | null> {
  try {
    const { default: RedisClient } = await import('ioredis');
    const redis = new RedisClient(process.env.REDIS_URL!.trim(), { maxRetriesPerRequest: 1, connectTimeout: 2000, enableOfflineQueue: false });
    redis.on('error', warn);
    redis.on('ready', () => { warned = false; });
    // Wait briefly for the first connection so the first request can use it; later outages fail open per command.
    await new Promise<void>(resolve => {
      const timer = setTimeout(resolve, 2000);
      redis.once('ready', () => { clearTimeout(timer); resolve(); });
    });
    return redis;
  } catch (cause) {
    warn(cause);
    return null;
  }
}

/** The shared client, or null when REDIS_URL is unset. Commands can still fail while Redis is down: callers fail open. */
export function getRedis(): Promise<Redis | null> {
  if (!redisConfigured()) return Promise.resolve(null);
  connection ??= connect();
  return connection;
}

/** A separate connection for blocking commands (BRPOP); the caller closes it. */
export async function newRedisConnection(): Promise<Redis | null> {
  if (!redisConfigured()) return null;
  const { default: RedisClient } = await import('ioredis');
  const redis = new RedisClient(process.env.REDIS_URL!.trim(), { maxRetriesPerRequest: null, connectTimeout: 5000 });
  redis.on('error', warn);
  return redis;
}

export function redisReportError(cause: unknown) { warn(cause); }
