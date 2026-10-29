'use client';
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { planDeliverableLabels, sumPlanDeliverables } from '@/lib/plan-deliverables';
import { ArrowLeft, ArrowUpRight, Landmark, SendIcon } from 'lucide-react';
import { componentPalette } from '@/components/dashboard/component-budgets';
import states from '@/lib/nigeria-map.json';
import { implementedPillars, type ImplementedPillar } from '@/lib/beap-pillars';
import { BudgetArtwork, PlansArtwork, SchoolsArtwork, StatesArtwork } from '@/components/metric-artwork';
import { DepartmentArt } from '@/components/ubec/department-art';
import { deliverableIcons, deliverableOrder } from '@/components/ubec/dashboard/deliverables';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { componentName } from '@/lib/ubec-flow';
import { NationalMap, stageOf } from '@/components/ubec/dashboard/national-map';
import { planPeriod } from '@/lib/action-plans';
import { normalizeStateCode, summarizePlans } from '@/lib/national-analytics';
import { componentDepartments, departmentName, departmentPillars, nationalStatusLabels, type UbecDashboard } from '@/lib/ubec';
import { nairaFormat, compactNairaFormat } from '@/lib/money-format';
import './national-hero.css';

// The UBEC Overview for the ES and BEAP Chair: Nigeria as the centrepiece (no card; it blends into the page) beside
// the headline figures; then the next step, the review pipeline and the latest plans.
const money = compactNairaFormat(1);
const count = new Intl.NumberFormat('en-NG');
const stages = ['received', 'reviewing', 'returned', 'approved'] as const;

export function NationalHero({ data, controls }: { data: UbecDashboard; /** The funding-year filter and Refresh, placed above the figures */ controls?: ReactNode }) {
  const s = summarizePlans(data.items), represented = new Set(data.items.map(i => normalizeStateCode(i.stateCode))).size;
  const [selected, setSelected] = useState<string | null>(null);
  useEffect(() => { const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setSelected(null); }; window.addEventListener('keydown', esc); return () => window.removeEventListener('keydown', esc); }, []);
  return <div className="nh nh-hero-wrap">
    <section className="nh-hero" aria-label="National overview">
      <div className="nh-map"><NationalMap data={data} selected={selected} onSelect={setSelected} /></div>
      {/* UBEC202: the deliverables as a list beside the map, for Nigeria or the state chosen on it. */}
      <HeroDeliverables data={data} code={selected} />
      <div className="nh-side" data-mode={selected ? 'state' : 'national'}>
        {selected ? <StateFigures key={selected} data={data} code={selected} onBack={() => setSelected(null)} /> : <>
        {controls && <div className="nh-controls">{controls}</div>}
      <div className="nh-stats">
        <article className="nh-stat" data-tone="ivory"><span className="nh-stat-art"><PlansArtwork /></span><span>Action plans</span><strong>{count.format(s.plans)}</strong></article>
        <article className="nh-stat" data-tone="teal"><span className="nh-stat-art"><BudgetArtwork /></span><span>Proposed budget</span><strong title={nairaFormat.format(s.budget)}>{money.format(s.budget)}</strong></article>
        <article className="nh-stat" data-tone="sage"><span className="nh-stat-art"><SchoolsArtwork /></span><span>Targeted schools</span><strong>{count.format(s.schools)}</strong></article>
        <article className="nh-stat" data-tone="sky"><span className="nh-stat-art"><StatesArtwork /></span><span>States represented</span><strong>{represented}<small> of 37</small></strong></article>
        <article className="nh-stat nh-stat-wide" data-tone="lilac">
          <header><span className="nh-stat-icon"><Landmark /></span><span>Review departments</span></header>
          <div className="nh-depts">
            <span className="nh-dept-stack">{componentDepartments.map((d, i) => {
              const load = data.workload.find(w => w.department === d.id);
              return <Tooltip key={d.id}><TooltipTrigger asChild>
                <a className="nh-dept" href={`/ubec/submissions`} style={{ zIndex: componentDepartments.length - i } as CSSProperties} aria-label={`${departmentName(d.id)}: ${departmentPillars(d.id).map(componentName).join(', ')}`}><DepartmentArt department={d.id} /></a>
              </TooltipTrigger><TooltipContent side="bottom" className="nh-dept-tip">
                <span className="nh-dept-tip-head"><DepartmentArt department={d.id} /><span><strong>{departmentName(d.id)}</strong><small>{d.short} · Director</small></span></span>
                <span className="nh-dept-tip-list">{departmentPillars(d.id).map(p => <span key={p}>{componentName(p)}</span>)}</span>
                <span className="nh-dept-tip-load"><b>{load?.pending ?? 0}</b> assessing · <b>{load?.completed ?? 0}</b> sent on</span>
              </TooltipContent></Tooltip>;
            })}</span>
            <small>{componentDepartments.length} departments</small>
            <a className="nh-round" href="/ubec/activity" aria-label="Department workload and activity"><ArrowUpRight /></a>
          </div>
        </article>
      </div>
      </>}
      </div>
    </section>

  </div>;
}

