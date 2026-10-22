'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Badge } from '@/components/ui/badge';
import { DocumentFiles, FileUpload } from '@/components/document-files';
import { currentPlanHref, type ActionPlan } from '@/lib/action-plans';

type Waiver = { id: string; name: string; size: number };

/**
 * ICT: does the state already have UBEC-SUBEB Connect? (migration 070, UBEC123). "Yes" needs the UBEC HQ waiver and
 * makes "Maintenance of UBEC-SUBEB Connect" optional; "No" keeps it required. Unanswered, ICT cannot be sent.
 */
export function IctConnectPanel({ plan, waivers, canEdit, onSaved }: { plan: ActionPlan; waivers: readonly Waiver[]; canEdit: boolean; onSaved: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const answer = plan.ictConnect ?? null;
  async function choose(status: string) {
    if (busy || status === answer) return;
    setBusy(true);
    try {
      const response = await fetch(currentPlanHref('/api/activities/ict-connect'), { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) });
      const result = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(result.error || 'The answer could not be saved');
      await onSaved();
    } catch (cause) { toast.error(cause instanceof Error ? cause.message : 'The answer could not be saved'); }
    finally { setBusy(false); }
  }
  async function upload(files: File[]) {
    setBusy(true);
    try {
      for (const file of files) {
        const form = new FormData(); form.set('workstream', 'ict'); form.set('file', file);
        const response = await fetch(currentPlanHref('/api/activities/documents'), { method: 'POST', body: form });
        if (!response.ok) { toast.error(((await response.json().catch(() => ({}))) as { error?: string }).error || `${file.name} could not be uploaded`); break; }
      }
      await onSaved();
    } catch { toast.error('You appear to be offline. The waiver was not uploaded.'); }
    finally { setBusy(false); }
  }
  async function remove(id: string) {
    setBusy(true);
    try {
      const response = await fetch(`${currentPlanHref('/api/activities/documents')}&workstream=ict&id=${id}`, { method: 'DELETE' });
      if (!response.ok) toast.error(((await response.json().catch(() => ({}))) as { error?: string }).error || 'The waiver could not be removed');
      await onSaved();
    } catch { toast.error('You appear to be offline. The waiver was not removed.'); }
    finally { setBusy(false); }
  }
  const needsWaiver = answer === 'has' && !waivers.length;
  return <Card className="ict-connect-panel" data-missing={answer === null || needsWaiver || undefined}>
    <CardHeader>
      <CardTitle className="flex flex-wrap items-center gap-2">UBEC-SUBEB Connect {answer === null ? <Badge variant="warning">Answer before sending</Badge> : needsWaiver ? <Badge variant="warning">Waiver needed</Badge> : <Badge variant="secondary">Answered</Badge>}</CardTitle>
      <CardDescription>Does this state already have UBEC-SUBEB Connect?</CardDescription>
    </CardHeader>
    <CardContent className="flex flex-col gap-4">
      <RadioGroup value={answer ?? ''} onValueChange={value => void choose(value)} disabled={!canEdit || busy} className="grid gap-2 sm:grid-cols-2">
        <Field orientation="horizontal" className="ict-connect-choice"><RadioGroupItem value="has" id="ict-connect-has" /><FieldLabel htmlFor="ict-connect-has" className="flex flex-col items-start gap-0.5 font-normal"><strong>Yes, we have it</strong><span className="text-xs text-muted-foreground">Upload the waiver from UBEC HQ; Connect maintenance becomes optional</span></FieldLabel></Field>
        <Field orientation="horizontal" className="ict-connect-choice"><RadioGroupItem value="needs" id="ict-connect-needs" /><FieldLabel htmlFor="ict-connect-needs" className="flex flex-col items-start gap-0.5 font-normal"><strong>No, we need it</strong><span className="text-xs text-muted-foreground">“Maintenance of UBEC-SUBEB Connect” stays required</span></FieldLabel></Field>
      </RadioGroup>
      {answer === 'has' && <Field>
        <FieldLabel>Waiver from UBEC HQ</FieldLabel>
        {canEdit && <FileUpload label="Waiver from UBEC HQ" accept=".pdf,.docx,.xlsx,.xls,.png,.jpg,.jpeg" compact busy={busy} disabled={busy} onFiles={files => void upload(files)} />}
        {waivers.length > 0 && <DocumentFiles compact disabled={busy} documents={waivers.map(w => ({ ...w, url: `/api/activities/documents?id=${w.id}` }))} onRemove={canEdit ? id => void remove(id) : undefined} />}
        <FieldDescription className={needsWaiver ? 'text-warning-foreground' : undefined}>{needsWaiver ? 'Required before ICT can be sent' : 'PDF, Word, Excel or images, up to 5 MB'}</FieldDescription>
      </Field>}
    </CardContent>
  </Card>;
}
