'use client';
import '@/components/plan-page/plan-page.css';
import '@/components/observations/observations.css';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeftIcon, ScanEyeIcon, SendIcon } from 'lucide-react';
import { toast } from 'sonner';
import { UbecShell } from '@/components/ubec-shell';
import { PlanReviewContent } from '@/components/plan-review-content';
import { usePlanComments } from '@/components/plan-workbook/comments-context';
import { ObservationRequests } from '@/components/observations/observation-requests';
import { ObservationPlansCard } from '@/components/ubec/dashboard/observation-plans';
import { ConfirmStep, useConfirmStep } from '@/components/confirm-step';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';
import { currentPlanHref } from '@/lib/action-plans';
import { observationDepartmentName, type ObservationRequest } from '@/lib/observation-requests';
import type { Snapshot } from '@/lib/plan-review';

const openLabel = (n: number) => `${n === 0 ? 'No' : n} open ${n === 1 ? 'comment' : 'comments'} from your department`;

type Detail = {
  plan: { id: number; state: string; period: string; version: number }; user: { name: string; role: string; department?: string | null };
  snapshot: Snapshot; requests: ObservationRequest[]; department: string | null; abilities: { comment: boolean; sendBack: boolean };
};

/**
 * Observations before sending to UBEC (row 156): with `?plan=`, the whole working plan a SUBEB Executive Chairman asked
 * UBEC Audit, Procurement or Finance to look at. The department comments per activity on the workbook and its Oversight
 * Director sends the observations back; the UBEC BEAP Chair follows read-only. Without a plan: the list of requests.
 */
