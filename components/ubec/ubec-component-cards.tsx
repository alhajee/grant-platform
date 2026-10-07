'use client';
import '@/components/plan-page/plan-page.css';

import type { CSSProperties } from 'react';
import { EyeIcon, MessageSquareTextIcon, SendHorizontalIcon, UserRoundPlusIcon, ClipboardCheckIcon, ShieldCheckIcon } from 'lucide-react';
import { InfrastructureIllustration } from '@/components/infrastructure-illustration';
import { PillarIllustration } from '@/components/pillar-illustration';
import { componentPalette } from '@/components/dashboard/component-budgets';
import { compactNaira } from '@/components/dashboard/plan-figures';
import type { CommentsController } from '@/components/plan-workbook/comments-context';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { groupByStrategicPillar, type ImplementedPillar } from '@/lib/beap-pillars';
import { departmentLabel, pillarDepartments } from '@/lib/ubec';
import { componentName, type PipelineComponent } from '@/lib/ubec-flow';
import { DecisionBar, OfficerStack, OversightProgress, StagePill, percentOf } from './flow-bits';

export type CardStep = { label: string; run: () => void; kind: 'assign' | 'assess' | 'oversight' | 'observe' };
const stepIcons = { assign: UserRoundPlusIcon, assess: ClipboardCheckIcon, oversight: SendHorizontalIcon, observe: ShieldCheckIcon };

/**
 * The plan's components on the UBEC plan page, in the SUBEB card style: illustration, stage pill, department,
 * cost and share of the plan, item decisions, officers and oversight progress, then the viewer's step.
 */
export function UbecComponentCards({ components, planTotal, comments, stepsFor, onView }: {
  components: readonly PipelineComponent[]; planTotal: number; comments: CommentsController | null;
  stepsFor: (pillar: ImplementedPillar) => CardStep[]; onView: (pillar: ImplementedPillar) => void;
}) {
  const groups = groupByStrategicPillar(components, c => c.pillar);
  return <div className="component-groups">
    {groups.map(group => <section key={group.id} className="component-group" aria-labelledby={`ubec-group-${group.id}`}>
      <div className="component-group-head"><h3 id={`ubec-group-${group.id}`}>{group.name}</h3><Separator className="component-group-rule" /></div>
      <ul className="component-cards">{group.items.map(c => <Card key={c.pillar} component={c} planTotal={planTotal} comments={comments} steps={stepsFor(c.pillar)} onView={() => onView(c.pillar)} />)}</ul>
    </section>)}
  </div>;
}

function Card({ component: c, planTotal, comments, steps, onView }: { component: PipelineComponent; planTotal: number; comments: CommentsController | null; steps: CardStep[]; onView: () => void }) {
  const palette = componentPalette[c.pillar], open = comments?.openCount(c.pillar, 'ubec') ?? 0, released = c.stage !== 'unreleased';
  return <li className="component-card ubec-component-card" data-component={c.pillar} data-stage={c.stage} id={`ubec-card-${c.pillar}`} style={{ '--component-fill': palette.fill, '--component-ink': palette.ink } as CSSProperties}>
    <span className="component-card-art" aria-hidden="true">{c.pillar === 'infrastructure' ? <InfrastructureIllustration kind="new" /> : <PillarIllustration pillar={c.pillar} standalone />}</span>
    <div className="component-card-body">
      <div className="component-card-title">
        <h4><button type="button" className="component-card-link ubec-card-link" onClick={onView}>{componentName(c.pillar)}<span className="sr-only">, view items</span></button></h4>
        <StagePill stage={c.stage} />
      </div>
      <div className="component-card-department"><span>{departmentLabel(c.department || pillarDepartments[c.pillar])}</span><Badge variant="outline" className="component-card-share">{percentOf(c.amount, planTotal)}% of plan</Badge></div>
      <p className="component-card-amount"><b>{compactNaira.format(c.amount)}</b> · {c.counts.total} {c.counts.total === 1 ? 'item' : 'items'}</p>
      {released && <DecisionBar counts={c.counts} compact />}
      {released && <p className="ubec-card-meta">{c.counts.accepted} accepted · {c.counts.rejected} rejected{c.counts.undecided ? ` · ${c.counts.undecided} to decide` : ''}</p>}
      {c.stage === 'oversight' && <OversightProgress done={c.oversightDone} />}
    </div>
    <div className="component-card-foot">
      <OfficerStack officers={c.officers} />
      {open > 0 && <span className="review-open-comments review-ubec-comments card-pill" title={`${open} open UBEC comments`}><MessageSquareTextIcon aria-hidden="true" /><span className="card-pill-count" aria-hidden="true">{open}</span><span className="card-pill-label">{open} open</span></span>}
      <Button size="sm" variant="ghost" className="card-pill rounded-full ubec-card-view" onClick={onView}><EyeIcon aria-hidden="true" /><span className="card-pill-label">View</span></Button>
      {steps.map(step => { const Icon = stepIcons[step.kind]; return <Button key={step.label} size="sm" className="component-card-step card-pill card-pill-step rounded-full" onClick={step.run}><Icon aria-hidden="true" /><span className="card-pill-label">{step.label}</span></Button>; })}
    </div>
  </li>;
}
