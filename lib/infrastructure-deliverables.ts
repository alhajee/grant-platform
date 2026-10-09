// UBEC "Deliverables for proposed UBEC model school typologies" (Deliverables workbook, October 2026):
// sheet "Minimum Standard Requirements" (24 deliverables, standards per Model I/II/III) and
// sheet "Other Requirements", shown as "Other Facilities" (30 optional deliverables with no standard quantity).
// New Construction is sized by the model; Whole School by enrolment (lib/infrastructure-model.ts, wholeRequirements).
// Keys are unchanged from the earlier catalogue, so packages saved before still load and recalculate.

export type DeliverableCategory = 'minimum' | 'other';
export type Requirement = {
  key: string; label: string; qty: number[]; unit: string; civil?: boolean; lump?: boolean; block?: number;
  category: DeliverableCategory; group: number; sn: number;
  /** Standard as worded in the workbook, per model (Model I/II/III); omitted = the quantity and unit. */
  standard?: [string, string, string];
  /** ✓ in the workbook: one is required at every model. */
  tick?: boolean;
  remark?: string;
  /** Specification shown in the New Construction Description column (workbook remark or wording). */
  description?: string;
};

const minimum = (r: Omit<Requirement, 'category'>): Requirement => ({ ...r, category: 'minimum' });
const other = (sn: number, group: number, key: string, label: string, unit: string, extra: Partial<Requirement> = {}): Requirement =>
  ({ key, label, qty: [0, 0, 0], unit, category: 'other', group, sn, ...extra });

/** Hybrid solar power system rating per model (Minimum Standard 23). */
export const solarKva = [7.5, 7.5, 10];

/** The perimeter fence (Minimum Standard 6) has no fixed quantity: the audit records the metres the site needs. */
export const fenceDeliverable = { key: 'fence', label: 'Perimeter Wall Fence with Concertina Security Wire', unit: 'metres', civil: true, category: 'minimum' as const, group: 0, sn: 6, tick: true,
  remark: 'Required for every school. Enter the length of fence the site needs, in metres.',
  description: 'Perimeter wall fence with concertina security wire; enter the length the site needs, in metres.' };

