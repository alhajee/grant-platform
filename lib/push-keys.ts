import type { QueryResult, QueryResultRow } from 'pg';
import { openSecret, sealSecret } from './secret-box';

/**
 * UBEC260: the VAPID key pair web push is signed with. Made on first use and kept in `push_settings` (migration 102),
 * the private key sealed with AUTH_SECRET, so push needs no deployment settings. Changing AUTH_SECRET makes the
 * private key unreadable: a new pair is then made and every device turns alerts on again.
 */
type Db = { query<R extends QueryResultRow = QueryResultRow>(sql: string, values?: unknown[]): Promise<QueryResult<R>> };
export type PushKeys = { publicKey: string; privateKey: string };

async function generate(): Promise<PushKeys> {
  const { default: webpush } = await import('web-push');
  return webpush.generateVAPIDKeys();
}

/** The stored pair, or a new one (concurrent first calls agree on the row that landed). */
export async function readPushKeys(db: Db): Promise<PushKeys> {
  const stored = (await db.query<{ public_key: string; private_key_ciphertext: string }>('SELECT public_key,private_key_ciphertext FROM push_settings WHERE id')).rows[0];
  if (stored) {
    try { return { publicKey: stored.public_key, privateKey: await openSecret(stored.private_key_ciphertext) }; }
    catch {
      // AUTH_SECRET changed: start again with a new pair; earlier subscriptions belong to the old key.
      console.warn('Web push keys could not be opened; making a new pair (devices must turn alerts on again)');
      const fresh = await generate();
      await db.query('UPDATE push_settings SET public_key=$1,private_key_ciphertext=$2,created_at=NOW() WHERE id', [fresh.publicKey, await sealSecret(fresh.privateKey)]);
      await db.query('DELETE FROM push_subscriptions');
      return fresh;
    }
  }
  const fresh = await generate();
  await db.query('INSERT INTO push_settings(public_key,private_key_ciphertext) VALUES($1,$2) ON CONFLICT (id) DO NOTHING', [fresh.publicKey, await sealSecret(fresh.privateKey)]);
  return readPushKeys(db);
}