const deliverableTones = ['ivory', 'sage', 'sky', 'lilac'] as const;

/** UBEC152/202: what the plans will deliver, for all of Nigeria or the state chosen on the map, in the figure cards' colours. */
function HeroDeliverables({ data, code }: { data: UbecDashboard; code: string | null }) {
  const items = code ? data.items.filter(i => normalizeStateCode(i.stateCode) === code) : data.items;
  const totals = sumPlanDeliverables(items.map(i => i.deliverables));
  const place = code ? states.find(st => st.code === code)?.name ?? code : 'Nigeria';
  return <section className="nh-deliv" aria-labelledby="nh-deliv-title">
    <header><h3 id="nh-deliv-title">Deliverables</h3><small>{place} · {items.length} {items.length === 1 ? 'plan' : 'plans'}</small></header>
    <ul>{deliverableOrder.map((key, index) => { const Icon = deliverableIcons[key]; return <li key={key} data-tone={deliverableTones[index % deliverableTones.length]}><Icon aria-hidden="true" /><span>{planDeliverableLabels[key]}</span><strong>{count.format(totals[key])}</strong></li>; })}</ul>
  </section>;
}

/** The cards under the map: the next step, the review pipeline and the latest plans. */
export function NationalGlance({ data }: { data: UbecDashboard }) {
  const s = summarizePlans(data.items);
  const byDate = [...data.items].sort((a, b) => +new Date(b.submittedAt) - +new Date(a.submittedAt));
  const waiting = byDate.filter(p => p.status === 'received'), latest = byDate.slice(0, 4);
  return <div className="nh">
    <section className="nh-row" aria-label="At a glance">
      <article className="nh-card nh-next">
        <header className="nh-next-head"><span className="nh-orb" aria-hidden="true" /><span>Next step</span></header>
        <p className="nh-next-count"><strong>{count.format(s.received)}</strong>{s.received === 1 ? 'plan waiting to be released' : 'plans waiting to be released'}</p>
        {waiting.length > 0 ? <ul className="nh-next-list">{waiting.slice(0, 3).map(p => <li key={p.id}><a href={`/ubec/review?plan=${p.planId}`}><span>{p.state}</span><small>{planPeriod(p)}</small><b>{money.format(p.budget)}</b></a></li>)}</ul>
          : <p className="nh-empty">Every submission has been released to the departments</p>}
        <a className="nh-cta" href={waiting[0] ? `/ubec/review?plan=${waiting[0].planId}` : '/ubec/submissions'}><SendIcon aria-hidden="true" />{waiting[0] ? 'Open the next submission' : 'View submissions'}</a>
      </article>
      <article className="nh-card">
        <header className="nh-card-head"><h3>Review pipeline</h3><a href="/ubec/submissions">View all</a></header>
        <div className="nh-pipe-bar" aria-hidden="true">{stages.map(id => s[id] > 0 && <span key={id} data-status={id} style={{ flexGrow: s[id] } as CSSProperties} />)}{!s.plans && <span className="nh-pipe-empty" />}</div>
        <ul className="nh-pipeline">{stages.map(id => <li key={id} data-status={id}><a href={`/ubec/submissions?stage=${id}`}><i /><span>{nationalStatusLabels[id]}</span><strong>{count.format(s[id])}</strong></a></li>)}</ul>
      </article>
      <article className="nh-card">
        <header className="nh-card-head"><h3>Latest plans</h3><a href="/ubec/plans">View all</a></header>
        {latest.length ? <ul className="nh-latest">{latest.map(p => <li key={p.id}><a href={`/ubec/review?plan=${p.planId}`}>
          <span className="nh-latest-code">{normalizeStateCode(p.stateCode)}</span>
          <span className="nh-latest-name"><strong>{p.state}</strong><small>{planPeriod(p)} · Submission {p.round}</small></span>
          <span className="nh-latest-end"><b>{money.format(p.budget)}</b><span className="nh-plan-stage" data-status={p.status}>{nationalStatusLabels[p.status]}</span></span>
        </a></li>)}</ul> : <p className="nh-empty">Plans appear here as SUBEBs send them to UBEC</p>}
      </article>
    </section>
  </div>;
}

