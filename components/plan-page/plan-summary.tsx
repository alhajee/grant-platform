'use client';

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { ArrowLeftIcon, CalendarDaysIcon, FileTextIcon, HandCoinsIcon, ListIcon, SchoolIcon } from 'lucide-react';
import { Amount, FundingGauge, amountFormat, compactNaira, mixOrder } from '@/components/dashboard/plan-figures';
import { OtherFundingInfo } from '@/components/funding-sources-field';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import type { ActionPlan } from '@/lib/action-plans';
import { otherFundingTotal } from '@/lib/plan-setup';
import type { PlanTotals } from '@/lib/plan-summary';
import { FundingDetails } from './funding-details';

const plural = (n: number, one: string, many: string) => n === 1 ? one : many;
// Things that open outside the card but belong to it (document preview dialog, tooltips, menus).
const PORTALS = '[data-slot=dialog-overlay], [data-slot=dialog-content], [role=dialog], [data-radix-popper-content-wrapper]';
const inPortal = (target: EventTarget | null) => target instanceof Element && !!target.closest(PORTALS);

/**
 * While the card is flipped, a click or tap outside it, focus moving elsewhere on the page, or Escape turns it
 * back. Focus follows the visible face so keyboard users land on Back, and on the trigger again afterwards.
 */
function useFlipBack(flipped: boolean, onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null), wasFlipped = useRef(flipped);
  useEffect(() => {
    const card = ref.current;
    if (wasFlipped.current !== flipped) {
      wasFlipped.current = flipped;
      const target = card?.querySelector<HTMLElement>(flipped ? '[data-flip-back]' : '.plan-summary-details-trigger');
      requestAnimationFrame(() => target?.focus({ preventScroll: true }));
    }
    if (!flipped || !card) return;
    const outside = (target: EventTarget | null) => target instanceof Node && !card.contains(target) && !inPortal(target);
    const onPointer = (event: PointerEvent) => { if (outside(event.target)) onClose(); };
    // relatedTarget is the element receiving focus; null (focus left the page or an inert face) is not a move away.
    const onFocusOut = (event: FocusEvent) => { if (event.relatedTarget && outside(event.relatedTarget)) onClose(); };
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape' && !document.querySelector('[role=dialog]')) onClose(); };
    document.addEventListener('pointerdown', onPointer);
    card.addEventListener('focusout', onFocusOut);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('pointerdown', onPointer); card.removeEventListener('focusout', onFocusOut); document.removeEventListener('keydown', onKey); };
  }, [flipped, onClose]);
  return ref;
}
// A soft spring: the flip settles without overshooting past the edge-on point.
const FLIP = { type: 'spring', stiffness: 170, damping: 24, mass: 0.9 } as const;

/** Tracks an element's rendered height, so the card can animate between its two faces. */
function useHeight() {
  const ref = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number | null>(null);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    // The full border box (padding included): the faces carry their own padding.
    const observer = new ResizeObserver(() => setHeight(element.offsetHeight));
    observer.observe(element);
    setHeight(element.offsetHeight);
    return () => observer.disconnect();
  }, []);
  return [ref, height] as const;
}

/**
 * A card with two faces that flips on its vertical axis (Motion spring); its height follows the visible face.
 * The hidden face is inert, so keyboard and screen readers only reach the side that is showing. Reduced
 * motion swaps the faces with a short crossfade instead of rotating.
 */
function FlipCard({ flipped, front, back }: { flipped: boolean; front: ReactNode; back: ReactNode }) {
  const reduce = useReducedMotion();
  const [frontRef, frontHeight] = useHeight(), [backRef, backHeight] = useHeight();
  const height = flipped ? backHeight : frontHeight;
  const face = (side: 'front' | 'back') => {
    const showing = (side === 'back') === flipped;
    return reduce
      ? { initial: false, animate: { opacity: showing ? 1 : 0 }, transition: { duration: 0.18 } }
      : { initial: false, animate: { rotateY: side === 'front' ? (flipped ? 180 : 0) : (flipped ? 0 : -180) }, transition: FLIP };
  };
  return <motion.div className="flip-card" style={{ perspective: 1400 }} initial={false} animate={height == null ? undefined : { height }} transition={reduce ? { duration: 0 } : FLIP}>
    <motion.div ref={frontRef} className="flip-face" data-side="front" inert={flipped} aria-hidden={flipped} {...face('front')}>{front}</motion.div>
    <motion.div ref={backRef} className="flip-face" data-side="back" inert={!flipped} aria-hidden={!flipped} {...face('back')}>{back}</motion.div>
  </motion.div>;
}

