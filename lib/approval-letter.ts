// UBEC268 (client, 18 November 2026, with sample letters): once the UBEC BEAP Chair approves a plan, the SUBEB downloads
// UBEC's approval letter. This module works out what the letter says from the approved round; lib/approval-letter-pdf.ts
// draws it on the Executive Secretary's letterhead.
//
// The fund is applied as in the samples: each component's funding-policy share (Infrastructure 75%, Quality Assurance 5%,
// ICT & TPD 5%, ...), and under Infrastructure the approved spending split into Construction, Renovation, Furniture &
// Equipment, WASH and TLMs, as percentages of the plan that add up to the Infrastructure share (the 2026 Delta draft:
// 0 + 58.20 + 5.06 + 3.74 + 8.00 = 75).
import type { Snapshot } from './plan-review';
import { policyAllocation, type EnvelopePlan } from './funding-policy.ts';
import { lineMinor, minorOfNumber } from './money.ts';
import { stateCapital } from './state-capitals.ts';
import { stateDisplayName } from './state-names.ts';

const ZERO = BigInt(0), ONE = BigInt(1);

export const infrastructureParts = ['construction', 'renovation', 'furniture', 'wash', 'tlm'] as const;
export type InfrastructurePart = typeof infrastructureParts[number];
export const infrastructurePartLabels: Record<InfrastructurePart, string> = {
  construction: 'Construction', renovation: 'Renovation', furniture: 'Furniture & Equipment', wash: 'WASH', tlm: 'TLMs',
};

const furnitureKeys = new Set(['dualDesk', 'eccdeFurniture', 'teachersFurniture', 'hmFurniture', 'storageShelf', 'kgBed', 'singleSeater', 'workshopFurniture', 'labFurniture', 'libraryFurniture',
  'magneticBoard', 'desktop', 'laptop', 'tablet', 'smartBoard', 'ictAccessories', 'networking', 'workshopEquipment', 'labEquipment', 'libraryEquipment', 'playEquipment']);
const washKeys = new Set(['toilet', 'solarBorehole', 'handwashing', 'rwh', 'handpumpBorehole', 'deepWell']);

type PackageItem = { key: string; total?: number; operation?: string; block?: { kind?: string } | null };

/** Which part of Infrastructure one package item belongs to. */
export function itemPart(item: PackageItem, packageKind: string | undefined): Exclude<InfrastructurePart, 'tlm'> {
  if (packageKind === 'furniture') return 'furniture';
  const key = item.key.replace(/-(renovate|construct)$/, '');
  if (washKeys.has(key)) return 'wash';
  if (furnitureKeys.has(key) || key.startsWith('furniture-')) return 'furniture';
  if (item.block) return item.block.kind === 'renovate' ? 'renovation' : 'construction';
  if (item.key.endsWith('-renovate') || item.operation === 'Renovation') return 'renovation';
  return 'construction';
}

/**
 * Approved Infrastructure and TLM spending by part, in minor units. A package's amount (VAT included) is shared across
 * its parts by its items' totals; a lump-sum New Construction package, or one with no costed items, is all Construction.
 */
export function infrastructureSpending(snapshot: Pick<Snapshot, 'infrastructure' | 'tlm'>): Record<InfrastructurePart, bigint> {
  const parts: Record<InfrastructurePart, bigint> = { construction: ZERO, renovation: ZERO, furniture: ZERO, wash: ZERO, tlm: ZERO };
  for (const line of snapshot.infrastructure ?? []) {
    const amount = lineMinor(line.unit_cost, line.quantity);
    const kind = line.package?.kind;
    const items = ((line.package?.result?.items ?? []) as PackageItem[]).filter(item => item.key !== 'package' && (Number(item.total) || 0) > 0);
    if (!items.length) { parts[kind === 'furniture' ? 'furniture' : 'construction'] += amount; continue; }
    const weights = items.map(item => ({ part: itemPart(item, kind), weight: BigInt(minorOfNumber(Number(item.total))) }));
    const whole = weights.reduce((sum, w) => sum + w.weight, ZERO);
    let given = ZERO;
    weights.forEach((w, i) => { const share = i === weights.length - 1 ? amount - given : amount * w.weight / whole; parts[w.part] += share; given += share; });
  }
  parts.tlm = (snapshot.tlm ?? []).reduce((sum, line) => sum + lineMinor(line.unit_cost, line.quantity), ZERO);
  return parts;
}