/** The chosen state in the figure column: the same cards, now with the state's figures, then its component mix and plans. */
function StateFigures({ data, code, onBack }: { data: UbecDashboard; code: string; onBack: () => void }) {
  const items = data.items.filter(i => normalizeStateCode(i.stateCode) === code), s = summarizePlans(items), status = stageOf(items);
  const name = states.find(st => st.code === code)?.name ?? code;
  const mix = implementedPillars.map(p => ({ p, v: items.reduce((sum, i) => sum + (i.amounts?.[p] ?? 0), 0) })).filter(a => a.v > 0).sort((a, b) => b.v - a.v);
  const total = mix.reduce((sum, a) => sum + a.v, 0) || 1;
  return <>
    <header className="nh-state-head nh-in" style={{ '--i': 0 } as CSSProperties}>
      <button type="button" className="nh-back" onClick={onBack} aria-label="Back to all of Nigeria"><ArrowLeft /></button>
      <span className="nh-state-name"><strong>{name}</strong>{status ? <span className="nh-plan-stage" data-status={status}>{nationalStatusLabels[status]}</span> : <small>No submissions yet</small>}</span>
    </header>
    <div className="nh-stats">
      <article className="nh-stat nh-in" data-tone="ivory" style={{ '--i': 1 } as CSSProperties}><span className="nh-stat-art"><PlansArtwork /></span><span>Plans</span><strong>{count.format(s.plans)}</strong></article>
      <article className="nh-stat nh-in" data-tone="teal" style={{ '--i': 2 } as CSSProperties}><span className="nh-stat-art"><BudgetArtwork /></span><span>Proposed</span><strong>{money.format(s.budget)}</strong></article>
      <article className="nh-stat nh-in" data-tone="sage" style={{ '--i': 3 } as CSSProperties}><span className="nh-stat-art"><SchoolsArtwork /></span><span>Schools</span><strong>{count.format(s.schools)}</strong></article>
      <article className="nh-stat nh-in" data-tone="sky" data-alert={s.returned > 0 || undefined} style={{ '--i': 4 } as CSSProperties}><span className="nh-stat-art"><StatesArtwork /></span><span>Returned</span><strong>{count.format(s.returned)}</strong></article>
      <article className="nh-stat nh-stat-wide nh-in nh-state-more" data-tone="lilac" style={{ '--i': 5 } as CSSProperties}>
        {items.length ? <>
          {mix.length > 0 && <>
            <div className="nh-mix-bar" aria-hidden="true">{mix.map(a => <span key={a.p} style={{ flexGrow: a.v / total, background: componentPalette[a.p as ImplementedPillar].fill } as CSSProperties} />)}</div>
            <ul className="nh-mix">{mix.slice(0, 3).map(a => <li key={a.p}><i style={{ background: componentPalette[a.p as ImplementedPillar].fill }} /><span>{componentName(a.p)}</span><b>{money.format(a.v)}</b></li>)}{mix.length > 3 && <li className="nh-mix-more">+{mix.length - 3} more components</li>}</ul>
          </>}
          <ul className="nh-state-plans">{items.slice(0, 1).map(i => <li key={i.id}><a href={`/ubec/review?plan=${i.planId}`}><span><strong>{planPeriod(i)}</strong><small>Submission {i.round}</small></span><ArrowUpRight aria-hidden="true" /></a></li>)}</ul>
        </> : <p className="nh-empty">This state has not sent a plan to UBEC yet</p>}
      </article>
    </div>
  </>;
}
