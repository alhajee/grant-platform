'use client';

import { useRef, useState } from 'react';
import { CheckIcon, CircleDotIcon, MessageSquareTextIcon, XIcon } from 'lucide-react';
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
import { componentName, type FlowComponent, type UbecFlow } from '@/lib/ubec-flow';
import { DecisionBar } from './flow-bits';

export type FlowRequest =
  | { kind: 'release' } | { kind: 'approve' } | { kind: 'return' }
  | { kind: 'assign'; pillar: ImplementedPillar } | { kind: 'complete'; pillar: ImplementedPillar }
  | { kind: 'oversight'; pillar: ImplementedPillar } | { kind: 'observe'; pillar: ImplementedPillar };

const copy: Record<FlowRequest['kind'], { title: (name: string) => string; description: string; field: string; required: boolean; confirm: string }> = {
  release: { title: () => 'Release to UBEC departments', description: 'Each component goes to its department Director, who assigns Assessment Officers. Your comment is shared with them.', field: 'Your comment', required: true, confirm: 'Release to UBEC departments' },
  assign: { title: name => `Assign staff · ${name}`, description: 'Choose one or more Assessment Officers from your department. They accept or reject each item and report back to you.', field: 'Comment for the officers', required: true, confirm: 'Assign staff' },
  complete: { title: name => `Complete assessment · ${name}`, description: 'Your decisions are locked and sent to your Director.', field: 'Note for your Director (optional)', required: false, confirm: 'Submit assessment' },
  oversight: { title: name => `Complete & send for oversight · ${name}`, description: 'Audit, Procurement and Finance review it next. When all three have finished their observations it goes to the UBEC BEAP Chair.', field: 'Your comment', required: true, confirm: 'Send for oversight' },
  observe: { title: name => `Observations done · ${name}`, description: 'Add any comments on items in the workbook first. Once Audit, Procurement and Finance are all done, the component goes to the UBEC BEAP Chair.', field: 'Your observations (optional)', required: false, confirm: 'Observations done' },
  approve: { title: () => 'Approve action plan', description: 'Every item has been accepted. Approval locks the plan; it does not disburse funds.', field: 'Decision note', required: true, confirm: 'Approve action plan' },
  return: { title: () => 'Return to SUBEB', description: 'The whole plan goes back to the SUBEB with every component’s results. Its BEAP Chair, the Directors and Data Entry staff of these components are notified.', field: 'Consolidated changes required', required: true, confirm: 'Return to SUBEB' },
};

/** Every UBEC workflow step in one dialog: the step's summary, its fields, and the request to the right API. */
export function FlowDialog({ request, planId, version, roundId, flow, threads, onClose, onDone }: {
  request: FlowRequest | null; planId: number; version: number; roundId: number; flow: UbecFlow; threads: readonly PlanCommentThread[];
  onClose: () => void; onDone: () => void;
}) {
  const [comment, setComment] = useState(''), [officers, setOfficers] = useState<number[]>([]), [share, setShare] = useState<number[] | null>(null);
  const [saving, setSaving] = useState(false), [error, setError] = useState('');
  const busy = useRef(false);
  const kind = request?.kind, pillar = request && 'pillar' in request ? request.pillar : null;
  const component = pillar ? flow.components.find(c => c.pillar === pillar) : undefined;
  const text = kind ? copy[kind] : null;
  const openThreads = threads.filter(t => !t.resolvedAt);
  const shareIds = share ?? openThreads.map(t => t.id);
  const reset = () => { setComment(''); setOfficers([]); setShare(null); setError(''); };

  async function submit() {
    if (!request || busy.current) return;
    if (text?.required && !comment.trim()) { setError(`${text.field} is required.`); return; }
    if (request.kind === 'assign' && !officers.length) { setError('Choose at least one Assessment Officer.'); return; }
    busy.current = true; setSaving(true); setError('');
    const plan = `?plan=${planId}`;
    const [url, body] = request.kind === 'release' || request.kind === 'approve' || request.kind === 'return'
      ? [`/api/ubec/review${plan}`, { action: request.kind, version, roundId, comment, ...(request.kind === 'return' && shareIds.length ? { shareCommentIds: shareIds } : {}) }]
      : [`/api/ubec/components${plan}`, { roundId, pillar: request.pillar, ...(request.kind === 'assign' ? { action: 'assign_officers', officerIds: officers, comment }
        : request.kind === 'complete' ? { action: 'complete_assessment', note: comment } : request.kind === 'oversight' ? { action: 'send_oversight', comment } : { action: 'observations_done', note: comment }) }];
    try {
      const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const result = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(result.error || 'This step could not be saved.');
      toast.success(text!.confirm.replace(/^Submit /, 'Submitted ').replace(/ done$/, ' recorded'));
      reset(); onDone();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'This step could not be saved.'); }
    finally { busy.current = false; setSaving(false); }
  }

  return <Dialog open={!!request} onOpenChange={open => { if (!open && !saving) { reset(); onClose(); } }}>
    <DialogContent className="national-dialog ubec-flow-dialog sm:max-w-xl" showCloseButton={!saving} onEscapeKeyDown={e => { if (saving) e.preventDefault(); }} onInteractOutside={e => { if (saving) e.preventDefault(); }}>
      {text && <>
        <DialogHeader><DialogTitle>{text.title(pillar ? componentName(pillar) : '')}</DialogTitle><DialogDescription>{text.description}</DialogDescription></DialogHeader>
        <form onSubmit={event => { event.preventDefault(); void submit(); }}><FieldGroup>
          {kind === 'assign' && <OfficerPicker flow={flow} component={component} value={officers} onChange={setOfficers} disabled={saving} />}
          {(kind === 'complete' || kind === 'oversight' || kind === 'observe') && component && <ComponentSummary component={component} threads={openThreads.filter(t => t.pillar === pillar).length} showOfficers={kind !== 'complete'} />}
          {(kind === 'approve' || kind === 'return') && <PlanSummary flow={flow} />}
          {kind === 'return' && <ShareCommentsField threads={openThreads} value={shareIds} onChange={setShare} disabled={saving} />}
          <Field><FieldLabel htmlFor="ubec-flow-comment">{text.field}</FieldLabel><Textarea id="ubec-flow-comment" rows={4} maxLength={5000} required={text.required} value={comment} onChange={event => setComment(event.target.value)} disabled={saving} /></Field>
          {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
        </FieldGroup>
        <DialogFooter className="mt-6"><Button type="button" variant="outline" disabled={saving} onClick={() => { reset(); onClose(); }}>Cancel</Button><Button type="submit" variant={kind === 'return' ? 'destructive' : 'default'} disabled={saving}>{saving && <Spinner data-icon="inline-start" />}{text.confirm}</Button></DialogFooter>
        </form>
      </>}
    </DialogContent>
  </Dialog>;
}