export default function ObservationsPage() {
  // undefined until the address has been read in the browser (the server render has no query string).
  const [planId, setPlanId] = useState<string | null | undefined>(undefined);
  useEffect(() => { void Promise.resolve().then(() => setPlanId(new URLSearchParams(window.location.search).get('plan'))); }, []);
  const [listUser, setListUser] = useState<Detail['user'] | null>(null);
  const [data, setData] = useState<Detail | null>(null), [error, setError] = useState(''), [loading, setLoading] = useState(true), [sending, setSending] = useState(false);
  const load = useCallback(async () => {
    if (!planId) return;
    setLoading(true); setError('');
    try {
      const response = await fetch(currentPlanHref('/api/ubec/observations'), { cache: 'no-store' });
      if (response.status === 401) { window.location.replace('/'); return; }
      const body = await response.json().catch(() => ({})) as Detail & { error?: string };
      if (!response.ok) throw Error(body.error || 'Unable to load this plan');
      setData(body);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to load this plan'); }
    finally { setLoading(false); }
  }, [planId]);
  useEffect(() => { void Promise.resolve().then(load); }, [load]);
  const comments = usePlanComments(data?.plan.id, !!data && !error, data?.plan.version, { scope: 'observation' });

  if (planId === null) return <UbecShell user={listUser}><div className="ubec-review-workspace plan-page">
    <div className="national-page-title"><div><span className="national-eyebrow">BEFORE SENDING TO UBEC</span><h1>Observation requests</h1></div></div>
    <ObservationPlansCard onUser={setListUser} />
  </div></UbecShell>;

  const own = data?.department ? data.requests[0]?.departments.find(d => d.department === data.department) : undefined;
  return <UbecShell user={data?.user}>
    <div className="ubec-review-workspace plan-page">
      <Button asChild variant="ghost" size="sm" className="review-back"><a href="/ubec/observations"><ArrowLeftIcon data-icon="inline-start" />Observation requests</a></Button>
      <div className="national-page-title"><div><span className="national-eyebrow">{data?.plan.state ?? 'OBSERVATIONS BEFORE SENDING TO UBEC'}</span><h1>{data ? `${data.plan.period} · Observations` : 'Observations'}</h1></div></div>
      {error && <Alert variant="destructive"><AlertTitle>Plan unavailable</AlertTitle><AlertDescription>{error}<Button variant="outline" onClick={() => void load()}>Try again</Button></AlertDescription></Alert>}
      {loading && !data ? <div className="plan-page-loading"><Skeleton className="h-36 w-full rounded-3xl" /><Skeleton className="h-64 w-full rounded-3xl" /></div> : data && !error && <>
        <div className="observations-page-grid">
          <Card className="observations-card"><CardHeader><CardTitle><h2><ScanEyeIcon aria-hidden="true" />What the Executive Chairman asked</h2></CardTitle>
            <CardDescription>The plan is still with the SUBEB. Comment on its activities in the workbook below; the SUBEB sees your department’s comments once they are sent back</CardDescription></CardHeader>
            <CardContent className="observations-card-body"><ObservationRequests requests={data.requests} /></CardContent></Card>
          <Card className="observations-card"><CardHeader><CardTitle><h2>{data.department ? observationDepartmentName(data.department) : 'UBEC BEAP Chair'}</h2></CardTitle>
            <CardDescription>{!data.department ? 'You follow these observations. Audit, Procurement and Finance write them' : data.abilities.comment ? openLabel(comments?.threads.filter(t => !t.resolvedAt).length ?? 0) : own?.completedAt ? 'Your department has sent its observations back' : 'Your department was not asked on the latest request'}</CardDescription></CardHeader>
            <CardContent>{data.abilities.sendBack ? <Button className="rounded-full" onClick={() => setSending(true)}><SendIcon data-icon="inline-start" />Send observations back</Button>
              : data.abilities.comment ? <p className="text-sm text-muted-foreground">Your Oversight Director sends the observations back</p> : null}</CardContent></Card>
        </div>
        <PlanReviewContent showPlanReference comments={comments} snapshot={data.snapshot} />
        <SendBackDialog key={sending ? 'open' : 'closed'} open={sending} detail={data} openComments={comments?.threads.filter(t => !t.resolvedAt).length ?? 0} onClose={() => setSending(false)} onSent={() => { setSending(false); void load(); }} />
      </>}
    </div>
  </UbecShell>;
}

/** The Oversight Director sends the department's observations back to the Executive Chairman, with an optional note. */
function SendBackDialog({ open, detail, openComments, onClose, onSent }: { open: boolean; detail: Detail; openComments: number; onClose: () => void; onSent: () => void }) {
  const [note, setNote] = useState(''), [error, setError] = useState(''), [saving, setSaving] = useState(false);
  const busy = useRef(false), step = useConfirmStep('observation-send-back-note');
  async function send() {
    if (busy.current) return;
    busy.current = true; setSaving(true); setError('');
    try {
      const response = await fetch(currentPlanHref('/api/ubec/observations'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'done', note: note.trim() }) });
      const result = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw Error(result.error || 'The observations could not be sent back');
      toast.success('Observations sent back'); onSent();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'The observations could not be sent back'); }
    finally { busy.current = false; setSaving(false); }
  }
  const department = observationDepartmentName(detail.department ?? '');
  return <Dialog open={open} onOpenChange={next => { if (!next && !saving) onClose(); }}>
    <DialogContent variant="inset-footer" className="sm:max-w-lg" showCloseButton={!saving} onEscapeKeyDown={event => step.escape(event, saving)} onInteractOutside={event => { if (saving) event.preventDefault(); }}>
      {step.confirming ? <ConfirmStep title={`Send ${department}’s observations back?`} description="The Executive Chairman is notified and the SUBEB sees your comments"
        facts={[{ label: 'Plan', value: `${detail.plan.state} · ${detail.plan.period}` }, { label: 'Open comments', value: openComments ? `${openComments} for the SUBEB to resolve` : 'None' }, { label: 'Goes to', value: 'SUBEB Executive Chairman' }]}
        notes={[{ kind: 'lock', text: 'Your department cannot add or change comments on this request afterwards' }]}
        comment={note} commentLabel="Your note" confirmLabel="Yes, send back" saving={saving} error={error} bodyClassName="px-4 pb-5" onBack={() => { setError(''); step.back(); }} onConfirm={() => void send()} /> : <>
        <DialogHeader className={step.commentStepClass}><DialogTitle>Send observations back</DialogTitle><DialogDescription>{openComments ? `${openComments} ${openComments === 1 ? 'comment goes' : 'comments go'} to the SUBEB, which must resolve them before sending the plan to UBEC` : 'Your department has no open comments. The Executive Chairman can then send the plan'}</DialogDescription></DialogHeader>
        <form className={step.commentStepClass} onSubmit={event => { event.preventDefault(); step.review(); }}>
          <div className="px-4 pb-4"><Field data-invalid={!!error || undefined}><FieldLabel htmlFor="observation-send-back-note">Note (optional)</FieldLabel>
            <Textarea id="observation-send-back-note" value={note} onChange={event => setNote(event.target.value)} maxLength={2000} rows={3} disabled={saving} />{error && <FieldError>{error}</FieldError>}</Field></div>
          <DialogFooter><DialogClose asChild><Button type="button" variant="outline" disabled={saving}>Cancel</Button></DialogClose><Button type="submit" disabled={saving}>{saving && <Spinner data-icon="inline-start" />}Continue</Button></DialogFooter>
        </form>
      </>}
    </DialogContent>
  </Dialog>;
}
