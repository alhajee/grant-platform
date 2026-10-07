'use client';

import type { CSSProperties } from 'react';
import { HandCoinsIcon, LockIcon, MessageSquareTextIcon, SendHorizontalIcon, Sheet } from 'lucide-react';
import { InfrastructureIllustration } from '@/components/infrastructure-illustration';
import { PillarIllustration } from '@/components/pillar-illustration';
import { componentPalette } from '@/components/dashboard/component-budgets';
import { compactNaira } from '@/components/dashboard/plan-figures';
import type { CommentsController } from '@/components/plan-workbook/comments-context';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { componentSections, groupByStrategicPillar, subebComponentDepartments, type ImplementedPillar } from '@/lib/beap-pillars';
import { componentEnvelope, isSplitMode, percent, policyShare, type EnvelopeComponent, type EnvelopePlan } from '@/lib/funding-policy';
import { isPoolComponent, poolLabels, poolPartner } from '@/lib/infrastructure-pool';
import { pillarReviewLabels, type PillarReview } from '@/lib/pillar-review';
import type { PlanReview } from '@/lib/plan-review';
import type { PlanTotals } from '@/lib/plan-summary';
import { subebDepartmentName } from '@/lib/subeb-departments';
import { commentCount, ubecCount } from './review-action-dialog';


/** What the viewer can do with one component card: open its editor, and the workflow step they hold (if any). */
export type CardActions = { editHref?: string; step?: { label: string; run: () => void; /** Why the step cannot run yet (missing documents or compulsory activities); the button is then disabled. */ blocked?: string | null } };

type CardProps = { plan: PlanReview['plan']; envelopePlan: EnvelopePlan; review: PillarReview; totals: PlanTotals; comments: CommentsController | null; actions: CardActions; /** False until the component has been sent to the viewer: the card then shows only its status. */ detail: boolean };

/**
 * Proposed amount against the component's ceiling (policy share plus its own funding sources): a slim bar, then "₦X of ₦Y".
 * Infrastructure and TLM share one pool: the bar shows this side, then the partner's part in a lighter tint (--partner-share).
 */
function CeilingBar({ proposed, partner = 0, ceiling }: { proposed: number; partner?: number; ceiling: number | null }) {
  if (ceiling == null) return null;
  const pct = (amount: number) => ceiling > 0 ? amount / ceiling * 100 : 0;
  const used = Math.min(pct(proposed + partner), 100), partnerShare = Math.min(pct(partner), used);
  return <Progress className="component-ceiling" value={used} style={partner > 0 ? { '--partner-share': `${partnerShare}%` } as CSSProperties : undefined} data-pooled={partner > 0 || undefined} aria-label={`${Math.round(pct(proposed + partner))}% of ceiling proposed`} />;
}

// Teacher Development and ICT share one policy share (teachers), like Infrastructure and TLM share theirs.
const sharedPartners: Partial<Record<ImplementedPillar, string>> = { infrastructure: poolLabels.tlm, tlm: poolLabels.infrastructure, teachers: 'ICT', ict: 'Teacher Development' };
/** The component's funding-policy share of the plan's funding, from the plan's pinned policy (never a "used" figure). */
function PolicyShare({ plan, pillar }: { plan: EnvelopePlan; pillar: ImplementedPillar }) {
  const partner = sharedPartners[pillar], label = `${percent(policyShare(plan, pillar as EnvelopeComponent))}% ${partner ? `shared with ${partner}` : 'share'}`;
  return <Tooltip delayDuration={0}>
    <TooltipTrigger asChild><Badge variant="outline" className="component-card-share" tabIndex={0}>{label}</Badge></TooltipTrigger>
    <TooltipContent side="top" className="soft-tip max-w-xs">Share of the plan&apos;s funding for this component (funding policy)</TooltipContent>
  </Tooltip>;
}

