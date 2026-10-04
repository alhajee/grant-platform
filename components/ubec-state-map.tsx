'use client';

import { useState } from 'react';
import { ArrowUpRight, CircleCheck, MapPin, UsersRound } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectGroup, SelectItem } from '@/components/ui/select';
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { NothingWaitingArt } from '@/components/empty-art/ubec';
import states from '@/lib/nigeria-map.json';
import { normalizeStateCode, summarizePlans, needsDecision } from '@/lib/national-analytics';
import type { NationalItem } from '@/lib/ubec';

const money = new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', notation: 'compact', maximumFractionDigits: 2 });
const exactMoney = new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 2 });
const metrics = { budget: 'Proposed budget', schools: 'Targeted schools', plans: 'Submitted plans' };
type Metric = keyof typeof metrics;

export function UbecStateMap({ items, selectedState, onState, reviewer }: {
  items: NationalItem[]; selectedState: string; onState: (code: string) => void; reviewer: boolean;
}) {
  const [metric, setMetric] = useState<Metric>('budget');
  const [hovered, setHovered] = useState<string | null>(null);
  const summaries = new Map(states.map(state => [state.code, summarizePlans(items.filter(item => normalizeStateCode(item.stateCode) === state.code))]));
  const max = Math.max(0, ...Array.from(summaries.values(), value => value[metric]));
  const displayCode = hovered || (selectedState !== 'all' ? normalizeStateCode(selectedState) : null);
  const displayState = states.find(state => state.code === displayCode);
  const summary = (displayCode && summaries.get(displayCode)) || summarizePlans(items);
  const represented = [...summaries.values()].filter(s => s.plans > 0).length;
  const format = (value: number) => metric === 'budget' ? money.format(value) : value.toLocaleString('en-NG');
  const exactValue = metric === 'budget' ? exactMoney.format(summary.budget) : summary[metric].toLocaleString('en-NG');
  const hasZero = [...summaries.values()].some(value => value.plans > 0 && value[metric] === 0);

  return <Card className="national-map-card">
    <CardHeader><div className="map-heading"><CardTitle>State coverage</CardTitle>
      <div className="flex flex-wrap items-center gap-2">
      <Button variant="outline" size="sm" disabled={selectedState === 'all'} onClick={() => { onState('all'); setHovered(null); }}>Clear filter</Button>
      <Select value={metric} onValueChange={value => setMetric(value as Metric)}><SelectTrigger aria-label="Map metric"><SelectValue /></SelectTrigger><SelectContent><SelectGroup>{Object.entries(metrics).map(([key,label]) => <SelectItem key={key} value={key}>{label}</SelectItem>)}</SelectGroup></SelectContent></Select>
      </div>
    </div></CardHeader>
    <CardContent className="map-layout">
      <div className="map-geography">
        <svg viewBox="0 0 690 555" className="nigeria-map" data-empty={represented === 0} role="group" aria-label="Nigeria states. Select a state to filter submissions.">
          {states.map(state => {
            const value = summaries.get(state.code)!;
            const tone = !value.plans ? 'none' : !value[metric] ? 'zero' : String(Math.min(4, Math.ceil(value[metric] / max * 4)));
            return <path key={state.code} d={state.d} data-tone={tone} data-active={displayCode === state.code} data-selected={selectedState === state.code} role="button" tabIndex={0} aria-pressed={selectedState === state.code}
              aria-label={value.plans ? `${state.name}: ${value.plans} submitted plans, ${metric === 'budget' ? exactMoney.format(value.budget) : format(value[metric])} ${metrics[metric].toLowerCase()}` : `${state.name}: no ${reviewer ? 'assigned ' : ''}submissions in this period`}
              onMouseEnter={() => setHovered(state.code)} onMouseLeave={() => setHovered(null)} onFocus={() => setHovered(state.code)} onBlur={() => setHovered(null)}
              onClick={() => onState(selectedState === state.code ? 'all' : state.code)}
              onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onState(selectedState === state.code ? 'all' : state.code); } }}>
              <title>{`${state.name} · ${value.plans ? `${value.plans} plans · ${metric === 'budget' ? exactMoney.format(value.budget) : format(value[metric])}` : 'No submissions'}`}</title>
            </path>;
          })}
        </svg>
        <div className="map-legend"><span><i data-tone="none" />{reviewer ? 'No assigned submissions' : 'No submissions'}</span>{hasZero && <span><i data-tone="zero" />{format(0)}</span>}{max > 0 && <span className="map-range"><span>&gt; 0</span><span className="map-scale" aria-label="Four equal value bands from zero to the maximum" /><span>{format(max)}</span></span>}</div>
        <p className="map-interaction-hint">Hover to explore · Select a state to filter plans</p>
      </div>
      <aside className="map-state-detail" aria-label="State summary" aria-live="polite">
        <div className="map-summary-primary">
        <div className="map-state-name"><MapPin aria-hidden="true" /><h3>{displayState?.name || (reviewer ? 'Assigned coverage' : 'Nigeria')}</h3></div>
        <strong className="map-headline-value" title={summary.plans ? exactValue : 'No submissions'} aria-label={summary.plans ? exactValue : 'No submissions'}>{summary.plans ? format(summary[metric]) : '—'}</strong><span className="map-detail-label">{metrics[metric]}</span>
        <dl className="map-detail-totals"><div><dt>Plans</dt><dd>{summary.plans.toLocaleString()}</dd></div><div><dt>Schools</dt><dd>{summary.schools.toLocaleString()}</dd></div></dl>
        <Separator className="map-detail-separator" />
        </div>
        <div className="map-status-list">{[{key:'received',label:'Awaiting assignment'},{key:'reviewing',label:'In review'},{key:'returned',label:'Returned to SUBEB'},{key:'approved',label:'Approved'}].map(stage => <div key={stage.key}><span><i data-stage={stage.key} />{stage.label}</span><strong>{summary[stage.key as 'received' | 'reviewing' | 'returned' | 'approved']}</strong></div>)}</div>
        <p className="map-summary-note">{!summary.plans ? (reviewer ? 'No assigned submissions in this period.' : 'No submissions in this period.') : reviewer ? 'Assigned pillars · latest submissions.' : 'Latest submissions · proposed, not released funding.'}</p>
      </aside>
    </CardContent>
    <Separator className="map-footer-separator" />
    <CardFooter className="map-footer"><span>States / FCT represented: {represented} of 37</span><a href="https://www.geoboundaries.org/api/current/gbOpen/NGA/ADM1/" target="_blank" rel="noreferrer">GRID3 / geoBoundaries · CC BY 4.0</a></CardFooter>
  </Card>;
}

