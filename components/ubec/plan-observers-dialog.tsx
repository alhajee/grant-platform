'use client';

import { useRef, useState } from 'react';
import { UserMinusIcon } from 'lucide-react';
import { toast } from 'sonner';
import { ConfirmStep, useConfirmStep } from '@/components/confirm-step';
import { NoOfficersArt, UbecEmpty } from '@/components/empty-art/ubec-flow';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field, FieldDescription, FieldGroup, FieldLabel, FieldLegend, FieldSet } from '@/components/ui/field';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';
import { departmentName } from '@/lib/ubec';
import { componentName, type UbecFlow } from '@/lib/ubec-flow';

/** The Oversight Director's officers on this plan: who is on it, and on how many of its open components. */
export function planObservers(flow: UbecFlow, department: string) {
  const open = flow.components.filter(c => c.stage !== 'chair' && !c.oversight.some(o => o.department === department));
  const byOfficer = new Map<number, { name: string; components: number; done: number }>();
  for (const c of open) for (const o of c.observers.filter(x => x.department === department)) {
    const entry = byOfficer.get(o.officerId) ?? { name: o.officerName, components: 0, done: 0 };
    byOfficer.set(o.officerId, { ...entry, components: entry.components + 1, done: entry.done + (o.completedAt ? 1 : 0) });
  }
  return { open, officers: byOfficer };
}

interface PlanObserversDialogProps {
  open: boolean; planId: number; roundId: number; plan: string; department: string; flow: UbecFlow;
  onClose: () => void; onChanged: () => void;
}

/**
 * UBEC270: the Oversight Director assigns their Assessment Officers to the whole plan (every released component their
 * department has not finished), with a comment, then a confirmation. Officers already on the plan can be removed.
 */
