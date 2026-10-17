'use client';
import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { LockIcon, TriangleAlertIcon } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field, FieldContent, FieldDescription, FieldLabel, FieldLegend, FieldSet, FieldTitle } from '@/components/ui/field';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Spinner } from '@/components/ui/spinner';
import { activityInfo, activityNames, activityShare, activityTitles, capActivities, type ActivityWorkstream } from '@/lib/activity-plans';
import { activityCapKobo, componentEnvelopeKobo, type BudgetLine } from '@/lib/activity-budget';
import { compulsoryActivities } from '@/lib/activity-extras';
import { chosenActivities, optionalActivities, scaledPercent, shareTotal } from '@/lib/activity-selection';
import { currentPlanHref } from '@/lib/action-plans';
import type { EnvelopePlan } from '@/lib/funding-policy';
import './activity-selection.css';
import { nairaFormat } from '@/lib/money-format';

// Quality Assurance activities chosen up front (migration 061, lib/activity-selection.ts). The compulsory activities
// are always in; the state ticks the optional ones, and the chosen activities share the whole allocation in proportion
// to their policy shares. The server re-checks everything (PATCH /api/activities/selection).
const money = nairaFormat;
const naira = (kobo: bigint) => money.format(Number(kobo) / 100);

type Props = { workstream: ActivityWorkstream; plan: EnvelopePlan & { id?: number }; lines: readonly BudgetLine[]; canEdit: boolean; onSaved: () => Promise<void> };

const seenKey = (planId: number) => `beapms:activity-selection:seen:${planId}`;
function firstVisit(planId: number | undefined) {
  if (planId === undefined || typeof window === 'undefined') return false;
  try { if (localStorage.getItem(seenKey(planId))) return false; localStorage.setItem(seenKey(planId), '1'); return true; } catch { return false; }
}

/** The editor's first step: until the activities are chosen the dialog opens by itself; afterwards a compact summary with "Change activities". */
export function ActivitySelectionPanel({ workstream, plan, lines, canEdit, onSaved }: Props) {
  const stored = plan.qualityActivities;
  // Opens by itself until the activities are chosen, and on the first visit to this plan's editor in this browser
  // (plans whose choice was filled in from their existing items, migration 061).
  const [open, setOpen] = useState(() => canEdit && (stored == null || firstVisit(plan.id)));
  const title = activityTitles[workstream];
  const dialog = canEdit && <ActivitySelectionDialog workstream={workstream} plan={plan} lines={lines} open={open} onOpenChange={setOpen} onSaved={onSaved} />;
  if (stored == null) return <section className="ict-allocation" aria-labelledby="activity-selection-title">
    <h2 id="activity-selection-title">Which {title} activities will this plan fund?</h2>
    <p>Required activities are always included</p>
    {canEdit ? <div><Button type="button" onClick={() => setOpen(true)}>Choose activities</Button></div> : <p>Someone who can edit {title} chooses the activities.</p>}
    {dialog}
  </section>;
  const chosen = chosenActivities(workstream, stored), all = chosenActivities(workstream, optionalActivities(workstream));
  return <div className="activity-selection-summary">
    <div className="activity-selection-summary-head"><strong>{chosen.length} of {all.length} activities</strong>{canEdit && <Button type="button" variant="outline" size="sm" className="rounded-full" onClick={() => setOpen(true)}>Change activities</Button>}</div>
    <span>{stored.length ? `Optional: ${stored.map(a => activityNames[workstream][a]).join(' · ')}` : 'Required activities only'}</span>
    {dialog}
  </div>;
}

type DialogProps = Omit<Props, 'canEdit'> & { open: boolean; onOpenChange: (open: boolean) => void };

