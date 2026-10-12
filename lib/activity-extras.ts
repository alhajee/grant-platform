// Quality Assurance and ICT (migration 038) and Teacher Development (migration 040): line extras, compulsory
// activities, line schools and line documents. Kept apart from lib/activity-plans.ts, which imports these
// constants into the shared line schema.
import { othersActivityName, teacherActivityNames, teacherDocumentLabel } from './teacher-development.ts';

/** Activity lists from the client's Quality Assurance and ICT (DDPA) activity forms, stored by index; the last is Others (specify), migration 047. */
/** Quality Assurance activities, renamed from the client's observations (October 2026, migration 060); 11 was added then and Others moved to 12. */
export const qualityActivityNames = ['Mobility and office equipment', 'Maintenance of motorcycles, vehicles and office equipment', 'Capacity strengthening for principals and headteachers', 'Capacity building of M&E officers on school-based monitoring and evaluation procedures and data entry', 'Literacy and Numeracy Assessment at LGEAs (aligned with HOPE-EDU)', 'Maintenance of E-Quality Assurance platform / M&E', 'Conduct of Continuous School-based Monitoring and Evaluation (CSM&E) for 9 weeks to visit schools for evaluation', 'Transportation and fueling for CSM&E', 'Follow-up evaluation (by UBEC, SUBEB and LGEAs)', 'Daily school monitoring by SUBEB and LGEAs', 'Production of instruments, report writing and harmonization', 'Server renewal and dashboard', othersActivityName] as const;
export const ictActivityNames = ['Procurement of Digital/STEM Equipment', 'Compliance with Data Protection & Cybersecurity Policy (NDPA)', 'Maintenance of Model Smart Schools', 'Maintenance of UBEC-SUBEB Connect', 'Establishment of DLC (Digital Literacy Centre)/Smart Classrooms', 'Acquisition/Renewal of Internet Subscriptions', 'Development/maintenance of website', 'Provision of digital teaching & learning resources', 'Monitoring and verification', othersActivityName] as const;
/** Planning, Research & Statistics activities (migration 041), stored by index. */
export const planningActivityNames = ['Conduct annual school census', 'Develop State Medium-Term Basic Education Strategic Plans (SMTBESP)', 'Review and track the implementation of SMTBESP', 'Capacity building of EMIS, ICT and PRS Officers at SUBEB & LGEA', 'Procure working tools and ICT resources for PRS Officers', 'Provide technical assistance for planning activities', othersActivityName] as const;
export const qualityIctActivityNames: Record<string, readonly string[]> = { quality: qualityActivityNames, ict: ictActivityNames, teachers: teacherActivityNames, planning: planningActivityNames };

/** Quality Assurance equipment items (activities 0 and 1) are either mobility or office equipment, each with its own types. */
export const equipmentCategories = ['Mobility', 'Office equipment'] as const;
export type EquipmentCategory = typeof equipmentCategories[number];
export const equipmentTypesByCategory: Record<EquipmentCategory, readonly string[]> = {
  Mobility: ['Hilux', 'Sienna', 'Minibus', 'Motorcycle', 'Boat'],
  'Office equipment': ['Laptop', 'Desktop computer', 'Printer', 'Photocopier', 'Scanner', 'Projector', 'Generator', 'Office furniture'],
};
export const subscriptionTypes = ['Starlink', 'MTN', 'Airtel', 'Glo', 'T2', 'Fibre'] as const;
/** Subscription types grouped for display: the mobile networks sit together under "Mobile network (MNO)". */
export const subscriptionGroups: { label: string | null; types: readonly (typeof subscriptionTypes[number])[] }[] = [
  { label: null, types: ['Starlink'] },
  { label: 'Mobile network (MNO)', types: ['MTN', 'Airtel', 'Glo', 'T2'] },
  { label: null, types: ['Fibre'] },
];
export const websiteTypes = ['Maintenance – renewal', 'Maintenance – redesign', 'Development (new)'] as const;
/** Equipment, website and subscription types are suggestions: "Others (specify)" lets the user type one that is not listed. */
export const maxTypeNameLength = 100;

/** QA activities whose items record an equipment category and type: Mobility and office equipment, and its maintenance. */
export const qualityEquipmentActivities = [0, 1] as const;
export const isQualityEquipmentActivity = (workstream: string, activity: number) => workstream === 'quality' && (qualityEquipmentActivities as readonly number[]).includes(activity);
/** ICT activities whose lines record their subscription types and website type. */
export const ictSubscriptionActivity = 5;
export const ictWebsiteActivity = 6;
/** ICT Maintenance of Model Smart Schools: all its lines together are capped at ₦30,000,000. */
export const ictModelSchoolsActivity = 2;
export const ictModelSchoolsCapKobo = BigInt(3_000_000_000);

