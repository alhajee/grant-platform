import { Building2, Trophy, Users, BookOpen, School, ClipboardCheck, Leaf, GraduationCap, BadgeCheck, Laptop, Presentation, ChartColumn } from 'lucide-react';
import { LineExtrasDetail } from './line-extras-detail';
import type { Snapshot } from '@/lib/plan-review';
import { activityLabel, activityTitles, allocateByEnrolment, curriculumActivityShares, distributionNames, distributionSnapshotKeys, type DistributionWorkstream } from '@/lib/activity-plans';
import { kindNames } from '@/lib/infrastructure-model';
import { sportsSections } from '@/lib/sports';
import { InfrastructurePackageDetails } from '@/components/infrastructure-package-details';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import type { CellValue, WorkbookColumn, WorkbookRow, WorkbookSheet } from './types';

export type SheetLinks = { infrastructureEditHref?: string; sportsEditHref?: string; sbmcEditHref?: string; tlmEditHref?: string; monitoringEditHref?: string; gscciEditHref?: string; curriculumEditHref?: string; qualityEditHref?: string; ictEditHref?: string; teachersEditHref?: string; planningEditHref?: string };
const cost = (line: { unit_cost: string; quantity: number }) => Math.round(Number(line.unit_cost) * 100) * line.quantity / 100;
const sectionNames: Record<string, string> = Object.fromEntries(sportsSections.map(section => [section.id, section.shortLabel]));
const text = (id: string, header: string, size = 150, filter = false): WorkbookColumn => ({ id, header, kind: 'text', size, filter });
const qty = (id = 'quantity', header = 'Qty.', total = false): WorkbookColumn => ({ id, header, kind: 'number', size: header === 'Qty.' ? 80 : 104, total });
const amount = (id: string, header: string, total = false): WorkbookColumn => ({ id, header, kind: 'money', size: 156, total });
function row(id: string, values: Record<string, CellValue>, expandable = false): WorkbookRow {
  return { id, values, expandable, search: Object.values(values).join(' ').toLowerCase() };
}

function infrastructureSheet(snapshot: Snapshot, editHref?: string): WorkbookSheet {
  const byId = new Map(snapshot.infrastructure.map(line => [String(line.id), line]));
  return {
    key: 'infrastructure', label: 'Infrastructure', hash: 'review-infrastructure', icon: Building2, itemLabel: 'project lines', empty: 'No infrastructure projects.', editHref, editLabel: 'Infrastructure',
    columns: [text('school', 'School', 250), text('lga', 'LGA', 112, true), text('level', 'Level', 90, true), text('location', 'Location', 100, true), text('type', 'Project type', 200, true), text('code', 'Code', 96), qty(), amount('unitCost', 'Unit cost'), amount('amount', 'Amount', true), text('scope', 'Components', 140), qty('learners', 'Learners'), text('strategy', 'Strategy', 120, true), text('duration', 'Duration', 120)],
    rows: snapshot.infrastructure.map(line => row(String(line.id), {
      school: line.school.name, lga: line.school.lga, level: line.school.level, location: line.school.location,
      type: line.package ? kindNames[line.package.kind] : line.construction.name, code: line.code,
      scope: line.package ? line.package.input.components.join(', ') : '', learners: line.package?.result.enrolment ?? '',
      strategy: line.strategy || '', duration: line.package ? line.package.input.duration || (line.package.kind === 'whole' ? 'Per intervention' : '') : `${line.duration} weeks`,
      quantity: line.quantity, unitCost: Number(line.unit_cost), amount: cost(line),
    }, true)),
    detail: id => {
      const line = byId.get(id); if (!line) return null;
      return line.package ? <InfrastructurePackageDetails record={line.package} /> : <><h3>Project</h3><p className="review-comment">{line.construction.name}</p><dl className="review-facts"><div><dt>Implementation strategy</dt><dd>{line.strategy || '—'}</dd></div><div><dt>Latitude</dt><dd>{line.latitude || '—'}</dd></div><div><dt>Longitude</dt><dd>{line.longitude || '—'}</dd></div></dl><h3>Rationale</h3><p className="review-comment">{line.rationale || 'No rationale provided.'}</p></>;
    },
  };
}

