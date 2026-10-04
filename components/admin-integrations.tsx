'use client';

import { useCallback, useEffect, useState } from 'react';
import { CircleAlertIcon, CircleCheckIcon } from 'lucide-react';
import { toast } from 'sonner';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { Switch } from '@/components/ui/switch';
import { formatDateTime } from '@/components/admin-activity-format';
import { DnemisSync } from '@/components/admin-dnemis-sync';

type DnemisSettings = {
  baseUrl: string; enabled: boolean; tokenSet: boolean; tokenLast4: string | null; updatedAt: string | null; updatedBy: string | null;
  lastTestedAt: string | null; lastTestOk: boolean | null; lastTestMessage: string | null; source: 'database' | 'environment' | 'none';
};
type Draft = { baseUrl: string; enabled: boolean; token: string; clearToken: boolean };
type Response = { dnemis?: DnemisSettings; error?: string };

const endpoint = '/api/admin/integrations';
const draftFrom = (settings: DnemisSettings): Draft => ({ baseUrl: settings.baseUrl, enabled: settings.enabled, token: '', clearToken: false });

async function request(init?: RequestInit) {
  const response = await fetch(endpoint, { cache: 'no-store', ...init, headers: { 'Content-Type': 'application/json', ...init?.headers } });
  const body = await response.json().catch(() => ({})) as Response;
  if (!response.ok || !body.dnemis) throw Error(body.error || 'Unable to reach the integration settings.');
  return body.dnemis;
}

function TestStatus({ settings }: { settings: DnemisSettings }) {
  if (!settings.lastTestedAt) return null;
  const ok = settings.lastTestOk === true;
  return <Alert variant={ok ? 'default' : 'destructive'}>
    {ok ? <CircleCheckIcon /> : <CircleAlertIcon />}
    <AlertTitle>{ok ? 'Connected' : 'Connection failed'}</AlertTitle>
    <AlertDescription><p>{settings.lastTestMessage}</p><p className="text-muted-foreground">{formatDateTime(settings.lastTestedAt)}</p></AlertDescription>
  </Alert>;
}

function TokenField({ settings, draft, onChange }: { settings: DnemisSettings; draft: Draft; onChange: (next: Partial<Draft>) => void }) {
  const saved = settings.tokenSet && !draft.clearToken;
  return <Field>
    <FieldLabel htmlFor="dnemis-token">Personal access token</FieldLabel>
    <Input id="dnemis-token" type="password" autoComplete="off" spellCheck={false} value={draft.token} maxLength={300}
      placeholder={saved ? 'Paste a new token to replace it' : 'Paste token'}
      onChange={event => onChange({ token: event.target.value, clearToken: false })} />
    <FieldDescription>
      {saved && !draft.token && <>Ends in ••••{settings.tokenLast4}. <Button type="button" variant="link" className="h-auto p-0" onClick={() => onChange({ clearToken: true, token: '', enabled: false })}>Remove</Button></>}
      {draft.clearToken && <>Removed when you save. <Button type="button" variant="link" className="h-auto p-0" onClick={() => onChange({ clearToken: false })}>Keep it</Button></>}
    </FieldDescription>
  </Field>;
}

export function AdminIntegrations() {
  const [settings, setSettings] = useState<DnemisSettings | null>(null), [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState(''), [saving, setSaving] = useState(false), [testing, setTesting] = useState(false);
  const apply = useCallback((next: DnemisSettings) => { setSettings(next); setDraft(draftFrom(next)); }, []);
  const load = useCallback(async () => {
    setError('');
    try { apply(await request()); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to load integration settings.'); }
  }, [apply]);
  useEffect(() => { void Promise.resolve().then(load); }, [load]);

  if (error) return <Alert variant="destructive"><AlertTitle>Unable to load integrations</AlertTitle><AlertDescription>{error}<Button variant="outline" size="sm" onClick={() => void load()}>Try again</Button></AlertDescription></Alert>;
  if (!settings || !draft) return <Skeleton className="h-96 w-full" />;

  const dirty = draft.baseUrl.trim() !== settings.baseUrl || draft.enabled !== settings.enabled || Boolean(draft.token.trim()) || draft.clearToken;
  const canTurnOn = Boolean(draft.token.trim()) || (settings.tokenSet && !draft.clearToken);
  const change = (next: Partial<Draft>) => setDraft(current => current && ({ ...current, ...next }));

  const save = async () => {
    setSaving(true);
    try {
      const body = { baseUrl: draft.baseUrl, enabled: draft.enabled, ...(draft.token.trim() ? { token: draft.token } : {}), ...(draft.clearToken ? { clearToken: true } : {}) };
      apply(await request({ method: 'PUT', body: JSON.stringify(body) }));
      toast.success('DNEMIS settings saved');
    } catch (cause) { toast.error(cause instanceof Error ? cause.message : 'Unable to save the DNEMIS settings.'); }
    finally { setSaving(false); }
  };
  const test = async () => {
    setTesting(true);
    try {
      // Tests what is in the form, saved or not; only a test of the saved settings is remembered.
      const response = await fetch(endpoint, { method: 'POST', cache: 'no-store', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'test', baseUrl: draft.baseUrl, ...(draft.token.trim() ? { token: draft.token } : {}) }) });
      const body = await response.json().catch(() => ({})) as Response & { result?: { ok: boolean; message: string } };
      if (!response.ok || !body.result) throw Error(body.error || 'Unable to test the DNEMIS connection.');
      if (body.dnemis) setSettings(body.dnemis);
      if (body.result.ok) toast.success(body.result.message || 'Connected to DNEMIS'); else toast.error(body.result.message || 'DNEMIS connection failed');
    } catch (cause) { toast.error(cause instanceof Error ? cause.message : 'Unable to test the DNEMIS connection.'); }
    finally { setTesting(false); }
  };

  return <Card>
    <CardHeader className="border-b">
      <CardTitle>DNEMIS (DHIS2)</CardTitle>
      <CardDescription>School and enrolment data</CardDescription>
      <CardAction><Switch id="dnemis-enabled" aria-label="Use DNEMIS" checked={draft.enabled} disabled={!canTurnOn && !draft.enabled} onCheckedChange={enabled => change({ enabled })} /></CardAction>
    </CardHeader>
    <CardContent>
      <FieldGroup className="max-w-2xl">
        <Field>
          <FieldLabel htmlFor="dnemis-url">Server address</FieldLabel>
          <Input id="dnemis-url" type="url" inputMode="url" value={draft.baseUrl} maxLength={300} onChange={event => change({ baseUrl: event.target.value })} />
        </Field>
        <TokenField settings={settings} draft={draft} onChange={change} />
        <TestStatus settings={settings} />
        <DnemisSync ready={settings.enabled && settings.tokenSet && !dirty} />
      </FieldGroup>
    </CardContent>
    <CardFooter className="flex-wrap justify-between gap-2 border-t">
      <p className="text-xs text-muted-foreground">{dirty ? 'Unsaved changes' : settings.updatedAt ? `Updated ${formatDateTime(settings.updatedAt)}` : ''}</p>
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="outline" onClick={() => void test()} disabled={testing || !(draft.token.trim() || (settings.tokenSet && !draft.clearToken))}>{testing && <Spinner data-icon="inline-start" />}Test</Button>
        <Button onClick={() => void save()} disabled={saving || !dirty}>{saving && <Spinner data-icon="inline-start" />}Save</Button>
      </div>
    </CardFooter>
  </Card>;
}
