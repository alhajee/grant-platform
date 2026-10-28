import type { ImplementedPillar } from './beap-pillars';
import type { InfrastructurePackage } from './infrastructure-model';
import type { Snapshot } from './plan-review';
import { activityLabel, strategyLabel, type ActivityWorkstream } from './activity-plans';
import { sportsSections } from './sports';
import { formatQuarters } from './format-quarters';
import { nairaFormat } from './money-format';

// The items of one component as the UBEC "Assess items" screen shows them (UBEC138): grouped like the SUBEB editor
// (activity, Sports section or package type), with the figures that matter and every uploaded document as a link.
// rowRef matches the decision row refs (componentItems in lib/ubec-flow.ts) and the workbook row ids.

export type AssessmentDocument = { id: string; name: string; size: number; href: string; label?: string };
/** `package`: an Infrastructure package's requirements table, shown under the item (UBEC174). */
export type AssessmentItem = { rowRef: string; group: string; title: string; subtitle: string; amount: number; facts: { label: string; value: string }[]; documents: AssessmentDocument[]; package?: InfrastructurePackage };
export type AssessmentGroup = { name: string; items: AssessmentItem[] };

const kobo = (unitCost: string | number, quantity: number) => Math.round(Number(unitCost) * 100) * Number(quantity);
const money = (value: number) => nairaFormat.format(value);
const costFacts = (quantity: number, unitCost: string | number) => [{ label: 'Quantity', value: Number(quantity).toLocaleString('en-NG') }, { label: 'Unit cost', value: money(Number(unitCost)) }];
const timeline = (quarters?: number[], start?: string | null, due?: string | null) => quarters?.length ? [{ label: 'Timeline', value: `${formatQuarters(quarters)}${start && due ? ` · ${start} to ${due}` : ''}` }] : [];
const present = (facts: ({ label: string; value: string | undefined | null } | false)[]) => facts.filter((f): f is { label: string; value: string } => !!f && !!f.value);
const documentKinds: Record<string, string> = { boq: 'BOQ', sample: 'Sample of the item', document: '' };

export function assessmentItems(snapshot: Snapshot, pillar: ImplementedPillar): AssessmentItem[] {
  if (pillar === 'infrastructure') return snapshot.infrastructure.map(line => {
    const docs = (snapshot.infrastructureDocuments ?? []).filter(d => d.schoolId != null && d.schoolId === line.school.id);
    return { rowRef: String(line.id), group: line.construction?.name || 'Infrastructure', title: line.school.name, subtitle: `${line.school.lga} · ${line.school.level}`,
      amount: kobo(line.unit_cost, line.quantity) / 100,
      facts: present([{ label: 'Strategy', value: line.strategy }, { label: 'Duration', value: line.package?.input?.duration ?? '' }, ...timeline(line.quarters, line.start_date, line.due_date)]),
      package: line.package,
      documents: docs.map(d => ({ id: d.id, name: d.name, size: d.size, href: `/api/infrastructure/documents?id=${d.id}`, label: d.kind.toUpperCase() === 'BOQ' ? 'BOQ' : d.kind.replace(/_/g, ' ') })) };
  });
  if (pillar === 'sports') return snapshot.sports.map(line => ({
    rowRef: String(line.id), group: sportsSections.find(s => s.id === line.section)?.label ?? line.section, title: line.description || line.activity_type, subtitle: line.activity_type,
    amount: kobo(line.unit_cost, line.quantity) / 100,
    facts: present([...costFacts(line.quantity, line.unit_cost), { label: 'Schools', value: line.allocations.length ? `${line.allocations.length} (${line.allocations.reduce((s, a) => s + Number(a.quantity), 0)} allocated)` : '' }, ...timeline(line.quarters, line.start_date, line.due_date)]),
    documents: [],
  }));
  return (snapshot[pillar] ?? []).map(line => ({
    rowRef: String(line.id), group: activityLabel(pillar as ActivityWorkstream, line.activity, line.custom_activity ?? ''),
    title: line.description || line.item || line.custom_activity || `Item ${line.id}`, subtitle: line.code ?? '',
    amount: kobo(line.unit_cost, line.quantity) / 100,
    facts: present([...costFacts(line.quantity, line.unit_cost),
      { label: 'Strategy', value: line.strategy ? strategyLabel(line.strategy) : '' }, { label: 'Target group', value: line.target_group },
      { label: 'Item', value: line.item }, { label: 'Classes', value: line.textbook_classes?.join(', ') }, { label: 'Equipment', value: line.equipment_type },
      { label: 'Census', value: line.census_type }, { label: 'Training provider', value: line.training_provider }, { label: 'Participants', value: line.target_participants },
      { label: 'School levels', value: line.school_levels?.join(', ') }, { label: 'Training days', value: line.training_days ? String(line.training_days) : '' },
      { label: 'Beneficiaries', value: line.beneficiary === 'subeb' ? 'SUBEB' : line.beneficiary === 'lga' ? 'LGA' : '' },
      { label: 'Schools', value: line.schools?.length ? line.schools.map(s => s.quantity ? `${s.name} (${s.quantity.toLocaleString('en-NG')})` : s.name).join(', ') : '' }, ...timeline(line.quarters, (line as { start_date?: string | null }).start_date, (line as { due_date?: string | null }).due_date)]),
    documents: (line.documents ?? []).map(d => ({ id: d.id, name: d.name, size: d.size, href: `/api/activities/line-documents?id=${d.id}`, label: documentKinds[d.kind ?? 'document'] || undefined })),
  }));
}

/** Groups in the order they first appear (the SUBEB editors' order). */
export function groupItems(items: readonly AssessmentItem[]): AssessmentGroup[] {
  const groups: AssessmentGroup[] = [];
  for (const item of items) {
    const group = groups.find(g => g.name === item.group);
    if (group) group.items.push(item); else groups.push({ name: item.group, items: [item] });
  }
  return groups;
}

/** Component-wide documents (Supervision & Monitoring proforma invoices) the officer may also need. */
export const componentDocuments = (snapshot: Snapshot, pillar: ImplementedPillar): AssessmentDocument[] =>
  (snapshot.componentDocuments ?? []).filter(d => d.component === pillar).map(d => ({ id: d.id, name: d.name, size: d.size, href: `/api/activities/documents?id=${d.id}` }));
