"use client";

import { useRef, useState } from 'react';
import { FileSpreadsheetIcon } from 'lucide-react';
import { toast } from 'sonner';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldError, FieldLegend, FieldSet } from '@/components/ui/field';
import { Spinner } from '@/components/ui/spinner';
import { DocumentFiles, FileUpload } from '@/components/document-files';
import { isRatSpreadsheet, maxRatFileBytes, maxRatTotalBytes, ratFileAccept } from '@/lib/plan-setup';
import type { ActionPlan } from '@/lib/action-plans';
import type { RatReview } from '@/lib/rat-review';

type Props = { plan: ActionPlan; canReplace: boolean; review: RatReview | null; replaced: boolean; onReplaced: (plan: ActionPlan) => void };

/**
 * UBEC204/205: the plan's RAT tool in Edit plan. While the plan is at the SUBEB (before it goes to UBEC, and when UBEC
 * returns it) the RAT can be replaced with new files; UBEC Planning's rejection, with its comment, is shown above.
 */
export function PlanRatField({ plan, canReplace, review, replaced, onReplaced }: Props) {
  const [files, setFiles] = useState<File[]>([]), [error, setError] = useState(''), [saving, setSaving] = useState(false);
  const pending = useRef(false);
  const current = plan.documents ?? [];

  function add(incoming: File[]) {
    const combined = [...files, ...incoming];
    if (combined.some(file => !isRatSpreadsheet(file.name))) { setError('Upload the RAT as an Excel (.xlsx) file'); return; }
    if (combined.length > 3 || combined.some(f => !f.size || f.size > maxRatFileBytes) || combined.reduce((sum, f) => sum + f.size, 0) > maxRatTotalBytes) { setError('Use 1–3 Excel files, up to 5 MB each and 10 MB in total'); return; }
    setFiles(combined); setError('');
  }

  async function replace() {
    if (pending.current || !files.length) return;
    pending.current = true; setSaving(true);
    try {
      const body = new FormData();
      body.append('plan', String(plan.id)); body.append('version', String(plan.version));
      files.forEach(file => body.append('rat', file));
      const response = await fetch('/api/plans/rat', { method: 'POST', body });
      const result = await response.json().catch(() => ({})) as { plan?: ActionPlan; error?: string };
      if (!response.ok || !result.plan) throw new Error(result.error || 'The RAT tool could not be replaced');
      setFiles([]); toast.success('RAT tool replaced'); onReplaced(result.plan);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'The RAT tool could not be replaced'); }
    finally { pending.current = false; setSaving(false); }
  }

  return <FieldSet className="gap-3 rounded-xl border bg-card p-3 shadow-xs"><FieldLegend>Rapid Assessment Tool (RAT)</FieldLegend>
    {review?.decision === 'reject' && <Alert variant={replaced ? 'default' : 'destructive'}><FileSpreadsheetIcon /><AlertTitle>{replaced ? 'New RAT uploaded since UBEC rejected it' : 'UBEC rejected the RAT tool'}</AlertTitle><AlertDescription>“{review.comment}” · {review.reviewerName}{replaced ? '' : '. Upload a corrected RAT before sending the plan to UBEC again'}</AlertDescription></Alert>}
    <Field>
      <DocumentFiles compact documents={current.map(doc => ({ id: doc.id, name: doc.name, size: doc.size, url: `/api/plans/documents?id=${doc.id}` }))} />
      {!current.length && <FieldDescription>No RAT uploaded</FieldDescription>}
    </Field>
    {canReplace ? <Field data-invalid={!!error}>
      <FieldDescription>Upload new files to replace the current RAT · Excel (.xlsx), up to 3 files</FieldDescription>
      <FileUpload compact id="replace-rat" label="New RAT Excel files" multiple accept={ratFileAccept} disabled={saving} onFiles={add} />
      <DocumentFiles compact documents={files.map((file, i) => ({ id: String(i), name: file.name, size: file.size, file }))} disabled={saving} onRemove={id => setFiles(list => list.filter((_, i) => String(i) !== id))} />
      {error && <FieldError>{error}</FieldError>}
      <div><Button type="button" className="rounded-full" disabled={!files.length || saving} onClick={() => void replace()}>{saving && <Spinner data-icon="inline-start" />}{saving ? 'Replacing…' : 'Replace RAT'}</Button></div>
    </Field> : <FieldDescription>The RAT tool can be replaced while the plan is at the SUBEB</FieldDescription>}
  </FieldSet>;
}
