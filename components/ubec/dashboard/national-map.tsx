'use client';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { ArrowLeft, ArrowUpRight, Minus, Plus, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { componentPalette } from '@/components/dashboard/component-budgets';
import states from '@/lib/nigeria-map.json';
import { planPeriod } from '@/lib/action-plans';
import { normalizeStateCode, summarizePlans } from '@/lib/national-analytics';
import { implementedPillars, type ImplementedPillar } from '@/lib/beap-pillars';
import { nationalStatusLabels, type NationalItem, type UbecDashboard } from '@/lib/ubec';
import { componentName } from '@/lib/ubec-flow';
import './national-map.css';

// The Nigeria map of the UBEC Overview hero (ES and BEAP Chair): a pin per state with plans, coloured by stage.
// Choosing a state (pin or shape) flies the map into that state and opens everything about its plans.
const money = new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', notation: 'compact', maximumFractionDigits: 1 });
const count = new Intl.NumberFormat('en-NG');
const date = new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium' });
type Status = 'received' | 'reviewing' | 'returned' | 'approved';
const statusOrder: Status[] = ['received', 'reviewing', 'returned', 'approved'];
type Box = { x: number; y: number; w: number; h: number };
const full: Box = { x: 0, y: 0, w: 690, h: 555 };
const ease = (t: number) => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

/** Animates the map's viewBox between boxes (no animation when reduced motion is requested). */
function useViewBox() {
  const [box, setBox] = useState<Box>(full);
  const current = useRef(full), frame = useRef(0);
  const fly = useCallback((to: Box, ms = 700) => {
    cancelAnimationFrame(frame.current);
    const from = current.current, start = performance.now();
    const reduce = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const step = (now: number) => {
      const t = reduce ? 1 : Math.min(1, (now - start) / ms), k = ease(t);
      const next = { x: from.x + (to.x - from.x) * k, y: from.y + (to.y - from.y) * k, w: from.w + (to.w - from.w) * k, h: from.h + (to.h - from.h) * k };
      current.current = next; setBox(next);
      if (t < 1) frame.current = requestAnimationFrame(step);
    };
    frame.current = requestAnimationFrame(step);
  }, []);
  useEffect(() => () => cancelAnimationFrame(frame.current), []);
  return { box, fly, current };
}

/** A box around `b` with the map's aspect ratio and some room around it. */
function frameAround(b: Box, pad = 1.6): Box {
  const ratio = full.w / full.h;
  let w = Math.max(b.w * pad, 150), h = Math.max(b.h * pad, 150 / ratio);
  if (w / h > ratio) h = w / ratio; else w = h * ratio;
  return { x: b.x + b.w / 2 - w / 2, y: b.y + b.h / 2 - h / 2, w, h };
}

const stageOf = (items: NationalItem[]): Status | null => {
  if (!items.length) return null;
  const s = summarizePlans(items);
  return statusOrder.reduce<Status>((best, k) => s[k] > s[best] ? k : best, statusOrder.find(k => s[k] > 0) ?? 'received');
};

export function NationalMap({ data }: { data: UbecDashboard }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const { box, fly } = useViewBox();
  const [geo, setGeo] = useState<Record<string, { c: { x: number; y: number }; b: Box }>>({});
  const [hover, setHover] = useState<string | null>(null), [selected, setSelected] = useState<string | null>(null);
  const byState = useMemo(() => new Map(states.map(s => [s.code, data.items.filter(i => normalizeStateCode(i.stateCode) === s.code)])), [data.items]);
  // Pin positions and state bounds, measured once the map is drawn.
  useLayoutEffect(() => {
    const svg = svgRef.current; if (!svg) return;
    const next: typeof geo = {};
    svg.querySelectorAll<SVGPathElement>('path[data-code]').forEach(path => {
      const length = path.getTotalLength(), steps = 80; let x = 0, y = 0;
      for (let i = 0; i < steps; i++) { const p = path.getPointAtLength(length * i / steps); x += p.x; y += p.y; }
      const b = path.getBBox();
      next[path.dataset.code!] = { c: { x: x / steps, y: y / steps }, b: { x: b.x, y: b.y, w: b.width, h: b.height } };
    });
    setGeo(next);
  }, []);
  const choose = (code: string | null) => {
    setSelected(code); setHover(null);
    // The details open on the right, so the chosen state is framed in the left part of the map.
    const target = code && geo[code] ? frameAround(geo[code].b, 2.1) : full;
    fly(code ? { ...target, x: target.x + target.w * .24 } : full);
  };
  const zoom = (factor: number) => {
    const w = Math.min(full.w, Math.max(120, box.w * factor)), h = w * full.h / full.w;
    fly({ x: box.x + box.w / 2 - w / 2, y: box.y + box.h / 2 - h / 2, w, h }, 320);
  };
  useEffect(() => { const esc = (e: KeyboardEvent) => { if (e.key === 'Escape' && selected) choose(null); }; window.addEventListener('keydown', esc); return () => window.removeEventListener('keydown', esc); });
  const scale = box.w / full.w; // pins keep their size as the map zooms
  const withPlans = states.filter(s => byState.get(s.code)!.length);
  // Choropleth: states with plans get one of four teal shades by proposed budget.
  const budgets = new Map(withPlans.map(st => [st.code, byState.get(st.code)!.reduce((sum, i) => sum + i.budget, 0)]));
  const maxBudget = Math.max(0, ...budgets.values());
  const tone = (code: string) => { const b = budgets.get(code); return b === undefined ? undefined : String(maxBudget ? Math.max(1, Math.ceil(b / maxBudget * 4)) : 1); };
  const focus = selected ?? hover;

  return <section className="nm" aria-label="Plans across Nigeria" data-selected={selected || undefined}>
    <div className="nm-map">
      <svg ref={svgRef} viewBox={`${box.x} ${box.y} ${box.w} ${box.h}`} className="nm-svg" role="group" aria-label="Nigeria states. Choose a state to see its plans." onMouseLeave={() => setHover(null)}>
        {states.map(state => {
          const has = byState.get(state.code)!.length > 0;
          return <path key={state.code} data-code={state.code} d={state.d} className="nm-state" data-has={has || undefined} data-tone={tone(state.code)}
            data-focus={focus === state.code || undefined} data-dim={(selected && selected !== state.code) || undefined}
            onMouseEnter={() => !selected && setHover(state.code)} onClick={() => choose(selected === state.code ? null : state.code)}>
            <title>{state.name}</title>
          </path>;
        })}
        {/* Hover: the state lifts out of the map on a copy drawn above its neighbours */}
        {!selected && hover && (() => { const st = states.find(x => x.code === hover)!; return <path key={`lift-${hover}`} d={st.d} className="nm-lift" data-tone={tone(hover)} onClick={() => choose(hover)} onMouseLeave={() => setHover(null)} aria-hidden="true" />; })()}
        {withPlans.map(state => {
          const g = geo[state.code]; if (!g) return null;
          const status = stageOf(byState.get(state.code)!), n = byState.get(state.code)!.length;
          return <g key={state.code} className="nm-pin" data-status={status} data-focus={focus === state.code || undefined} data-dim={(selected && selected !== state.code) || undefined}
            transform={`translate(${g.c.x} ${g.c.y}) scale(${scale})`} role="button" tabIndex={0}
            aria-label={`${state.name}: ${n} ${n === 1 ? 'plan' : 'plans'}. Show details`}
            onMouseEnter={() => !selected && setHover(state.code)} onFocus={() => !selected && setHover(state.code)} onClick={() => choose(state.code)}
            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); choose(state.code); } }}>
            <ellipse className="nm-pin-shadow" cx="0" cy="1" rx="7" ry="2.4" />
            <path className="nm-pin-body" d="M0 0c-2-6-13-12-13-22a13 13 0 0 1 26 0c0 10-11 16-13 22Z" />
            <text y="-18" textAnchor="middle">{n > 1 ? n : state.code}</text>
          </g>;
        })}
      </svg>

      <div className="nm-controls" aria-label="Map controls">
        <Button type="button" size="icon" variant="outline" aria-label="Zoom in" onClick={() => zoom(.7)}><Plus /></Button>
        <Button type="button" size="icon" variant="outline" aria-label="Zoom out" onClick={() => zoom(1.4)}><Minus /></Button>
        <Button type="button" size="icon" variant="outline" aria-label="Show all of Nigeria" onClick={() => choose(null)}><RotateCcw /></Button>
      </div>
      <ul className="nm-legend">{statusOrder.map(s => <li key={s} data-status={s}><i />{nationalStatusLabels[s]}</li>)}</ul>
      {!selected && hover && <HoverChip name={states.find(s => s.code === hover)!.name} code={hover} items={byState.get(hover)!} />}
      {selected && <StateDetail key={selected} name={states.find(s => s.code === selected)!.name} items={byState.get(selected)!} onBack={() => choose(null)} />}
    </div>
  </section>;
}

