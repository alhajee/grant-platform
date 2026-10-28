'use client';

import { useRef, useState } from 'react';
import { ConfirmStep, useConfirmStep } from '@/components/confirm-step';
import { CheckIcon, CircleDotIcon, MessageSquareTextIcon, UserMinusIcon, XIcon } from 'lucide-react';
import { toast } from 'sonner';
import { NoOfficersArt, UbecEmpty } from '@/components/empty-art/ubec-flow';
import { ShareCommentsField } from '@/components/ubec-share-comments';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field, FieldDescription, FieldGroup, FieldLabel, FieldLegend, FieldSet } from '@/components/ui/field';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';
import type { ImplementedPillar } from '@/lib/beap-pillars';
import type { PlanCommentThread } from '@/lib/plan-comments';
import { departmentName, oversightList } from '@/lib/ubec';
import { componentName, type FlowComponent, type PipelineComponent, type UbecFlow } from '@/lib/ubec-flow';
import { DecisionBar } from './flow-bits';
import { flowConfirmation } from './flow-confirmation';
import { ReleaseAssignments } from './release-assignments';
import { compactNairaFormat } from '@/lib/money-format';

const confirmMoneyCompact = compactNairaFormat(1);

export type FlowRequest =
  | { kind: 'release' } | { kind: 'approve' } | { kind: 'return' }
  | { kind: 'assign'; pillar: ImplementedPillar } | { kind: 'complete'; pillar: ImplementedPillar }
  | { kind: 'oversight'; pillar: ImplementedPillar } | { kind: 'observe'; pillar: ImplementedPillar }
  /** An Oversight Director puts their own Assessment Officers on a component (migration 071). */
  | { kind: 'observers'; pillar: ImplementedPillar };

const copy: Record<FlowRequest['kind'], { title: (name: string) => string; description: string; field: string; required: boolean; confirm: string }> = {
  release: { title: () => 'Release to UBEC departments', description: 'Each Director gets their components and assigns Assessment Officers', field: 'Message to the Directors', required: true, confirm: 'Release to UBEC departments' },
  assign: { title: name => `Assign staff · ${name}`, description: 'Choose one or more Assessment Officers of the component’s department. They accept or reject each item and report back to the Director.', field: 'Comment for the officers', required: true, confirm: 'Assign staff' },
  complete: { title: name => `Complete assessment · ${name}`, description: 'Your decisions are locked and sent to your Director', field: 'Note for your Director (optional)', required: false, confirm: 'Submit assessment' },
  oversight: { title: name => `Complete & send to Oversight Department · ${name}`, description: `${oversightList()} review it next. When they have all finished their observations it goes to the UBEC BEAP Chair.`, field: 'Your comment', required: true, confirm: 'Send to Oversight Department' },
  observers: { title: name => `Assign officers · ${name}`, description: 'Choose one or more Assessment Officers of your department. They comment on the items; they do not accept or reject. Their open comments must be resolved before the plan is approved.', field: 'Comment for the officers', required: true, confirm: 'Assign officers' },
  observe: { title: name => `Observations done · ${name}`, description: `Add any comments on items in the workbook first. Once ${oversightList()} are all done, the component goes to the UBEC BEAP Chair.`, field: 'Your observations (optional)', required: false, confirm: 'Observations done' },
  approve: { title: () => 'Approve action plan', description: 'Every item has been accepted. Approval locks the plan; it does not disburse funds.', field: 'Decision note', required: true, confirm: 'Approve action plan' },
  return: { title: () => 'Return to SUBEB', description: 'The whole plan goes back to the SUBEB BEAP Chair with every component’s results', field: 'Consolidated changes required', required: true, confirm: 'Return to SUBEB' },
};

/**
 * Every UBEC workflow step in one dialog: the step's summary and fields, then a confirmation of what will
 * happen (`flowConfirmation`), then the request to the right API. `plan` names the plan ("Yobe 2026 BEAP");
 * `components` are the round's components with their amounts.
 */
