// DNEMIS (DHIS2) client. The connection is configured by the Super Admin (integration_settings, migration 043);
// server environment variables are only a fallback when no row has been saved. The token is sent as
// `Authorization: ApiToken <token>` and is never included in errors, logs or API responses.
import type { QueryResult, QueryResultRow } from 'pg';
import { openSecret } from '@/lib/secret-box';
import { assertPublicDnemisHost, defaultDnemisBaseUrl, DnemisUrlError, normaliseDnemisBaseUrl } from '@/lib/dnemis-url';

type Db = { query<R extends QueryResultRow>(sql: string, values?: unknown[]): Promise<QueryResult<R>> };
export type DnemisConfig = { source: 'database' | 'environment'; baseUrl: string; token: string | null; enabled: boolean };
export type DnemisErrorKind = 'not_configured' | 'invalid_url' | 'unauthorised' | 'timeout' | 'network' | 'bad_response';
export type DnemisTestResult = {
  ok: boolean; message: string; testedAt: string;
  details?: { displayName: string; username: string; version: string; serverDate: string | null; organisationUnits: { id: string; displayName: string; level: number | null }[] };
};

const timeoutMs = 15_000;
const maxResponseBytes = 5_000_000;
const tokenPlaceholder = 'paste-token-here';

export class DnemisError extends Error {
  constructor(message: string, readonly kind: DnemisErrorKind) { super(message); this.name = 'DnemisError'; }
}

const usableToken = (value: string | undefined | null) => {
  const token = value?.trim();
  return token && token !== tokenPlaceholder ? token : null;
};

export async function getDnemisConfig(db: Db): Promise<DnemisConfig | null> {
  const row = (await db.query<{ baseUrl: string; ciphertext: string | null; enabled: boolean }>(
    `SELECT base_url AS "baseUrl", token_ciphertext AS ciphertext, enabled FROM integration_settings WHERE provider='dnemis'`,
  )).rows[0];
  if (row) return { source: 'database', baseUrl: row.baseUrl, token: row.ciphertext ? await openSecret(row.ciphertext) : null, enabled: row.enabled };
  const envUrl = process.env.DNEMIS_URL?.trim(), envToken = usableToken(process.env.DNEMIS_TOKEN);
  if (!envUrl && !envToken) return null;
  return { source: 'environment', baseUrl: envUrl || defaultDnemisBaseUrl, token: envToken, enabled: Boolean(envUrl && envToken) };
}

function networkMessage(cause: unknown, host: string) {
  if (cause instanceof Error && (cause.name === 'TimeoutError' || cause.name === 'AbortError')) return new DnemisError(`DNEMIS did not respond within ${timeoutMs / 1000} seconds.`, 'timeout');
  const code = (cause as { cause?: { code?: unknown } })?.cause?.code;
  return new DnemisError(`Could not reach DNEMIS at ${host}${typeof code === 'string' && /^[A-Z_]+$/.test(code) ? ` (${code})` : ''}. Check the address and the server's internet access.`, 'network');
}

/** DHIS2's short error message, cleaned for display: never contains the token, plain characters, at most 120. */
async function serverReason(response: Response, token: string) {
  if (!/json/i.test(response.headers.get('content-type') ?? '')) return '';
  try {
    const body = JSON.parse((await response.text()).slice(0, 10_000)) as { message?: unknown };
    if (typeof body.message !== 'string') return '';
    return body.message.split(token).join('[token]').replace(/[^\x20-\x7e]/g, '').replace(/[()]/g, '').trim().slice(0, 120);
  } catch { return ''; }
}

