'use client';
import { BookOpenIcon, BuildingIcon, DropletsIcon, GraduationCapIcon, LibraryIcon, SchoolIcon, ArmchairIcon, BathIcon } from 'lucide-react';
import { planDeliverableLabels, type PlanDeliverables } from '@/lib/plan-deliverables';

const count = new Intl.NumberFormat('en-NG');
export const deliverableIcons: Record<keyof PlanDeliverables, typeof SchoolIcon> = { schools: SchoolIcon, classrooms: BuildingIcon, teachers: GraduationCapIcon, curriculum: BookOpenIcon, tlm: LibraryIcon, toilets: BathIcon, furniture: ArmchairIcon, water: DropletsIcon };
export const deliverableOrder: (keyof PlanDeliverables)[] = ['schools', 'classrooms', 'teachers', 'curriculum', 'tlm', 'toilets', 'furniture', 'water'];

/** The plan card's compact line of deliverables (UBEC154). */
export function PlanDeliverablesLine({ deliverables }: { deliverables?: PlanDeliverables }) {
  if (!deliverables) return null;
  const shown = (['classrooms', 'teachers', 'curriculum', 'tlm'] as const).filter(key => deliverables[key] > 0);
  if (!shown.length) return null;
  return <ul className="plan-deliverables-line" aria-label="Deliverables">{shown.map(key => { const Icon = deliverableIcons[key]; return <li key={key} title={planDeliverableLabels[key]}><Icon aria-hidden="true" /><b>{count.format(deliverables[key])}</b>{planDeliverableLabels[key].replace(/ (trained|purchased)$/, '').toLowerCase()}</li>; })}</ul>;
}