function OfficerPicker({ flow, component, value, onChange, disabled }: { flow: UbecFlow; component?: FlowComponent; value: number[]; onChange: (ids: number[]) => void; disabled: boolean }) {
  const assigned = new Set(component?.officers.map(o => o.officerId));
  if (!flow.officers.length) return <UbecEmpty art={<NoOfficersArt />} title="No Assessment Officers in your department yet" compact><a href="/ubec/team">Add an Assessment Officer</a> first, then assign them here.</UbecEmpty>;
  return <FieldSet>
    <FieldLegend variant="label">Assessment Officers</FieldLegend>
    <FieldDescription>One officer per component by default; add more when the work needs it. <a href="/ubec/team">Manage officers</a></FieldDescription>
    <ul className="ubec-officer-options">{flow.officers.map(officer => {
      const id = `officer-${officer.id}`, already = assigned.has(officer.id);
      return <li key={officer.id} data-checked={value.includes(officer.id) || already || undefined}>
        <Checkbox id={id} disabled={disabled || already} checked={already || value.includes(officer.id)} onCheckedChange={checked => onChange(checked ? [...value, officer.id] : value.filter(v => v !== officer.id))} />
        <FieldLabel htmlFor={id} className="ubec-officer-option"><strong>{officer.name}</strong><span>{already ? 'Already assigned' : officer.open ? `${officer.open} open ${officer.open === 1 ? 'assessment' : 'assessments'}` : 'Available'}</span></FieldLabel>
      </li>;
    })}</ul>
  </FieldSet>;
}

function ComponentSummary({ component, threads, showOfficers }: { component: FlowComponent; threads: number; showOfficers: boolean }) {
  return <div className="ubec-step-summary">
    <DecisionBar counts={component.counts} />
    <p className="ubec-step-stats"><span><CheckIcon aria-hidden="true" />{component.counts.accepted} accepted</span><span><XIcon aria-hidden="true" />{component.counts.rejected} rejected</span><span><MessageSquareTextIcon aria-hidden="true" />{threads} open {threads === 1 ? 'comment' : 'comments'}</span>{component.counts.undecided > 0 && <span><CircleDotIcon aria-hidden="true" />{component.counts.undecided} undecided</span>}</p>
    {showOfficers && component.officers.length > 0 && <ul className="ubec-step-notes">{component.officers.map(o => <li key={o.id}><strong>{o.officerName}</strong>{o.completedAt ? <span>{o.completionNote || 'Assessment complete.'}</span> : <Badge variant="outline">Assessing</Badge>}</li>)}</ul>}
    {component.directorComment && <p className="ubec-step-quote"><strong>{component.directorName}</strong> {component.directorComment}</p>}
  </div>;
}

function PlanSummary({ flow }: { flow: UbecFlow }) {
  return <ul className="ubec-plan-summary">{flow.components.map(c => <li key={c.pillar}><span>{componentName(c.pillar)}</span><DecisionBar counts={c.counts} compact /><small>{c.counts.accepted} accepted · {c.counts.rejected} rejected</small></li>)}</ul>;
}