export const requirements: Requirement[] = [
  // Primary/JSS classrooms (the workbook's non-ECCDE classrooms). Whole School labels the row by the school's learners (Classroom · Primary / JSS).
  minimum({ sn: 1, group: 0, key: 'classroomPri', label: 'Classroom', qty: [6, 9, 12], unit: 'classrooms', civil: true,
    standard: ['6 classrooms', '9 classrooms', '12 classrooms'],
    remark: 'Primary and JSS classrooms hold 40 learners each; ECCDE classrooms hold 30.' }),
  minimum({ sn: 1, group: 0, key: 'classroomEccde', label: 'Classroom · ECCDE', qty: [1, 2, 2], unit: 'classrooms', civil: true, block: 2,
    standard: ['1 ECCDE classroom', '2 ECCDE classrooms', '2 ECCDE classrooms'],
    remark: 'New ECCDE classrooms are built as one ECCDE block: 2 classrooms, nanny station and sleeping bay.' }),
  minimum({ sn: 2, group: 0, key: 'office', label: 'Office', qty: [1, 2, 2], unit: 'offices', civil: true }),
  minimum({ sn: 3, group: 0, key: 'store', label: 'Store', qty: [1, 2, 2], unit: 'stores', civil: true }),
  minimum({ sn: 4, group: 0, key: 'toilet', label: 'Toilet', qty: [16, 28, 28], unit: 'compartments', lump: true,
    standard: ['6 compartments × 2 blocks (male & female) + 4 ECCDE toilets = 16', '6 compartments × 4 blocks (male & female) + 4 ECCDE toilets = 28', '6 compartments × 4 blocks (male & female) + 4 ECCDE toilets = 28'],
    remark: '4 learners, 1 PwD and 1 teacher per block per gender = 6 toilets; 2 ECCDE classrooms × 2 toilets each = 4 toilets.' }),
  minimum({ sn: 5, group: 0, key: 'staffroom', label: 'Staff Room', qty: [1, 1, 2], unit: 'rooms', remark: 'One staff room for every 9 teachers.' }),
  minimum({ sn: 7, group: 0, key: 'gatehouse', label: 'Gate House', qty: [1, 1, 1], unit: 'units', civil: true, tick: true, description: 'Gate house at the school entrance.' }),
  minimum({ sn: 8, group: 1, key: 'eccdeFurniture', label: 'ECCDE Plastic Furniture (set of 1 table and 5 chairs)', qty: [6, 12, 12], unit: 'sets', remark: '6 sets per ECCDE classroom for 30 kids.' }),
  minimum({ sn: 9, group: 1, key: 'dualDesk', label: 'Dual-Seater Desk (wood + metal frame)', qty: [120, 180, 240], unit: 'sets', remark: '20 sets per class for 40 learners.' }),
  minimum({ sn: 10, group: 1, key: 'magneticBoard', label: 'Magnetic Board', qty: [7, 11, 14], unit: 'sets', remark: '1 set per classroom (including ECCDE).' }),
  // The workbook prints Model III as "= 14 sets"; its parts (12 + 2 + 18) add to 32, which the user confirmed (October 2026).
  minimum({ sn: 11, group: 1, key: 'teachersFurniture', label: 'Teachers’ Furniture', qty: [16, 20, 32], unit: 'sets',
    standard: ['6 (classrooms) + 1 (ECCDE) + 9 (staff room) = 16 sets', '9 (classrooms) + 2 (ECCDE) + 9 (staff room) = 20 sets', '12 (classrooms) + 2 (ECCDE) + 18 (staff rooms) = 32 sets'],
    remark: 'Set of chair + table with drawer (1 per classroom, 9 per staff room).' }),
  minimum({ sn: 12, group: 1, key: 'hmFurniture', label: 'HM/Principal Furniture', qty: [1, 1, 1], unit: 'sets', remark: 'Set of semi-executive table + chair and 2 visitors’ chairs.' }),
  minimum({ sn: 13, group: 1, key: 'storageShelf', label: 'Storage Shelf/Cupboard', qty: [9, 12, 15], unit: 'units', remark: '1 in each classroom and staff room/office.' }),
  minimum({ sn: 14, group: 2, key: 'playEquipment', label: 'Play Equipment', qty: [1, 1, 1], unit: 'sets', description: 'Outdoor play equipment for ECCDE learners.' }),
  minimum({ sn: 15, group: 2, key: 'kgBed', label: 'Kindergarten Bed', qty: [1, 1, 1], unit: 'units', tick: true, description: 'Bed for the ECCDE sleeping bay.' }),
  minimum({ sn: 16, group: 3, key: 'solarBorehole', label: 'Solar Borehole (with overhead tank)', qty: [1, 1, 1], unit: 'systems', tick: true, description: 'Solar-powered borehole with an overhead tank.' }),
  minimum({ sn: 17, group: 3, key: 'handwashing', label: 'Handwashing Station', qty: [1, 1, 1], unit: 'units', tick: true, description: 'Handwashing station with running water.' }),
  minimum({ sn: 18, group: 3, key: 'rwh', label: 'Rainwater Harvesting System', qty: [1, 1, 1], unit: 'systems', tick: true, description: 'Roof rainwater collection and storage.' }),
  minimum({ sn: 19, group: 4, key: 'playground', label: 'Playground', qty: [1, 1, 1], unit: 'units', tick: true, description: 'Prepared outdoor play area.' }),
  minimum({ sn: 20, group: 4, key: 'landscaping', label: 'Soft & Hard Landscaping', qty: [1, 1, 1], unit: 'units', tick: true, description: 'Planting, walkways and paved areas.' }),
  minimum({ sn: 21, group: 4, key: 'football', label: 'Football Pitch (with associated facilities)', qty: [1, 1, 1], unit: 'units', tick: true, remark: 'Sports facility.' }),
  minimum({ sn: 22, group: 4, key: 'volleyball', label: 'Volleyball Court (with associated facilities)', qty: [1, 1, 1], unit: 'units', tick: true, remark: 'Sports facility.' }),
  minimum({ sn: 23, group: 4, key: 'solarPower', label: 'Hybrid Solar Power System', qty: [1, 1, 1], unit: 'systems', standard: ['7.5 KVA', '7.5 KVA', '10 KVA'], description: 'Hybrid solar power system for the school.' }),
  minimum({ sn: 24, group: 4, key: 'solarLight', label: 'All-in-one Standalone Outdoor Solar Light', qty: [20, 20, 20], unit: 'sets', description: 'Standalone outdoor solar lights for the compound.' }),
  other(1, 0, 'workshop', 'Workshop', 'rooms', { civil: true }),
  other(2, 0, 'scienceLab', 'Science Laboratory', 'rooms', { civil: true }),
  other(3, 0, 'roboticsLab', 'Robotic / AI Laboratory', 'rooms', { civil: true }),
  other(4, 0, 'vocationalLab', 'Vocational Laboratory', 'rooms', { civil: true }),
  other(5, 0, 'library', 'Library / e-Library', 'rooms', { civil: true }),
  other(6, 0, 'ictRoom', 'ICT / Computer Room', 'rooms', { civil: true }),
  other(7, 0, 'adminBlock', 'Admin Block', 'blocks', { civil: true }),
  other(8, 0, 'multipurposeHall', 'Multipurpose Hall', 'halls', { civil: true }),
  other(9, 0, 'staffQuarters', 'Staff Quarters', 'units', { civil: true }),
  other(10, 0, 'hostel', 'Hostel Room', 'rooms', { civil: true }),
  other(11, 0, 'clinic', 'Clinic / Sick Bay', 'units', { civil: true }),
  other(12, 1, 'singleSeater', 'Single Seater Plastic Chair and Table with Locker', 'sets'),
  other(13, 1, 'workshopFurniture', 'Workshop Furniture', 'sets'),
  other(14, 1, 'labFurniture', 'Laboratory Furniture', 'sets'),
  other(15, 1, 'libraryFurniture', 'Library Furniture', 'sets'),
  other(16, 2, 'desktop', 'Desktop Computer', 'units'),
  other(17, 2, 'laptop', 'Laptop Computer', 'units'),
  other(18, 2, 'tablet', 'Tablet', 'units'),
  other(19, 2, 'smartBoard', 'Interactive Smart Board', 'units'),
  other(20, 2, 'ictAccessories', 'ICT Accessories', 'sets'),
  other(21, 2, 'networking', 'Networking Equipment', 'sets'),
  other(22, 2, 'workshopEquipment', 'Workshop Equipment', 'sets'),
  other(23, 2, 'labEquipment', 'Laboratory Equipment', 'sets'),
  other(24, 2, 'libraryEquipment', 'Library Equipment', 'sets'),
  other(25, 2, 'sportsEquipment', 'Sports Equipment', 'sets'),
  other(26, 3, 'handpumpBorehole', 'Handpump Borehole', 'units'),
  other(27, 3, 'deepWell', 'Deep Well', 'units'),
  other(28, 3, 'wasteBin', 'Waste Bin', 'units'),
  other(29, 4, 'drainage', 'Drainage & External Works', 'lots', { lump: true }),
  other(30, 4, 'erosionControl', 'Erosion Control Measures', 'lots', { lump: true }),
];

