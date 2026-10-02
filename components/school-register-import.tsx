'use client';

import { useRef, useState } from 'react';
import { CheckCircle2Icon, DownloadIcon, FileSpreadsheetIcon, XIcon } from 'lucide-react';
import { toast } from 'sonner';
import { FileUpload } from '@/components/document-files';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Spinner } from '@/components/ui/spinner';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { ImportResult } from '@/lib/school-register';

export type SchoolBulkUploadProps = { onImported: (result: ImportResult) => void };
type Checked = { file: File; result: ImportResult };

async function send(file: File, mode: 'preview' | 'commit') {
  const body = new FormData(); body.set('file', file);
  const response = await fetch(`/api/schools/import?mode=${mode}`, { method: 'POST', body });
  if (response.status === 401) { window.location.replace('/'); throw Error('Sign in to continue.'); }
  const result = await response.json().catch(() => ({})) as ImportResult & { error?: string };
  return { ok: response.ok, result };
}

/** Bulk entry: download the template, upload it filled, review the check, then add the new schools. */
export function SchoolBulkUpload({ onImported }: SchoolBulkUploadProps) {
  const [checked, setChecked] = useState<Checked | null>(null), [done, setDone] = useState<ImportResult | null>(null);
  const [busy, setBusy] = useState<'preview' | 'commit' | null>(null), [error, setError] = useState('');
  const pending = useRef(false);
  async function run(file: File, mode: 'preview' | 'commit') {
    if (pending.current) return;
    pending.current = true; setBusy(mode); setError('');
    try {
      const { ok, result } = await send(file, mode);
      if (!ok && !result.rows) throw Error(result.error || 'The file could not be checked.');
      if (mode === 'preview' || !ok) { setChecked({ file, result }); setDone(null); if (!ok) setError(result.error || 'No schools were added.'); return; }
      setChecked(null); setDone(result);
      toast.success(result.created ? `${result.created} ${result.created === 1 ? 'school' : 'schools'} added to the register` : 'No new schools to add');
      onImported(result);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'The file could not be checked.'); }
    finally { pending.current = false; setBusy(null); }
  }
  const result = checked?.result;
  return <div className="flex flex-col gap-4">
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/40 p-3">
      <div className="flex items-start gap-3"><FileSpreadsheetIcon className="mt-0.5 size-5 text-muted-foreground" aria-hidden="true" /><div><p className="text-sm font-medium">School register template</p><p className="text-sm text-muted-foreground">One school per row, with enrolment by class. Your state&apos;s LGAs are listed in the LGA column.</p></div></div>
      <Button asChild variant="outline" size="sm"><a href="/api/schools/template" download><DownloadIcon data-icon="inline-start" />Download template</a></Button>
    </div>
    {!checked && <FileUpload compact label="Filled school register template" accept=".xlsx" busy={busy === 'preview'} illustration="boq" onFiles={files => run(files[0], 'preview')} />}
    {error && <Alert variant="destructive"><AlertTitle>{checked ? 'Schools not added' : 'File not accepted'}</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
    {done && <Alert><CheckCircle2Icon /><AlertTitle>{done.created ? `${done.created} ${done.created === 1 ? 'school' : 'schools'} added` : 'No new schools added'}</AlertTitle><AlertDescription>{done.duplicates.length ? `${done.duplicates.length} already in the register ${done.duplicates.length === 1 ? 'was' : 'were'} skipped.` : 'Every school in the file was new.'}</AlertDescription></Alert>}
    {checked && result && <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0"><p className="truncate text-sm font-medium">{checked.file.name}</p><div className="mt-1 flex flex-wrap gap-2"><Badge variant="secondary">{result.rows} {result.rows === 1 ? 'row' : 'rows'}</Badge><Badge>{result.ready} ready to add</Badge>{result.duplicates.length > 0 && <Badge variant="outline">{result.duplicates.length} already in register</Badge>}{result.errorCount > 0 && <Badge variant="destructive">{result.errorCount} with errors</Badge>}</div></div>
        <Button type="button" variant="ghost" size="sm" disabled={!!busy} onClick={() => { setChecked(null); setError(''); }}><XIcon data-icon="inline-start" />Choose another file</Button>
      </div>
      {result.errorCount > 0 && <IssueTable title={`Rows with errors${result.errorCount > result.errors.length ? ` (first ${result.errors.length} of ${result.errorCount})` : ''}`} rows={result.errors.map(item => ({ row: item.row, name: item.name, detail: item.messages.join(' ') }))} />}
      {result.duplicates.length > 0 && <IssueTable title="Already in the register (will be skipped)" rows={result.duplicates.map(item => ({ row: item.row, name: item.name, detail: item.reason }))} />}
      {result.errorCount > 0 ? <p className="text-sm text-muted-foreground">Fix these rows in the file and upload it again. Nothing is added while any row has errors.</p>
        : <div className="flex justify-end"><Button type="button" disabled={!!busy || !result.ready} onClick={() => run(checked.file, 'commit')}>{busy === 'commit' && <Spinner data-icon="inline-start" />}{result.ready ? `Add ${result.ready} ${result.ready === 1 ? 'school' : 'schools'}` : 'No new schools to add'}</Button></div>}
    </div>}
  </div>;
}

function IssueTable({ title, rows }: { title: string; rows: { row: number; name: string; detail: string }[] }) {
  return <section className="flex flex-col gap-2"><h3 className="text-sm font-medium">{title}</h3><ScrollArea className="max-h-64 rounded-md border"><Table>
    <TableHeader><TableRow><TableHead className="w-16">Row</TableHead><TableHead>School</TableHead><TableHead>Problem</TableHead></TableRow></TableHeader>
    <TableBody>{rows.map(item => <TableRow key={`${item.row}-${item.detail}`}><TableCell className="tabular-nums">{item.row}</TableCell><TableCell className="whitespace-normal">{item.name || '—'}</TableCell><TableCell className="whitespace-normal">{item.detail}</TableCell></TableRow>)}</TableBody>
  </Table></ScrollArea></section>;
}
