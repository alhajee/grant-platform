'use client';

import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';
import type { UbecDetail } from '@/lib/ubec';

type Status = { version: number; roundId?: number; returned: boolean; canSubmit: boolean };
const reviewUrl = (planId: number) => `/api/ubec/review?plan=${encodeURIComponent(String(planId))}`;

/**
 * The Executive Chairman's Send to UBEC, on the plan page. It reads the plan's UBEC state when opened (so a
 * plan returned by UBEC asks for a response to the feedback) and submits the same action the UBEC review
 * page used to. Mount it with a fresh key each time it opens so it starts clean.
 */
export function SendToUbecDialog({ planId, open, openUbecComments, onClose, onSent }: {
  planId: number; open: boolean; openUbecComments: number; onClose: () => void; onSent: () => void;
}) {
  const [status, setStatus] = useState<Status | null>(null), [loadError, setLoadError] = useState('');
  const [comment, setComment] = useState(''), [error, setError] = useState(''), [saving, setSaving] = useState(false);
  const busy = useRef(false);

  useEffect(() => {
    if (!open) return;
    let active = true;
    void fetch(reviewUrl(planId), { cache: 'no-store' }).then(async response => {
      if (response.status === 401) { window.location.replace('/'); return; }
      const detail = await response.json().catch(() => ({})) as UbecDetail & { error?: string };
      if (!response.ok) throw Error(detail.error || 'The plan could not be checked.');
      if (active) setStatus({ version: detail.plan.version, roundId: detail.round?.id, returned: detail.round?.status === 'returned', canSubmit: detail.canSubmit });
    }).catch(cause => { if (active) setLoadError(cause instanceof Error ? cause.message : 'The plan could not be checked.'); });
    return () => { active = false; };
  }, [open, planId]);

  async function send() {
    if (!status || busy.current) return;
    if (status.returned && !comment.trim()) { setError('Describe how the UBEC feedback was addressed.'); return; }
    busy.current = true; setSaving(true); setError('');
    try {
      const response = await fetch(reviewUrl(planId), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'submit', version: status.version, roundId: status.roundId, comment: comment.trim() }) });
      const result = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw Error(result.error || 'The plan could not be sent to UBEC.');
      toast.success('Sent to UBEC');
      onSent();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'The plan could not be sent to UBEC.'); }
    finally { busy.current = false; setSaving(false); }
  }

  return <Dialog open={open} onOpenChange={next => { if (!next && !saving) onClose(); }}>
    <DialogContent variant="inset-footer" className="sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>Send to UBEC</DialogTitle>
        <DialogDescription>{status?.returned ? 'Resubmit the revised plan to UBEC with a note on how its feedback was addressed.' : 'The reviewed plan goes to UBEC for national review. It is locked while UBEC reviews it.'}</DialogDescription>
      </DialogHeader>
      <div className="px-4 pb-4">
        {!status && !loadError && <p className="flex items-center gap-2 text-sm text-muted-foreground"><Spinner />Checking the plan…</p>}
        {loadError && <p className="text-sm text-destructive" role="alert">{loadError}</p>}
        {status && !status.canSubmit && <p className="text-sm text-muted-foreground" role="status">This plan can’t be sent to UBEC right now. It may already be with UBEC, or components are still being reviewed.</p>}
        {status?.canSubmit && <FieldGroup>
          {openUbecComments > 0 && <p className="ubec-dialog-note">{openUbecComments} UBEC {openUbecComments === 1 ? 'comment is' : 'comments are'} still open. UBEC will see your team’s replies with this submission.</p>}
          <Field data-invalid={!!error || undefined}>
            <FieldLabel htmlFor="send-to-ubec-note">{status.returned ? 'Response to UBEC feedback' : 'Comment (optional)'}</FieldLabel>
            <Textarea id="send-to-ubec-note" value={comment} onChange={event => setComment(event.target.value)} maxLength={5000} rows={4} required={status.returned} disabled={saving} />
            {error && <FieldError>{error}</FieldError>}
          </Field>
        </FieldGroup>}
      </div>
      <DialogFooter>
        <DialogClose asChild><Button type="button" variant="outline" disabled={saving}>Cancel</Button></DialogClose>
        <Button type="button" disabled={!status?.canSubmit || saving} onClick={() => void send()}>{saving && <Spinner data-icon="inline-start" />}Send to UBEC</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}
