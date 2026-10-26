'use client';
import '@/components/observations/observations.css';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field, FieldError, FieldGroup, FieldLabel, FieldLegend, FieldSet } from '@/components/ui/field';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';
import { ConfirmStep, useConfirmStep } from '@/components/confirm-step';
import { planPeriod, type ActionPlan } from '@/lib/action-plans';
import { listDepartments, observationDepartmentIds } from '@/lib/observation-requests';
import { oversightDepartments, type OversightDepartment } from '@/lib/ubec';

const looksAt: Record<OversightDepartment, string> = { audit: 'Compliance and controls across the plan', procurement: 'Items to buy, prices and procurement methods', finance: 'Funding, costs and budget lines' };

/**
 * The Executive Chairman's optional request for observations before sending to UBEC (row 156): choose any of UBEC Audit,
 * Procurement and Finance, add a note, confirm. Mount it with a fresh key each time it opens so it starts clean.
 */
export function RequestObservationsDialog({ plan, open, onClose, onSent }: { plan: ActionPlan; open: boolean; onClose: () => void; onSent: () => void }) {
  const [chosen, setChosen] = useState<OversightDepartment[]>([...observationDepartmentIds]);
  const [comment, setComment] = useState(''), [error, setError] = useState(''), [saving, setSaving] = useState(false);
  const busy = useRef(false);
  const step = useConfirmStep('observation-request-note');
  const toggle = (department: OversightDepartment, on: boolean) => setChosen(current => observationDepartmentIds.filter(d => d === department ? on : current.includes(d)));

  function toConfirm() {
    if (!chosen.length) { setError('Choose at least one department'); return; }
    setError(''); step.review();
  }
  async function send() {
    if (busy.current) return;
    busy.current = true; setSaving(true); setError('');
    try {
      const response = await fetch(`/api/plans/observations?plan=${plan.id}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'request', version: plan.version, departments: chosen, comment: comment.trim() }) });
      const result = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw Error(result.error || 'The request could not be sent');
      toast.success(`Observations requested from UBEC ${listDepartments(chosen)}`);
      onSent();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'The request could not be sent'); }
    finally { busy.current = false; setSaving(false); }
  }

  return <Dialog open={open} onOpenChange={next => { if (!next && !saving) onClose(); }}>
    <DialogContent variant="inset-footer" className="sm:max-w-lg" showCloseButton={!saving} onEscapeKeyDown={event => step.escape(event, saving)} onInteractOutside={event => { if (saving) event.preventDefault(); }}>
      {step.confirming ? <ConfirmStep title={`Ask UBEC ${listDepartments(chosen)} for observations?`} description="They see the whole plan and comment on its activities, then send their observations back to you"
        facts={[{ label: 'Plan', value: `${planPeriod(plan)} BEAP` }, { label: 'Goes to', value: <ul>{chosen.map(d => <li key={d}>UBEC {oversightDepartments.find(o => o.id === d)?.name}</li>)}</ul> }, { label: 'Also sees it', value: 'UBEC BEAP Chair' }]}
        notes={[{ kind: 'info', text: 'You can send the plan to UBEC once every department asked has replied and its observations are resolved' }, { kind: 'info', text: 'The plan stays with you; their observations are not part of the UBEC review' }]}
        comment={comment} confirmLabel="Yes, ask for observations" saving={saving} error={error} bodyClassName="px-4 pb-5" onBack={() => { setError(''); step.back(); }} onConfirm={() => void send()} /> : <>
        <DialogHeader className={step.commentStepClass}>
          <DialogTitle>Ask UBEC for observations</DialogTitle>
          <DialogDescription>Optional. Before you send the plan, UBEC Audit, Procurement or Finance can look at it and comment</DialogDescription>
        </DialogHeader>
        <form className={step.commentStepClass} onSubmit={event => { event.preventDefault(); toConfirm(); }}>
          <div className="px-4 pb-4"><FieldGroup>
            <FieldSet>
              <FieldLegend variant="label">Departments to ask</FieldLegend>
              <div className="observation-dept-choices">{observationDepartmentIds.map(d => <label key={d} className="observation-dept-choice">
                <Checkbox checked={chosen.includes(d)} disabled={saving} onCheckedChange={value => toggle(d, value === true)} aria-label={`UBEC ${oversightDepartments.find(o => o.id === d)?.name}`} />
                <span><strong>UBEC {oversightDepartments.find(o => o.id === d)?.name}</strong><small>{looksAt[d]}</small></span>
              </label>)}</div>
            </FieldSet>
            <Field data-invalid={!!error || undefined}>
              <FieldLabel htmlFor="observation-request-note">Comment (optional)</FieldLabel>
              <Textarea id="observation-request-note" value={comment} onChange={event => setComment(event.target.value)} maxLength={2000} rows={3} disabled={saving} placeholder="What you would like them to look at" />
              {error && <FieldError>{error}</FieldError>}
            </Field>
          </FieldGroup></div>
          <DialogFooter>
            <DialogClose asChild><Button type="button" variant="outline" disabled={saving}>Cancel</Button></DialogClose>
            <Button type="submit" disabled={saving}>{saving && <Spinner data-icon="inline-start" />}Continue</Button>
          </DialogFooter>
        </form>
      </>}
    </DialogContent>
  </Dialog>;
}
