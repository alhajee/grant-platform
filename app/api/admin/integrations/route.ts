import { NextRequest } from 'next/server';
import { z } from 'zod';
import { getPostgres } from '@/lib/postgres';
import { isSameRequestOrigin } from '@/lib/request-origin';
import { noStoreJson as json, requireSuperAdmin } from '@/lib/admin-activity-server';
import { sealSecret, SecretBoxConfigError, SecretBoxDecryptError } from '@/lib/secret-box';
import { assertPublicDnemisHost, defaultDnemisBaseUrl, DnemisUrlError, normaliseDnemisBaseUrl } from '@/lib/dnemis-url';
import { getDnemisConfig, testDnemisConnection, type DnemisConfig } from '@/lib/dnemis';

// Super Admin settings for the DNEMIS (DHIS2) connection. Responses never contain the token.
const putSchema = z.object({
  baseUrl: z.string().max(500),
  enabled: z.boolean(),
  token: z.string().max(500).optional(),
  clearToken: z.boolean().optional(),
}).strict();
// Test may use unsaved values from the form: an address and/or a newly typed token.
const postSchema = z.object({ action: z.literal('test'), baseUrl: z.string().max(500).optional(), token: z.string().max(500).optional() }).strict();
const tokenPattern = /^[\x21-\x7e]{8,300}$/;

type SettingsRow = {
  baseUrl: string; enabled: boolean; tokenLast4: string | null; ciphertext: string | null; updatedAt: string | null; updatedBy: string | null;
  lastTestedAt: string | null; lastTestOk: boolean | null; lastTestMessage: string | null;
};

async function readRow() {
  return (await getPostgres().query<SettingsRow>(`
    SELECT s.base_url AS "baseUrl", s.enabled, s.token_last4 AS "tokenLast4", s.token_ciphertext AS ciphertext, s.updated_at AS "updatedAt",
      u.full_name AS "updatedBy", s.last_tested_at AS "lastTestedAt", s.last_test_ok AS "lastTestOk", s.last_test_message AS "lastTestMessage"
    FROM integration_settings s LEFT JOIN users u ON u.id = s.updated_by WHERE s.provider = 'dnemis'`)).rows[0] ?? null;
}

async function publicSettings() {
  const row = await readRow();
  if (row) {
    const { ciphertext, ...rest } = row;
    return { dnemis: { ...rest, tokenSet: Boolean(ciphertext), source: 'database' as const } };
  }
  const env = await getDnemisConfig(getPostgres());
  return { dnemis: {
    baseUrl: env?.baseUrl ?? defaultDnemisBaseUrl, enabled: false, tokenSet: false, tokenLast4: null, updatedAt: null, updatedBy: null,
    lastTestedAt: null, lastTestOk: null, lastTestMessage: null, source: env?.token ? 'environment' as const : 'none' as const,
  } };
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireSuperAdmin(request);
    if (auth.error) return auth.error;
    return json(await publicSettings());
  } catch (cause) {
    console.error('Integration settings could not be loaded', cause instanceof Error ? cause.message : 'unknown error');
    return json({ error: 'Unable to load integration settings.' }, 503);
  }
}

