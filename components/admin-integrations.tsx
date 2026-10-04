'use client';

import { useCallback, useEffect, useState } from 'react';
import { CircleAlertIcon, CircleCheckIcon, PlugZapIcon } from 'lucide-react';
import { toast } from 'sonner';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, FieldContent, FieldDescription, FieldGroup, FieldLabel, FieldTitle } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { Switch } from '@/components/ui/switch';
import { formatDateTime } from '@/components/admin-activity-format';

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
  if (!settings.lastTestedAt) return <FieldDescription>Not tested yet. Save your changes, then use Test connection.</FieldDescription>;
  const ok = settings.lastTestOk === true;
  return <Alert variant={ok ? 'default' : 'destructive'}>
    {ok ? <CircleCheckIcon /> : <CircleAlertIcon />}
    <AlertTitle>{ok ? 'Connected' : 'Connection failed'}</AlertTitle>
    <AlertDescription><p>{settings.lastTestMessage}</p><p className="text-muted-foreground">Last tested {formatDateTime(settings.lastTestedAt)}</p></AlertDescription>
  </Alert>;
}

function TokenField({ settings, draft, onChange }: { settings: DnemisSettings; draft: Draft; onChange: (next: Partial<Draft>) => void }) {
  const saved = settings.tokenSet && !draft.clearToken;
  return <Field>
    <FieldLabel htmlFor="dnemis-token">Personal access token</FieldLabel>
    <Input id="dnemis-token" type="password" autoComplete="off" spellCheck={false} value={draft.token} maxLength={300}
      placeholder={saved ? `Saved · ends in ••••${settings.tokenLast4 ?? ''}` : 'Paste the token from your DNEMIS profile'}
      onChange={event => onChange({ token: event.target.value, clearToken: false })} />
    <FieldDescription>
      {saved && !draft.token && <>Saved · ends in ••••{settings.tokenLast4}. Type a new token only to replace it. <Button type="button" variant="link" className="h-auto p-0" onClick={() => onChange({ clearToken: true, token: '', enabled: false })}>Remove</Button></>}
      {saved && draft.token && <>The new token replaces the saved one when you save.</>}
      {draft.clearToken && <>The saved token will be removed when you save. <Button type="button" variant="link" className="h-auto p-0" onClick={() => onChange({ clearToken: false })}>Keep it</Button></>}
      {!settings.tokenSet && !draft.clearToken && <>In DNEMIS, open your profile, choose Personal access tokens and create one. It is stored encrypted and never shown again.</>}
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
      const next = await request({ method: 'POST', body: JSON.stringify({ action: 'test' }) });
      setSettings(next);
      if (next.lastTestOk) toast.success('Connected to DNEMIS'); else toast.error('DNEMIS connection failed');
    } catch (cause) { toast.error(cause instanceof Error ? cause.message : 'Unable to test the DNEMIS connection.'); }
    finally { setTesting(false); }
  };

  return <Card>
    <CardHeader className="border-b">
      <CardTitle>DNEMIS (DHIS2)</CardTitle>
      <CardDescription>Connect the portal to DNEMIS, the national education data system, so school and enrolment figures can come from it.</CardDescription>
      <CardAction><Badge variant={settings.enabled ? 'default' : 'secondary'}>{settings.enabled ? 'On' : 'Off'}</Badge></CardAction>
    </CardHeader>
    <CardContent>
      <FieldGroup className="max-w-2xl">
        {settings.source === 'environment' && <Alert><PlugZapIcon /><AlertTitle>Using server settings</AlertTitle><AlertDescription>DNEMIS is currently set up on the server. Saving here takes over from those settings.</AlertDescription></Alert>}
        <Field>
          <FieldLabel htmlFor="dnemis-url">Server address</FieldLabel>
          <Input id="dnemis-url" type="url" inputMode="url" value={draft.baseUrl} maxLength={300} onChange={event => change({ baseUrl: event.target.value })} />
          <FieldDescription>The DHIS2 address, without /api. It must start with https://.</FieldDescription>
        </Field>
        <TokenField settings={settings} draft={draft} onChange={change} />
        <Field orientation="horizontal">
          <FieldContent>
            <FieldTitle>Use DNEMIS</FieldTitle>
            <FieldDescription>{canTurnOn ? 'When on, the portal may read data from DNEMIS.' : 'Add an access token before turning this on.'}</FieldDescription>
          </FieldContent>
          <Switch id="dnemis-enabled" aria-label="Use DNEMIS" checked={draft.enabled} disabled={!canTurnOn && !draft.enabled} onCheckedChange={enabled => change({ enabled })} />
        </Field>
        <TestStatus settings={settings} />
        {settings.updatedAt && <FieldDescription>Last changed {formatDateTime(settings.updatedAt)}{settings.updatedBy ? ` by ${settings.updatedBy}` : ''}.</FieldDescription>}
      </FieldGroup>
    </CardContent>
    <CardFooter className="flex-wrap justify-between gap-2 border-t">
      <Badge variant={dirty ? 'outline' : 'secondary'}>{dirty ? 'Unsaved changes' : 'Saved'}</Badge>
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="outline" onClick={() => void test()} disabled={testing || dirty || !settings.tokenSet} title={dirty ? 'Save your changes first' : undefined}>{testing && <Spinner data-icon="inline-start" />}Test connection</Button>
        <Button onClick={() => void save()} disabled={saving || !dirty}>{saving && <Spinner data-icon="inline-start" />}Save changes</Button>
      </div>
    </CardFooter>
  </Card>;
}