/** Activities that must have at least one budget line before the component can be sent on. Teacher Development has none yet. */
export const compulsoryActivities: Partial<Record<string, readonly number[]>> = {
  quality: [2, 3, 6, 7, 8, 9, 10],
  ict: [1, 2, 3, 5, 6],
  teachers: [],
  planning: [0, 2, 3, 5],
};
export const isCompulsory = (workstream: string, activity: number) => (compulsoryActivities[workstream] ?? []).includes(activity);
/**
 * Activities kept only so earlier lines still read: no new lines, and a component with lines on them cannot be sent
 * until they are moved to a listed activity or removed. Quality Assurance follows the client's observations
 * (October 2026) exactly: "Maintenance of E-Quality Assurance platform / M&E" (5) and Others (12) are not in it.
 */
export const retiredActivities: Partial<Record<string, readonly number[]>> = { quality: [5, 12] };
export const isRetiredActivity = (workstream: string, activity: number) => (retiredActivities[workstream] ?? []).includes(activity);

/** Activities whose lines choose schools from the state's School register (at least one per line). */
export const lineSchoolActivities: Partial<Record<string, readonly number[]>> = { ict: [2, 4, 8] };
export const hasLineSchools = (workstream: string, activity: number) => (lineSchoolActivities[workstream] ?? []).includes(activity);
export const maxLineSchools = 2000;

/** Activities whose lines take uploaded documents (PDF or Excel), and what they are called. Required before sending only while the Super Admin setting is on (migration 052). */
export const lineDocumentLabels: Partial<Record<string, Record<number, string>>> = {
  ict: { 0: 'Specification document', 3: 'Supporting document', 4: 'Bill of Quantities' },
};
/** Components where every line needs documents, whatever the activity (Teacher Development). */
const everyLineDocumentLabels: Partial<Record<string, string>> = { teachers: teacherDocumentLabel };
/** The documents the Supporting documents setting governs (ICT 0/3/4, Teacher Development), or null. */
export const requiredLineDocumentLabel = (workstream: string, activity: number) => everyLineDocumentLabels[workstream] ?? lineDocumentLabels[workstream]?.[activity] ?? null;
/**
 * Components whose other lines take optional supporting documents (migration 057): never required, whatever the
 * Supporting documents setting, and never checked at a send step. Sports and Greening (GSCCI) take none.
 */
export const supportingDocumentWorkstreams = ['sbmc', 'tlm', 'monitoring', 'curriculum', 'quality', 'ict', 'planning'] as const;
export const supportingDocumentLabel = 'Supporting documents';
const takesSupportingDocuments = (workstream: string) => (supportingDocumentWorkstreams as readonly string[]).includes(workstream);
/** True when this line's documents are the optional supporting documents rather than ones the setting governs. */
export const isSupportingDocumentLine = (workstream: string, activity: number) => !requiredLineDocumentLabel(workstream, activity) && takesSupportingDocuments(workstream);
/** What a line's documents are called, or null when the line takes none. */
export const lineDocumentLabel = (workstream: string, activity: number) => requiredLineDocumentLabel(workstream, activity) ?? (takesSupportingDocuments(workstream) ? supportingDocumentLabel : null);
/** Components whose lines can carry documents (activity_line_documents.component). */
export const lineDocumentWorkstreams = ['sbmc', 'tlm', 'monitoring', 'curriculum', 'quality', 'ict', 'teachers', 'planning'] as const;
export type LineDocumentWorkstream = typeof lineDocumentWorkstreams[number];
/** The governed documents are PDF or Excel; optional supporting documents also take Word and photos. */
export const lineDocumentAccept = '.pdf,.xls,.xlsx';
export const supportingDocumentAccept = '.pdf,.xls,.xlsx,.docx,.png,.jpg,.jpeg';
export const lineDocumentAcceptFor = (workstream: string, activity: number) => isSupportingDocumentLine(workstream, activity) ? supportingDocumentAccept : lineDocumentAccept;
export const maxLineDocumentBytes = 5 * 1024 * 1024;
export const maxLineDocuments = 10;

export type LineSchool = { id: number; name: string; lga: string; level: string };
export type LineDocument = { id: string; name: string; size: number };
