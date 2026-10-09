import { z } from 'zod';

/**
 * Saves on weak connections (migration 058). A create carries a client key, a UUID made when the draft is started and
 * kept for every retry of that draft, so a save that reached the server but whose response was lost is never stored
 * twice: the API answers a repeated key with the row it already saved ({ id, replayed: true }).
 */
export const clientKeySchema = z.string().uuid('Invalid request key.').optional();

/** A new client key (crypto.randomUUID needs a secure context; the fallback builds the same RFC 4122 v4 form). */
export function newClientKey(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map(b => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** How long a save may take before the editor stops waiting and checks what the server has. */
export const saveTimeoutMs = 30_000;
export const connectionDroppedMessage = 'Your connection dropped before the save finished. Check the list, then try again.';

/** The request failed in transit (network error, abort, timeout or a reply that is not the API's JSON): the save may or may not have happened. */
export class ConnectionDroppedError extends Error {
  constructor() { super(connectionDroppedMessage); this.name = 'ConnectionDroppedError'; }
}
export const isConnectionDropped = (cause: unknown): cause is ConnectionDroppedError => cause instanceof ConnectionDroppedError;

export type JsonReply<T> = { ok: boolean; status: number; data: T };

/** POSTs JSON and reads the JSON reply, or throws ConnectionDroppedError when the outcome is unknown. */
export async function postJson<T extends object>(url: string, body: unknown, timeoutMs: number = saveTimeoutMs): Promise<JsonReply<T>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: controller.signal });
    const data = await response.json() as T;
    if (!data || typeof data !== 'object') throw new Error('Not the API reply.');
    return { ok: response.ok, status: response.status, data };
  } catch {
    throw new ConnectionDroppedError();
  } finally {
    clearTimeout(timer);
  }
}

/** After a dropped inline cell save: whether the reloaded line already holds the value (the update landed). */
export const cellMatches = (line: { quantity: number; unitCost: number; description: string }, field: 'quantity' | 'unitCost' | 'description', value: string): boolean =>
  field === 'description' ? line.description === value.trim() : Number(line[field]) === Number(value);