function sportsSheet(snapshot: Snapshot, editHref?: string): WorkbookSheet {
  const byId = new Map(snapshot.sports.map(line => [String(line.id), line]));
  return {
    key: 'sports', label: 'Sports', hash: 'review-sports', icon: Trophy, itemLabel: 'budget items', empty: 'No sports budget items.', editHref, editLabel: 'Sports activities',
    columns: [text('item', 'Budget item', 270), text('code', 'Code', 180), text('section', 'Section', 124, true), text('activity', 'Sport / sub-activity', 170, true), qty(), amount('unitCost', 'Unit cost'), amount('amount', 'Amount', true), qty('schools', 'Schools', true), qty('allocated', 'Allocated qty.')],
    rows: snapshot.sports.map(line => row(String(line.id), {
      item: line.description, code: line.code, section: sectionNames[line.section] || line.section, activity: line.activity_type || '',
      schools: line.section === 'equipment' ? line.allocations.length : '', allocated: line.section === 'equipment' ? line.allocations.reduce((sum, a) => sum + a.quantity, 0) : '',
      quantity: line.quantity, unitCost: Number(line.unit_cost), amount: cost(line),
    }, line.section === 'equipment')),
    detail: id => {
      const line = byId.get(id); if (!line) return null;
      return <><div className="review-allocation-heading"><h3>School allocations</h3><span>{line.allocations.reduce((sum, a) => sum + a.quantity, 0).toLocaleString()} of {line.quantity.toLocaleString()} items allocated</span></div>
        <Table aria-label={`School allocations for ${line.description}`}><TableHeader><TableRow><TableHead>School</TableHead><TableHead>LGA</TableHead><TableHead>Level</TableHead><TableHead>Location</TableHead><TableHead>Latitude</TableHead><TableHead>Longitude</TableHead><TableHead className="text-right">Qty.</TableHead></TableRow></TableHeader><TableBody>
          {!line.allocations.length && <TableRow><TableCell colSpan={7}>No school allocations.</TableCell></TableRow>}
          {line.allocations.map(a => <TableRow key={a.id}><TableCell className="whitespace-normal">{a.school.name}</TableCell><TableCell>{a.school.lga}</TableCell><TableCell>{a.school.level}</TableCell><TableCell>{a.school.location}</TableCell><TableCell>{a.latitude || '—'}</TableCell><TableCell>{a.longitude || '—'}</TableCell><TableCell className="text-right tabular-nums">{a.quantity.toLocaleString()}</TableCell></TableRow>)}
        </TableBody></Table></>;
    },
  };
}

type ActivitySheetKey = 'sbmc' | 'tlm' | 'monitoring' | 'gscci' | 'curriculum' | 'quality' | 'ict' | 'planning';
const activityIcons = { sbmc: Users, tlm: BookOpen, monitoring: ClipboardCheck, gscci: Leaf, curriculum: GraduationCap, quality: BadgeCheck, ict: Laptop, planning: ChartColumn };
function activityExtras(key: ActivitySheetKey): WorkbookColumn[] {
  if (key === 'tlm') return [text('material', 'Material type', 170, true), text('subject', 'Subject', 190, true), text('classes', 'Classes', 170)];
  if (key === 'sbmc') return [text('rationale', 'Rationale', 260), text('approach', 'Implementation approach', 260)];
  if (key === 'quality') return [text('equipment', 'Equipment type', 200, true)];
  if (key === 'ict') return [text('details', 'Details', 200), qty('schools', 'Schools', true), qty('documents', 'Documents')];
  return key === 'curriculum' ? [text('share', 'Activity share', 120, true)] : [];
}
function activityExtraValues(key: ActivitySheetKey, line: NonNullable<Snapshot['sbmc']>[number]): Record<string, CellValue> {
  if (key === 'tlm') return { material: line.equipment || '', subject: line.textbook_subject || '', classes: line.textbook_classes?.join(', ') ?? '' };
  if (key === 'sbmc') return { rationale: line.rationale || '', approach: line.implementation_approach || '' };
  if (key === 'quality') return { equipment: line.equipment_type || '' };
  if (key === 'ict') return { details: line.subscription_types?.length ? line.subscription_types.join(', ') : line.website_type || '', schools: line.schools?.length || '', documents: line.documents?.length || '' };
  // Others (specify) has no share of its own; it only counts toward the Curriculum allocation.
  const share = (curriculumActivityShares as readonly number[])[line.activity];
  return key === 'curriculum' ? { share: share === undefined ? '' : `${share / 100}%` } : {};
}
function activitySheet(key: ActivitySheetKey, lines: NonNullable<Snapshot['sbmc']>, editHref?: string): WorkbookSheet {
  // Quality Assurance and ICT rows expand to their extra details, chosen schools and documents.
  const detailed = key === 'quality' || key === 'ict', byId = new Map(lines.map(line => [String(line.id), line]));
  const expandable = (line: NonNullable<Snapshot['sbmc']>[number]) => detailed && Boolean(line.equipment_type || line.subscription_types?.length || line.website_type || line.schools?.length || line.documents?.length || (key === 'ict' && [0, 3, 4].includes(line.activity)));
  return {
    key, label: activityTitles[key], hash: `review-${key}`, icon: activityIcons[key], itemLabel: 'activity lines', empty: 'No saved items.', editHref, editLabel: activityTitles[key],
    columns: [text('activity', 'Allowable activity', 240, true), text('description', 'Description', 280), ...activityExtras(key), text('strategy', 'Strategy', 170, true), text('target', 'Target group', 170, true), qty(), amount('unitCost', 'Unit cost'), amount('amount', 'Amount', true)],
    rows: lines.map(line => row(String(line.id), {
      activity: activityLabel(key, line.activity, line.custom_activity), description: line.description,
      ...activityExtraValues(key, line),
      strategy: line.strategy, target: line.target_group, quantity: line.quantity, unitCost: Number(line.unit_cost), amount: cost(line),
    }, expandable(line))),
    ...(detailed ? { detail: (id: string) => { const line = byId.get(id); return line ? <LineExtrasDetail workstream={key} line={line} /> : null; } } : {}),
  };
}

