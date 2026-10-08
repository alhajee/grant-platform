'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from '@/components/ui/input-group';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Spinner } from '@/components/ui/spinner';
import { Switch } from '@/components/ui/switch';
import { formatLagos, weekdayNames, type SyncSchedule } from '@/lib/dnemis-schedule';
import type { SyncRun, SyncStatus } from '@/lib/dnemis-jobs';
import { stateDisplayName } from '@/lib/state-names';
import { PanelSkeleton, SettingRow, SettingsCard } from './settings-primitives';

const endpoint = '/api/admin/integrations/sync';
const pollMs = 5000;
const number = (value: number) => value.toLocaleString('en-NG');
const stateName = (code: string) => stateDisplayName(code).replace(/ State$/, '');

async function call(init?: RequestInit) {
  const response = await fetch(endpoint, { cache: 'no-store', ...init, headers: { 'Content-Type': 'application/json', ...init?.headers } });
  const body = await response.json().catch(() => ({})) as { status?: SyncStatus; error?: string };
  if (!response.ok || !body.status) throw Object.assign(Error(body.error || 'Unable to reach the DNEMIS sync.'), { status: body.status });
  return body.status;
}

function LastSync({ status, onRetry, retrying }: { status: SyncStatus; onRetry: (states: string[]) => void; retrying: boolean }) {
  const latest = status.latest, done: SyncRun | null = status.lastFinished;
  if (status.active && latest) return <span className="flex items-center gap-1.5"><Spinner />{latest.status === 'queued' ? 'Waiting to start…' : `Syncing · ${latest.message ?? 'starting'}`}</span>;
  if (!done) return <span>Not synced yet</span>;
  const when = formatLagos(done.finishedAt ?? done.queuedAt), failed = done.failedStates;
  if (done.status === 'failed' && !failed.length) return <span className="text-destructive">Last sync failed {when}: {done.message}</span>;
  const names = failed.map(item => stateName(item.code)).join(', ');
  return <>
    <span>Last sync {when} · {number(done.created)} new · {number(done.updated)} updated</span>
    {failed.length > 0 && <span className="flex flex-wrap items-center gap-x-2 text-destructive">
      <span title={failed.map(item => `${stateName(item.code)}: ${item.error}`).join('\n')}>{names} didn&apos;t sync: {failed[0].error}</span>
      <Button variant="link" size="sm" className="h-auto p-0 text-xs" disabled={retrying || status.active} onClick={() => onRetry(failed.map(item => item.code))}>Try {failed.length === 1 ? names : 'these states'} again</Button>
    </span>}
  </>;
}

/** "Sync now", the automatic refresh schedule (saved as soon as it changes) and the last result. `ready`: the saved connection is on. */
export function DnemisSync({ ready }: { ready: boolean }) {
  const [status, setStatus] = useState<SyncStatus | null>(null), [error, setError] = useState('');
  const [starting, setStarting] = useState(false), [saving, setSaving] = useState(false);
  // The time is typed, so it is saved when the field loses focus (or on Enter), not on every keystroke.
  const [time, setTime] = useState('');
  const load = useCallback(async () => {
    try { const next = await call(); setStatus(next); setTime(current => current || next.schedule.time); setError(''); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to load the DNEMIS sync.'); }
  }, []);
  useEffect(() => { void Promise.resolve().then(load); }, [load]);
  useEffect(() => {
    if (!status?.active) return;
    const timer = setInterval(() => void load(), pollMs);
    return () => clearInterval(timer);
  }, [status?.active, load]);

  if (error && !status) return <p className="text-sm text-destructive">{error}</p>;
  if (!status) return <PanelSkeleton rows={2} />;
  const schedule = status.schedule;

  const save = async (next: SyncSchedule) => {
    const previous = status;
    setStatus({ ...status, schedule: next });
    setSaving(true);
    try { setStatus(await call({ method: 'PUT', body: JSON.stringify(next) })); toast.success(next.mode === 'off' ? 'Automatic refresh turned off' : 'Refresh schedule saved'); }
    catch (cause) { setStatus(previous); setTime(previous.schedule.time); toast.error(cause instanceof Error ? cause.message : 'Unable to save the refresh schedule.'); }
    finally { setSaving(false); }
  };
  const start = async (states?: string[]) => {
    setStarting(true);
    try { setStatus(await call({ method: 'POST', body: JSON.stringify({ action: 'start', ...(states ? { states } : {}) }) })); toast.success('DNEMIS sync started'); }
    catch (cause) {
      const current = (cause as { status?: SyncStatus }).status;
      if (current) setStatus(current);
      toast.error(cause instanceof Error ? cause.message : 'Unable to start the DNEMIS sync.');
    } finally { setStarting(false); }
  };
  const on = schedule.mode !== 'off';
  const commitTime = () => {
    if (/^([01]\d|2[0-3]):[0-5]\d$/.test(time) && time !== schedule.time) void save({ ...schedule, time });
    else setTime(schedule.time);
  };

  return <SettingsCard>
    <SettingRow label="Automatic refresh" htmlFor="dnemis-auto" description={on && status.nextSync ? `Next sync ${formatLagos(status.nextSync)}` : 'Saved as soon as you change it.'}>
      <div className="flex flex-wrap items-center gap-2 sm:justify-end">
        {on && <>
          <Select value={schedule.mode} disabled={saving} onValueChange={mode => void save({ ...schedule, mode: mode as SyncSchedule['mode'] })}>
            <SelectTrigger size="sm" aria-label="How often"><SelectValue /></SelectTrigger>
            <SelectContent><SelectGroup><SelectItem value="daily">Daily</SelectItem><SelectItem value="weekly">Weekly</SelectItem></SelectGroup></SelectContent>
          </Select>
          {schedule.mode === 'weekly' && <Select value={String(schedule.weekday)} disabled={saving} onValueChange={weekday => void save({ ...schedule, weekday: Number(weekday) })}>
            <SelectTrigger size="sm" aria-label="Day of the week"><SelectValue /></SelectTrigger>
            <SelectContent><SelectGroup>{weekdayNames.map((name, index) => <SelectItem key={name} value={String(index)}>{name}</SelectItem>)}</SelectGroup></SelectContent>
          </Select>}
          <InputGroup className="h-8 w-28">
            <InputGroupInput type="time" step={300} aria-label="Time (West Africa Time)" className="appearance-none [&::-webkit-calendar-picker-indicator]:hidden [&::-webkit-calendar-picker-indicator]:appearance-none"
              value={time} disabled={saving} onChange={event => setTime(event.target.value)} onBlur={commitTime}
              onKeyDown={event => { if (event.key === 'Enter') commitTime(); }} />
            <InputGroupAddon align="inline-end"><InputGroupText>WAT</InputGroupText></InputGroupAddon>
          </InputGroup>
        </>}
        <Switch id="dnemis-auto" checked={on} disabled={saving} onCheckedChange={checked => void save({ ...schedule, mode: checked ? 'daily' : 'off' })} />
      </div>
    </SettingRow>
    <Separator />
    <SettingRow label="Sync schools now" description={<span className="flex flex-col gap-1"><LastSync status={status} retrying={starting || !ready} onRetry={states => void start(states)} /></span>}>
      <Button variant="outline" size="sm" onClick={() => void start()} disabled={!ready || starting || status.active}>{(starting || status.active) && <Spinner data-icon="inline-start" />}Sync now</Button>
    </SettingRow>
  </SettingsCard>;
}