/** GET a DHIS2 API path (must start with /api/) and return parsed JSON. */
export async function dhis2Fetch<T = unknown>(path: string, config: DnemisConfig, init: { signal?: AbortSignal } = {}): Promise<T> {
  if (!path.startsWith('/api/') || path.includes('..') || path.includes('//')) throw new DnemisError('Invalid DNEMIS API path.', 'bad_response');
  if (!config.token) throw new DnemisError('Add a DNEMIS personal access token first.', 'not_configured');
  let baseUrl: string;
  try { baseUrl = normaliseDnemisBaseUrl(config.baseUrl); await assertPublicDnemisHost(baseUrl); }
  catch (cause) { throw new DnemisError(cause instanceof DnemisUrlError ? cause.message : 'The DNEMIS address is not valid.', 'invalid_url'); }
  const host = new URL(baseUrl).host;
  let response: Response;
  try {
    response = await fetch(`${baseUrl}${path}`, {
      method: 'GET', redirect: 'manual', cache: 'no-store',
      signal: init.signal ? AbortSignal.any([init.signal, AbortSignal.timeout(timeoutMs)]) : AbortSignal.timeout(timeoutMs),
      headers: { Authorization: `ApiToken ${config.token}`, Accept: 'application/json' },
    });
  } catch (cause) { throw networkMessage(cause, host); }
  const contentType = response.headers.get('content-type') ?? '';
  if ((response.status >= 300 && response.status < 400) || response.type === 'opaqueredirect') {
    throw new DnemisError('DNEMIS did not accept the access token (it redirected to its sign-in page). Check that the token is correct and has not expired.', 'unauthorised');
  }
  if (!response.ok) {
    const reason = await serverReason(response, config.token);
    // DHIS2 answers a malformed or unknown token with 400/401 and `WWW-Authenticate: ApiToken`.
    if (response.status === 401 || response.status === 403 || response.headers.has('www-authenticate')) {
      throw new DnemisError(`DNEMIS did not accept the access token${reason ? ` (${reason})` : ''}. Check that the token is correct, has not expired and is allowed for this server.`, 'unauthorised');
    }
    throw new DnemisError(`DNEMIS returned an error (HTTP ${response.status}${reason ? `: ${reason}` : ''}).`, 'bad_response');
  }
  if (/text\/html/i.test(contentType)) throw new DnemisError('DNEMIS returned its sign-in page instead of data. Check the access token.', 'unauthorised');
  if (!/json/i.test(contentType)) throw new DnemisError('DNEMIS returned an unexpected response. Check that the address points at the DHIS2 server (it usually ends in /dhis).', 'bad_response');
  const declared = Number(response.headers.get('content-length') ?? 0);
  if (declared > maxResponseBytes) throw new DnemisError('The DNEMIS response was too large.', 'bad_response');
  let text: string;
  try { text = await response.text(); } catch (cause) { throw networkMessage(cause, host); }
  if (text.length > maxResponseBytes) throw new DnemisError('The DNEMIS response was too large.', 'bad_response');
  try { return JSON.parse(text) as T; } catch { throw new DnemisError('DNEMIS returned data that could not be read.', 'bad_response'); }
}

type DhisMe = { id?: string; username?: string; displayName?: string; organisationUnits?: { id?: string; displayName?: string; level?: number }[] };
type DhisInfo = { version?: string; serverDate?: string };

function orgUnitSummary(units: { displayName: string }[]) {
  if (!units.length) return 'no organisation units assigned';
  const names = units.slice(0, 3).map(unit => unit.displayName).join(', ');
  return units.length > 3 ? `${names} and ${units.length - 3} more` : names;
}

/** Checks the token against /api/me and the server version against /api/system/info. Never throws. */
export async function testDnemisConnection(config: DnemisConfig | null): Promise<DnemisTestResult> {
  const testedAt = new Date().toISOString();
  if (!config) return { ok: false, message: 'DNEMIS is not set up yet. Save the server address and access token first.', testedAt };
  try {
    const [me, info] = await Promise.all([
      dhis2Fetch<DhisMe>('/api/me?fields=id,username,displayName,organisationUnits[id,displayName,level]', config),
      dhis2Fetch<DhisInfo>('/api/system/info?fields=version,serverDate', config),
    ]);
    const organisationUnits = (me.organisationUnits ?? []).map(unit => ({ id: String(unit.id ?? ''), displayName: String(unit.displayName ?? unit.id ?? 'Unnamed'), level: typeof unit.level === 'number' ? unit.level : null }));
    const displayName = String(me.displayName ?? me.username ?? 'unknown user'), version = String(info.version ?? 'unknown');
    return {
      ok: true, testedAt,
      message: `Connected as ${displayName} · DHIS2 ${version} · ${orgUnitSummary(organisationUnits)}`.slice(0, 300),
      details: { displayName, username: String(me.username ?? ''), version, serverDate: info.serverDate ?? null, organisationUnits },
    };
  } catch (cause) {
    if (cause instanceof DnemisError) return { ok: false, message: cause.message, testedAt };
    console.error('DNEMIS connection test failed unexpectedly', cause instanceof Error ? cause.name : 'unknown error');
    return { ok: false, message: 'The connection test failed unexpectedly. Try again.', testedAt };
  }
}
