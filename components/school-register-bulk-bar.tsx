'use client';

import { useState } from 'react';
import { DownloadIcon, Trash2Icon, XIcon } from 'lucide-react';
import { toast } from 'sonner';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Spinner } from '@/components/ui/spinner';
import type { SchoolDeleteResult } from '@/lib/school-register';

export type SchoolBulkBarProps = { ids: number[]; onClear: () => void; onDeleted: (result: SchoolDeleteResult) => void };

const plural = (count: number, one: string, many = `${one}s`) => `${count.toLocaleString()} ${count === 1 ? one : many}`;

async function failure(response: Response, fallback: string) {
  if (response.status === 401) { window.location.replace('/'); return 'Sign in to continue.'; }
  const body = await response.json().catch(() => ({})) as { error?: string };
  return body.error || fallback;
}

function download(blob: Blob, response: Response) {
  const name = /filename="([^"]+)"/.exec(response.headers.get('Content-Disposition') ?? '')?.[1] ?? 'schools.xlsx';
  const url = URL.createObjectURL(blob), link = document.createElement('a');
  link.href = url; link.download = name; document.body.appendChild(link); link.click(); link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Floating actions for the ticked schools: export them as a school list, or delete them. */
export function SchoolBulkBar({ ids, onClear, onDeleted }: SchoolBulkBarProps) {
  const [busy, setBusy] = useState<'export' | 'delete' | null>(null), [confirming, setConfirming] = useState(false);
  const request = (path: string, method: 'POST' | 'DELETE') => fetch(path, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids }) });

  async function exportSchools() {
    setBusy('export');
    try {
      const response = await request('/api/schools/export', 'POST');
      if (!response.ok) throw Error(await failure(response, 'The schools could not be exported.'));
      download(await response.blob(), response);
    } catch (cause) { toast.error(cause instanceof Error ? cause.message : 'The schools could not be exported.'); }
    finally { setBusy(null); }
  }

  async function deleteSchools() {
    setBusy('delete');
    try {
      const response = await request('/api/schools', 'DELETE');
      if (!response.ok) throw Error(await failure(response, 'The schools could not be deleted.'));
      const result = await response.json() as SchoolDeleteResult;
      const kept = result.kept.length ? `${plural(result.kept.length, 'school')} used in a plan ${result.kept.length === 1 ? 'was' : 'were'} kept: ${result.kept.slice(0, 3).map(item => item.name).join(', ')}${result.kept.length > 3 ? '…' : ''}` : undefined;
      if (result.deleted) toast.success(`${plural(result.deleted, 'school')} deleted`, { description: kept });
      else toast.warning('No schools deleted', { description: kept });
      setConfirming(false); onDeleted(result);
    } catch (cause) { toast.error(cause instanceof Error ? cause.message : 'The schools could not be deleted.'); }
    finally { setBusy(null); }
  }

  if (!ids.length) return null;
  return <>
    <div role="toolbar" aria-label="Selected schools" className="fixed inset-x-0 bottom-6 z-40 mx-auto flex w-max max-w-[calc(100vw-2rem)] items-center gap-1 rounded-full border bg-popover/95 p-1.5 pl-4 text-popover-foreground shadow-lg backdrop-blur-md animate-in fade-in-0 slide-in-from-bottom-2 duration-150 motion-reduce:animate-none">
      <span className="pr-2 text-sm font-medium tabular-nums" role="status">{plural(ids.length, 'school')} selected</span>
      <Separator orientation="vertical" className="h-5" />
      <Button type="button" variant="ghost" size="sm" className="rounded-full" disabled={!!busy} onClick={exportSchools}>{busy === 'export' ? <Spinner data-icon="inline-start" /> : <DownloadIcon data-icon="inline-start" />}Export</Button>
      <Button type="button" variant="ghost" size="sm" className="rounded-full text-destructive hover:text-destructive" disabled={!!busy} onClick={() => setConfirming(true)}><Trash2Icon data-icon="inline-start" />Delete</Button>
      <Separator orientation="vertical" className="h-5" />
      <Button type="button" variant="ghost" size="icon-sm" className="rounded-full" disabled={!!busy} onClick={onClear} aria-label="Clear selection"><XIcon /></Button>
    </div>
    <AlertDialog open={confirming} onOpenChange={open => { if (!busy) setConfirming(open); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {plural(ids.length, 'school')}?</AlertDialogTitle>
          <AlertDialogDescription>They are removed from your state&apos;s School register. Schools already used in a plan are kept. This cannot be undone.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={!!busy}>Cancel</AlertDialogCancel>
          <AlertDialogAction variant="destructive" disabled={!!busy} onClick={event => { event.preventDefault(); void deleteSchools(); }}>{busy === 'delete' && <Spinner data-icon="inline-start" />}Delete</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </>;
}
