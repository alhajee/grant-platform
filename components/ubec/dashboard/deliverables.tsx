'use client';
import { useMemo, useState } from 'react';
import { BookOpenIcon, BuildingIcon, DropletsIcon, GraduationCapIcon, LibraryIcon, SchoolIcon, ArmchairIcon, BathIcon } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import states from '@/lib/nigeria-map.json';
import { normalizeStateCode } from '@/lib/national-analytics';
import { planDeliverableLabels, sumPlanDeliverables, type PlanDeliverables } from '@/lib/plan-deliverables';
import type { UbecDashboard } from '@/lib/ubec';

const count = new Intl.NumberFormat('en-NG');
const icons: Record<keyof PlanDeliverables, typeof SchoolIcon> = { schools: SchoolIcon, classrooms: BuildingIcon, teachers: GraduationCapIcon, curriculum: BookOpenIcon, tlm: LibraryIcon, toilets: BathIcon, furniture: ArmchairIcon, water: DropletsIcon };
const order: (keyof PlanDeliverables)[] = ['schools', 'classrooms', 'teachers', 'curriculum', 'tlm', 'toilets', 'furniture', 'water'];

/**
 * UBEC152/154/197: what the plans deliver, at a glance, for all of Nigeria or one state: schools intervened, classrooms,
 * teachers trained, curriculum and TLM purchased, and the main Infrastructure items. From `deliverables` on each
 * dashboard item (the components the viewer sees).
 */
export function DeliverablesCard({ data }: { data: UbecDashboard }) {
  const [state, setState] = useState('all');
  const options = useMemo(() => [...new Set(data.items.map(i => normalizeStateCode(i.stateCode)))].map(code => ({ code, name: states.find(s => s.code === code)?.name ?? code })).sort((a, b) => a.name.localeCompare(b.name)), [data.items]);
  const items = state === 'all' ? data.items : data.items.filter(i => normalizeStateCode(i.stateCode) === state);
  const totals = sumPlanDeliverables(items.map(i => i.deliverables));
  return <Card className="ubec-deliverables"><CardHeader className="ubec-deliverables-head">
    <div><CardTitle>Deliverables</CardTitle><CardDescription>What {items.length} {items.length === 1 ? 'plan' : 'plans'} {state === 'all' ? 'across Nigeria' : `in ${options.find(o => o.code === state)?.name}`} will deliver</CardDescription></div>
    <Select value={state} onValueChange={setState}><SelectTrigger size="sm" aria-label="State"><SelectValue /></SelectTrigger><SelectContent><SelectGroup><SelectItem value="all">All states</SelectItem>{options.map(o => <SelectItem key={o.code} value={o.code}>{o.name}</SelectItem>)}</SelectGroup></SelectContent></Select>
  </CardHeader><CardContent>
    <ul className="ubec-deliverables-grid">{order.map(key => { const Icon = icons[key]; return <li key={key}><Icon aria-hidden="true" /><strong>{count.format(totals[key])}</strong><span>{planDeliverableLabels[key]}</span></li>; })}</ul>
  </CardContent></Card>;
}

/** The plan card's compact line of deliverables (UBEC154). */
export function PlanDeliverablesLine({ deliverables }: { deliverables?: PlanDeliverables }) {
  if (!deliverables) return null;
  const shown = (['classrooms', 'teachers', 'curriculum', 'tlm'] as const).filter(key => deliverables[key] > 0);
  if (!shown.length) return null;
  return <ul className="plan-deliverables-line" aria-label="Deliverables">{shown.map(key => { const Icon = icons[key]; return <li key={key} title={planDeliverableLabels[key]}><Icon aria-hidden="true" /><b>{count.format(deliverables[key])}</b>{planDeliverableLabels[key].replace(/ (trained|purchased)$/, '').toLowerCase()}</li>; })}</ul>;
}