/** The parts as percentages of the plan (two decimals), adding up to the Infrastructure share; null without spending. */
export function infrastructurePercents(spending: Record<InfrastructurePart, bigint>, infrastructureBasisPoints: number): Record<InfrastructurePart, number> | null {
  const whole = infrastructureParts.reduce((sum, part) => sum + spending[part], ZERO);
  if (whole <= ZERO) return null;
  // Hundredths of a percent, largest remainders last so the parts add up to the share exactly.
  const target = BigInt(infrastructureBasisPoints);
  const raw = infrastructureParts.map(part => ({ part, exact: spending[part] * target, floor: spending[part] * target / whole }));
  let left = target - raw.reduce((sum, r) => sum + r.floor, ZERO);
  const order = [...raw].sort((a, b) => Number((b.exact % whole) - (a.exact % whole)));
  const result = Object.fromEntries(raw.map(r => [r.part, r.floor])) as Record<InfrastructurePart, bigint>;
  for (const r of order) { if (left <= ZERO) break; result[r.part] += ONE; left -= ONE; }
  return Object.fromEntries(infrastructureParts.map(part => [part, Number(result[part]) / 100])) as Record<InfrastructurePart, number>;
}

/** The components the letter lists, in the samples' order, with the policy share each takes. */
const componentRows: { label: string; share: keyof ReturnType<typeof policyAllocation>['shares'] }[] = [
  { label: 'Infrastructure', share: 'infrastructure' }, { label: 'Quality Assurance', share: 'quality' }, { label: 'ICT & TPD', share: 'teachers' },
  { label: 'SBMC', share: 'sbmc' }, { label: 'Sport Activities', share: 'sports' }, { label: 'Supervision & Monitoring', share: 'monitoring' },
  { label: 'Curriculum Purchases & Distribution', share: 'curriculum' }, { label: 'Planning, EMIS & Data Collection', share: 'planning' },
  { label: 'Greening Schools & Climate Change', share: 'gscci' },
];

export type LetterRow = { label: string; percent: number; parts?: { label: string; percent: number }[] };
export type ApprovalLetter = {
  reference: string; date: Date; addressee: string[]; title: string; intro: string; rows: LetterRow[]; closing: string[];
};

const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;
/** "1st – 4th Quarter 2026" from the plan's quarters (a plan without quarters covers the year). */
export function quarterPhrase(year: number, quarters: readonly number[] | null | undefined): string {
  const q = [...(quarters?.length ? quarters : [1, 2, 3, 4])].sort();
  const span = q.length === 1 ? ordinal(q[0]) : `${ordinal(q[0])} – ${ordinal(q[q.length - 1])}`;
  return `${span} Quarter${q.length === 1 ? '' : 's'} ${year}`;
}

/** UBEC/DPP/BEAP/<state>/<year>/<serial>, the samples' reference format. */
export const letterReference = (stateCode: string, year: number, serial: number) => `UBEC/DPP/BEAP/${stateCode.toUpperCase()}/${year}/${serial}`;

export function approvalLetter(input: {
  stateCode: string; planYear: number; quarters: readonly number[] | null; snapshot: Snapshot; year: number; serial: number; issuedAt: Date;
}): ApprovalLetter {
  const { stateCode, planYear, quarters, snapshot, year, serial, issuedAt } = input;
  const shares = policyAllocation((snapshot.setup ?? {}) as EnvelopePlan).shares;
  const parts = infrastructurePercents(infrastructureSpending(snapshot), shares.infrastructure);
  const period = quarterPhrase(planYear, quarters);
  const capital = stateCapital(stateCode);
  const fct = stateCode.toUpperCase() === 'FC';
  return {
    reference: letterReference(stateCode, year, serial),
    date: issuedAt,
    addressee: ['The Executive Chairman,', fct ? 'FCT Universal Basic Education Board,' : 'State Universal Basic Education Board,', fct ? 'Abuja.' : `${capital ? `${capital}, ` : ''}${stateDisplayName(stateCode)}.`],
    title: `APPROVAL FOR ${period.toUpperCase()} ACTION PLAN`,
    intro: `The Commission wishes to grant approval for the implementation of the corrected ${period} Basic Education Action Plan. Accordingly, you are to apply the fund as follows:`,
    rows: componentRows.map(row => ({
      label: row.label, percent: shares[row.share] / 100,
      ...(row.share === 'infrastructure' && parts ? { parts: infrastructureParts.map(part => ({ label: infrastructurePartLabels[part], percent: parts[part] })) } : {}),
    })),
    closing: [
      'Your Board is therefore required to adhere to the 2007 Procurement Act during the procurement process and equally ensure adherence to specifications during implementation.',
      'Please, accept the assurances of the Executive Secretary’s best regards.',
    ],
  };
}

/** "24th August 2026" in Africa/Lagos. */
export function letterDate(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Lagos', day: 'numeric', month: 'long', year: 'numeric' }).formatToParts(date);
  const get = (type: string) => parts.find(p => p.type === type)?.value ?? '';
  return `${ordinal(Number(get('day')))} ${get('month')} ${get('year')}`;
}
