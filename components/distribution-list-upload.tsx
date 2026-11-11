'use client';
import { useRef, useState } from 'react';
import { DownloadIcon, UploadIcon } from 'lucide-react';
import { toast } from 'sonner';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Spinner } from '@/components/ui/spinner';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { uploadListNames, type UploadListWorkstream, type UploadMatch } from '@/lib/distribution-upload';

type Preview = UploadMatch & { rows: number };
interface DistributionListUploadProps {
  workstream: UploadListWorkstream;
  /** Adds a URL path to the current plan (`currentPlanHref`). */
  planHref: (path: string) => string;
  disabled: boolean;
  /** Adds the matched schools through the list's usual bulk add (it skips schools already listed). */
  onAdd: (schoolIds: number[]) => Promise<unknown>;
}

const count = new Intl.NumberFormat('en-NG');
const shown = 300;
const plural = (n: number, one: string, many = `${one}s`) => `${count.format(n)} ${n === 1 ? one : many}`;
const withParam = (href: string, key: string, value: string) => `${href}${href.includes('?') ? '&' : '?'}${key}=${encodeURIComponent(value)}`;

/**
 * UBEC248: "Download template" and "Upload list" for a school list (TLM, Curriculum and Greening distribution lists, PHE
 * training schools). The upload is checked on the server (the DNEMIS code finds the school; a name that differs from the
 * School list is shown as a check, client 11 November 2026) and shown here before anything is added; nothing is ever removed by an upload.
 */
