'use client';

import { useRef, useState, type ReactNode } from 'react';
import { CheckCircle2Icon, DownloadIcon, XIcon } from 'lucide-react';
import { toast } from 'sonner';
import { FileArtwork } from '@/components/document-files';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DialogFooter } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Spinner } from '@/components/ui/spinner';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { schoolApiPath, type ImportResult } from '@/lib/school-register';

/** `dialog`: rendered straight inside an inset-footer DialogContent, so the actions become its footer bar. */
export type SchoolBulkUploadProps = { onImported: (result: ImportResult) => void; dialog?: boolean; stateCode?: string };
type Checked = { file: File; result: ImportResult | null };

const MAX_BYTES = 5 * 1024 * 1024;

async function send(file: File, mode: 'preview' | 'commit', stateCode?: string) {
  const body = new FormData(); body.set('file', file);
  const response = await fetch(schoolApiPath(`/api/schools/import?mode=${mode}`, stateCode), { method: 'POST', body });
  if (response.status === 401) { window.location.replace('/'); throw Error('Sign in to continue.'); }
  const result = await response.json().catch(() => ({})) as ImportResult & { error?: string };
  return { ok: response.ok, result };
}

const plural = (count: number, one: string, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;

/** Bulk entry: download the template, drop it back filled in, review the check, then add the new schools. */
export function SchoolBulkUpload({ onImported, dialog = false, stateCode }: SchoolBulkUploadProps) {
  const [checked, setChecked] = useState<Checked | null>(null), [done, setDone] = useState<ImportResult | null>(null);
  const [busy, setBusy] = useState<'preview' | 'commit' | null>(null), [error, setError] = useState('');
  const pending = useRef(false);
  async function run(file: File, mode: 'preview' | 'commit') {
    if (pending.current) return;
    pending.current = true; setBusy(mode); setError('');
    if (mode === 'preview') { setChecked({ file, result: null }); setDone(null); }
    try {
      const { ok, result } = await send(file, mode, stateCode);
      if (!ok && !result.rows) throw Error(result.error || 'The file could not be checked.');
      if (mode === 'preview' || !ok) { setChecked({ file, result }); if (!ok) setError(result.error || 'No schools were added.'); return; }
      setChecked(null); setDone(result);
      toast.success(result.created ? `${plural(result.created, 'school')} added to the register` : 'No new schools to add');
      onImported(result);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The file could not be checked.');
      if (mode === 'preview') setChecked(null);
    } finally { pending.current = false; setBusy(null); }
  }
  const reset = () => { setChecked(null); setError(''); };
  const result = checked?.result;
  const canAdd = !!result && !result.errorCount && result.ready > 0;
  const addLabel = result && !result.errorCount && !result.ready ? 'No new schools to add' : result?.ready && !result.errorCount ? `Add ${plural(result.ready, 'school')}` : 'Add schools';

  const body = <div className={cn('flex flex-col gap-4', dialog && 'px-6 pb-6')}>
    {!checked && <Dropzone onFile={file => run(file, 'preview')} onReject={setError} />}
    {checked && <div className="flex items-center gap-3 rounded-xl border bg-card px-3 py-2.5">
      <span className="h-8 w-7 shrink-0 [&_svg]:size-full!"><FileArtwork name={checked.file.name} /></span>
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
        <span className="truncate text-sm font-medium">{checked.file.name}</span>
        {!result ? <Badge variant="secondary"><Spinner data-icon="inline-start" />Checking</Badge>
          : result.errorCount > 0 ? <Badge variant="destructive">{plural(result.errorCount, 'row')} with errors</Badge>
          : <Badge variant="secondary">{plural(result.ready, 'school')} ready</Badge>}
        {result && result.duplicates.length > 0 && <Badge variant="outline">{result.duplicates.length} already in register</Badge>}
      </div>
      <Button type="button" variant="ghost" size="icon" className="size-8 shrink-0 rounded-full" disabled={!!busy} onClick={reset} aria-label="Remove file"><XIcon /></Button>
    </div>}
    {error && <Alert variant="destructive"><AlertTitle>{checked ? 'Schools not added' : 'File not accepted'}</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
    {done && <Alert><CheckCircle2Icon /><AlertTitle>{done.created ? `${plural(done.created, 'school')} added` : 'No new schools added'}</AlertTitle><AlertDescription>{done.duplicates.length ? `${done.duplicates.length} already in the register ${done.duplicates.length === 1 ? 'was' : 'were'} skipped.` : 'Every school in the file was new.'}</AlertDescription></Alert>}
    {result && result.errorCount > 0 && <>
      <IssueTable title={`Rows with errors${result.errorCount > result.errors.length ? ` (first ${result.errors.length} of ${result.errorCount})` : ''}`} rows={result.errors.map(item => ({ row: item.row, name: item.name, detail: item.messages.join(' ') }))} />
      <p className="text-sm text-muted-foreground">Fix these rows in the file and upload it again. Nothing is added while any row has errors.</p>
    </>}
    {result && result.duplicates.length > 0 && <IssueTable title="Already in the register (will be skipped)" rows={result.duplicates.map(item => ({ row: item.row, name: item.name, detail: item.reason }))} />}
  </div>;

  const actions: ReactNode = <>
    <Button asChild variant="outline" className="rounded-full"><a href={schoolApiPath('/api/schools/template', stateCode)} download><DownloadIcon data-icon="inline-start" />Download template</a></Button>
    <Button type="button" className="rounded-full" disabled={!canAdd || !!busy} onClick={() => checked && run(checked.file, 'commit')}>{busy === 'commit' && <Spinner data-icon="inline-start" />}{addLabel}</Button>
  </>;

  if (dialog) return <>{body}<DialogFooter className="sm:justify-between">{actions}</DialogFooter></>;
  return <div className="flex flex-col gap-4">{body}<div className="flex flex-wrap items-center justify-between gap-2">{actions}</div></div>;
}

/** A large drop target for one .xlsx file; the whole area also opens the file picker. */
function Dropzone({ onFile, onReject }: { onFile: (file: File) => void; onReject: (message: string) => void }) {
  const input = useRef<HTMLInputElement>(null), [dragging, setDragging] = useState(false);
  function pick(files: File[]) {
    setDragging(false);
    if (files.length !== 1) { onReject('Choose one file at a time.'); return; }
    const [file] = files;
    if (!file.name.toLowerCase().endsWith('.xlsx') || !file.size || file.size > MAX_BYTES) { onReject('Choose a filled school list in .xlsx format, up to 5 MB.'); return; }
    onReject(''); onFile(file);
  }
  return <div
    role="button" tabIndex={0} aria-label="Upload the filled school list"
    data-dragging={dragging || undefined}
    className="group flex cursor-pointer flex-col items-center gap-1 rounded-xl border border-dashed border-foreground/20 bg-muted/30 px-6 py-8 text-center outline-none transition-colors [background-image:repeating-linear-gradient(135deg,color-mix(in_oklab,var(--foreground)_5%,transparent)_0_1px,transparent_1px_9px)] hover:border-foreground/35 focus-visible:ring-[3px] focus-visible:ring-ring/50 data-[dragging]:border-primary data-[dragging]:bg-primary/5"
    onClick={() => input.current?.click()}
    onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); input.current?.click(); } }}
    onDragOver={event => { event.preventDefault(); setDragging(true); }}
    onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragging(false); }}
    onDrop={event => { event.preventDefault(); pick(Array.from(event.dataTransfer.files)); }}
  >
    <input ref={input} className="sr-only" type="file" tabIndex={-1} aria-hidden="true" accept=".xlsx" onChange={event => { pick(Array.from(event.target.files ?? [])); event.target.value = ''; }} />
    <span className="mb-2 size-12 transition-transform group-hover:-translate-y-0.5 [&_svg]:size-full!"><FileArtwork name="list.xlsx" /></span>
    <p className="text-sm font-medium">Drag and drop your school list here</p>
    <p className="text-sm text-muted-foreground">or, <span className="underline underline-offset-4">click to browse</span> (.xlsx, 5 MB max)</p>
    <Button type="button" variant="outline" size="sm" className="mt-3 rounded-full bg-background" tabIndex={-1} onClick={event => { event.stopPropagation(); input.current?.click(); }}>Select file</Button>
  </div>;
}

function IssueTable({ title, rows }: { title: string; rows: { row: number; name: string; detail: string }[] }) {
  return <section className="flex flex-col gap-2"><h3 className="text-sm font-medium">{title}</h3><ScrollArea className="max-h-64 rounded-md border"><Table>
    <TableHeader><TableRow><TableHead className="w-16">Row</TableHead><TableHead>School</TableHead><TableHead>Problem</TableHead></TableRow></TableHeader>
    <TableBody>{rows.map(item => <TableRow key={`${item.row}-${item.detail}`}><TableCell className="tabular-nums">{item.row}</TableCell><TableCell className="whitespace-normal">{item.name || '—'}</TableCell><TableCell className="whitespace-normal">{item.detail}</TableCell></TableRow>)}</TableBody>
  </Table></ScrollArea></section>;
}
