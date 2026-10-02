'use client';

import { useState } from 'react';
import { DownloadIcon, Trash2Icon, XIcon } from 'lucide-react';
import { toast } from 'sonner';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Spinner } from '@/components/ui/spinner';
import type { SchoolDeleteResult } from '@/lib/school-register';

export type SchoolBulkBarProps = { ids: number[]; actions: SchoolActions; onClear: () => void; selectAll?: { total: number; busy: boolean; onSelect: () => void } };

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

type Pending = { ids: number[]; title: string };

/** Export and delete for one or more schools, with the delete confirmation; shared by the row menu and the bulk bar. */
export function useSchoolActions({ onDeleted }: { onDeleted: (result: SchoolDeleteResult) => void }) {
  const [busy, setBusy] = useState<'export' | 'delete' | null>(null), [pending, setPending] = useState<Pending | null>(null);
  const request = (path: string, method: 'POST' | 'DELETE', ids: number[]) => fetch(path, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids }) });

  async function exportSchools(ids: number[]) {
    if (busy) return;
    setBusy('export');
    try {
      const response = await request('/api/schools/export', 'POST', ids);
      if (!response.ok) throw Error(await failure(response, 'The schools could not be exported.'));
      download(await response.blob(), response);
    } catch (cause) { toast.error(cause instanceof Error ? cause.message : 'The schools could not be exported.'); }
    finally { setBusy(null); }
  }

  async function deleteSchools(ids: number[]) {
    setBusy('delete');
    try {
      const response = await request('/api/schools', 'DELETE', ids);
      if (!response.ok) throw Error(await failure(response, 'The schools could not be deleted.'));
      const result = await response.json() as SchoolDeleteResult;
      const kept = result.kept.length ? `${plural(result.kept.length, 'school')} used in a plan ${result.kept.length === 1 ? 'was' : 'were'} kept: ${result.kept.slice(0, 3).map(item => item.name).join(', ')}${result.kept.length > 3 ? '…' : ''}` : undefined;
      if (result.deleted) toast.success(`${plural(result.deleted, 'school')} deleted`, { description: kept });
      else toast.warning('No schools deleted', { description: kept });
      setPending(null); onDeleted(result);
    } catch (cause) { toast.error(cause instanceof Error ? cause.message : 'The schools could not be deleted.'); }
    finally { setBusy(null); }
  }

  const confirmDelete = (ids: number[], name?: string) => setPending({ ids, title: name ? `Delete ${name}?` : `Delete ${plural(ids.length, 'school')}?` });
  const dialog = <AlertDialog open={!!pending} onOpenChange={open => { if (!open && !busy) setPending(null); }}>
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle className="break-words">{pending?.title}</AlertDialogTitle>
        <AlertDialogDescription>{pending?.ids.length === 1 ? 'It is' : 'They are'} removed from your state&apos;s School register. Schools already used in a plan are kept. This cannot be undone.</AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel disabled={!!busy}>Cancel</AlertDialogCancel>
        <AlertDialogAction variant="destructive" disabled={!!busy} onClick={event => { event.preventDefault(); if (pending) void deleteSchools(pending.ids); }}>{busy === 'delete' && <Spinner data-icon="inline-start" />}Delete</AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>;
  return { busy, exportSchools, confirmDelete, dialog };
}
export type SchoolActions = ReturnType<typeof useSchoolActions>;

/** Floating actions for the ticked schools: export them as a school list, or delete them. */
export function SchoolBulkBar({ ids, actions, onClear, selectAll }: SchoolBulkBarProps) {
  const { busy } = actions;
  if (!ids.length) return null;
  return <div role="toolbar" aria-label="Selected schools" className="fixed inset-x-0 bottom-6 z-40 mx-auto flex w-max max-w-[calc(100vw-2rem)] items-center gap-1 rounded-full border bg-popover/95 p-1.5 pl-4 text-popover-foreground shadow-lg backdrop-blur-md animate-in fade-in-0 slide-in-from-bottom-2 duration-150 motion-reduce:animate-none">
    <span className="pr-2 text-sm font-medium tabular-nums" role="status">{plural(ids.length, 'school')} selected</span>
    {selectAll && <Button type="button" variant="link" size="sm" className="px-2" disabled={selectAll.busy || !!busy} onClick={selectAll.onSelect}>{selectAll.busy && <Spinner data-icon="inline-start" />}Select all {selectAll.total.toLocaleString()}</Button>}
    <Separator orientation="vertical" className="h-5" />
    <Button type="button" variant="ghost" size="sm" className="rounded-full" disabled={!!busy} onClick={() => void actions.exportSchools(ids)}>{busy === 'export' ? <Spinner data-icon="inline-start" /> : <DownloadIcon data-icon="inline-start" />}Export</Button>
    <Button type="button" variant="ghost" size="sm" className="rounded-full text-destructive hover:text-destructive" disabled={!!busy} onClick={() => actions.confirmDelete(ids)}><Trash2Icon data-icon="inline-start" />Delete</Button>
    <Separator orientation="vertical" className="h-5" />
    <Button type="button" variant="ghost" size="icon-sm" className="rounded-full" disabled={!!busy} onClick={onClear} aria-label="Clear selection"><XIcon /></Button>
  </div>;
}