/** Teacher Development (migration 040): training details instead of description, strategy and target group; rows expand to the description and supporting documents. */
function teacherSheet(lines: NonNullable<Snapshot['teachers']>, editHref?: string): WorkbookSheet {
  const byId = new Map(lines.map(line => [String(line.id), line]));
  return {
    key: 'teachers', label: activityTitles.teachers, hash: 'review-teachers', icon: Presentation, itemLabel: 'activity lines', empty: 'No saved items.', editHref, editLabel: activityTitles.teachers,
    columns: [text('activity', 'Allowable activity', 260, true), text('provider', 'Training provider', 240, true), text('participants', 'Target participants', 170, true), text('levels', 'School level', 150, true), qty('days', 'Training days'), text('venue', 'Venue', 110, true), qty(), amount('unitCost', 'Unit cost'), amount('amount', 'Amount', true)],
    rows: lines.map(line => row(String(line.id), {
      activity: activityLabel('teachers', line.activity, line.custom_activity), provider: line.training_provider ?? '', participants: line.target_participants ?? '',
      levels: line.school_levels?.join(', ') ?? '', days: line.training_days ?? '', venue: line.venue_type ?? '', quantity: line.quantity, unitCost: Number(line.unit_cost), amount: cost(line),
    }, true)),
    detail: (id: string) => { const line = byId.get(id); return line ? <LineExtrasDetail workstream="teachers" line={line} /> : null; },
  };
}

/** Allocation = the component budget (TLM, GSCCI or Curriculum) shared across the listed schools by enrolment (snapshots before enrolment was recorded show blanks). */
function distributionSheet(component: DistributionWorkstream, schools: NonNullable<Snapshot['tlmDistribution']>, lines: NonNullable<Snapshot['tlm']>, editHref?: string): WorkbookSheet {
  const shares = allocateByEnrolment(Math.round(lines.reduce((sum, line) => sum + cost(line), 0) * 100), schools);
  const name = distributionNames[component];
  return {
    key: component === 'tlm' ? 'distribution' : distributionSnapshotKeys[component], label: `${name} distribution`, hash: `review-${component}-distribution`, icon: School, itemLabel: 'schools', empty: 'No distribution schools.', editHref, editLabel: `${name} distribution list`,
    columns: [text('school', 'School', 320), text('lga', 'LGA', 140, true), text('level', 'Level', 110, true), text('location', 'Location', 110, true), qty('learners', 'Learners', true), amount('allocation', 'Allocation', true)],
    rows: schools.map(s => row(String(s.id), { school: s.name, lga: s.lga, level: s.level, location: s.location, learners: s.enrolment ?? '', allocation: shares.has(s.id) ? shares.get(s.id)! / 100 : '' })),
  };
}