/** Other funding given to this component alone (it is already in the ceiling): one chip, each funder in the tooltip. */
function ComponentFunding({ sources }: { sources: readonly { funder: string; amount: string }[] }) {
  if (!sources.length) return null;
  const total = sources.reduce((sum, source) => sum + Number(source.amount), 0);
  const names = sources.map(source => source.funder);
  return <Tooltip delayDuration={0}>
    <TooltipTrigger asChild>
      <span className="component-card-funding" tabIndex={0}><HandCoinsIcon aria-hidden="true" /><b>+{compactNaira.format(total)}</b>{names.length === 1 ? names[0] : `${names.length} funders`}</span>
    </TooltipTrigger>
    <TooltipContent side="top" className="soft-tip">
      <p className="mb-1 font-medium">Other funding for this component</p>
      <ul className="grid gap-0.5">{sources.map((source, index) => <li key={index} className="flex justify-between gap-4"><span>{source.funder}</span><b className="tabular-nums">{compactNaira.format(Number(source.amount))}</b></li>)}</ul>
    </TooltipContent>
  </Tooltip>;
}

function ComponentCard({ plan, envelopePlan, review, totals, comments, actions, detail }: CardProps) {
  const { pillar } = review, section = componentSections[pillar][0], summary = totals[pillar];
  const ceilingValue = componentEnvelope(envelopePlan, pillar), ceiling = ceilingValue == null ? null : Number(ceilingValue);
  // Infrastructure and TLM in shared-pool mode: the ceiling is the pool they share, so the partner's proposals count against it too.
  // In split mode each shows its own part of the pool (null until the split is set).
  const pooled = isPoolComponent(pillar) && !isSplitMode(envelopePlan);
  const partner = pooled ? totals[poolPartner(pillar)].budget : 0, used = summary.budget + partner;
  const sheet = `#review-${pillar}`, own = comments?.openCount(pillar) ?? 0, ubec = comments?.openCount(pillar, 'ubec') ?? 0;
  const palette = componentPalette[pillar];
  if (!detail) return <li className="component-card" data-component={pillar} data-pending style={{ '--component-fill': palette.fill, '--component-ink': palette.ink } as CSSProperties}>
    <span className="component-card-art" aria-hidden="true">{pillar === 'infrastructure' ? <InfrastructureIllustration kind="new" /> : <PillarIllustration pillar={pillar} standalone />}</span>
    <div className="component-card-body">
      <div className="component-card-title">
        <h4>{section.name}</h4>
        <Badge variant={review.status === 'changes_requested' ? 'warning' : 'secondary'}>{pillarReviewLabels[review.status]}</Badge>
      </div>
      <div className="component-card-department"><span>{subebDepartmentName(subebComponentDepartments[pillar])}</span><PolicyShare plan={envelopePlan} pillar={pillar} /></div>
      <p className="component-card-amount component-card-pending"><LockIcon aria-hidden="true" />Details appear once it is sent to you</p>
    </div>
  </li>;
  return <li className="component-card" data-component={pillar} data-over={ceiling != null && used > ceiling || undefined} style={{ '--component-fill': palette.fill, '--component-ink': palette.ink } as CSSProperties}>
    <span className="component-card-art" aria-hidden="true">{pillar === 'infrastructure' ? <InfrastructureIllustration kind="new" /> : <PillarIllustration pillar={pillar} standalone />}</span>
    <div className="component-card-body">
      <div className="component-card-title">
        <h4><a className="component-card-link" href={actions.editHref ?? sheet}>{section.name}<span className="sr-only">{actions.editHref ? ', open editor' : ', view sheet'}</span></a></h4>
        <Badge variant={review.status === 'changes_requested' ? 'warning' : 'secondary'}>{pillarReviewLabels[review.status]}</Badge>
      </div>
      <div className="component-card-department"><span>{subebDepartmentName(subebComponentDepartments[pillar])}</span><PolicyShare plan={envelopePlan} pillar={pillar} /></div>
      <CeilingBar proposed={summary.budget} partner={partner} ceiling={ceiling} />
      <p className="component-card-amount"><b>{compactNaira.format(summary.budget)}</b>{ceiling != null && <> of {compactNaira.format(ceiling)}{pooled && <> · {compactNaira.format(Math.max(ceiling - used, 0))} left</>}</>}</p>
      <ComponentFunding sources={(plan.fundingSources ?? []).filter(source => source.component === pillar)} />
    </div>
    {/* One row across the card: workbook link (on hover), comment chips, then the viewer's step. */}
    {(actions.editHref || own > 0 || ubec > 0 || actions.step) && <div className="component-card-foot">
      {actions.editHref && <Tooltip><TooltipTrigger asChild><Button asChild variant="ghost" size="icon-sm" className="component-card-sheet rounded-full"><a href={sheet} aria-label={`View ${section.name} in the workbook`}><Sheet /></a></Button></TooltipTrigger><TooltipContent side="top" className="soft-tip">View in the workbook</TooltipContent></Tooltip>}
      {own > 0 && <a className="review-open-comments card-pill" href={sheet} title={commentCount(own)} aria-label={commentCount(own)}><MessageSquareTextIcon aria-hidden="true" /><span className="card-pill-count" aria-hidden="true">{own}</span><span className="card-pill-label">{own} open</span></a>}
      {ubec > 0 && <a className="review-open-comments review-ubec-comments card-pill" href={sheet} title={ubecCount(ubec)} aria-label={ubecCount(ubec)}><MessageSquareTextIcon aria-hidden="true" /><span className="card-pill-count" aria-hidden="true">{ubec}</span><span className="card-pill-label">UBEC {ubec}</span></a>}
      {actions.step && (actions.step.blocked
        ? <Tooltip><TooltipTrigger asChild><span className="relative z-[1]" tabIndex={0}><Button size="sm" className="card-pill card-pill-step rounded-full" disabled aria-describedby={`blocked-${pillar}`}><SendHorizontalIcon aria-hidden="true" /><span className="card-pill-label">{actions.step.label}</span></Button></span></TooltipTrigger><TooltipContent side="top" className="soft-tip max-w-xs" id={`blocked-${pillar}`}>{actions.step.blocked}</TooltipContent></Tooltip>
        : <Button size="sm" className="component-card-step card-pill card-pill-step rounded-full" onClick={actions.step.run} aria-label={actions.step.label}><SendHorizontalIcon aria-hidden="true" /><span className="card-pill-label">{actions.step.label}</span></Button>)}
    </div>}
  </li>;
}