const byKey = new Map<string, Requirement | typeof fenceDeliverable>([...requirements.map(r => [r.key, r] as const), [fenceDeliverable.key, fenceDeliverable]]);
export const deliverableInfo = (key: string) => byKey.get(key.replace(/-(renovate|construct)$/, ''));
/** Minimum Standard rows (the fence included) that every Whole School audit must complete. */
export const minimumKeys = [...requirements.filter(r => r.category === 'minimum').map(r => r.key), fenceDeliverable.key];
export const auditKeys = new Set(byKey.keys());

/** Which deliverable list a school takes: JSS-only schools leave out the ECCDE rows (client feedback, October 2026). */
export type SchoolStream = 'primary' | 'jss';
/** Minimum Standard rows only the Primary/ECCDE list has. */
export const eccdeOnlyKeys: ReadonlySet<string> = new Set(['classroomEccde', 'eccdeFurniture', 'playEquipment', 'kgBed']);
const baseKey = (key: string) => key.replace(/-(renovate|construct)$/, '');
/** Whether a school's list includes a deliverable: Other Facilities and the fence always; ECCDE rows only on the Primary/ECCDE list. */
export const appliesToStream = (key: string, stream: SchoolStream): boolean => !!deliverableInfo(key) && (stream === 'primary' || !eccdeOnlyKeys.has(baseKey(key)));

