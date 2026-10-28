// UBEC114: what a plan's Infrastructure packages deliver, counted into the eight headings UBEC asked for. Counts come
// from each package's saved result items (New Construction, Whole School and Furniture/Equipment alike); a Whole School
// row's -renovate/-construct suffix is ignored, so renovated and new units both count.

export const deliverableHeadings = ['classrooms', 'toilets', 'furniture', 'equipment', 'water', 'fencing', 'eccde', 'admin'] as const;
export type DeliverableHeading = typeof deliverableHeadings[number];
export const deliverableHeadingLabels: Record<DeliverableHeading, string> = {
  classrooms: 'Classrooms', toilets: 'Toilet Compartments', furniture: 'Furniture Units', equipment: 'ICT & Teaching Equip',
  water: 'Water Systems', fencing: 'Fencing Projects', eccde: 'ECCDE Rooms', admin: 'Admin Blocks',
};

type ResultItem = { key: string; quantity: number; unit?: string };
export type DeliverablePackage = { kind?: string; result?: { items?: readonly ResultItem[] } | null };
export type DeliverableCounts = Record<DeliverableHeading, number> & { fenceMetres: number };

// Classrooms a New Construction block holds (current and earlier blocks).
const blockClassrooms: Record<string, number> = { classBlock6: 6, classBlock9: 9, block3os: 3, block3: 3, block6os: 6 };
const furnitureKeys = new Set(['dualDesk', 'eccdeFurniture', 'teachersFurniture', 'hmFurniture', 'storageShelf', 'kgBed', 'singleSeater', 'workshopFurniture', 'labFurniture', 'libraryFurniture']);
const equipmentKeys = new Set(['magneticBoard', 'desktop', 'laptop', 'tablet', 'smartBoard', 'ictAccessories', 'networking', 'workshopEquipment', 'labEquipment', 'libraryEquipment']);
const waterKeys = new Set(['solarBorehole', 'handwashing', 'rwh', 'handpumpBorehole', 'deepWell']);

const baseKey = (key: string) => key.replace(/-(renovate|construct)$/, '');
const quantity = (item: ResultItem) => Number.isFinite(Number(item.quantity)) && Number(item.quantity) > 0 ? Number(item.quantity) : 0;

/** Where one result item counts, and how many it adds (ECCDE blocks hold two classrooms). */
function classify(item: ResultItem, kind: string | undefined): [DeliverableHeading, number] | null {
  const key = baseKey(item.key), n = quantity(item);
  if (blockClassrooms[key]) return ['classrooms', n * blockClassrooms[key]];
  if (key === 'classroomPri') return ['classrooms', n];
  if (key === 'eccdeBlock') return ['eccde', n * 2];
  if (key === 'eccdeBlock1') return ['eccde', n];
  // Whole School costs new ECCDE classrooms as blocks of two (unit "block"); renovations stay in classrooms.
  if (key === 'classroomEccde') return ['eccde', item.unit === 'block' ? n * 2 : n];
  if (key === 'toilet') return ['toilets', n];
  if (key === 'adminBlock') return ['admin', n];
  if (furnitureKeys.has(key)) return ['furniture', n];
  if (equipmentKeys.has(key)) return ['equipment', n];
  if (waterKeys.has(key)) return ['water', n];
  // Furniture/Equipment packages list their own items by name: they count as furniture units.
  if (kind === 'furniture' && key.startsWith('furniture-')) return ['furniture', n];
  return null;
}

export function countDeliverables(packages: readonly (DeliverablePackage | null | undefined)[]): DeliverableCounts {
  const counts: DeliverableCounts = { classrooms: 0, toilets: 0, furniture: 0, equipment: 0, water: 0, fencing: 0, eccde: 0, admin: 0, fenceMetres: 0 };
  for (const pkg of packages) {
    const items = pkg?.result?.items ?? [];
    const fence = items.filter(item => baseKey(item.key) === 'fence').reduce((sum, item) => sum + quantity(item), 0);
    if (fence > 0) { counts.fencing += 1; counts.fenceMetres += fence; }
    for (const item of items) {
      const hit = classify(item, pkg?.kind);
      if (hit) counts[hit[0]] += hit[1];
    }
  }
  return counts;
}

/**
 * UBEC152/154/197: a plan's headline deliverables for the UBEC dashboards (client, 28 October 2026; defaults agreed:
 * teachers = Teacher Development participants, curriculum = quantities under Curriculum Procurement, TLM = quantities
 * of all TLM items). Schools and classrooms come from the plan's school counts and Infrastructure packages.
 */
export type PlanDeliverables = { schools: number; classrooms: number; teachers: number; curriculum: number; tlm: number; toilets: number; furniture: number; water: number };
export const planDeliverableLabels: Record<keyof PlanDeliverables, string> = {
  schools: 'Schools intervened', classrooms: 'Classrooms', teachers: 'Teachers trained', curriculum: 'Curriculum purchased', tlm: 'TLM purchased',
  toilets: 'Toilet compartments', furniture: 'Furniture units', water: 'Water systems',
};
type QuantityLine = { activity: number; quantity: number };
export function planDeliverables(input: { schools: number; packages: readonly (DeliverablePackage | null | undefined)[]; teachers?: readonly { quantity: number }[]; curriculum?: readonly QuantityLine[]; tlm?: readonly { quantity: number }[] }): PlanDeliverables {
  const infra = countDeliverables(input.packages);
  const sum = (lines: readonly { quantity: number }[] = []) => lines.reduce((total, line) => total + (Number(line.quantity) || 0), 0);
  return { schools: input.schools, classrooms: infra.classrooms + infra.eccde, teachers: sum(input.teachers), curriculum: sum((input.curriculum ?? []).filter(line => line.activity === 0)), tlm: sum(input.tlm), toilets: infra.toilets, furniture: infra.furniture, water: infra.water };
}
export const sumPlanDeliverables = (all: readonly (PlanDeliverables | undefined)[]): PlanDeliverables =>
  all.reduce<PlanDeliverables>((total, d) => d ? Object.fromEntries(Object.keys(total).map(k => [k, total[k as keyof PlanDeliverables] + d[k as keyof PlanDeliverables]])) as PlanDeliverables : total,
    { schools: 0, classrooms: 0, teachers: 0, curriculum: 0, tlm: 0, toilets: 0, furniture: 0, water: 0 });
