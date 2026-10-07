import { z } from 'zod';
import { ictActivityNames, planningActivityNames, qualityActivityNames, equipmentTypes, hasLineSchools, ictSubscriptionActivity, ictWebsiteActivity, maxLineSchools, qualityEquipmentActivity, subscriptionTypes, websiteTypes, type LineDocument, type LineSchool } from './activity-extras.ts';
import { maxActivityNameLength, othersActivityName, teacherActivityInfo, teacherActivityNames } from './teacher-development.ts';
import { teacherTrainingIssues, teacherTrainingShape } from './teacher-training-schema.ts';
export { maxActivityNameLength, othersActivityName };
export const activityWorkstreams = ['sbmc', 'tlm', 'monitoring', 'gscci', 'curriculum', 'quality', 'ict', 'teachers', 'planning'] as const;
export type ActivityWorkstream = typeof activityWorkstreams[number];
export const activityNames = {
  // UBEC's modified allowable social mobilisation activities (Oct 2026); the earlier SBMC list was retired and its lines cleared (migration 037).
  sbmc: ['Out-of-School Children (OOSC)', 'Capacity building and training', 'School/Centre Improvement Programme (SBMC-SIP/CBMC-CIP)', 'Advocacy and sensitisation', 'Community engagement and stakeholders’ coordination', 'Stakeholder engagement', 'Enrolment campaign/drive and post-enrolment follow-up', 'Establishment/support of non-formal learning centres', 'Media engagement', 'Advocacy and sensitisation tools', 'Annual School Grant', 'Learner support and retention interventions', 'Monitoring, tracking and accountability', 'Community-based data collection and reporting', 'Social mobilisation in IDP camps and emergency settings', 'Provision of working tools and materials', othersActivityName],
  // Lines are stored by index: TLM 0-4 are the earlier activities (kept so saved lines still render), 5-22 are the UBEC allowable-materials checklist.
  tlm: ['Purchase of TLMs to Schools', 'Capacity Building of Teachers on the Implementation of the Revised TLMs', 'Distribution of TLMs to Schools', 'Monitoring of TLMs', 'Others',
    'Textbooks', 'Supplementary books', 'Teacher resources', 'Visual aids', 'Language materials', 'Mathematics materials', 'Science materials', 'Social Studies/Geography materials', 'Basic Technology materials', 'Computer Studies resources', 'Educational games', 'Writing and teaching aids', 'Art and creativity supplies', 'Audio materials', 'Digital/basic devices', 'Projection equipment', 'Interactive learning boards', 'Other TLMs'],
  monitoring: ['Monitoring tools and supervision visit equipment', 'Procurement/maintenance of monitoring vehicles or other means of transportation to sites', 'Allowances for monitoring officers', 'Digital monitoring system/dashboard', othersActivityName],
  // UBEC's new GSCCI allowable activities (Oct 2026); the earlier safeguarding list was retired and its lines cleared (migration 039).
  gscci: ['GSCCI Pillar 1: Greening schools/planting of trees', 'GSCCI Pillar 2: Promoting entrepreneurial greening curricula', 'GSCCI Pillar 3: Teacher training and education system capacity', 'GSCCI Pillar 4: Greening communities', 'GSCCI Pillar 5: National greening competitions', 'GSCCI Pillar 6: Establishment of Green Clubs (climate change clubs)', 'Rearing of small animals/aquatic farming', 'Safeguards and waste management initiatives', 'Supervision and monitoring of GSCCI initiatives', othersActivityName],
  curriculum: ['Purchase and distribution of copies of the revised NERDC curriculum to schools', 'Capacity building of teachers on the implementation of the revised curriculum', 'Distribution of curriculum to schools', 'Monitoring of implementation of the revised curriculum', othersActivityName],
  // Quality Assurance and ICT (DDPA) activity forms (migration 038); compulsory ones are in lib/activity-extras.ts.
  quality: qualityActivityNames,
  ict: ictActivityNames,
  // Teacher Development (migration 040), the first section of the shared Teacher Development and ICT component.
  teachers: teacherActivityNames,
  // Planning, Research & Statistics (migration 041); compulsory ones are in lib/activity-extras.ts.
  planning: planningActivityNames,
} as const;
/** Explanations shown as an info hint beside an activity (Quality Assurance, Planning, Research & Statistics and others). */
export const activityInfo: Partial<Record<ActivityWorkstream, Record<number, string>>> = {
  quality: {
    0: 'Procurement of motorcycles, vehicles and any other means of transportation, and office equipment.',
    2: 'Capacity strengthening for Principals and Headteachers on the conduct of school self-evaluation and quality assurance practices and procedures.',
    3: 'Capacity building for new M&E Officers on quality assurance practices and procedures.',
    6: 'Conduct of CQA for 9 weeks to visit schools by UBEC, SUBEBs and LGEAs for evaluation of 324 schools over 3 terms (108 schools per term).',
    8: 'Follow-up by UBEC, SUBEB and LGEAs for evaluation of 162 schools.',
  },
  ict: { 2: 'All Model Smart Schools lines together may use up to ₦30,000,000.' },
  curriculum: { 4: 'Not part of the 60/20/10/10 activity split; it counts toward the Curriculum allocation.' },
  teachers: teacherActivityInfo,
  planning: {
    0: 'Conduct annual school census and regular data updates to improve accuracy of planning and reporting, uploaded to DNEMIS.',
    1: 'Develop State Medium-Term Basic Education Strategic Plans (SMTBESP) to guide state-level interventions.',
    3: 'Capacity building of EMIS, ICT and planning officers at SUBEB and LGEA through targeted trainings and continuous professional support.',
    4: 'Procure working tools and ICT resources for PRS officers at SUBEBs and LGEAs to enhance efficiency.',
    5: 'Provide technical assistance and ongoing support on planning, research and data management activities across states.',
  },
};
/** Per-activity caps as a share of the component envelope, in basis points: Curriculum (UBEC30-32) and SBMC monitoring (5%). */
export const activityShareCaps: Partial<Record<ActivityWorkstream, Record<number, number>>> = { curriculum: { 0: 6000, 1: 2000, 2: 1000, 3: 1000 }, sbmc: { 12: 500 } };
export const curriculumActivityShares = [6000, 2000, 1000, 1000] as const;
export { distributionWorkstreams, hasDistribution, distributionSnapshotKeys, distributionNames, emptyDistributionMessage, type DistributionWorkstream } from './distribution-lists.ts';
/** Workstreams that collect documents in component_documents (the Supervision & Monitoring proforma invoices). */
export const documentWorkstreams = ['monitoring'] as const;
export const activityTitles: Record<ActivityWorkstream, string> = { sbmc: 'SBMC', tlm: 'Teaching & Learning Materials', monitoring: 'Supervision & Monitoring', gscci: 'Greening Schools, Climate Change & Safeguards', curriculum: 'Curriculum', quality: 'Quality Assurance', ict: 'ICT', teachers: 'Teacher Development', planning: 'Planning, Research & Statistics' };
/** Example items shown under each TLM checklist activity. */
export const activityHints: Partial<Record<ActivityWorkstream, Record<number, string>>> = {
 sbmc: {0: 'Mapping, profiling and other activities to identify and support out-of-school children', 1: 'State-level capacity building, and training for SBMCs and CBMCs', 2: 'School Improvement Programme and Centre Improvement Programme, consolidated', 3: 'Advocacy and sensitisation in marketplaces, communities and with other target groups', 4: 'Town hall meetings and other structured community engagement', 5: 'Engaging relevant stakeholders in support of social mobilisation and basic education', 6: 'Enrolment campaigns and drives, with post-enrolment follow-up', 7: 'Part of the HOPE-EDU initiative', 8: 'Radio programmes, jingles, media advocacy and media sensitisation', 9: 'Development and production of posters and IEC materials', 10: 'Retained as an allowable intervention', 11: 'Starter kits and other learner retention support', 12: 'Monitoring, tracking, accountability and related M&E (up to 5% of the SBMC allocation)', 13: 'Community-based data collection and reporting', 14: 'Scope and classification to be confirmed by UBEC', 15: 'Working tools and materials for social mobilisation' },
 tlm: {
  5: 'English Studies, Mathematics, Basic Science/Technology, Social Studies', 6: 'Story books, supplementary readers, graded readers', 7: 'Teacher guides, lesson and activity resources', 8: 'Charts, posters, diagrams, maps, globes', 9: 'Flashcards, picture, word and alphabet cards', 10: 'Counting blocks, abacus, number cards, geometric shapes, manipulatives', 11: 'Models, specimens, magnifying glasses, simple microscopes', 12: 'Maps, globes, charts, models', 13: 'Models, demonstration materials, practical learning resources', 14: 'Basic computers and learning resources', 15: 'Educational games', 16: 'Blackboards, whiteboards, rulers, protractors, scales', 17: 'Art and craft supplies', 18: 'Radios, tape recorders, CD players', 19: 'Tablets, where justified', 20: 'Overhead projectors', 21: 'Smart interactive boards', 22: 'Must be justified and meet UBEC standards',
} };
export const selectableActivityIndexes = { sbmc: [0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16], tlm: [5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22], monitoring: [0,1,2,3,4], gscci: [0,1,2,3,4,5,6,7,8,9], curriculum: [0,1,2,3,4], quality: [0,1,2,3,4,5,6,7,8,9,10,11], ict: [0,1,2,3,4,5,6,7,8,9], teachers: [0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18], planning: [0,1,2,3,4,5,6] } as const;
/**
 * The "Others (specify)" activity of each component: always the last in its list (TLM's is "Other TLMs"), so earlier
 * indexes keep their meaning. Its lines name their own activity (custom_activity, migration 047); no other line may.
 * Others is never compulsory, has no per-activity cap and no activity-specific extras.
 */
