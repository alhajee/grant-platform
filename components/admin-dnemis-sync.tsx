'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Field, FieldLabel } from '@/components/ui/field';
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from '@/components/ui/input-group';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { Switch } from '@/components/ui/switch';
import { formatLagos, weekdayNames, type SyncSchedule } from '@/lib/dnemis-schedule';
import type { SyncRun, SyncStatus } from '@/lib/dnemis-jobs';

const endpoint = '/api/admin/integrations/sync';
const pollMs = 5000;
const number = (value: number) => value.toLocaleString('en-NG');

async function call(init?: RequestInit) {
  const response = await fetch(endpoint, { cache: 'no-store', ...init, headers: { 'Content-Type': 'application/json', ...init?.headers } });
  const body = await response.json().catch(() => ({})) as { status?: SyncStatus; error?: string };
  if (!response.ok || !body.status) throw Object.assign(Error(body.error || 'Unable to reach the DNEMIS sync.'), { status: body.status });
  return body.status;
}

function LastSync({ status }: { status: SyncStatus }) {
  const latest = status.latest, done: SyncRun | null = status.lastFinished;
  if (status.active && latest) return <span className="flex items-center gap-1.5"><Spinner />{latest.status === 'queued' ? 'Waiting to start…' : `Syncing · ${latest.message ?? 'starting'}`}</span>;
  if (!done) return <span>Not synced yet</span>;
  const when = formatLagos(done.finishedAt ?? done.queuedAt);
  if (done.status === 'failed' && !done.created && !done.updated) return <span className="text-destructive">Last sync failed {when}: {done.message}</span>;
  return <span className={done.status === 'failed' ? 'text-destructive' : undefined}>Last sync {when} · {number(done.created)} new · {number(done.updated)} updated{done.status === 'failed' ? ` · ${done.message}` : ''}</span>;
}

/** "Sync now", the automatic refresh schedule and the last sync result. `ready`: the saved connection is on. */
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
  if (!status) return <Skeleton className="h-16 w-full" />;
  const schedule = status.schedule;

  const save = async (next: SyncSchedule) => {
    const previous = status;
    setStatus({ ...status, schedule: next });
    setSaving(true);
    try { setStatus(await call({ method: 'PUT', body: JSON.stringify(next) })); toast.success(next.mode === 'off' ? 'Automatic refresh turned off' : 'Refresh schedule saved'); }
    catch (cause) { setStatus(previous); setTime(previous.schedule.time); toast.error(cause instanceof Error ? cause.message : 'Unable to save the refresh schedule.'); }
    finally { setSaving(false); }
  };
  const start = async () => {
    setStarting(true);
    try { setStatus(await call({ method: 'POST', body: JSON.stringify({ action: 'start' }) })); toast.success('DNEMIS sync started'); }
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

  return <div className="flex flex-col gap-4">
    <Separator />
    <Field orientation="horizontal" className="w-auto">
      <Switch id="dnemis-auto" checked={on} disabled={saving} onCheckedChange={checked => void save({ ...schedule, mode: checked ? 'daily' : 'off' })} />
      <FieldLabel htmlFor="dnemis-auto">Automatic refresh</FieldLabel>
    </Field>
    {on && <div className="flex flex-wrap items-center gap-2">
      <Select value={schedule.mode} disabled={saving} onValueChange={mode => void save({ ...schedule, mode: mode as SyncSchedule['mode'] })}>
        <SelectTrigger aria-label="How often"><SelectValue /></SelectTrigger>
        <SelectContent><SelectGroup><SelectItem value="daily">Daily</SelectItem><SelectItem value="weekly">Weekly</SelectItem></SelectGroup></SelectContent>
      </Select>
      {schedule.mode === 'weekly' && <Select value={String(schedule.weekday)} disabled={saving} onValueChange={weekday => void save({ ...schedule, weekday: Number(weekday) })}>
        <SelectTrigger aria-label="Day of the week"><SelectValue /></SelectTrigger>
        <SelectContent><SelectGroup>{weekdayNames.map((name, index) => <SelectItem key={name} value={String(index)}>{name}</SelectItem>)}</SelectGroup></SelectContent>
      </Select>}
      <InputGroup className="w-32">
        <InputGroupInput type="time" step={300} aria-label="Time (West Africa Time)" className="appearance-none [&::-webkit-calendar-picker-indicator]:hidden [&::-webkit-calendar-picker-indicator]:appearance-none"
          value={time} disabled={saving} onChange={event => setTime(event.target.value)} onBlur={commitTime}
          onKeyDown={event => { if (event.key === 'Enter') commitTime(); }} />
        <InputGroupAddon align="inline-end"><InputGroupText>WAT</InputGroupText></InputGroupAddon>
      </InputGroup>
    </div>}
    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
      <div className="flex flex-col gap-1">
        <LastSync status={status} />
        {on && status.nextSync && <span>Next sync {formatLagos(status.nextSync)}</span>}
      </div>
      <Button variant="outline" size="sm" onClick={() => void start()} disabled={!ready || starting || status.active}>{(starting || status.active) && <Spinner data-icon="inline-start" />}Sync now</Button>
    </div>
  </div>;
}