export function ActivitySelectionDialog({ workstream, plan, lines, open, onOpenChange, onSaved }: DialogProps) {
  const [picked, setPicked] = useState<number[]>(() => [...(plan.qualityActivities ?? [])]);
  const [busy, setBusy] = useState(false), [problem, setProblem] = useState<string | null>(null);
  const title = activityTitles[workstream], envelope = componentEnvelopeKobo(plan, workstream);
  const required = compulsoryActivities[workstream] ?? [], optional = optionalActivities(workstream);
  const total = shareTotal(workstream, picked), policyTotal = shareTotal(workstream, optional);
  const used = (activity: number) => { const group = capActivities(workstream, activity); return lines.filter(l => group.includes(l.activity)).reduce((sum, l) => sum + l.kobo, BigInt(0)); };
  const items = (activity: number) => lines.filter(l => l.activity === activity).length;
  const toggle = (activity: number, on: boolean) => setPicked(current => on ? [...new Set([...current, activity])].sort((a, b) => a - b) : current.filter(a => a !== activity));
  const change = (next: boolean) => { if (next) { setPicked([...(plan.qualityActivities ?? [])]); setProblem(null); } onOpenChange(next); };

  async function save(e: FormEvent) {
    e.preventDefault(); if (busy) return;
    setBusy(true); setProblem(null);
    try {
      const r = await fetch(currentPlanHref('/api/activities/selection'), { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ workstream, activities: picked }) });
      const result = await r.json().catch(() => ({})) as { error?: string };
      if (!r.ok) { setProblem(result.error || 'The activities could not be saved'); return; }
      await onSaved(); toast.success('Activities saved'); onOpenChange(false);
    } catch { setProblem('Your connection dropped before the activities were saved. Try again.'); }
    finally { setBusy(false); }
  }

  const row = (activity: number, isRequired: boolean) => {
    const on = isRequired || picked.includes(activity), share = activityShare(workstream, activity), group = capActivities(workstream, activity);
    const count = items(activity), locked = isRequired || (count > 0 && (plan.qualityActivities ?? []).includes(activity));
    const cap = on && share !== undefined && envelope !== null ? activityCapKobo(workstream, envelope, activity, picked) : null;
    const over = cap !== null && group[0] === activity ? used(activity) - cap : BigInt(0);
    const partner = group.filter(a => a !== activity).map(a => activityNames[workstream][a])[0];
    const id = `activity-choice-${activity}`;
    return <FieldLabel htmlFor={id} key={activity} className="activity-choice">
      <Field orientation="horizontal" data-disabled={locked || undefined}>
        <Checkbox id={id} checked={on} disabled={locked || busy} onCheckedChange={v => toggle(activity, v === true)} />
        <FieldContent>
          <FieldTitle>{activityNames[workstream][activity]}{isRequired && <Badge variant="warning">Required</Badge>}</FieldTitle>
          {activityInfo[workstream]?.[activity] && <FieldDescription className="activity-choice-info">{activityInfo[workstream]?.[activity]}</FieldDescription>}
          {!isRequired && count > 0 && locked && <FieldDescription className="activity-choice-note"><LockIcon aria-hidden="true" />Has {count} item{count === 1 ? '' : 's'}. Remove {count === 1 ? 'it' : 'them'} to leave this activity out.</FieldDescription>}
          {over > BigInt(0) && <FieldDescription className="activity-choice-over"><TriangleAlertIcon aria-hidden="true" />Its items would be {naira(over)} over with this choice</FieldDescription>}
        </FieldContent>
        {share !== undefined && group[0] !== activity ? <div className="activity-choice-share"><small>Shares the {share / 100}% above</small></div>
        : share !== undefined && <div className="activity-choice-share" aria-label="Share of the allocation">
          <span className="activity-choice-percent" data-off={!on || undefined}>{on ? scaledPercent(share, total) : '—'}</span>
          <small>{share / 100}% in the policy{partner ? `, with ${partner.split(' ')[0]}` : ''}</small>
          {cap !== null && <small>up to {naira(cap)}</small>}
        </div>}
      </Field>
    </FieldLabel>;
  };

  return <Dialog open={open} onOpenChange={change}>
    <DialogContent className="activity-selection-dialog sm:max-w-2xl">
      <form onSubmit={save} className="activity-selection-form">
        <DialogHeader>
          <DialogTitle>Choose the {title} activities</DialogTitle>
          <DialogDescription>Required activities are always included. Tick the optional ones this plan will fund.</DialogDescription>
        </DialogHeader>
        <ScrollArea className="activity-selection-scroll">
          <div className="activity-selection-sets">
            <FieldSet><FieldLegend variant="label">Optional · choose any</FieldLegend>{optional.map(a => row(a, false))}</FieldSet>
            <FieldSet><FieldLegend variant="label">Required · always included</FieldLegend>{required.map(a => row(a, true))}</FieldSet>
          </div>
        </ScrollArea>
        <div className="activity-selection-coverage" aria-live="polite">
          <div><span>Chosen activities hold <strong>{scaledPercent(total, policyTotal)}</strong> of the policy percentages</span><span>{total < policyTotal ? `each share is scaled ×${(policyTotal / total).toFixed(2)}` : 'shares as in the policy'}</span></div>
          <Progress value={total * 100 / policyTotal} aria-label="Policy percentages covered by the chosen activities" />
        </div>
        {problem && <Alert variant="destructive"><AlertDescription>{problem}</AlertDescription></Alert>}
        <DialogFooter>
          <Button type="button" variant="outline" disabled={busy} onClick={() => change(false)}>Cancel</Button>
          <Button type="submit" disabled={busy}>{busy && <Spinner data-icon="inline-start" />}Save activities</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>;
}
