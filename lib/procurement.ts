// The SUBEB Procurement price list (UBEC130 part 2, migration 074): each state's Procurement department keeps its own
// list; Procurement Data Entry adds or edits items (pending) and the Procurement Director approves them (or adds and
// edits them directly). Component Data Entry picks an approved item on the activities that buy goods: the unit cost
// is the list price. A saved line keeps the price it was saved with.
import type { ActivityWorkstream } from './activity-plans';

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

export type ProcurementItemStatus = 'pending' | 'approved' | 'archived';
export type ProcurementItem = {
  id: number; name: string; maker: string; modelYear: number | null; description: string; unitPrice: number; status: ProcurementItemStatus;
  createdByName: string; updatedByName: string; approvedByName: string | null; approvedAt: string | null; updatedAt: string;
};
export const procurementItemLabel = (item: Pick<ProcurementItem, 'name' | 'maker' | 'modelYear'>) => [item.name, item.maker, item.modelYear ? String(item.modelYear) : ''].filter(Boolean).join(' · ');

type Viewer = { role: string; department?: string | null; departments?: readonly string[] | null };
const holds = (viewer: Viewer, department: string) => viewer.department === department || !!viewer.departments?.includes(department);
/** SUBEB Procurement: Data Entry Staff or a Director holding the Procurement department. */
export const isProcurement = (viewer: Viewer) => ['Data Entry Staff', 'Director'].includes(viewer.role) && holds(viewer, 'procurement');
/** The Procurement Director approves items; their own additions and edits are approved at once. */
export const isProcurementDirector = (viewer: Viewer) => viewer.role === 'Director' && holds(viewer, 'procurement');
export const notOnListMessage = 'Pick the item from the Procurement price list. If it is not there, ask Procurement to add it';