/** Builds one sheet per visible component; the TLM, GSCCI and Curriculum distribution lists are their own sheets after the component. */
export function buildSheets(snapshot: Snapshot, visiblePillars: readonly string[], links: SheetLinks): WorkbookSheet[] {
  const sheets: WorkbookSheet[] = [];
  if (visiblePillars.includes('infrastructure')) sheets.push(infrastructureSheet(snapshot, links.infrastructureEditHref));
  if (visiblePillars.includes('sports')) sheets.push(sportsSheet(snapshot, links.sportsEditHref));
  if (visiblePillars.includes('sbmc') && snapshot.sbmc) sheets.push(activitySheet('sbmc', snapshot.sbmc, links.sbmcEditHref));
  if (visiblePillars.includes('tlm') && snapshot.tlm) sheets.push(activitySheet('tlm', snapshot.tlm, links.tlmEditHref), distributionSheet('tlm', snapshot.tlmDistribution ?? [], snapshot.tlm, links.tlmEditHref));
  if (visiblePillars.includes('monitoring') && snapshot.monitoring) sheets.push(activitySheet('monitoring', snapshot.monitoring, links.monitoringEditHref));
  if (visiblePillars.includes('gscci') && snapshot.gscci) sheets.push(activitySheet('gscci', snapshot.gscci, links.gscciEditHref), distributionSheet('gscci', snapshot.gscciDistribution ?? [], snapshot.gscci, links.gscciEditHref));
  if (visiblePillars.includes('quality') && snapshot.quality) sheets.push(activitySheet('quality', snapshot.quality, links.qualityEditHref));
  if (visiblePillars.includes('teachers') && snapshot.teachers) sheets.push(teacherSheet(snapshot.teachers, links.teachersEditHref));
  if (visiblePillars.includes('ict') && snapshot.ict) sheets.push(activitySheet('ict', snapshot.ict, links.ictEditHref));
  if (visiblePillars.includes('curriculum') && snapshot.curriculum) sheets.push(activitySheet('curriculum', snapshot.curriculum, links.curriculumEditHref), distributionSheet('curriculum', snapshot.curriculumDistribution ?? [], snapshot.curriculum, links.curriculumEditHref));
  if (visiblePillars.includes('planning') && snapshot.planning) sheets.push(activitySheet('planning', snapshot.planning, links.planningEditHref));
  return sheets;
}

/** Extra sheets for the all-sheets download: the row details that the grid shows on expand. */
export function detailExportSheets(snapshot: Snapshot, sheets: WorkbookSheet[]): { name: string; columns: WorkbookColumn[]; rows: WorkbookRow[]; totals?: boolean }[] {
  const out = [];
  if (sheets.some(s => s.key === 'infrastructure')) out.push({ name: 'Infrastructure items', columns: [text('school', 'School', 260), text('type', 'Project type', 200), text('item', 'Requirement', 320), text('operation', 'Operation', 140), qty('quantity', 'Quantity'), text('unit', 'Unit', 100), amount('cost', 'Unit cost'), text('strategy', 'Strategy', 140), text('duration', 'Duration', 120), amount('amount', 'Amount', true)],
    rows: snapshot.infrastructure.flatMap(line => (line.package?.result.items ?? []).map(item => row(`${line.id}-${item.key}`, { school: line.school.name, type: kindNames[line.package!.kind], item: item.label, operation: item.operation ?? '', quantity: item.quantity, unit: item.unit, cost: item.lump ? '' : item.cost, strategy: item.strategy, duration: item.duration, amount: item.total }))) });
  if (sheets.some(s => s.key === 'sports')) out.push({ name: 'Sports allocations', columns: [text('item', 'Budget item', 260), text('code', 'Code', 120), text('school', 'School', 280), text('lga', 'LGA', 120), text('level', 'Level', 96), text('location', 'Location', 104), text('latitude', 'Latitude', 100), text('longitude', 'Longitude', 100), qty('quantity', 'Qty.', true)],
    rows: snapshot.sports.flatMap(line => line.allocations.map(a => row(`${line.id}-${a.id}`, { item: line.description, code: line.code, school: a.school.name, lga: a.school.lga, level: a.school.level, location: a.school.location, latitude: a.latitude, longitude: a.longitude, quantity: a.quantity }))) });
  return out;
}