function HoverChip({ name, code, items }: { name: string; code: string; items: NationalItem[] }) {
  const s = summarizePlans(items), status = stageOf(items);
  return <div className="nm-chip" aria-live="polite" data-status={status ?? undefined}><span className="nm-chip-code">{code}</span><span><strong>{name}</strong><span>{items.length ? `${s.plans} ${s.plans === 1 ? 'plan' : 'plans'} · ${money.format(s.budget)}` : 'No submissions yet'}</span></span></div>;
}

/** Everything about the chosen state's plans, sliding in over the zoomed map. */
function StateDetail({ name, items, onBack }: { name: string; items: NationalItem[]; onBack: () => void }) {
  const s = summarizePlans(items), status = stageOf(items);
  const amounts = implementedPillars.map(p => ({ p, v: items.reduce((sum, i) => sum + (i.amounts?.[p] ?? 0), 0) })).filter(a => a.v > 0).sort((a, b) => b.v - a.v);
  const total = amounts.reduce((sum, a) => sum + a.v, 0) || 1;
  return <aside className="nm-detail" aria-label={`${name} details`}>
    <header className="nm-detail-head">
      <Button type="button" variant="ghost" size="sm" onClick={onBack}><ArrowLeft data-icon="inline-start" />All of Nigeria</Button>
      <h3>{name}</h3>
      {status ? <span className="nm-stage" data-status={status}>{nationalStatusLabels[status]}</span> : <span className="nm-stage">No submissions yet</span>}
    </header>
    {items.length > 0 ? <>
      <dl className="nm-stats">
        <div><dt>Plans</dt><dd>{count.format(s.plans)}</dd></div>
        <div><dt>Proposed</dt><dd>{money.format(s.budget)}</dd></div>
        <div><dt>Schools</dt><dd>{count.format(s.schools)}</dd></div>
        <div data-alert={s.returned > 0 || undefined}><dt>Returned</dt><dd>{count.format(s.returned)}</dd></div>
      </dl>
      {amounts.length > 0 && <section className="nm-mix" aria-label="Proposed by component">
        <h4>By component</h4>
        <div className="nm-mix-bar">{amounts.map(a => <span key={a.p} style={{ width: `${a.v / total * 100}%`, background: componentPalette[a.p as ImplementedPillar].fill } as CSSProperties} title={`${componentName(a.p)} · ${money.format(a.v)}`} />)}</div>
        <ul>{amounts.slice(0, 6).map(a => <li key={a.p}><i style={{ background: componentPalette[a.p as ImplementedPillar].fill }} /><span>{componentName(a.p)}</span><b>{money.format(a.v)}</b></li>)}</ul>
      </section>}
      <section className="nm-plans" aria-label="Plans">
        <h4>Plans</h4>
        <ul>{items.map(i => <li key={i.id}><div><strong>{planPeriod(i)}</strong><small>Submission {i.round} · received {date.format(new Date(i.submittedAt))}</small></div><span className="nm-stage" data-status={i.status}>{nationalStatusLabels[i.status]}</span><b>{money.format(i.budget)}</b><a href={`/ubec/review?plan=${i.planId}`} aria-label={`Open the ${planPeriod(i)} plan`}><ArrowUpRight /></a></li>)}</ul>
      </section>
    </> : <p className="nm-empty">This state has not sent a plan to UBEC yet</p>}
  </aside>;
}
