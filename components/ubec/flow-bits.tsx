'use client';
import './ubec-flow.css';

import { CheckIcon, CircleDotIcon, ShieldCheckIcon, XIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { oversightDepartments } from '@/lib/ubec';
import { stageLabels, type DecisionCounts, type PipelineComponent } from '@/lib/ubec-flow';

// Small shared pieces of the UBEC review UI: stage pill, decision bar, oversight progress, item decision pill.

export type Stage = PipelineComponent['stage'];
const stageTone: Record<Stage, string> = { unreleased: 'waiting', director: 'working', oversight: 'oversight', chair: 'done' };
export function StagePill({ stage, label }: { stage: Stage; label?: string }) {
  return <Badge variant="secondary" className="ubec-stage-pill" data-tone={stageTone[stage]}><span aria-hidden="true" />{label ?? stageLabels[stage]}</Badge>;
}

/** Accepted / rejected / undecided items as one segmented bar with counts. */
export function DecisionBar({ counts, compact = false }: { counts: DecisionCounts; compact?: boolean }) {
  const pct = (n: number) => counts.total ? `${n / counts.total * 100}%` : '0%';
  const label = `${counts.accepted} accepted, ${counts.rejected} rejected, ${counts.undecided} undecided of ${counts.total} items`;
  return <div className="ubec-decision" data-compact={compact || undefined}>
    <div className="ubec-decision-bar" role="img" aria-label={label}>
      <span data-kind="accept" style={{ width: pct(counts.accepted) }} /><span data-kind="reject" style={{ width: pct(counts.rejected) }} />
    </div>
    {!compact && <p className="ubec-decision-legend">
      <span data-kind="accept"><CheckIcon aria-hidden="true" />{counts.accepted} accepted</span>
      <span data-kind="reject"><XIcon aria-hidden="true" />{counts.rejected} rejected</span>
      {counts.undecided > 0 && <span data-kind="open"><CircleDotIcon aria-hidden="true" />{counts.undecided} to decide</span>}
    </p>}
  </div>;
}

/** "Waiting for Audit · Procurement · Finance": a chip per oversight department, filled once done. */
export function OversightProgress({ done }: { done: readonly string[] }) {
  const pending = oversightDepartments.filter(d => !done.includes(d.id));
  return <div className="ubec-oversight" aria-label={pending.length ? `Waiting for ${pending.map(d => d.name).join(', ')}` : 'All oversight observations done'}>
    <ShieldCheckIcon aria-hidden="true" />
    {oversightDepartments.map(d => <Tooltip key={d.id} delayDuration={0}>
      <TooltipTrigger asChild><span className="ubec-oversight-chip" data-done={done.includes(d.id) || undefined} tabIndex={0}>{done.includes(d.id) && <CheckIcon aria-hidden="true" />}{d.name}</span></TooltipTrigger>
      <TooltipContent side="top" className="soft-tip">{done.includes(d.id) ? `${d.name}: observations done` : `Waiting for ${d.name}`}</TooltipContent>
    </Tooltip>)}
  </div>;
}

export function DecisionPill({ decision }: { decision: 'accept' | 'reject' | null | undefined }) {
  if (!decision) return <Badge variant="outline" className="ubec-item-pill" data-kind="open">To decide</Badge>;
  return <Badge variant="secondary" className="ubec-item-pill" data-kind={decision}>{decision === 'accept' ? <><CheckIcon aria-hidden="true" />Accepted</> : <><XIcon aria-hidden="true" />Rejected</>}</Badge>;
}

/** Initials avatars for the officers on a component. */
export function OfficerStack({ officers }: { officers: readonly { name: string; completed: boolean }[] }) {
  if (!officers.length) return null;
  const initials = (name: string) => name.trim().split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase();
  return <span className="ubec-officers" aria-label={`Assessment Officers: ${officers.map(o => `${o.name}${o.completed ? ' (done)' : ''}`).join(', ')}`}>
    {officers.slice(0, 4).map(o => <Tooltip key={o.name} delayDuration={0}><TooltipTrigger asChild><span className="ubec-officer" data-done={o.completed || undefined} tabIndex={0}>{initials(o.name)}</span></TooltipTrigger><TooltipContent side="top" className="soft-tip">{o.name}{o.completed ? ' · assessment complete' : ' · assessing'}</TooltipContent></Tooltip>)}
    {officers.length > 4 && <span className="ubec-officer">+{officers.length - 4}</span>}
  </span>;
}

export const percentOf = (part: number, whole: number) => whole > 0 ? Math.round(part / whole * 1000) / 10 : 0;