export function UbecAttention({ items, reviewer }: { items: NationalItem[]; reviewer: boolean }) {
  const actionable = items.filter(item => reviewer ? item.status === 'reviewing' && item.pending > 0 : item.status === 'received' || needsDecision(item))
    .sort((a,b) => Number(needsDecision(b)) - Number(needsDecision(a)) || Date.parse(a.submittedAt) - Date.parse(b.submittedAt));
  const ready = items.filter(needsDecision).length;
  const unassigned = items.filter(item => item.status === 'received').length;
  return <Card className="national-attention-card">
    <CardHeader><CardTitle>Needs attention</CardTitle></CardHeader>
    <CardContent>
      <div className="attention-counts">{reviewer ? <div><strong>{actionable.length}</strong><span>Plans to review</span></div> : <><div><strong>{ready}</strong><span>Ready for decision</span></div><div><strong>{unassigned}</strong><span>Awaiting assignment</span></div></>}</div>
      {actionable.length ? <ol className="attention-list">{actionable.slice(0,4).map(item => <li key={item.id}><a href={`/ubec/review?plan=${item.planId}`}><span className="attention-item-icon">{needsDecision(item) ? <CircleCheck /> : <UsersRound />}</span><span><strong>{item.state.replace(/ State$/, '')}</strong><small>{item.startYear === item.endYear ? item.startYear : `${item.startYear}–${item.endYear}`} · {reviewer ? `${item.pending} reviews pending` : needsDecision(item) ? 'Ready for decision' : 'Assign departments'}</small></span><ArrowUpRight aria-hidden="true" /></a></li>)}</ol> : <Empty className="p-4 md:p-6"><EmptyHeader><EmptyMedia><NothingWaitingArt label="No actions waiting" /></EmptyMedia><EmptyTitle>No actions waiting</EmptyTitle></EmptyHeader></Empty>}
    </CardContent><CardFooter><span className="map-detail-label">{actionable.length > 4 ? `Showing 4 of ${actionable.length} plans` : 'Latest submission per plan'}</span></CardFooter>
  </Card>;
}
