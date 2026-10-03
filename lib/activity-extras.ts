// Quality Assurance and ICT (migration 038): line extras, compulsory activities, line schools and line documents.
// Kept apart from lib/activity-plans.ts, which imports these constants into the shared line schema.

/** Activity lists from the client's Quality Assurance and ICT (DDPA) activity forms, stored by index. */
export const qualityActivityNames = ['Mobility and Office Equipment', 'Maintenance of motorcycles, vehicles and office equipment', 'Capacity strengthening for Principals and Headteachers', 'Capacity building for new M&E Officers', 'Literacy and Numeracy Assessment at LGEA', 'Maintenance of E-Quality Assurance platform / M&E', 'Conduct of CQA for 9 weeks to visit schools for evaluations', 'Transportation and fueling for CQA', 'Follow-up evaluation', 'Daily school monitoring by SUBEB and LGEA', 'Production of instruments, report writing and harmonization'] as const;
export const ictActivityNames = ['Procurement of Digital/STEM Equipment', 'Compliance with Data Protection & Cybersecurity Policy (NDPA)', 'Maintenance of Model Smart Schools', 'Maintenance of UBEC-SUBEB Connect', 'Establishment of DLC (Digital Literacy Centre)/Smart Classrooms', 'Acquisition/Renewal of Internet Subscriptions', 'Development/maintenance of website', 'Provision of digital teaching & learning resources', 'Monitoring and verification'] as const;
export const qualityIctActivityNames: Record<string, readonly string[]> = { quality: qualityActivityNames, ict: ictActivityNames };

export const equipmentTypes = ['Motorcycles', 'Vehicles', 'Office equipment (printers, photocopiers, projectors etc.)'] as const;
export const subscriptionTypes = ['Starlink', 'MTN', 'Airtel', 'Glo', 'T2', 'Fibre'] as const;
/** Subscription types grouped for display: the mobile networks sit together under "Mobile network (MNO)". */
export const subscriptionGroups: { label: string | null; types: readonly (typeof subscriptionTypes[number])[] }[] = [
  { label: null, types: ['Starlink'] },
  { label: 'Mobile network (MNO)', types: ['MTN', 'Airtel', 'Glo', 'T2'] },
  { label: null, types: ['Fibre'] },
];
export const websiteTypes = ['Maintenance – renewal', 'Maintenance – redesign', 'Development (new)'] as const;

/** QA activity whose lines record the equipment type. */
export const qualityEquipmentActivity = 0;
/** ICT activities whose lines record their subscription types and website type. */
export const ictSubscriptionActivity = 5;
export const ictWebsiteActivity = 6;
/** ICT Maintenance of Model Smart Schools: all its lines together are capped at ₦30,000,000. */
export const ictModelSchoolsActivity = 2;
export const ictModelSchoolsCapKobo = BigInt(3_000_000_000);

/** Activities that must have at least one budget line before the component can be sent on. */
export const compulsoryActivities: Partial<Record<string, readonly number[]>> = {
  quality: [2, 3, 6, 7, 8, 9, 10],
  ict: [2, 3, 6],
};
export const isCompulsory = (workstream: string, activity: number) => (compulsoryActivities[workstream] ?? []).includes(activity);

/** Activities whose lines choose schools from the state's School register (at least one per line). */
export const lineSchoolActivities: Partial<Record<string, readonly number[]>> = { ict: [2, 4, 8] };
export const hasLineSchools = (workstream: string, activity: number) => (lineSchoolActivities[workstream] ?? []).includes(activity);
export const maxLineSchools = 2000;

/** Activities whose lines need at least one uploaded document (PDF or Excel), and what it is called. */
export const lineDocumentLabels: Partial<Record<string, Record<number, string>>> = {
  ict: { 0: 'Specification document', 3: 'Supporting document', 4: 'Bill of Quantities' },
};
export const lineDocumentLabel = (workstream: string, activity: number) => lineDocumentLabels[workstream]?.[activity] ?? null;
/** Components whose lines can carry documents (activity_line_documents.component). */
export const lineDocumentWorkstreams = ['quality', 'ict'] as const;
export type LineDocumentWorkstream = typeof lineDocumentWorkstreams[number];
export const lineDocumentAccept = '.pdf,.xls,.xlsx';
export const maxLineDocumentBytes = 5 * 1024 * 1024;
export const maxLineDocuments = 10;

export type LineSchool = { id: number; name: string; lga: string; level: string };
export type LineDocument = { id: string; name: string; size: number };