/**
 * The plan's components as compact cards: status, comments and proposed amount against the ceiling. The card
 * opens the component editor when the viewer may edit it, otherwise its sheet in the workbook below.
 */
export function ComponentCards({ data, totals, comments, actionsFor }: { data: PlanReview; totals: PlanTotals; comments: CommentsController | null; actionsFor: (review: PillarReview) => CardActions }) {
  // Ceilings and policy shares come from the loaded snapshot's setup (a saved submission shows its own), else the plan.
  const setup = data.snapshot.setup;
  const envelopePlan: EnvelopePlan = setup ? { ...data.plan, ...setup, fundingPolicy: setup.fundingPolicy ?? data.plan.fundingPolicy } : data.plan;
  // Grouped by strategic pillar (Quality, Access, System Optimisation; `strategicPillars`); groups the viewer cannot see are left out.
  const groups = groupByStrategicPillar(data.pillarReviews, review => review.pillar);
  return <div className="component-groups">
    {groups.map(group => <section key={group.id} className="component-group" aria-labelledby={`component-group-${group.id}`}>
      <div className="component-group-head">
        <h3 id={`component-group-${group.id}`}>{group.name}</h3>
        <Separator className="component-group-rule" />
      </div>
      <ul className="component-cards">
        {group.items.map(review => <ComponentCard key={review.pillar} plan={data.plan} envelopePlan={envelopePlan} review={review} totals={totals} comments={comments} actions={actionsFor(review)} detail={data.visiblePillars.includes(review.pillar)} />)}
      </ul>
    </section>)}
  </div>;
}
