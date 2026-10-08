'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { CircleAlertIcon, CircleCheckIcon, CircleDashedIcon } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { Spinner } from '@/components/ui/spinner';
import { Switch } from '@/components/ui/switch';
import { formatDateTime } from '@/components/admin-activity-format';
import { DnemisSync } from './dnemis-sync';
import { PanelError, PanelSkeleton, SaveBar, SettingRow, SettingsCard, SettingsPanel } from './settings-primitives';

type DnemisSettings = {
  baseUrl: string; enabled: boolean; tokenSet: boolean; tokenLast4: string | null; updatedAt: string | null; updatedBy: string | null;
  lastTestedAt: string | null; lastTestOk: boolean | null; lastTestMessage: string | null; source: 'database' | 'environment' | 'none';
};
type Draft = { baseUrl: string; enabled: boolean; token: string; clearToken: boolean };
type Body = { dnemis?: DnemisSettings; error?: string };

const endpoint = '/api/admin/integrations';
const draftFrom = (settings: DnemisSettings): Draft => ({ baseUrl: settings.baseUrl, enabled: settings.enabled, token: '', clearToken: false });

async function request(init?: RequestInit) {
  const response = await fetch(endpoint, { cache: 'no-store', ...init, headers: { 'Content-Type': 'application/json', ...init?.headers } });
  const body = await response.json().catch(() => ({})) as Body;
  if (!response.ok || !body.dnemis) throw Error(body.error || 'Unable to reach the integration settings.');
  return body.dnemis;
}

function TestStatus({ settings }: { settings: DnemisSettings }) {
  if (!settings.lastTestedAt) return <Badge variant="outline"><CircleDashedIcon />Not tested</Badge>;
  const ok = settings.lastTestOk === true;
  return <Badge variant={ok ? 'secondary' : 'destructive'} className={ok ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200' : undefined}>
    {ok ? <CircleCheckIcon /> : <CircleAlertIcon />}{ok ? 'Connected' : 'Connection failed'}
  </Badge>;
}

/** Admin settings: the DNEMIS (DHIS2) connection, then the school sync. The token is never shown once saved. */
export function DnemisPanel({ onDirty }: { onDirty?: (dirty: boolean) => void }) {
  const [settings, setSettings] = useState<DnemisSettings | null>(null), [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState(''), [saving, setSaving] = useState(false), [testing, setTesting] = useState(false);
  const apply = useCallback((next: DnemisSettings) => { setSettings(next); setDraft(draftFrom(next)); }, []);
  const load = useCallback(async () => {
    setError('');
    try { apply(await request()); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to load integration settings.'); }
  }, [apply]);
  useEffect(() => { void Promise.resolve().then(load); }, [load]);
  const dirty = !!settings && !!draft && (draft.baseUrl.trim() !== settings.baseUrl || draft.enabled !== settings.enabled || Boolean(draft.token.trim()) || draft.clearToken);
  useEffect(() => { onDirty?.(dirty); }, [dirty, onDirty]);

  const header = (body: ReactNode) => <SettingsPanel title="DNEMIS integration" description="School and enrolment data from the national DHIS2 server.">{body}</SettingsPanel>;
  if (error) return header(<PanelError title="Unable to load integrations" message={error} onRetry={() => void load()} />);
  if (!settings || !draft) return header(<PanelSkeleton rows={3} />);

  const hasToken = Boolean(draft.token.trim()) || (settings.tokenSet && !draft.clearToken);
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
      const body = await response.json().catch(() => ({})) as Body & { result?: { ok: boolean; message: string } };
      if (!response.ok || !body.result) throw Error(body.error || 'Unable to test the DNEMIS connection.');
      if (body.dnemis) setSettings(body.dnemis);
      if (body.result.ok) toast.success(body.result.message || 'Connected to DNEMIS'); else toast.error(body.result.message || 'DNEMIS connection failed');
    } catch (cause) { toast.error(cause instanceof Error ? cause.message : 'Unable to test the DNEMIS connection.'); }
    finally { setTesting(false); }
  };
  const savedToken = settings.tokenSet && !draft.clearToken;

  return header(<>
    <SettingsCard>
      <SettingRow label="Use DNEMIS" htmlFor="dnemis-enabled" description={hasToken ? 'Allow syncs from the server below.' : 'Add an access token first.'}>
        <Switch id="dnemis-enabled" checked={draft.enabled} disabled={!hasToken && !draft.enabled} onCheckedChange={enabled => change({ enabled })} />
      </SettingRow>
      <Separator />
      <SettingRow label="Server address" htmlFor="dnemis-url" description="HTTPS address of the DHIS2 instance." wide>
        <Input id="dnemis-url" type="url" inputMode="url" value={draft.baseUrl} maxLength={300} onChange={event => change({ baseUrl: event.target.value })} />
      </SettingRow>
      <Separator />
      <SettingRow label="Personal access token" htmlFor="dnemis-token" wide
        description={draft.clearToken ? <>Removed when you save. <Button type="button" variant="link" className="h-auto p-0 text-xs" onClick={() => change({ clearToken: false })}>Keep it</Button></>
          : savedToken && !draft.token ? <>Saved, ends in ••••{settings.tokenLast4}. <Button type="button" variant="link" className="h-auto p-0 text-xs" onClick={() => change({ clearToken: true, token: '', enabled: false })}>Remove</Button></>
            : 'Stored encrypted; never shown again after saving.'}
        info="Changing the server address needs the token again, so a saved token is never sent to a new host.">
        <Input id="dnemis-token" type="password" autoComplete="off" spellCheck={false} value={draft.token} maxLength={300}
          placeholder={savedToken ? 'Paste a new token to replace it' : 'Paste token'} onChange={event => change({ token: event.target.value, clearToken: false })} />
      </SettingRow>
      <Separator />
      <SettingRow label="Connection" description={settings.lastTestedAt ? <>{settings.lastTestMessage}<br />{formatDateTime(settings.lastTestedAt)}</> : 'Check the address and token before saving.'}>
        <div className="flex items-center gap-2 sm:justify-end">
          <TestStatus settings={settings} />
          <Button variant="outline" size="sm" onClick={() => void test()} disabled={testing || !hasToken}>{testing && <Spinner data-icon="inline-start" />}Test</Button>
        </div>
      </SettingRow>
    </SettingsCard>
    <SaveBar dirty={dirty} saving={saving} onDiscard={() => setDraft(draftFrom(settings))} onSave={() => void save()} />
    <div className="admin-subhead">
      <h3>School sync</h3>
      <p>{settings.updatedAt ? `Connection updated ${formatDateTime(settings.updatedAt)}` : 'Imports public schools and census data per state.'}</p>
    </div>
    <DnemisSync ready={settings.enabled && settings.tokenSet && !dirty} />
  </>);
}
