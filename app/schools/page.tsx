'use client';

import { useCallback, useEffect, useState } from 'react';
import { FileUpIcon, PlusIcon } from 'lucide-react';
import { SubebHeader } from '@/components/subeb-header';
import { SchoolRegisterTable } from '@/components/school-register-table';
import { SchoolEntryForm } from '@/components/school-register-form';
import { SchoolBulkUpload } from '@/components/school-register-import';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import type { RegisterOptions, RegisterPage, RegisterSchool } from '@/lib/school-register';

export default function SchoolsPage() {
  const [options, setOptions] = useState<RegisterOptions | null>(null), [error, setError] = useState('');
  const [editing, setEditing] = useState<RegisterSchool | 'new' | null>(null), [bulk, setBulk] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const load = useCallback(async () => {
    setError('');
    try {
      const response = await fetch('/api/schools/options', { cache: 'no-store' });
      if (response.status === 401) { window.location.replace('/'); return; }
      const body = await response.json().catch(() => ({})) as RegisterOptions & { error?: string };
      if (!response.ok) throw Error(body.error || 'Unable to load the school register.');
      setOptions(body);
      // "Update in the School register" links from the plan editors open one school directly.
      const editId = Number(new URLSearchParams(window.location.search).get('edit'));
      if (body.canManage && Number.isInteger(editId) && editId > 0) {
        const found = await fetch(`/api/schools?id=${editId}`, { cache: 'no-store' }).then(r => r.ok ? r.json() as Promise<RegisterPage> : null).catch(() => null);
        if (found?.items[0]) setEditing(found.items[0]);
      }
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to load the school register.'); }
  }, []);
  useEffect(() => { void Promise.resolve().then(load); }, [load]);
  const refresh = () => setRefreshKey(value => value + 1);
  const closeEdit = () => { setEditing(null); if (window.location.search.includes('edit=')) window.history.replaceState(null, '', '/schools'); };

  return <div className="dashboard-page"><SubebHeader schools /><main className="state-users-main">
    <div className="state-users-heading">
      <div><p className="text-muted-foreground">{options?.stateName ?? 'SUBEB'}</p><h1>School register</h1></div>
      {options?.canManage && <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => setBulk(true)}><FileUpIcon data-icon="inline-start" />Bulk entry</Button><Button onClick={() => setEditing('new')}><PlusIcon data-icon="inline-start" />Add school</Button></div>}
    </div>
    {error && <Alert variant="destructive"><AlertTitle>School register unavailable</AlertTitle><AlertDescription>{error}<Button variant="outline" onClick={load}>Try again</Button></AlertDescription></Alert>}
    {!options && !error ? <Skeleton className="h-80 w-full" /> : options && !options.canManage ? <Alert><AlertTitle>School register access</AlertTitle><AlertDescription>Only the Executive Chairman, the BEAP Chair or staff they authorise can manage your state&apos;s schools.<Button asChild variant="outline"><a href="/dashboard">Back to plans</a></Button></AlertDescription></Alert>
      : options && <SchoolRegisterTable refreshKey={refreshKey} onEdit={setEditing} />}
    <Dialog open={Boolean(editing)} onOpenChange={open => { if (!open) closeEdit(); }}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-2xl">
        <DialogHeader><DialogTitle>{editing === 'new' ? 'Add school' : 'Edit school'}</DialogTitle><DialogDescription>{editing === 'new' ? 'Add one school to your state register.' : 'Update the school details and its enrolment by class.'}</DialogDescription></DialogHeader>
        {editing && options && <SchoolEntryForm key={editing === 'new' ? 'new' : editing.id} school={editing === 'new' ? null : editing} lgas={options.lgas} onCancel={closeEdit} onSaved={() => { closeEdit(); refresh(); }} />}
      </DialogContent>
    </Dialog>
    <Dialog open={bulk} onOpenChange={setBulk}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-[34rem]" aria-describedby={undefined}>
        <DialogHeader><DialogTitle>Bulk entry</DialogTitle></DialogHeader>
        {bulk && <SchoolBulkUpload onImported={result => { if (result.created) refresh(); }} />}
      </DialogContent>
    </Dialog>
  </main></div>;
}