export const otherActivityIndex = Object.fromEntries(activityWorkstreams.map(w => [w, activityNames[w].length - 1])) as Record<ActivityWorkstream, number>;
export const isOtherActivity = (workstream: ActivityWorkstream, activity: number) => otherActivityIndex[workstream] === activity;
/** Activities whose saved lines may carry their own name: Others, plus TLM's retired "Others" (4). */
const customActivityIndexes = (workstream: ActivityWorkstream): readonly number[] => workstream === 'tlm' ? [4, otherActivityIndex.tlm] : [otherActivityIndex[workstream]];
/** TLM activity whose lines record textbook classes and subject. */
export const textbookActivityIndex = 5;
/** How a line's activity is shown everywhere (editor, workbook, UBEC review): an Others line shows the name it was given. */
export const activityLabel = (workstream: ActivityWorkstream, activity: number, customActivity: string | null = '') => customActivityIndexes(workstream).includes(activity) && customActivity ? customActivity : activityNames[workstream]?.[activity] ?? 'Unknown activity';
/** Material types used by legacy TLM purchase lines (activity 0). */
export const materialTypes = ['Textbooks', 'Teachers guide', 'Interactive learning materials', 'Teaching aids & basic devices'] as const;
export const textbookClasses = ['Primary 1', 'Primary 2', 'Primary 3', 'Primary 4', 'Primary 5', 'Primary 6', 'JSS 1', 'JSS 2', 'JSS 3'] as const;
export const textbookSubjects = ['English/literacy (Core)', 'Mathematics/Numeracy (Core)', 'Basic Science (Core)', 'Social Studies', 'Nigerian languages (one local language textbook)', 'Physical and Health Education', 'History'] as const;
export const implementationStrategies = ['NCB', 'Request for quotation', 'Market survey', 'Single source/Direct contracting', 'Prequalification', 'Quality and cost based', 'Consultant Qualification', 'E-payment/Cash transfer', 'Credit School account', 'Credit SBMC school account', 'Credit staff concern account', 'Direct payment to vendor'] as const;
export const targetGroups = ['National level', 'State level', 'LGA level', 'Community level', 'Schools', 'All Learners', 'All Learners and Teachers', 'ECCDE Learners', 'Primary School Learners', 'JSS Learners', 'Teachers', 'ECCDE Learners and Teachers', 'Primary School Learners and Teachers', 'JSS Learners and Teachers'] as const;
export const activityLineSchema = z.object({
  workstream: z.enum(activityWorkstreams), activity: z.number().int().min(0),
  // Description, strategy and target group are required except on Teacher Development lines (checked below).
  description: z.string().trim().max(1000).default(''),
  rationale: z.string().trim().max(1000).default(''),
  implementationApproach: z.string().trim().max(1000).default(''),
  quantity: z.number().int().min(1).max(1000000),
  unitCost: z.number().positive().max(999999999999.99).refine(n=>Math.abs(n*100-Math.round(n*100))<.001, 'Use at most two decimal places.'),
  strategy: z.union([z.enum(implementationStrategies), z.literal('')]).default(''), targetGroup: z.union([z.enum(targetGroups), z.literal('')]).default(''), location: z.enum(['','Rural','Urban']).default(''),
  equipment: z.string().max(100).default(''),
  customActivity: z.string().trim().max(maxActivityNameLength, `Use up to ${maxActivityNameLength} characters for the activity name.`).default(''),
  textbookClasses: z.array(z.enum(textbookClasses)).max(textbookClasses.length).default([]),
  textbookSubject: z.string().max(100).default(''),
  equipmentType: z.string().max(100).default(''),
  subscriptionTypes: z.array(z.enum(subscriptionTypes)).max(subscriptionTypes.length).default([]),
  websiteType: z.string().max(100).default(''),
  schoolIds: z.array(z.number().int().positive()).max(maxLineSchools, `Choose up to ${maxLineSchools.toLocaleString()} schools.`).default([]),
  ...teacherTrainingShape,
}).superRefine((v,ctx)=>{
  const training=v.workstream==='teachers';
  if(!training&&!v.description)ctx.addIssue({code:'custom',path:['description'],message:'Enter a description.'});
  if(!training&&!v.strategy)ctx.addIssue({code:'custom',path:['strategy'],message:'Choose the implementation strategy.'});
  if(!training&&!v.targetGroup)ctx.addIssue({code:'custom',path:['targetGroup'],message:'Choose the target group.'});
  if(training&&(v.strategy||v.targetGroup))ctx.addIssue({code:'custom',path:['strategy'],message:'Implementation strategy and target group do not apply to Teacher Development.'});
  for(const issue of teacherTrainingIssues(v))ctx.addIssue({code:'custom',...issue});
  const needsEquipment=v.workstream==='quality'&&v.activity===qualityEquipmentActivity;
  if(needsEquipment&&!equipmentTypes.some(t=>t===v.equipmentType))ctx.addIssue({code:'custom',path:['equipmentType'],message:'Choose the equipment type.'});
  if(!needsEquipment&&v.equipmentType)ctx.addIssue({code:'custom',path:['equipmentType'],message:'Equipment type only applies to Mobility and Office Equipment.'});
  const needsSubscriptions=v.workstream==='ict'&&v.activity===ictSubscriptionActivity;
  if(needsSubscriptions&&!v.subscriptionTypes.length)ctx.addIssue({code:'custom',path:['subscriptionTypes'],message:'Choose at least one subscription type.'});
  if(!needsSubscriptions&&v.subscriptionTypes.length)ctx.addIssue({code:'custom',path:['subscriptionTypes'],message:'Subscription types only apply to internet subscriptions.'});
  if(new Set(v.subscriptionTypes).size!==v.subscriptionTypes.length)ctx.addIssue({code:'custom',path:['subscriptionTypes'],message:'Choose each subscription type once.'});
  const needsWebsite=v.workstream==='ict'&&v.activity===ictWebsiteActivity;
  if(needsWebsite&&!websiteTypes.some(t=>t===v.websiteType))ctx.addIssue({code:'custom',path:['websiteType'],message:'Choose the website type.'});
  if(!needsWebsite&&v.websiteType)ctx.addIssue({code:'custom',path:['websiteType'],message:'Website type only applies to the website activity.'});
  const needsSchools=hasLineSchools(v.workstream,v.activity);
  if(needsSchools&&!v.schoolIds.length)ctx.addIssue({code:'custom',path:['schoolIds'],message:'Choose at least one school.'});
  if(!needsSchools&&v.schoolIds.length)ctx.addIssue({code:'custom',path:['schoolIds'],message:'Schools only apply to activities that target schools.'});
  if(new Set(v.schoolIds).size!==v.schoolIds.length)ctx.addIssue({code:'custom',path:['schoolIds'],message:'Choose each school once.'});
  if(v.workstream==='sbmc') for(const field of ['rationale','implementationApproach'] as const) if(!v[field])ctx.addIssue({code:'custom',path:[field],message:field==='rationale'?'Enter a rationale.':'Enter an implementation approach.'});
  if(!(selectableActivityIndexes[v.workstream] as readonly number[]).includes(v.activity))ctx.addIssue({code:'custom',path:['activity'],message:'Choose a valid allowable activity.'});
  const isOther=isOtherActivity(v.workstream,v.activity);
  if(isOther&&!v.customActivity)ctx.addIssue({code:'custom',path:['customActivity'],message:'Enter the activity name.'});
  if(!isOther&&v.customActivity)ctx.addIssue({code:'custom',path:['customActivity'],message:'An activity name only applies when Others (specify) is selected.'});
  if(v.equipment)ctx.addIssue({code:'custom',path:['equipment'],message:'Material type no longer applies; choose the material as the activity.'});
  const isTextbook=v.workstream==='tlm'&&v.activity===textbookActivityIndex;
  if(isTextbook&&!v.textbookClasses.length)ctx.addIssue({code:'custom',path:['textbookClasses'],message:'Choose at least one class for the textbooks.'});
  if(isTextbook&&!textbookSubjects.some(subject=>subject===v.textbookSubject))ctx.addIssue({code:'custom',path:['textbookSubject'],message:'Choose a subject for the textbooks.'});
  if(!isTextbook&&(v.textbookClasses.length||v.textbookSubject))ctx.addIssue({code:'custom',path:['textbookClasses'],message:'Class and subject only apply to textbooks.'});
  if(!Number.isSafeInteger(Math.round(v.unitCost*100)*v.quantity))ctx.addIssue({code:'custom',path:['unitCost'],message:'Line total is too large.'});
});
export type ActivityLine = z.infer<typeof activityLineSchema> & {id:number;schools?:LineSchool[];documents?:LineDocument[]};
export type ActivitySnapshotLine = Omit<ActivityLine,'unitCost'|'targetGroup'|'implementationApproach'|'customActivity'|'textbookClasses'|'textbookSubject'|'equipmentType'|'subscriptionTypes'|'websiteType'|'schoolIds'|'trainingProvider'|'targetParticipants'|'schoolLevels'|'trainingDays'|'venueType'> & {unit_cost:string;target_group:string;implementation_approach?:string;custom_activity?:string;textbook_classes?:string[];textbook_subject?:string;equipment_type?:string;subscription_types?:string[];website_type?:string;
  /** Teacher Development training details (migration 040). */
  training_provider?:string;target_participants?:string;school_levels?:string[];training_days?:number|null;venue_type?:string};
export type ComponentDocument = {id:string;component:typeof documentWorkstreams[number];name:string;size:number};
export type DistributionSchool = {id:number;name:string;lga:string;level:string;location:string;enrolment?:number};
/** Splits a budget (kobo) across schools in proportion to enrolment; remainders go to the largest fractions so shares sum exactly. Empty when no school has learners. */
export function allocateByEnrolment(totalKobo: number, schools: readonly {id:number;enrolment?:number}[]): Map<number, number> {
  const learners = schools.reduce((sum, s) => sum + Math.max(0, s.enrolment ?? 0), 0), shares = new Map<number, number>();
  if (!learners || totalKobo <= 0) return shares;
  const exact = schools.map(s => ({ id: s.id, value: totalKobo * Math.max(0, s.enrolment ?? 0) / learners }));
  const floors = exact.map(e => ({ ...e, floor: Math.floor(e.value) }));
  const left = totalKobo - floors.reduce((sum, e) => sum + e.floor, 0);
  const order = [...floors].sort((a, b) => (b.value - b.floor) - (a.value - a.floor));
  const bonus = new Set(order.slice(0, left).map(e => e.id));
  for (const e of floors) shares.set(e.id, e.floor + (bonus.has(e.id) ? 1 : 0));
  return shares;
}