export async function PUT(request: NextRequest) {
  try {
    if (!isSameRequestOrigin(request)) return json({ error: 'This action must come from the portal.' }, 403);
    const auth = await requireSuperAdmin(request);
    if (auth.error) return auth.error;
    const parsed = putSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return json({ error: 'Check the DNEMIS settings and try again.' }, 400);
    const { enabled, clearToken = false } = parsed.data;
    const token = parsed.data.token?.trim() ?? '';
    if (clearToken && token) return json({ error: 'Either enter a new token or remove the saved one, not both.' }, 400);
    if (token && !tokenPattern.test(token)) return json({ error: 'The access token looks wrong. Paste the whole token without spaces.' }, 400);

    let baseUrl: string;
    try { baseUrl = normaliseDnemisBaseUrl(parsed.data.baseUrl); await assertPublicDnemisHost(baseUrl); }
    catch (cause) {
      if (cause instanceof DnemisUrlError) return json({ error: cause.message }, 400);
      throw cause;
    }

    const existing = await readRow();
    const keepsToken = !token && !clearToken && Boolean(existing?.ciphertext);
    if (keepsToken && existing && new URL(existing.baseUrl).origin !== new URL(baseUrl).origin) {
      return json({ error: 'Enter the access token again when you change the server, so the saved token is never sent to a different server.' }, 400);
    }
    if (enabled && !token && !keepsToken) return json({ error: 'Add an access token before turning the DNEMIS connection on.' }, 400);

    const ciphertext = token ? await sealSecret(token) : keepsToken ? existing!.ciphertext : null;
    const last4 = token ? token.slice(-4) : keepsToken ? existing!.tokenLast4 : null;
    const connectionChanged = !existing || existing.baseUrl !== baseUrl || Boolean(token) || clearToken;
    await getPostgres().query(`
      INSERT INTO integration_settings(provider, base_url, token_ciphertext, token_last4, enabled, updated_by, updated_at)
      VALUES('dnemis', $1, $2, $3, $4, $5, NOW())
      ON CONFLICT(provider) DO UPDATE SET base_url = EXCLUDED.base_url, token_ciphertext = EXCLUDED.token_ciphertext,
        token_last4 = EXCLUDED.token_last4, enabled = EXCLUDED.enabled, updated_by = EXCLUDED.updated_by, updated_at = NOW(),
        last_tested_at = CASE WHEN $6::boolean THEN NULL ELSE integration_settings.last_tested_at END,
        last_test_ok = CASE WHEN $6::boolean THEN NULL ELSE integration_settings.last_test_ok END,
        last_test_message = CASE WHEN $6::boolean THEN NULL ELSE integration_settings.last_test_message END`,
    [baseUrl, ciphertext, last4, enabled, auth.actor.userId, connectionChanged]);
    return json(await publicSettings());
  } catch (cause) {
    if (cause instanceof SecretBoxConfigError) return json({ error: cause.message }, 503);
    console.error('Integration settings could not be saved', cause instanceof Error ? cause.message : 'unknown error');
    return json({ error: 'Unable to save the DNEMIS settings.' }, 503);
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!isSameRequestOrigin(request)) return json({ error: 'This action must come from the portal.' }, 403);
    const auth = await requireSuperAdmin(request);
    if (auth.error) return auth.error;
    const parsed = postSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return json({ error: 'Unknown action.' }, 400);
    const db = getPostgres();
    const saved = await getDnemisConfig(db);
    const typedToken = parsed.data.token?.trim() ?? '';
    if (typedToken && !tokenPattern.test(typedToken)) return json({ error: 'The access token looks wrong. Paste the whole token without spaces.' }, 400);
    let baseUrl = saved?.baseUrl ?? defaultDnemisBaseUrl;
    if (parsed.data.baseUrl !== undefined) {
      try { baseUrl = normaliseDnemisBaseUrl(parsed.data.baseUrl); await assertPublicDnemisHost(baseUrl); }
      catch (cause) { if (cause instanceof DnemisUrlError) return json({ error: cause.message }, 400); throw cause; }
    }
    // The saved token only ever goes to the saved server; a different address needs the token typed again.
    if (!typedToken && saved && new URL(saved.baseUrl).origin !== new URL(baseUrl).origin) return json({ error: 'Enter the access token to test a different server.' }, 400);
    const config: DnemisConfig | null = typedToken ? { source: saved?.source ?? 'database', enabled: saved?.enabled ?? false, baseUrl, token: typedToken } : saved ? { ...saved, baseUrl } : null;
    // Only a test of exactly the saved settings is recorded on them.
    const testsSaved = !typedToken && (!saved || saved.baseUrl === baseUrl);
    let result;
    try { result = await testDnemisConnection(config); }
    catch (cause) {
      if (!(cause instanceof SecretBoxDecryptError || cause instanceof SecretBoxConfigError)) throw cause;
      result = { ok: false, message: 'The saved access token can no longer be read (the server secret may have changed). Enter the token again.', testedAt: new Date().toISOString() };
    }
    if (testsSaved) await db.query(`UPDATE integration_settings SET last_tested_at = $1, last_test_ok = $2, last_test_message = $3 WHERE provider = 'dnemis'`,
      [result.testedAt, result.ok, result.message]);
    return json({ result, ...(await publicSettings()) });
  } catch (cause) {
    console.error('DNEMIS connection test could not run', cause instanceof Error ? cause.message : 'unknown error');
    return json({ error: 'Unable to test the DNEMIS connection.' }, 503);
  }
}
