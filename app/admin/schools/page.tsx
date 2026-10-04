'use client';

import { useCallback, useEffect, useState } from 'react';
import { FileUpIcon, MapPinIcon, PlusIcon } from 'lucide-react';
import { AdminHeader, useAdminMe } from '@/components/admin-header';
import { SchoolRegisterTable } from '@/components/school-register-table';
import { SchoolEntryForm } from '@/components/school-register-form';
import { SchoolBulkUpload } from '@/components/school-register-import';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { schoolApiPath, type RegisterOptions, type RegisterSchool } from '@/lib/school-register';
import { isStateCode, stateCodes, stateDisplayName } from '@/lib/state-names';

const lastStateKey = 'beapms:admin-schools:state';
const statesByName = [...stateCodes].sort((a, b) => stateDisplayName(a).localeCompare(stateDisplayName(b)));
type Loaded = { state: string; options: RegisterOptions } | { state: string; error: string };

function readLastState() { try { return window.localStorage.getItem(lastStateKey); } catch { return null; } }
function rememberState(state: string) {
  try { window.localStorage.setItem(lastStateKey, state); } catch { /* storage blocked: the URL still holds the choice */ }
  const url = new URL(window.location.href); url.searchParams.set('state', state);
  window.history.replaceState(null, '', `${url.pathname}${url.search}`);
}
/** `?state=` first, then the last state chosen in this browser, then the first state by name. */
function initialState() {
  const wanted = new URLSearchParams(window.location.search).get('state')?.toUpperCase(), last = readLastState();
  return isStateCode(wanted) ? wanted : isStateCode(last) ? last : statesByName[0];
}

/** The national school register: the Super Admin picks a state and manages it as that state's managers do. */
export default function AdminSchoolsPage() {
  const { me, error: meError, reload } = useAdminMe();
  const [state, setState] = useState<string | null>(null), [loaded, setLoaded] = useState<Loaded | null>(null), [attempt, setAttempt] = useState(0);
  const [editing, setEditing] = useState<RegisterSchool | 'new' | null>(null), [bulk, setBulk] = useState(false), [refreshKey, setRefreshKey] = useState(0);
  useEffect(() => { void Promise.resolve().then(() => { const next = initialState(); rememberState(next); setState(next); }); }, []);
  useEffect(() => {
    if (!me || me.impersonating || !state) return;
    const controller = new AbortController();
    fetch(schoolApiPath('/api/schools/options', state), { cache: 'no-store', signal: controller.signal }).then(async response => {
      if (response.status === 401) { window.location.replace('/'); return; }
      const body = await response.json().catch(() => ({})) as RegisterOptions & { error?: string };
      if (!response.ok) throw Error(body.error || 'Unable to load the school register.');
      setLoaded({ state, options: body });
    }).catch((cause: unknown) => { if (!controller.signal.aborted) setLoaded({ state, error: cause instanceof Error ? cause.message : 'Unable to load the school register.' }); });
    return () => controller.abort();
  }, [me, state, attempt]);
  const choose = useCallback((next: string) => { if (!isStateCode(next)) return; rememberState(next); setState(next); setEditing(null); }, []);
  const current = loaded && loaded.state === state ? loaded : null;
  const options = current && 'options' in current ? current.options : null;
  const error = meError || (current && 'error' in current ? current.error : '');
  const refresh = () => setRefreshKey(value => value + 1);

  return <div className="beap-page min-h-screen w-full"><AdminHeader current="schools" user={me?.user ?? null} /><main id="main-content" className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 pb-12 pt-8">
    <div className="flex flex-wrap items-end justify-between gap-4">
      <h1 className="text-3xl font-semibold tracking-tight">Schools</h1>
      <div className="flex flex-wrap items-center gap-2">
        <Select value={state ?? undefined} onValueChange={choose} disabled={!state}>
          <SelectTrigger className="h-9! w-48 justify-start rounded-full bg-card pl-3.5 shadow-xs hover:bg-accent/50 [&>svg:last-child]:ml-auto" aria-label="State"><MapPinIcon className="text-primary" /><SelectValue placeholder="Choose a state" /></SelectTrigger>
          <SelectContent><SelectGroup>{statesByName.map(code => <SelectItem key={code} value={code}>{stateDisplayName(code).replace(/ State$/, '')}</SelectItem>)}</SelectGroup></SelectContent>
        </Select>
        {options && <><Button variant="outline" onClick={() => setBulk(true)}><FileUpIcon data-icon="inline-start" />Bulk entry</Button><Button onClick={() => setEditing('new')}><PlusIcon data-icon="inline-start" />Add school</Button></>}
      </div>
    </div>
    {error && <Alert variant="destructive"><AlertTitle>School register unavailable</AlertTitle><AlertDescription>{error}<Button variant="outline" size="sm" onClick={() => void (meError ? reload() : setAttempt(value => value + 1))}>Try again</Button></AlertDescription></Alert>}
    {me?.impersonating ? <Alert><AlertTitle>You are using another account</AlertTitle><AlertDescription>Return to your administrator account to manage schools.</AlertDescription></Alert>
      : !options && !error ? <Skeleton className="h-80 w-full" />
      : options && state && <SchoolRegisterTable key={state} stateCode={state} refreshKey={refreshKey} onEdit={setEditing} />}
    <Dialog open={Boolean(editing)} onOpenChange={open => { if (!open) setEditing(null); }}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-2xl">
        <DialogHeader><DialogTitle>{editing === 'new' ? 'Add school' : 'Edit school'}</DialogTitle><DialogDescription>{editing === 'new' ? `Add one school to the ${options?.stateName ?? 'state'} register.` : 'Update the school details and its enrolment by class.'}</DialogDescription></DialogHeader>
        {editing && options && state && <SchoolEntryForm key={editing === 'new' ? 'new' : editing.id} stateCode={state} school={editing === 'new' ? null : editing} lgas={options.lgas} onCancel={() => setEditing(null)} onSaved={() => { setEditing(null); refresh(); }} />}
      </DialogContent>
    </Dialog>
    <Dialog open={bulk} onOpenChange={setBulk}>
      <DialogContent variant="inset-footer" className="sm:max-w-[34rem]" onOpenAutoFocus={event => event.preventDefault()}>
        <DialogHeader className="items-center px-6! pt-7! pb-5! text-center!"><DialogTitle className="px-6 text-lg!">Bulk entry</DialogTitle><DialogDescription>Add many schools to the {options?.stateName ?? 'state'} register at once.</DialogDescription></DialogHeader>
        {bulk && state && <SchoolBulkUpload dialog stateCode={state} onImported={result => { if (result.created) refresh(); }} />}
      </DialogContent>
    </Dialog>
  </main></div>;
}