export function DistributionListUpload({ workstream, planHref, disabled, onAdd }: DistributionListUploadProps) {
  const input = useRef<HTMLInputElement>(null);
  const [reading, setReading] = useState(false), [adding, setAdding] = useState(false), [preview, setPreview] = useState<Preview | null>(null);
  const endpoint = planHref('/api/distribution-lists');

  async function read(file: File) {
    setReading(true);
    try {
      const form = new FormData();
      form.append('workstream', workstream); form.append('file', file);
      const response = await fetch(endpoint, { method: 'POST', body: form });
      const result = await response.json().catch(() => ({})) as Partial<Preview> & { error?: string };
      if (!response.ok || !result.matched) throw new Error(result.error || 'The school list could not be read');
      setPreview(result as Preview);
    } catch (cause) { toast.error(cause instanceof Error ? cause.message : 'The school list could not be read'); }
    finally { setReading(false); if (input.current) input.current.value = ''; }
  }
  async function confirm() {
    if (!preview?.matched.length) return;
    setAdding(true);
    try { await onAdd(preview.matched.map(m => m.school.id)); setPreview(null); }
    finally { setAdding(false); }
  }

  return <div className="flex flex-wrap items-center gap-2">
    <Button asChild variant="outline" size="sm" className="rounded-full"><a href={withParam(endpoint, 'workstream', workstream)} download title="An Excel template with DNEMIS code and School name, filled with the schools already listed"><DownloadIcon data-icon="inline-start" />Download template</a></Button>
    <Button type="button" variant="outline" size="sm" className="rounded-full" disabled={disabled || reading} onClick={() => input.current?.click()}>{reading ? <Spinner data-icon="inline-start" /> : <UploadIcon data-icon="inline-start" />}Upload list</Button>
    <input ref={input} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="sr-only" tabIndex={-1} aria-label={`Upload the ${uploadListNames[workstream]}`} onChange={e => { const file = e.target.files?.[0]; if (file) void read(file); }} />
    <Dialog open={!!preview} onOpenChange={open => { if (!open && !adding) setPreview(null); }}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Check the uploaded schools</DialogTitle>
          <DialogDescription>{preview ? `${plural(preview.rows, 'row')} read. Schools are found by their DNEMIS code. Check any name that differs from the School list` : ''}</DialogDescription>
        </DialogHeader>
        {preview && <UploadPreview preview={preview} />}
        <DialogFooter>
          <Button variant="ghost" disabled={adding} onClick={() => setPreview(null)}>Cancel</Button>
          <Button disabled={adding || !preview?.matched.length} onClick={() => void confirm()}>{adding && <Spinner data-icon="inline-start" />}{preview?.matched.length ? `Add ${plural(preview.matched.length, 'school')}` : 'Nothing to add'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>;
}

function UploadPreview({ preview }: { preview: Preview }) {
  const problems = preview.unknown.length + preview.noCode.length + preview.duplicates.length;
  return <div className="flex max-h-[60vh] flex-col gap-4 overflow-y-auto pr-1">
    <div className="flex flex-wrap gap-2">
      <Badge>{plural(preview.matched.length, 'school')} to add</Badge>
      {preview.listed.length > 0 && <Badge variant="secondary">{count.format(preview.listed.length)} already on the list</Badge>}
      {preview.mismatched.length > 0 && <Badge variant="outline">{count.format(preview.mismatched.length)} name differs</Badge>}
      {preview.unknown.length > 0 && <Badge variant="warning">{count.format(preview.unknown.length)} code not found</Badge>}
      {preview.noCode.length > 0 && <Badge variant="warning">{count.format(preview.noCode.length)} without a code</Badge>}
      {preview.duplicates.length > 0 && <Badge variant="outline">{count.format(preview.duplicates.length)} repeated</Badge>}
    </div>
    {problems > 0 && <Alert variant="warning"><AlertTitle>{plural(problems, 'row')} will not be added</AlertTitle><AlertDescription>Correct them in the file and upload it again. The schools that match can be added now</AlertDescription></Alert>}
    {preview.mismatched.length > 0 && <Section title="Name differs from the School list (added by its DNEMIS code)" head={['Row', 'DNEMIS code', 'Name in the file', 'Name in the School list']} rows={preview.mismatched.map(r => [r.row, r.code, r.name || '—', `${r.school.name} · ${r.school.lga}`])} />}
    {preview.unknown.length > 0 && <Section title="DNEMIS code not in your state's School list" head={['Row', 'DNEMIS code', 'Name in the file']} rows={preview.unknown.map(r => [r.row, r.code, r.name || '—'])} />}
    {preview.noCode.length > 0 && <Section title="No DNEMIS code" head={['Row', 'Name in the file']} rows={preview.noCode.map(r => [r.row, r.name])} />}
    {preview.duplicates.length > 0 && <Section title="Repeated in the file" head={['Row', 'DNEMIS code', 'Name in the file', 'First on row']} rows={preview.duplicates.map(r => [r.row, r.code, r.name || '—', r.firstRow])} />}
    {preview.matched.length > 0 && <Section title="To add" head={['Row', 'DNEMIS code', 'School', 'LGA', 'Level']} rows={preview.matched.map(r => [r.row, r.school.code ?? '', r.school.name, r.school.lga, r.school.level])} />}
    {preview.listed.length > 0 && <Section title="Already on the list" head={['Row', 'DNEMIS code', 'School', 'LGA']} rows={preview.listed.map(r => [r.row, r.school.code ?? '', r.school.name, r.school.lga])} />}
  </div>;
}

function Section({ title, head, rows }: { title: string; head: string[]; rows: (string | number)[][] }) {
  return <section className="flex flex-col gap-1">
    <h3 className="text-sm font-semibold">{title} <span className="font-normal text-muted-foreground">· {count.format(rows.length)}</span></h3>
    <Table><TableHeader><TableRow>{head.map(h => <TableHead key={h}>{h}</TableHead>)}</TableRow></TableHeader>
      <TableBody>{rows.slice(0, shown).map(row => <TableRow key={`${row[0]}`}>{row.map((cell, index) => <TableCell key={index} className={index === 0 ? 'tabular-nums text-muted-foreground' : undefined}>{cell}</TableCell>)}</TableRow>)}</TableBody></Table>
    {rows.length > shown && <p className="text-xs text-muted-foreground">And {count.format(rows.length - shown)} more</p>}
  </section>;
}