export function FlowDialog({ request, planId, plan, version, roundId, flow, components, threads, onClose, onDone, onChanged, admin = false }: {
  request: FlowRequest | null; planId: number; plan: string; version: number; roundId: number; flow: UbecFlow; components: readonly PipelineComponent[]; threads: readonly PlanCommentThread[]; admin?: boolean;
  onClose: () => void; onDone: () => void;
  /** Reloads the plan while the dialog stays open (an officer removed in the assign step). */
  onChanged?: () => void;
}) {
  const [comment, setComment] = useState(''), [picked, setOfficers] = useState<number[] | null>(null), [share, setShare] = useState<number[] | null>(null);
  const [saving, setSaving] = useState(false), [error, setError] = useState('');
  const busy = useRef(false);
  const step = useConfirmStep('ubec-flow-comment');
  const kind = request?.kind, pillar = request && 'pillar' in request ? request.pillar : null;
  const component = pillar ? flow.components.find(c => c.pillar === pillar) : undefined;
  // The officers this step manages: the component's own (Director) or the Oversight Director's department's.
  const observing = kind === 'observers', picking = kind === 'assign' || observing;
  const department = observing ? flow.officers[0]?.department ?? '' : component?.department ?? '';
  const onComponent: PickedAssignment[] = !component ? [] : observing ? component.observers.filter(o => o.department === department).map(o => ({ id: o.id, officerId: o.officerId, completedAt: null })) : component.officers;
  // Officers already on the component: the step only adds more.
  const adding = picking && onComponent.length > 0;
  // Assign step: officers of the department not yet on it (none left = only removals remain).
  const unassigned = picking && component ? flow.officers.filter(o => o.department === department && !onComponent.some(a => a.officerId === o.id)) : [];
  const nothingToAdd = picking && adding && !unassigned.length;
  const text = kind ? observing ? (nothingToAdd ? { ...copy.observers, title: (name: string) => `Manage officers · ${name}`, description: 'Every Assessment Officer of your department is on this component. Remove one, if needed.' } : adding ? { ...copy.observers, title: (name: string) => `Add officers · ${name}`, confirm: 'Add officers' } : copy.observers) : nothingToAdd ? { ...copy.assign, title: (name: string) => `Manage officers · ${name}`, description: 'Every Assessment Officer of the department is on this component. Remove an officer who has not finished, if needed.', confirm: 'Add officers' } : adding ? { ...copy.assign, title: (name: string) => `Add officers · ${name}`, description: 'Officers already assigned keep their work. Tick another Assessment Officer of the component’s department to share it.', confirm: 'Add officers' } : copy[kind] : null;
  const openThreads = threads.filter(t => !t.resolvedAt);
  const defaults = pillar ? flow.defaultOfficers?.[pillar] ?? [] : [];
  // The Admin's default officers start ticked on a component nobody is assessing yet; the Director confirms or changes them.
  const officers = picked ?? (adding ? [] : [...defaults]);
  const shareIds = share ?? openThreads.map(t => t.id);
  const reset = () => { setComment(''); setOfficers(null); setShare(null); setError(''); step.reset(); };
  const [removing, setRemoving] = useState<number | null>(null);
  async function unassign(assignmentId: number, name: string) {
    if (!pillar || removing) return;
    setRemoving(assignmentId); setError('');
    try {
      const response = await fetch(`/api/ubec/components?plan=${planId}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: observing ? 'unassign_observer' : 'unassign_officer', roundId, pillar, assignmentId }) });
      const result = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(result.error || `${name} could not be removed`);
      toast.success(`${name} removed from ${componentName(pillar)}`);
      onChanged?.();
    } catch (cause) { setError(cause instanceof Error ? cause.message : `${name} could not be removed`); }
    finally { setRemoving(null); }
  }
  const summary = request && flowConfirmation({ request, plan, flow, components, threads: pillar ? openThreads.filter(t => t.pillar === pillar).length : openThreads.length, shared: shareIds.length,
    officerNames: flow.officers.filter(o => officers.includes(o.id)).map(o => o.name) });

  // The first step checks the fields, then asks for confirmation; the second step saves.
  function toConfirm() {
    if (!request) return;
    if (text?.required && !comment.trim()) { setError(`${text.field} is required.`); return; }
    if ((request.kind === 'assign' || request.kind === 'observers') && !officers.length) { setError(adding ? `${componentName(request.pillar)} is already assigned; tick another officer to add one` : 'Choose at least one Assessment Officer'); return; }
    setError(''); step.review();
  }

  async function submit() {
    if (!request || busy.current) return;
    busy.current = true; setSaving(true); setError('');
    const plan = `?plan=${planId}`;
    const [url, body] = request.kind === 'release' || request.kind === 'approve' || request.kind === 'return'
      ? [`/api/ubec/review${plan}`, { action: request.kind, version, roundId, comment, ...(request.kind === 'return' && shareIds.length ? { shareCommentIds: shareIds } : {}) }]
      : [`/api/ubec/components${plan}`, { roundId, pillar: request.pillar, ...(request.kind === 'assign' ? { action: 'assign_officers', officerIds: officers, comment } : request.kind === 'observers' ? { action: 'assign_observers', officerIds: officers, comment }
        : request.kind === 'complete' ? { action: 'complete_assessment', note: comment } : request.kind === 'oversight' ? { action: 'send_oversight', comment } : { action: 'observations_done', note: comment }) }];
    try {
      const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const result = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(result.error || 'This step could not be saved');
      toast.success(text!.confirm.replace(/^Submit /, 'Submitted ').replace(/ done$/, ' recorded'));
      reset(); onDone();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'This step could not be saved'); }
    finally { busy.current = false; setSaving(false); }
  }

  return <Dialog open={!!request} onOpenChange={open => { if (!open && !saving) { reset(); onClose(); } }}>
    <DialogContent data-kind={kind} className={`national-dialog ubec-flow-dialog ${kind === 'release' ? 'sm:max-w-2xl' : 'sm:max-w-xl'}`} showCloseButton={!saving} onEscapeKeyDown={e => step.escape(e, saving)} onInteractOutside={e => { if (saving) e.preventDefault(); }}>
      {text && summary && step.confirming && <ConfirmStep stats={summary.stats} title={summary.title} description={summary.description} facts={summary.facts} notes={summary.notes} tone={summary.tone} acknowledge={summary.acknowledge}
        comment={comment} commentLabel={text.field.replace(/ \(optional\)$/, '')} confirmLabel={summary.confirm} saving={saving} error={error} onBack={() => { setError(''); step.back(); }} onConfirm={() => void submit()} />}
      {text && !step.confirming && <>
        <DialogHeader className={step.commentStepClass}><p className="release-breadcrumb">{plan}</p><DialogTitle>{text.title(pillar ? componentName(pillar) : '')}</DialogTitle><DialogDescription>{text.description}</DialogDescription></DialogHeader>
        <form className={step.commentStepClass} onSubmit={event => { event.preventDefault(); toConfirm(); }}><FieldGroup>
          {picking && <OfficerPicker flow={flow} department={department} assigned={onComponent} observing={observing} defaults={adding ? [] : defaults} value={officers} onChange={setOfficers} disabled={saving || removing !== null} admin={admin} removing={removing} onRemove={(id, name) => void unassign(id, name)} />}
          {nothingToAdd && <Alert><AlertDescription><span>Every Assessment Officer of {departmentName(department)} is already on this component. Remove one above, or {admin ? 'add an officer on Users' : <><a href="/ubec/team" className="underline underline-offset-2">add an officer</a> to your team</>} first</span></AlertDescription></Alert>}
          {(kind === 'complete' || kind === 'oversight' || kind === 'observe') && component && <ComponentSummary component={component} threads={openThreads.filter(t => t.pillar === pillar).length} showOfficers={kind !== 'complete'} />}
          {kind === 'release' && <ReleaseAssignments components={components} />}
          {(kind === 'approve' || kind === 'return') && <PlanSummary flow={flow} />}
          {kind === 'return' && <ShareCommentsField threads={openThreads} value={shareIds} onChange={setShare} disabled={saving} />}
          {!nothingToAdd && <Field><FieldLabel htmlFor="ubec-flow-comment">{text.field}</FieldLabel><Textarea id="ubec-flow-comment" rows={kind === 'release' ? 3 : 4} placeholder={kind === 'release' ? 'Write a note for the Directors…' : undefined} maxLength={5000} required={text.required} value={comment} onChange={event => setComment(event.target.value)} disabled={saving} /></Field>}
          {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
        </FieldGroup>
        <DialogFooter className="mt-6">{kind === 'release' && <p className="release-summary">{components.length} components · {new Set(components.map(c => c.department)).size} departments · {confirmMoneyCompact.format(components.reduce((sum, c) => sum + c.amount, 0))}</p>}<Button type="button" variant="outline" disabled={saving} onClick={() => { reset(); onClose(); }}>{nothingToAdd ? 'Close' : 'Cancel'}</Button>{!nothingToAdd && <Button type="submit" variant={kind === 'return' ? 'destructive' : 'default'} disabled={saving}>{saving && <Spinner data-icon="inline-start" />}{text.confirm}</Button>}</DialogFooter>
        </form>
      </>}
    </DialogContent>
  </Dialog>;
}

/** An officer already on the component (component officers, or an oversight department's officers with no completion). */
type PickedAssignment = { id: number; officerId: number; completedAt: string | null };

function OfficerPicker({ flow, department, assigned: onComponent, observing, defaults, value, onChange, disabled, admin, removing, onRemove }: { flow: UbecFlow; department: string; assigned: readonly PickedAssignment[]; observing: boolean; defaults: readonly number[]; value: number[]; onChange: (ids: number[]) => void; disabled: boolean; admin: boolean; removing: number | null; onRemove: (assignmentId: number, name: string) => void }) {
  const assigned = new Set(onComponent.map(o => o.officerId));
  // The Super Admin's list holds every department's officers; only the component's department can take it.
  const officers = flow.officers.filter(o => !department || o.department === department);
  if (!officers.length) return <UbecEmpty art={<NoOfficersArt />} title={admin ? `No Assessment Officers in ${departmentName(department)} yet` : 'No Assessment Officers in your department yet'} compact><a href={admin ? '/admin/users' : '/ubec/team'}>Add an Assessment Officer</a> first, then assign them here</UbecEmpty>;
  return <FieldSet>
    <FieldLegend variant="label">Assessment Officers</FieldLegend>
    <FieldDescription>{observing ? 'They comment on the items of this component.' : 'One officer per component by default; add more when the work needs it.'} {admin ? <>Officers of {departmentName(department)}.</> : <a href="/ubec/team">Manage officers</a>}</FieldDescription>
    <ul className="ubec-officer-options">{officers.map(officer => {
      const id = `officer-${officer.id}`, already = assigned.has(officer.id);
      return <li key={officer.id} data-checked={value.includes(officer.id) || already || undefined}>
        <Checkbox id={id} disabled={disabled || already} checked={already || value.includes(officer.id)} onCheckedChange={checked => onChange(checked ? [...value, officer.id] : value.filter(v => v !== officer.id))} />
        <FieldLabel htmlFor={id} className="ubec-officer-option"><strong>{officer.name}</strong><span>{already ? 'Already assigned' : defaults.includes(officer.id) ? `Default for this component${officer.open ? ` · ${officer.open} open ${officer.open === 1 ? 'assessment' : 'assessments'}` : ''}` : officer.open ? `${officer.open} open ${officer.open === 1 ? 'assessment' : 'assessments'}` : 'Available'}</span></FieldLabel>
        {/* An officer still assessing can be taken off the component (their decisions so far stay on it). */}
        {already && (() => { const a = onComponent.find(o => o.officerId === officer.id); return a && !a.completedAt ? <Button type="button" size="sm" variant="ghost" className="ubec-officer-remove" disabled={disabled} onClick={() => onRemove(a.id, officer.name)}>{removing === a.id ? <Spinner data-icon="inline-start" /> : <UserMinusIcon data-icon="inline-start" />}Remove</Button> : a?.completedAt ? <Badge variant="secondary">Completed</Badge> : null; })()}
      </li>;
    })}</ul>
  </FieldSet>;
}

function ComponentSummary({ component, threads, showOfficers }: { component: FlowComponent; threads: number; showOfficers: boolean }) {
  return <div className="ubec-step-summary">
    <DecisionBar counts={component.counts} compact />
    <p className="ubec-step-stats"><span><CheckIcon aria-hidden="true" />{component.counts.accepted} accepted</span><span><XIcon aria-hidden="true" />{component.counts.rejected} rejected</span><span><MessageSquareTextIcon aria-hidden="true" />{threads} open {threads === 1 ? 'comment' : 'comments'}</span>{component.counts.undecided > 0 && <span><CircleDotIcon aria-hidden="true" />{component.counts.undecided} undecided</span>}</p>
    {showOfficers && component.officers.length > 0 && <ul className="ubec-step-notes">{component.officers.map(o => <li key={o.id}><strong>{o.officerName}</strong>{o.completedAt ? <span>{o.completionNote || 'Assessment complete'}</span> : <Badge variant="outline">Assessing</Badge>}</li>)}</ul>}
    {component.directorComment && <p className="ubec-step-quote"><strong>{component.directorName}</strong> {component.directorComment}</p>}
  </div>;
}

function PlanSummary({ flow }: { flow: UbecFlow }) {
  return <ul className="ubec-plan-summary">{flow.components.map(c => <li key={c.pillar}><span>{componentName(c.pillar)}</span><DecisionBar counts={c.counts} compact /><small>{c.counts.accepted} accepted · {c.counts.rejected} rejected</small></li>)}</ul>;
}