/**
 * The plan's funding in a narrow side card. The front shows available funding, the proposed amount as a
 * component-coloured gauge and a 2x2 grid of facts; "Funding details & documents" flips it to the back, where
 * the funding sources, plan reference and assessment documents are, with a button to flip back.
 */
export function PlanSummary({ plan, totals, detailsOpen, onDetailsOpenChange }: { plan: ActionPlan; totals: PlanTotals; detailsOpen: boolean; onDetailsOpenChange: (open: boolean) => void }) {
  const funding = plan.fundingTotal != null ? Number(plan.fundingTotal) : null;
  const other = Number(otherFundingTotal(plan));
  const { budget, schoolCount, lineCount } = totals.total;
  const amounts = Object.fromEntries(mixOrder.map(area => [area, totals[area].budget]));
  const share = funding ? Math.round(budget / funding * 100) : null;
  const cardRef = useFlipBack(detailsOpen, () => onDetailsOpenChange(false));
  const facts = [
    { key: 'schools', Icon: SchoolIcon, value: String(schoolCount), label: plural(schoolCount, 'school', 'schools') },
    { key: 'lines', Icon: ListIcon, value: String(lineCount), label: plural(lineCount, 'budget line', 'budget lines') },
    ...(other > 0 ? [{ key: 'other', Icon: HandCoinsIcon, value: `+${compactNaira.format(other)}`, label: 'other funding', info: true }] : []),
    ...(plan.implementationYear != null ? [{ key: 'year', Icon: CalendarDaysIcon, value: String(plan.implementationYear), label: 'implementation' }] : []),
  ];

  const front = <>
    <p className="plan-summary-label">Available funding</p>
    <p className="plan-funding" aria-label={funding == null ? 'Not set' : amountFormat.format(funding)}>{funding == null ? '—' : <Amount value={funding} />}</p>
    {budget > 0 ? <div className="plan-summary-mix">
      <FundingGauge amounts={amounts} budget={budget} funding={funding ?? 0} />
      <p className="plan-summary-proposed"><strong>{compactNaira.format(budget)}</strong> proposed{share != null && <span>{share}%</span>}</p>
    </div> : <p className="plan-summary-proposed">Nothing proposed yet</p>}
    <dl className="plan-summary-facts">
      {facts.map(({ key, Icon, value, label, info }) => <div key={key}>
        <dt><Icon aria-hidden="true" />{label}{info && <OtherFundingInfo setup={plan} />}</dt>
        <dd>{value}</dd>
      </div>)}
    </dl>
    {plan.beapName && <button type="button" className="plan-summary-details-trigger" aria-expanded={detailsOpen} onClick={() => onDetailsOpenChange(true)}><FileTextIcon aria-hidden="true" />Funding details & documents</button>}
  </>;

  const back = <>
    <div className="plan-summary-back-head">
      <Button type="button" variant="ghost" size="sm" className="rounded-full" data-flip-back onClick={() => onDetailsOpenChange(false)}><ArrowLeftIcon data-icon="inline-start" />Back</Button>
      <p className="plan-summary-label">Funding details & documents</p>
    </div>
    <FundingDetails setup={plan} />
  </>;

  return <Card ref={cardRef} className="plan-summary">
    <CardContent>
      {plan.beapName ? <FlipCard flipped={detailsOpen} front={front} back={back} /> : <div className="flip-face" data-side="front">{front}</div>}
    </CardContent>
  </Card>;
}
