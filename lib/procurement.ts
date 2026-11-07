// The SUBEB Procurement price list (UBEC130 part 2, migration 074): each state's Procurement department keeps its own
// list; Procurement Data Entry adds or edits items (pending) and the Procurement Director approves them (or adds and
// edits them directly). Component Data Entry picks an approved item on the activities that buy goods: the unit cost
// is the list price. A saved line keeps the price it was saved with.
import type { ActivityWorkstream } from './activity-plans';
import { isPheTraining } from './sports.ts';

/** Activities that buy goods, by component: their items come from the price list (Sports and Greening keep their own item lists). */
export const priceListActivities: Partial<Record<ActivityWorkstream, readonly number[]>> = {
  quality: [0], // Mobility and office equipment
  ict: [0], // Procurement of Digital/STEM Equipment
  monitoring: [0, 1], // Monitoring tools and equipment; monitoring vehicles
  curriculum: [0], // Curriculum Procurement (Acquisition)
  planning: [4], // Working tools and ICT resources for PRS Officers
  sbmc: [15], // Provision of working tools and materials
  tlm: [5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22], // the teaching and learning materials themselves
};
export const isPriceListActivity = (workstream: string, activity: number) => !!priceListActivities[workstream as ActivityWorkstream]?.includes(activity);

/**
 * UBEC244 (bug sheet 18, 7 November 2026: "so others can pick also anything to be procured"): every activity line may be
 * picked from the price list, not only the activities above, except Teacher Development (its lines are trainings).
 * The Super Admin switch and the proforma rule still cover only `priceListActivities`.
 */
export const pricePickWorkstreams = ['sbmc', 'tlm', 'monitoring', 'gscci', 'curriculum', 'quality', 'ict', 'planning'] as const satisfies readonly ActivityWorkstream[];
export const picksFromPriceList = (workstream: string): boolean => (pricePickWorkstreams as readonly string[]).includes(workstream);
/** Sports: the procurement items (the Procurement & Training of PHE Officers section), not the PHE training lines. */
export const sportsPicksFromPriceList = (line: { section: string; activityType: string }): boolean =>
  line.section === 'equipment' && !isPheTraining(line);

export type ProcurementItemStatus = 'pending' | 'approved' | 'archived';
export type ProcurementItem = {
  id: number; name: string; maker: string; modelYear: number | null; description: string; unitPrice: number; status: ProcurementItemStatus;
  createdByName: string; updatedByName: string; approvedByName: string | null; approvedAt: string | null; updatedAt: string;
};
export const procurementItemLabel = (item: Pick<ProcurementItem, 'name' | 'maker' | 'modelYear'>): string => [item.name, item.maker, item.modelYear ? String(item.modelYear) : ''].filter(Boolean).join(' · ');
/** The description a picked item puts on an empty line: "Desktop computer – HP all in one PC, …". */
export const procurementItemDescription = (item: Pick<ProcurementItem, 'name' | 'description'>): string => [item.name, item.description].filter(Boolean).join(' – ');
/** Search text of an item: name, maker, year and description. */
export const procurementItemSearch = (item: Pick<ProcurementItem, 'name' | 'maker' | 'modelYear' | 'description'>): string => [item.name, item.maker, item.modelYear ?? '', item.description].join(' ');

type Viewer = { role: string; department?: string | null; departments?: readonly string[] | null };
const holds = (viewer: Viewer, department: string) => viewer.department === department || !!viewer.departments?.includes(department);
/** SUBEB Procurement: Data Entry Staff or a Director holding the Procurement department. */
export const isProcurement = (viewer: Viewer) => ['Data Entry Staff', 'Director'].includes(viewer.role) && holds(viewer, 'procurement');
/** The Procurement Director approves items; their own additions and edits are approved at once. */
export const isProcurementDirector = (viewer: Viewer) => viewer.role === 'Director' && holds(viewer, 'procurement');