/** "1 set", "12 sets": units are stored in the plural. */
export const quantityLabel = (n: number, unit: string) => `${n} ${n === 1 ? unit.replace(/s$/, '') : unit}`;
/** The standard as the workbook words it, for one model (New Construction). */
export function standardText(key: string, model: number): string {
  const r = deliverableInfo(key);
  if (!r) return '';
  if ('qty' in r) return r.standard?.[model] ?? (r.tick ? '✓ Required' : quantityLabel(r.qty[model], r.unit));
  return '✓ Required (length in metres)';
}

// New Construction rows that are not audit deliverables. The block-of-3 and storey rows are retired but stay here so
// packages saved before still group and describe their rows.
const constructionRows: Record<string, { group: number; order: number; description: string }> = {
  classBlock6: { group: 0, order: 0.1, description: '6 classrooms with an office and a store in one block.' },
  classBlock9: { group: 0, order: 0.2, description: '9 classrooms with 2 offices and 2 stores.' },
  block3os: { group: 0, order: 0.3, description: '3 classrooms with an office and a store (earlier package).' },
  block3: { group: 0, order: 0.4, description: '3 classrooms (earlier package).' },
  block6os: { group: 0, order: 0.5, description: 'Storey block of 6 classrooms with 2 offices and 2 stores (earlier package).' },
  eccdeBlock: { group: 0, order: 1.5, description: '2 ECCDE classrooms, a nanny station and a sleeping bay.' },
  package: { group: 5, order: 1, description: 'One construction contract covering every item above.' },
};
/** Description column of the New Construction table: the workbook specification of a row. */
export function deliverableDescription(key: string, model = 0): string {
  const base = baseKey(key);
  if (constructionRows[base]) return constructionRows[base].description;
  const r = deliverableInfo(base);
  if (!r) return '';
  if (r.description) return r.description;
  const standard = 'qty' in r && r.standard ? r.standard[model] : '';
  return [standard && !/^\d+ classrooms?$/.test(standard) ? standard : '', r.remark ?? ''].filter(Boolean).join('. ').replace(/\.\./g, '.');
}

// Deliverable groups (sections of both workbook sheets). "Package costs" holds new-construction rows such as VAT.
export const deliverableGroups = ['Infrastructure (Construction/Renovation)', 'Furniture', 'Equipment', 'WASH Facilities', 'Special Projects/Facilities', 'Package costs'] as const;
export const deliverableGroup = (key: string) => deliverableGroups[deliverableInfo(key)?.group ?? constructionRows[baseKey(key)]?.group ?? 5];
export const deliverableCategory = (key: string): DeliverableCategory | undefined => deliverableInfo(key)?.category;
// Within a group: Minimum Standard rows by S/N, then Other Facilities by S/N.
const position = (key: string) => { const r = deliverableInfo(key); return r ? (r.category === 'minimum' ? 0 : 100) + r.sn : constructionRows[baseKey(key)]?.order ?? 999; };
const byDocument = <T extends { key: string }>(a: T, b: T) => position(a.key) - position(b.key);
export function groupDeliverables<T extends { key: string }>(rows: T[]) { return deliverableGroups.map(group => ({ group, rows: rows.filter(row => deliverableGroup(row.key) === group).sort(byDocument) })).filter(g => g.rows.length); }
export const inDeliverableOrder = <T extends { key: string }>(rows: T[]) => groupDeliverables(rows).flatMap(g => g.rows);
