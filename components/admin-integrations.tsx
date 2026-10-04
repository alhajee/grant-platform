'use client';
import './admin-integrations.css';

import { useCallback, useEffect, useState } from 'react';
import { DatabaseIcon } from 'lucide-react';
import { toast } from 'sonner';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemSeparator, ItemTitle } from '@/components/ui/item';
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

/** One row of the settings list: label on the left, the control on the right. */
function Row({ label, children, hint }: { label: string; children: React.ReactNode; hint?: React.ReactNode }) {
  return <Item size="sm" className="settings-row">
    <ItemContent><ItemTitle>{label}</ItemTitle>{hint && <ItemDescription>{hint}</ItemDescription>}</ItemContent>
    <ItemActions className="settings-row-control">{children}</ItemActions>
  </Item>;
}

function Status({ settings }: { settings: DnemisSettings }) {
  if (!settings.lastTestedAt) return <span className="settings-status">Not tested</span>;
  const ok = settings.lastTestOk === true;
  return <span className="settings-status" data-ok={ok} title={`${settings.lastTestMessage ?? ''} · ${formatDateTime(settings.lastTestedAt)}`}>
    <i aria-hidden="true" />{ok ? 'Connected' : 'Failed'}
  </span>;
}

/** DNEMIS connection settings, laid out like a system settings pane: grouped rows, a master switch, quiet text. */
export function AdminIntegrations() {
  const [settings, setSettings] = useState<DnemisSettings | null>(null), [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState(''), [saving, setSaving] = useState(false), [testing, setTesting] = useState(false);
  const [editingToken, setEditingToken] = useState(false);
  const apply = useCallback((next: DnemisSettings) => { setSettings(next); setDraft(draftFrom(next)); setEditingToken(false); }, []);
  const load = useCallback(async () => {
    setError('');
    try { apply(await request()); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to load integration settings.'); }
  }, [apply]);
  useEffect(() => { void Promise.resolve().then(load); }, [load]);

  if (error) return <Alert variant="destructive"><AlertTitle>Unable to load integrations</AlertTitle><AlertDescription>{error}<Button variant="outline" size="sm" onClick={() => void load()}>Try again</Button></AlertDescription></Alert>;
  if (!settings || !draft) return <Skeleton className="mx-auto h-80 w-full max-w-xl rounded-2xl" />;

  const dirty = draft.baseUrl.trim() !== settings.baseUrl || draft.enabled !== settings.enabled || Boolean(draft.token.trim()) || draft.clearToken;
  const hasToken = Boolean(draft.token.trim()) || (settings.tokenSet && !draft.clearToken);
  const change = (next: Partial<Draft>) => setDraft(current => current && ({ ...current, ...next }));
  const showTokenInput = editingToken || !settings.tokenSet || draft.clearToken;

  const save = async () => {
    setSaving(true);
    try {
      const body = { baseUrl: draft.baseUrl, enabled: draft.enabled, ...(draft.token.trim() ? { token: draft.token } : {}), ...(draft.clearToken ? { clearToken: true } : {}) };
      apply(await request({ method: 'PUT', body: JSON.stringify(body) }));
      toast.success('Saved');
    } catch (cause) { toast.error(cause instanceof Error ? cause.message : 'Unable to save.'); }
    finally { setSaving(false); }
  };
  const test = async () => {
    setTesting(true);
    try {
      const next = await request({ method: 'POST', body: JSON.stringify({ action: 'test' }) });
      setSettings(next);
      if (next.lastTestOk) toast.success(next.lastTestMessage || 'Connected'); else toast.error(next.lastTestMessage || 'Connection failed');
    } catch (cause) { toast.error(cause instanceof Error ? cause.message : 'Unable to test the connection.'); }
    finally { setTesting(false); }
  };

  return <div className="settings-pane">
    <ItemGroup className="settings-group">
      <Item className="settings-row settings-row-hero">
        <ItemMedia variant="icon" className="settings-app-icon"><DatabaseIcon /></ItemMedia>
        <ItemContent><ItemTitle>DNEMIS</ItemTitle><ItemDescription>School and enrolment data</ItemDescription></ItemContent>
        <ItemActions><Switch aria-label="Use DNEMIS" checked={draft.enabled} disabled={!hasToken && !draft.enabled} onCheckedChange={enabled => change({ enabled })} /></ItemActions>
      </Item>
    </ItemGroup>

    <ItemGroup className="settings-group">
      <Row label="Server">
        <Input aria-label="Server address" type="url" inputMode="url" className="settings-input" value={draft.baseUrl} maxLength={300} onChange={event => change({ baseUrl: event.target.value })} />
      </Row>
      <ItemSeparator />
      <Row label="Access token">
        {showTokenInput
          ? <Input aria-label="Personal access token" type="password" autoComplete="off" spellCheck={false} className="settings-input" placeholder="Paste token" value={draft.token} maxLength={300}
              onChange={event => change({ token: event.target.value, clearToken: false })} />
          : <span className="settings-token">••••{settings.tokenLast4}
              <Button type="button" variant="link" size="sm" onClick={() => setEditingToken(true)}>Change</Button>
              <Button type="button" variant="link" size="sm" className="text-destructive" onClick={() => change({ clearToken: true, token: '', enabled: false })}>Remove</Button>
            </span>}
      </Row>
      <ItemSeparator />
      <Row label="Status">
        <Status settings={settings} />
        <Button type="button" variant="ghost" size="sm" className="rounded-full" onClick={() => void test()} disabled={testing || dirty || !settings.tokenSet}>{testing ? <Spinner /> : 'Test'}</Button>
      </Row>
    </ItemGroup>

    <div className="settings-foot">
      <p>{settings.updatedAt ? `Updated ${formatDateTime(settings.updatedAt)}${settings.updatedBy ? ` by ${settings.updatedBy}` : ''}` : ''}</p>
      {dirty && <div className="flex gap-2">
        <Button type="button" variant="ghost" className="rounded-full" onClick={() => apply(settings)} disabled={saving}>Cancel</Button>
        <Button type="button" className="rounded-full" onClick={() => void save()} disabled={saving}>{saving && <Spinner data-icon="inline-start" />}Save</Button>
      </div>}
    </div>
  </div>;
}
