'use client';
import { useCallback, useEffect, useState } from 'react';
import { CheckIcon, CircleDashedIcon, LandmarkIcon, SendHorizontalIcon } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Spinner } from '@/components/ui/spinner';
import { DocumentFiles, FileUpload } from '@/components/document-files';
import { financeDocumentKinds, financeDocumentLabels, type FinanceDocumentKind, type FinanceDocuments } from '@/lib/finance-documents';

const date = new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' });
const accept = '.pdf,.xls,.xlsx,.docx,.png,.jpg,.jpeg';

/**
 * The plan's Finance documents (UBEC130, migration 073): SUBEB Finance uploads the three and submits them to the BEAP
 * Chair; the BEAP Chair and Executive Chairman see where they are; at UBEC only Finance sees them. Renders nothing for
 * anyone else (the API answers 403). `onLoaded` reports the missing documents (the Send to UBEC warning).
 */
export function FinanceDocumentsCard({ planId, reloadKey, onLoaded }: { planId: number; reloadKey?: string | number; onLoaded?: (missing: string[]) => void }) {
  const [data, setData] = useState<FinanceDocuments | null>(null), [busy, setBusy] = useState<FinanceDocumentKind | 'submit' | null>(null);
  const url = `/api/plans/finance?plan=${planId}`;
  const load = useCallback(async () => {
    try {
      const response = await fetch(url, { cache: 'no-store' });
      if (!response.ok) { setData(null); return; }
      const result = await response.json() as FinanceDocuments;
      setData(result); onLoaded?.(result.missing);
    } catch { setData(null); }
  }, [url, onLoaded]);
  useEffect(() => { void Promise.resolve().then(load); }, [load, reloadKey]);
  if (!data) return null;

  async function upload(kind: FinanceDocumentKind, files: File[]) {
    const file = files[0];
    if (!file || busy) return;
    setBusy(kind);
    try {
      const form = new FormData(); form.set('kind', kind); form.set('file', file);
      const response = await fetch(url, { method: 'POST', body: form });
      if (!response.ok) toast.error(((await response.json().catch(() => ({}))) as { error?: string }).error || `${file.name} could not be uploaded`);
      else toast.success(`${financeDocumentLabels[kind]} uploaded`);
    } catch { toast.error('You appear to be offline. The document was not uploaded.'); }
    finally { setBusy(null); await load(); }
  }
  async function remove(id: string) {
    try {
      const response = await fetch(`${url}&id=${id}`, { method: 'DELETE' });
      if (!response.ok) toast.error(((await response.json().catch(() => ({}))) as { error?: string }).error || 'The document could not be removed');
    } catch { toast.error('You appear to be offline. The document was not removed.'); }
    finally { await load(); }
  }
  async function submit() {
    if (busy) return;
    setBusy('submit');
    try {
      const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'submit' }) });
      if (!response.ok) toast.error(((await response.json().catch(() => ({}))) as { error?: string }).error || 'The documents could not be submitted');
      else toast.success('Submitted to the BEAP Chair');
    } catch { toast.error('You appear to be offline. Nothing was submitted.'); }
    finally { setBusy(null); await load(); }
  }

  const uploaded = financeDocumentKinds.length - data.missing.length;
  return <Card className="plan-status-panel finance-documents">
    <CardHeader><CardTitle><h2><LandmarkIcon aria-hidden="true" />Finance documents</h2></CardTitle>
      <CardDescription>{data.submittedAt ? `Submitted to the BEAP Chair by ${data.submittedByName} · ${date.format(new Date(data.submittedAt))}` : data.canEdit ? 'Upload all three, then submit them to the BEAP Chair' : 'Not submitted by Finance yet'}</CardDescription></CardHeader>
    <CardContent className="finance-documents-body">
      <div className="finance-documents-progress"><Progress value={uploaded / financeDocumentKinds.length * 100} aria-label={`${uploaded} of ${financeDocumentKinds.length} uploaded`} /><span>{uploaded} of {financeDocumentKinds.length}</span></div>
      <ul>{financeDocumentKinds.map(kind => {
        const doc = data.documents.find(d => d.kind === kind);
        return <li key={kind} data-done={!!doc || undefined}>
          <p>{doc ? <CheckIcon aria-hidden="true" /> : <CircleDashedIcon aria-hidden="true" />}<strong>{financeDocumentLabels[kind]}</strong></p>
          {doc && <DocumentFiles compact documents={[{ id: doc.id, name: doc.name, size: doc.size, url: `${url}&id=${doc.id}`, description: doc.uploadedByName }]} onRemove={data.canEdit ? id => void remove(id) : undefined} />}
          {data.canEdit && <FileUpload label={doc ? `Replace ${financeDocumentLabels[kind].toLowerCase()}` : financeDocumentLabels[kind]} accept={accept} compact busy={busy === kind} disabled={!!busy && busy !== kind} onFiles={files => void upload(kind, files)} />}
        </li>;
      })}</ul>
      {data.canEdit && (data.submittedAt ? <Badge variant="secondary" className="finance-documents-submitted"><CheckIcon aria-hidden="true" />Submitted to the BEAP Chair</Badge>
        : <Button className="rounded-full" disabled={data.missing.length > 0 || !!busy} title={data.missing.length ? `Upload the ${data.missing.join(', ')} first` : undefined} onClick={() => void submit()}>{busy === 'submit' ? <Spinner data-icon="inline-start" /> : <SendHorizontalIcon data-icon="inline-start" />}Submit to BEAP Chair</Button>)}
    </CardContent>
  </Card>;
}
