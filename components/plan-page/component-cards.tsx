'use client';

import type { CSSProperties } from 'react';
import { HandCoinsIcon, MessageSquareTextIcon, SendHorizontalIcon, Sheet } from 'lucide-react';
import { InfrastructureIllustration } from '@/components/infrastructure-illustration';
import { PillarIllustration } from '@/components/pillar-illustration';
import { componentPalette } from '@/components/dashboard/component-budgets';
import { compactNaira } from '@/components/dashboard/plan-figures';
import type { CommentsController } from '@/components/plan-workbook/comments-context';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { componentSections, subebComponentDepartments, type ImplementedPillar } from '@/lib/beap-pillars';
import { componentEnvelope } from '@/lib/funding-policy';
import { pillarReviewLabels, type PillarReview } from '@/lib/pillar-review';
import type { PlanReview } from '@/lib/plan-review';
import type { PlanTotals } from '@/lib/plan-summary';
import { subebDepartmentName } from '@/lib/subeb-departments';
import { commentCount, ubecCount } from './review-action-dialog';


/** What the viewer can do with one component card: open its editor, and the workflow step they hold (if any). */
export type CardActions = { editHref?: string; step?: { label: string; run: () => void; /** Why the step cannot run yet (missing documents or compulsory activities); the button is then disabled. */ blocked?: string | null } };

type CardProps = { plan: PlanReview['plan']; review: PillarReview; summary: PlanTotals[ImplementedPillar]; comments: CommentsController | null; actions: CardActions };

/** Proposed amount against the component's ceiling (policy share plus its own funding sources): a slim bar, then "₦X of ₦Y". */
function CeilingBar({ proposed, ceiling }: { proposed: number; ceiling: number | null }) {
  if (ceiling == null) return null;
  const share = ceiling > 0 ? proposed / ceiling * 100 : 0;
  return <Progress className="component-ceiling" value={Math.min(share, 100)} aria-label={`${Math.round(share)}% of ceiling proposed`} />;
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

function ComponentCard({ plan, review, summary, comments, actions }: CardProps) {
  const { pillar } = review, section = componentSections[pillar][0];
  const ceilingValue = componentEnvelope(plan, pillar), ceiling = ceilingValue == null ? null : Number(ceilingValue);
  const sheet = `#review-${pillar}`, own = comments?.openCount(pillar) ?? 0, ubec = comments?.openCount(pillar, 'ubec') ?? 0;
  const palette = componentPalette[pillar];
  return <li className="component-card" data-component={pillar} data-over={ceiling != null && summary.budget > ceiling || undefined} style={{ '--component-fill': palette.fill, '--component-ink': palette.ink } as CSSProperties}>
    <span className="component-card-art" aria-hidden="true">{pillar === 'infrastructure' ? <InfrastructureIllustration kind="new" /> : <PillarIllustration pillar={pillar} standalone />}</span>
    <div className="component-card-body">
      <div className="component-card-title">
        <h3><a className="component-card-link" href={actions.editHref ?? sheet}>{section.name}<span className="sr-only">{actions.editHref ? ', open editor' : ', view sheet'}</span></a></h3>
        <Badge variant={review.status === 'changes_requested' ? 'warning' : 'secondary'}>{pillarReviewLabels[review.status]}</Badge>
      </div>
      <p className="component-card-department">{subebDepartmentName(subebComponentDepartments[pillar])}</p>
      <CeilingBar proposed={summary.budget} ceiling={ceiling} />
      <p className="component-card-amount"><b>{compactNaira.format(summary.budget)}</b>{ceiling != null && <> of {compactNaira.format(ceiling)}</>}</p>
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
  return <ul className="component-cards">
    {data.pillarReviews.map(review => <ComponentCard key={review.pillar} plan={data.plan} review={review} summary={totals[review.pillar]} comments={comments} actions={actionsFor(review)} />)}
  </ul>;
}