export function PlanObserversDialog({ open, planId, roundId, plan, department, flow, onClose, onChanged }: PlanObserversDialogProps) {
  const [picked, setPicked] = useState<number[]>([]), [comment, setComment] = useState(''), [error, setError] = useState('');
  const [saving, setSaving] = useState(false), [removing, setRemoving] = useState<number | null>(null);
  const busy = useRef(false);
  const step = useConfirmStep('plan-observers-comment');
  const { open: components, officers: onPlan } = planObservers(flow, department);
  const officers = flow.officers.filter(o => o.department === department);
  const free = officers.filter(o => !onPlan.has(o.id));
  const reset = () => { setPicked([]); setComment(''); setError(''); step.reset(); };
  const close = () => { if (saving) return; reset(); onClose(); };
  const names = officers.filter(o => picked.includes(o.id)).map(o => o.name);

  async function post(body: object) {
    const response = await fetch(`/api/ubec/oversight-officers?plan=${planId}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ roundId, ...body }) });
    const result = await response.json().catch(() => ({})) as { error?: string };
    if (!response.ok) throw new Error(result.error || 'This could not be saved');
  }
  async function remove(officerId: number, name: string) {
    if (removing !== null || saving) return;
    setRemoving(officerId); setError('');
    try { await post({ action: 'unassign', officerId }); toast.success(`${name} removed from the plan`); onChanged(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : `${name} could not be removed`); }
    finally { setRemoving(null); }
  }
  function toConfirm() {
    if (!picked.length) { setError('Choose at least one Assessment Officer'); return; }
    if (!comment.trim()) { setError('Comment for the officers is required.'); return; }
    setError(''); step.review();
  }
  async function submit() {
    if (busy.current) return;
    busy.current = true; setSaving(true); setError('');
    try { await post({ action: 'assign', officerIds: picked, comment }); toast.success(names.length === 1 ? `${names[0]} assigned to the plan` : `${names.length} officers assigned to the plan`); reset(); onChanged(); onClose(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'This could not be saved'); }
    finally { busy.current = false; setSaving(false); }
  }

  return <Dialog open={open} onOpenChange={next => { if (!next) close(); }}>
    <DialogContent className="national-dialog ubec-flow-dialog sm:max-w-xl" showCloseButton={!saving} onEscapeKeyDown={e => step.escape(e, saving)} onInteractOutside={e => { if (saving) e.preventDefault(); }}>
      {step.confirming ? <ConfirmStep title={`Assign ${names.length === 1 ? names[0] : `${names.length} officers`} to the plan?`}
        description="They see every component of the plan and comment on its items. They do not accept or reject items"
        stats={[{ label: components.length === 1 ? 'Component' : 'Components', value: components.length, tint: 'mint' }, { label: names.length === 1 ? 'Officer' : 'Officers', value: names.length, tint: 'lilac' }]}
        facts={[{ label: 'Plan', value: plan }, { label: 'Officers', value: names.join(', ') }, { label: 'Components', value: components.map(c => componentName(c.pillar)).join(', ') }]}
        notes={[{ kind: 'info', text: 'Their open comments must be resolved before the plan is approved' }]}
        comment={comment} commentLabel="Comment for the officers" confirmLabel={names.length === 1 ? 'Yes, assign officer' : 'Yes, assign officers'} saving={saving} error={error}
        onBack={() => { setError(''); step.back(); }} onConfirm={() => void submit()} /> : <>
        <DialogHeader className={step.commentStepClass}><p className="release-breadcrumb">{plan}</p><DialogTitle>{onPlan.size ? 'Manage officers' : 'Assign officers'} · whole plan</DialogTitle>
          <DialogDescription>Choose Assessment Officers of {departmentName(department)}. They are put on all {components.length} {components.length === 1 ? 'component' : 'components'} your department has not finished, and comment on the items</DialogDescription></DialogHeader>
        <form className={step.commentStepClass} onSubmit={event => { event.preventDefault(); toConfirm(); }}><FieldGroup>
          {!officers.length ? <UbecEmpty art={<NoOfficersArt />} title="No Assessment Officers in your department yet" compact><a href="/ubec/team">Add an Assessment Officer</a> first, then assign them here</UbecEmpty>
            : <FieldSet>
              <FieldLegend variant="label">Assessment Officers</FieldLegend>
              <FieldDescription>Nobody is ticked for you. <a href="/ubec/team">Manage officers</a></FieldDescription>
              <ul className="ubec-officer-options">{officers.map(officer => {
                const id = `plan-officer-${officer.id}`, on = onPlan.get(officer.id), all = !!on && on.components >= components.length;
                return <li key={officer.id} data-checked={picked.includes(officer.id) || all || undefined}>
                  <Checkbox id={id} disabled={saving || removing !== null || all} checked={all || picked.includes(officer.id)} onCheckedChange={checked => setPicked(checked ? [...picked, officer.id] : picked.filter(v => v !== officer.id))} />
                  <FieldLabel htmlFor={id} className="ubec-officer-option"><strong>{officer.name}</strong><span>{on ? all ? 'On this plan' : `On ${on.components} of ${components.length} components · tick to add the rest` : 'Available'}</span></FieldLabel>
                  {on && on.done < on.components && <Button type="button" size="sm" variant="ghost" className="ubec-officer-remove" aria-label={`Remove ${officer.name} from the plan`} disabled={saving || removing !== null} onClick={() => void remove(officer.id, officer.name)}>{removing === officer.id ? <Spinner data-icon="inline-start" /> : <UserMinusIcon data-icon="inline-start" />}Remove</Button>}
                  {on && on.done > 0 && on.done === on.components && <Badge variant="secondary">Done</Badge>}
                </li>;
              })}</ul>
            </FieldSet>}
          {officers.length > 0 && !free.length && !officers.some(o => (onPlan.get(o.id)?.components ?? 0) < components.length) && <Alert><AlertDescription><span>Every Assessment Officer of {departmentName(department)} is on this plan. Remove one above, or <a href="/ubec/team" className="underline underline-offset-2">add an officer</a> to your team</span></AlertDescription></Alert>}
          <Field><FieldLabel htmlFor="plan-observers-comment">Comment for the officers</FieldLabel><Textarea id="plan-observers-comment" rows={4} maxLength={5000} value={comment} onChange={event => setComment(event.target.value)} disabled={saving} placeholder="What should they look at?" /></Field>
          {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
        </FieldGroup>
        <DialogFooter className="mt-6"><Button type="button" variant="outline" disabled={saving} onClick={close}>Cancel</Button><Button type="submit" disabled={saving || !officers.length}>Assign officers</Button></DialogFooter>
        </form>
      </>}
    </DialogContent>
  </Dialog>;
}
