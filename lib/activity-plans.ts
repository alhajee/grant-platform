import { z } from 'zod';
import { ictActivityNames, planningActivityNames, qualityActivityNames, hasLineSchools, allocatesToSchools, needsBeneficiary, beneficiaryTypes, quantityFromSchools, lineHasItem, needsCensusType, needsFrequency, maxFrequency, censusTypes, maxTypeNameLength, ictSubscriptionActivity, ictWebsiteActivity, maxLineSchools, equipmentCategories, isQualityEquipmentActivity, subscriptionTypes, type LineDocument, type LineSchool } from './activity-extras.ts';
import { maxActivityNameLength, othersActivityName, teacherActivityInfo, teacherActivityNames } from './teacher-development.ts';
import { teacherTrainingIssues, teacherTrainingShape } from './teacher-training-schema.ts';
import { lineQuartersSchema } from './line-quarters.ts';
import { lineDatesShape } from './line-dates.ts';
import { targetGroupField, targetGroups, targetGroupSeparator, splitTargetGroups, joinTargetGroups } from './target-groups.ts';
export { maxActivityNameLength, othersActivityName };
export const activityWorkstreams = ['sbmc', 'tlm', 'monitoring', 'gscci', 'curriculum', 'quality', 'ict', 'teachers', 'planning'] as const;
export type ActivityWorkstream = typeof activityWorkstreams[number];
export const activityNames = {
  // UBEC's modified allowable social mobilisation activities (Oct 2026); the earlier SBMC list was retired and its lines cleared (migration 037).
  // UBEC227 (client's 5 November 2026 document): 13 "Community-based data collection and reporting" is retired (retiredActivities),
  // 12 is compulsory and no longer capped at 5%, and the list is offered in the document's order (selectableActivityIndexes).
  sbmc: ['Out-of-School Children (OOSC) interventions', 'Capacity building and training', 'School/Centre Improvement Programme (SBMC-SIP/CBMC-CIP)', 'Advocacy and sensitisation', 'Community engagement and stakeholders’ coordination', 'Stakeholder engagement', 'Enrolment campaign/drive and post-enrolment follow-up', 'Establishment/support of non-formal learning centres', 'Media engagement', 'Advocacy and sensitisation tools', 'Annual School Grant', 'Learner support and retention interventions', 'Monitoring, tracking and accountability', 'Community-based data collection and reporting', 'Social mobilisation in IDP camps and emergency settings', 'Provision of working tools and materials', othersActivityName],
  // Lines are stored by index: TLM 0-4 are the earlier activities (kept so saved lines still render), 5-22 are the UBEC allowable-materials checklist.
  // 2 and 3 (renamed from "Monitoring of TLMs", UBEC73) are offered again, listed just before Other TLMs; neither has a cap.
  tlm: ['Purchase of TLMs to Schools', 'Capacity Building of Teachers on the Implementation of the Revised TLMs', 'Distribution of TLMs', 'Verification and Monitoring', 'Others',
    'Textbooks', 'Supplementary books', 'Teacher resources', 'Visual aids', 'Language materials', 'Mathematics materials', 'Science materials', 'Social Studies/Geography materials', 'Basic Technology materials', 'Computer Studies resources', 'Educational games', 'Writing and teaching aids', 'Art and creativity supplies', 'Audio materials', 'Digital/basic devices', 'Projection equipment', 'Interactive learning boards', 'Other TLMs'],
  monitoring: ['Monitoring tools and supervision visit equipment', 'Procurement/maintenance of monitoring vehicles or other means of transportation to sites', 'Allowances for monitoring officers', 'Digital monitoring system/dashboard', 'Training', othersActivityName],
  // UBEC's new GSCCI allowable activities (Oct 2026); the earlier safeguarding list was retired and its lines cleared (migration 039).
  gscci: ['GSCCI Pillar 1: Greening schools/planting of trees', 'GSCCI Pillar 2: Promoting entrepreneurial greening curricula', 'GSCCI Pillar 3: Teacher training and education system capacity', 'GSCCI Pillar 4: Greening communities', 'GSCCI Pillar 5: National greening competitions', 'GSCCI Pillar 6: Establishment of Green Clubs (climate change clubs)', 'Rearing of small animals/aquatic farming', 'Safeguards and waste management initiatives', 'Supervision and monitoring of GSCCI initiatives', othersActivityName],
  // Renamed to the client's list (October 2026); same order, so the 60/20/10/10 shares are unchanged.
  curriculum: ['Curriculum Procurement (Acquisition)', 'Training of teachers', 'Distribution of the Curriculum & Access', 'Monitoring & Accountability (Verification)', othersActivityName],
  // Quality Assurance and ICT (DDPA) activity forms (migration 038); compulsory ones are in lib/activity-extras.ts.
  quality: qualityActivityNames,
  ict: ictActivityNames,
  // Teacher Development (migration 040), the first section of the shared Teacher Development and ICT component.
  teachers: teacherActivityNames,
  // Planning, EMIS & Data Platform (migration 041); compulsory ones are in lib/activity-extras.ts.
  planning: planningActivityNames,
} as const;
/** Explanations shown as an info hint beside an activity (Quality Assurance, Planning, EMIS & Data Platform and others). */
export const activityInfo: Partial<Record<ActivityWorkstream, Record<number, string>>> = {
  quality: {
    0: 'Procurement of mobility (e.g. Hilux, Sienna, minibus, motorcycle, boat) and office equipment. Add one item per type, each with its own quantity and unit cost.',
    1: 'Maintenance of mobility and office equipment. Add one item per type, each with its own quantity and unit cost.',
    2: 'Capacity strengthening for principals and headteachers on the conduct of school self-evaluation procedures by UBEC trained facilitators',
    3: 'Capacity building of M&E officers on school-based monitoring and evaluation procedures and data entry by UBEC trained facilitators',
    6: 'Conduct of CSM&E for 9 weeks to visit schools by UBEC, SUBEBs and LGEAs for evaluation of 324 schools over 3 terms (108 schools per term)',
    8: 'Follow-up by UBEC, SUBEB and LGEAs for evaluation of 162 schools',
  },
  // UBEC227: the client's "Proposed allowable social mobilization activities" (5 November 2026), in the app's British spelling.
  sbmc: {
    0: 'Uses advocacy as a key tool to sensitise communities and reduce the number of out-of-school children. Includes targeted strategies and related initiatives to identify, re-engage and support OOSC',
    1: 'Capacity-building activities at State level, and training and capacity development for School-Based Management Committees (SBMCs) and Community-Based Management Committees (CBMCs)',
    2: 'The School Improvement Programme and the Centre Improvement Programme, consolidated under a single activity',
    3: 'Advocacy and sensitisation in different settings, including marketplaces, communities and other relevant target groups',
    4: 'Town hall meetings and other structured community engagement interventions',
    5: 'Activities designed to engage relevant stakeholders in support of social mobilisation and basic education objectives',
    6: 'Enrolment campaigns and drives, with post-enrolment follow-up',
    7: 'Retained as an allowable intervention, as it forms part of the HOPE-EDU initiative',
    8: 'Radio programmes, jingles, media advocacy, media sensitisation and other relevant media-based engagement activities',
    9: 'Development and production of communication materials, including posters and Information, Education and Communication (IEC) materials',
    10: 'Retained as an allowable intervention',
    11: 'Learner support interventions such as the provision of starter kits and other relevant retention support',
    12: 'Monitoring, tracking, accountability and related Monitoring and Evaluation (M&E) activities. A manual will be developed to guide implementation',
    13: 'No longer an allowable activity. Move its items to a listed activity',
    14: 'Its scope, applicability and classification are still being reviewed by UBEC',
    15: 'Essential tools, materials and equipment for social mobilisation',
  },
  ict: { 2: 'All Model Smart Schools & DLC lines together may use up to ₦30,000,000.0000' },
  curriculum: {
    0: 'Procurement of the New Revised Basic Curriculum (ECCDE, Primary 1–6, JSS 1–3)',
    1: 'Capacity building of Education Secretaries, teachers, supervisors, LGEA and curriculum officers',
    2: 'State → LGEA → school → teacher distribution',
    3: 'School monitoring, tracking, verification and utilisation checks by SUBEB and UBEC',
    4: 'Not part of the 60/20/10/10 activity split; it counts toward the Curriculum allocation',
  },
  teachers: teacherActivityInfo,
  planning: {
    0: 'Conduct annual school census and regular data updates to improve accuracy of planning and reporting, uploaded to DNEMIS.',
    1: 'Develop State Medium-Term Basic Education Strategic Plans (SMTBESP) to guide state-level interventions',
    3: 'Capacity building of EMIS, ICT and PRS Officers at SUBEB and LGEA through targeted trainings and continuous professional support',
    4: 'Procure working tools and ICT resources for PRS Officers at SUBEBs and LGEAs to enhance efficiency',
    5: 'Provide technical assistance and ongoing support on planning, research and data management activities across states',
  },
};
/** Per-activity caps as a share of the component envelope, in basis points: Curriculum (UBEC30-32) and Quality Assurance. SBMC monitoring lost its 5% cap (UBEC227). */
export const activityShareCaps: Partial<Record<ActivityWorkstream, Record<number, number>>> = { curriculum: { 0: 6000, 1: 2000, 2: 1000, 3: 1000 },
  // Quality Assurance (client observations, October 2026); 0 and 1 share one cap (activityShareGroups). Together the
  // shares come to 100%; 5 and Others are retired (retiredActivities).
  quality: { 2: 1000, 3: 500, 4: 1600, 6: 800, 7: 300, 8: 400, 9: 400, 10: 100, 11: 100 } };
/** Activities whose items share one cap, in basis points: Quality Assurance Mobility and office equipment with its maintenance, 48%. */
export const activityShareGroups: Partial<Record<ActivityWorkstream, readonly { activities: readonly number[]; share: number }[]>> = { quality: [{ activities: [0, 1], share: 4800 }] };
/** The activities whose items count toward this activity's cap: its group, or itself. */
export const capActivities = (workstream: ActivityWorkstream, activity: number): readonly number[] => activityShareGroups[workstream]?.find(g => g.activities.includes(activity))?.activities ?? [activity];
/** This activity's share in basis points (its own, or its group's), or undefined when it has none. */
export const activityShare = (workstream: ActivityWorkstream, activity: number): number | undefined => activityShareGroups[workstream]?.find(g => g.activities.includes(activity))?.share ?? activityShareCaps[workstream]?.[activity];
export const curriculumActivityShares = [6000, 2000, 1000, 1000] as const;
/**
 * Shares shown as a guide but not enforced (client, 28 October 2026): every Curriculum activity (UBEC162) and the optional
 * Quality Assurance activities, Mobility and office equipment with its maintenance, Literacy and Numeracy Assessment and
 * Server renewal (UBEC173). Items may go over them; the component allocation still caps (and, with full use on, must be
 * used in full), and these shares are not required in full.
 */
export const advisoryShareActivities: Partial<Record<ActivityWorkstream, readonly number[]>> = { curriculum: [0, 1, 2, 3], quality: [0, 1, 4, 11] };
export const isAdvisoryShare = (workstream: ActivityWorkstream, activity: number) => (advisoryShareActivities[workstream] ?? []).includes(activity);
export { distributionWorkstreams, hasDistribution, distributionSnapshotKeys, distributionNames, emptyDistributionMessage, type DistributionWorkstream } from './distribution-lists.ts';
/** Workstreams that collect documents in component_documents (the Supervision & Monitoring proforma invoices). */
export const documentWorkstreams = ['monitoring', 'ict'] as const;
/** The one kind of component document each workstream collects: Monitoring proforma invoices, the ICT UBEC-SUBEB Connect waiver. */
export const componentDocumentKinds = { monitoring: 'proforma', ict: 'connect_waiver' } as const;
export const activityTitles: Record<ActivityWorkstream, string> = { sbmc: 'SBMC', tlm: 'Teaching & Learning Materials', monitoring: 'Supervision & Monitoring', gscci: 'Greening Schools, Climate Change & Safeguards', curriculum: 'Curriculum', quality: 'Quality Assurance', ict: 'ICT', teachers: 'Teacher Development', planning: 'Planning, EMIS & Data Platform' };
/** Example items shown under each TLM checklist activity. */
export const activityHints: Partial<Record<ActivityWorkstream, Record<number, string>>> = {
 tlm: {
  5: 'English Studies, Mathematics, Basic Science/Technology, Social Studies', 6: 'Story books, supplementary readers, graded readers', 7: 'Teacher guides, lesson and activity resources', 8: 'Charts, posters, diagrams, maps, globes', 9: 'Flashcards, picture, word and alphabet cards', 10: 'Counting blocks, abacus, number cards, geometric shapes, manipulatives', 11: 'Models, specimens, magnifying glasses, simple microscopes', 12: 'Maps, globes, charts, models', 13: 'Models, demonstration materials, practical learning resources', 14: 'Basic computers and learning resources', 15: 'Educational games', 16: 'Blackboards, whiteboards, rulers, protractors, scales', 17: 'Art and craft supplies', 18: 'Radios, tape recorders, CD players', 19: 'Tablets, where justified', 20: 'Overhead projectors', 21: 'Smart interactive boards', 22: 'Must be justified and meet UBEC standards', 3: 'Checking that the TLMs reached the schools and how they are used',
} };
export const selectableActivityIndexes = { sbmc: [2,10,0,1,3,4,5,6,7,8,9,11,12,14,15,16], tlm: [5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,2,3,22], monitoring: [0,1,2,3,4,5], gscci: [0,1,2,3,4,5,6,7,8,9], curriculum: [0,1,2,3,4], quality: [0,1,2,3,4,6,7,8,9,10,11], ict: [0,1,2,3,4,5,6,7,8,9], teachers: [0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18], planning: [0,1,2,3,4,5,6] } as const;
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
// ECCDE joined the classes on 30 October 2026 (UBEC206).
export const textbookClasses = ['ECCDE', 'Primary 1', 'Primary 2', 'Primary 3', 'Primary 4', 'Primary 5', 'Primary 6', 'JSS 1', 'JSS 2', 'JSS 3'] as const;
/** Suggested subjects; "Others (specify)" stores a typed subject instead (UBEC207, migration 082). */
export const textbookSubjects = ['English/literacy (Core)', 'Mathematics/Numeracy (Core)', 'Basic Science (Core)', 'Social Studies', 'Nigerian languages (one local language textbook)', 'Physical and Health Education', 'History'] as const;
/**
 * Implementation (procurement) strategies of the activity components (client list, October 2026; Infrastructure keeps
 * its own). Stored values stay short and stable; `strategyLabels` gives the names shown. The retired ones stay valid on
 * lines that already use them, but cannot be chosen again (the save route refuses a change to one).
 */
// UBEC159 (28 October 2026): ICB, Non-Consultancy and Non-Applicable added. Non-Applicable lines say what is used instead
// (e.g. E-payment/cash transfer, direct payment to vendor), stored as "Non-Applicable: <what>" (`withStrategyDetail`).
export const implementationStrategies = ['ICB', 'NCB', 'Request for quotation', 'Market survey', 'Single source/Direct contracting', 'Prequalification', 'Quality and cost based', 'Consultant Qualification', 'Least cost', 'Non-Consultancy', 'Non-Applicable'] as const;
export const nonApplicableStrategy = 'Non-Applicable';
export const maxStrategyDetailLength = 100;
const nonApplicablePrefix = `${nonApplicableStrategy}: `;
/** "Non-Applicable: E-payment" → { strategy: 'Non-Applicable', detail: 'E-payment' }; any other value has no detail. */
export const splitStrategy = (value: string) => value.startsWith(nonApplicablePrefix) ? { strategy: nonApplicableStrategy, detail: value.slice(nonApplicablePrefix.length) } : { strategy: value, detail: '' };
export const withStrategyDetail = (strategy: string, detail: string) => strategy === nonApplicableStrategy && detail.trim() ? `${nonApplicablePrefix}${detail.trim().slice(0, maxStrategyDetailLength)}` : strategy;
export const isNonApplicable = (value: string) => splitStrategy(value).strategy === nonApplicableStrategy;
export const retiredStrategies = ['E-payment/Cash transfer', 'Credit School account', 'Credit SBMC school account', 'Credit staff concern account', 'Direct payment to vendor'] as const;
export const strategyLabels: Record<string, string> = {
  ICB: 'ICB (International Competitive Bidding)', NCB: 'NCB (National Competitive Bidding)', 'Request for quotation': 'Request for Quotation', 'Market survey': 'Market Survey (Shopping)',
  'Single source/Direct contracting': 'Single Source/Direct Contracting',
};
export const strategyLabel = (value: string) => { const { strategy, detail } = splitStrategy(value); return detail ? `${strategy} (${detail})` : strategyLabels[value] ?? value; };
export const isRetiredStrategy = (value: string) => (retiredStrategies as readonly string[]).includes(value);
export { targetGroups, targetGroupSeparator, splitTargetGroups, joinTargetGroups };
export const activityLineSchema = z.object({
  workstream: z.enum(activityWorkstreams), activity: z.number().int().min(0),
  // Description, strategy and target group are required except on Teacher Development lines (checked below).
  description: z.string().trim().max(1000).default(''),
  rationale: z.string().trim().max(1000).default(''),
  implementationApproach: z.string().trim().max(1000).default(''),
  quantity: z.number().int().min(1).max(1000000),
  unitCost: z.number().positive().max(999999999999.99).refine(n=>Math.abs(n*100-Math.round(n*100))<.001, 'Use at most two decimal places'),
  strategy: z.union([z.enum(implementationStrategies), z.enum(retiredStrategies), z.literal(''), z.string().regex(new RegExp(`^${nonApplicableStrategy}: \\S.{0,${maxStrategyDetailLength - 1}}$`), 'Say what is used instead (up to 100 characters)')]).default(''), targetGroup: targetGroupField, location: z.enum(['','Rural','Urban']).default(''),
  equipment: z.string().max(100).default(''),
  customActivity: z.string().trim().max(maxActivityNameLength, `Use up to ${maxActivityNameLength} characters for the activity name`).default(''),
  textbookClasses: z.array(z.enum(textbookClasses)).max(textbookClasses.length).default([]),
  textbookSubject: z.string().trim().max(100, 'Keep the subject to 100 characters').default(''),
  // Listed values or, through "Others (specify)", whatever the user types (lib/activity-extras.ts).
  equipmentCategory: z.enum(['', ...equipmentCategories]).default(''),
  equipmentType: z.string().trim().max(maxTypeNameLength, `Use up to ${maxTypeNameLength} characters`).default(''),
  subscriptionTypes: z.array(z.string().trim().min(1, 'Enter the subscription name').max(maxTypeNameLength, `Use up to ${maxTypeNameLength} characters`)).max(subscriptionTypes.length + 1).default([]),
  websiteType: z.string().trim().max(maxTypeNameLength, `Use up to ${maxTypeNameLength} characters`).default(''),
  /** Greening item (migration 062): listed for the activity or typed. */
  item: z.string().trim().max(maxTypeNameLength, `Use up to ${maxTypeNameLength} characters for the item`).default(''),
  /** Planning census type (migration 064). */
  censusType: z.enum(['', ...censusTypes]).default(''),
  /** Monitoring officer allowances: visits (migration 078); quantity is officers × visits. */
  frequency: z.number().int().min(1).max(maxFrequency).nullable().default(null),
  /** The Procurement price-list item the line buys (migration 074); the unit cost is its list price. */
  priceItemId: z.number().int().positive().nullable().default(null),
  schoolIds: z.array(z.number().int().positive()).max(maxLineSchools, `Choose up to ${maxLineSchools.toLocaleString()} schools`).default([]),
  /** ICT procurement (UBEC160, migration 080): who benefits, and for schools the items each school gets (by school id). */
  beneficiary: z.enum(['', ...beneficiaryTypes]).default(''),
  schoolQuantities: z.record(z.string().regex(/^\d+$/), z.number().int().min(1, 'Give each school at least 1 item').max(1000000)).default({}),
  ...teacherTrainingShape,
  /** Timeline: implementation quarters within the plan's quarters (migration 050); omitted = the plan's quarters. */
  quarters: lineQuartersSchema.optional(),
  /** Expected start and due dates inside the timeline (migration 059); omitted = kept or the whole timeline. */
  ...lineDatesShape,
}).superRefine((v,ctx)=>{
  const training=v.workstream==='teachers';
  if(!v.description)ctx.addIssue({code:'custom',path:['description'],message:'Enter a description'});
  if(!training&&!v.strategy)ctx.addIssue({code:'custom',path:['strategy'],message:'Choose the implementation strategy'});
  if(v.strategy===nonApplicableStrategy)ctx.addIssue({code:'custom',path:['strategy'],message:'Say what is used instead, e.g. E-payment/cash transfer or direct payment to vendor'});
  if(!training&&!v.targetGroup)ctx.addIssue({code:'custom',path:['targetGroup'],message:'Choose the target group'});
  if(training&&(v.strategy||v.targetGroup))ctx.addIssue({code:'custom',path:['strategy'],message:'Implementation strategy and target group do not apply to Teacher Development'});
  for(const issue of teacherTrainingIssues(v))ctx.addIssue({code:'custom',...issue});
  const needsEquipment=isQualityEquipmentActivity(v.workstream,v.activity);
  if(needsEquipment&&!v.equipmentCategory)ctx.addIssue({code:'custom',path:['equipmentCategory'],message:'Choose Mobility or Office equipment'});
  if(needsEquipment&&!v.equipmentType)ctx.addIssue({code:'custom',path:['equipmentType'],message:'Choose or enter the type'});
  if(!needsEquipment&&(v.equipmentType||v.equipmentCategory))ctx.addIssue({code:'custom',path:['equipmentType'],message:'Equipment category and type only apply to Mobility and office equipment and its maintenance'});
  const needsSubscriptions=v.workstream==='ict'&&v.activity===ictSubscriptionActivity;
  if(needsSubscriptions&&!v.subscriptionTypes.length)ctx.addIssue({code:'custom',path:['subscriptionTypes'],message:'Choose at least one subscription type'});
  if(!needsSubscriptions&&v.subscriptionTypes.length)ctx.addIssue({code:'custom',path:['subscriptionTypes'],message:'Subscription types only apply to internet subscriptions'});
  if(v.subscriptionTypes.filter(t=>!(subscriptionTypes as readonly string[]).includes(t)).length>1)ctx.addIssue({code:'custom',path:['subscriptionTypes'],message:'Enter one other subscription'});
  if(new Set(v.subscriptionTypes.map(t=>t.toLowerCase())).size!==v.subscriptionTypes.length)ctx.addIssue({code:'custom',path:['subscriptionTypes'],message:'Choose each subscription type once'});
  const needsWebsite=v.workstream==='ict'&&v.activity===ictWebsiteActivity;
  if(needsWebsite&&!v.websiteType)ctx.addIssue({code:'custom',path:['websiteType'],message:'Choose or enter the website type'});
  if(!needsWebsite&&v.websiteType)ctx.addIssue({code:'custom',path:['websiteType'],message:'Website type only applies to the website activity'});
  if(lineHasItem(v.workstream)&&!v.item)ctx.addIssue({code:'custom',path:['item'],message:'Choose or enter the item'});
  if(!lineHasItem(v.workstream)&&v.item)ctx.addIssue({code:'custom',path:['item'],message:'Items only apply to Greening Schools, Climate Change & Safeguards'});
  const census=needsCensusType(v.workstream,v.activity);
  if(census&&!v.censusType)ctx.addIssue({code:'custom',path:['censusType'],message:'Pick the type of census'});
  if(!census&&v.censusType)ctx.addIssue({code:'custom',path:['censusType'],message:'The type of census only applies to Conduct annual school census'});
  const visits=needsFrequency(v.workstream,v.activity);
  // An allowance line without a frequency (older clients, lines saved before migration 078) is one visit.
  if(!visits&&v.frequency!=null)ctx.addIssue({code:'custom',path:['frequency'],message:'Frequency only applies to Allowances for monitoring officers'});
  if(visits&&v.frequency!=null&&v.quantity%v.frequency!==0)ctx.addIssue({code:'custom',path:['quantity'],message:'Edit the item to change the number of officers or visits'});
  const beneficiaryNeeded=needsBeneficiary(v.workstream,v.activity);
  if(beneficiaryNeeded&&!v.beneficiary)ctx.addIssue({code:'custom',path:['beneficiary'],message:'Choose who benefits: Schools, SUBEB or LGA'});
  if(!beneficiaryNeeded&&v.beneficiary)ctx.addIssue({code:'custom',path:['beneficiary'],message:'Beneficiaries only apply to Procurement of Digital/STEM Equipment'});
  if(allocatesToSchools(v.workstream,v.activity,v.beneficiary)){
   const missing=v.schoolIds.filter(id=>!v.schoolQuantities[String(id)]);
   const shared=v.schoolIds.reduce((sum,id)=>sum+(v.schoolQuantities[String(id)]??0),0);
   if(v.schoolIds.length&&missing.length)ctx.addIssue({code:'custom',path:['schoolQuantities'],message:`Give each school its number of items (${missing.length} ${missing.length===1?'school has':'schools have'} none)`});
   else if(v.schoolIds.length&&shared!==v.quantity)ctx.addIssue({code:'custom',path:['schoolQuantities'],message:`Share all ${v.quantity.toLocaleString('en-NG')} items across the schools: ${shared.toLocaleString('en-NG')} allocated`});
  }else if(Object.keys(v.schoolQuantities).length)ctx.addIssue({code:'custom',path:['schoolQuantities'],message:'Items per school only apply to Procurement of Digital/STEM Equipment for schools'});
  const needsSchools=hasLineSchools(v.workstream,v.activity,v.beneficiary);
  if(needsSchools&&!v.schoolIds.length)ctx.addIssue({code:'custom',path:['schoolIds'],message:'Choose at least one school'});
  if(!needsSchools&&v.schoolIds.length)ctx.addIssue({code:'custom',path:['schoolIds'],message:'Schools only apply to activities that target schools'});
  if(new Set(v.schoolIds).size!==v.schoolIds.length)ctx.addIssue({code:'custom',path:['schoolIds'],message:'Choose each school once'});
  if(quantityFromSchools(v.workstream,v.activity)&&v.schoolIds.length&&v.quantity!==v.schoolIds.length)ctx.addIssue({code:'custom',path:['quantity'],message:`One per school: the quantity is the number of schools chosen (${v.schoolIds.length})`});
  if(v.workstream==='sbmc') for(const field of ['rationale','implementationApproach'] as const) if(!v[field])ctx.addIssue({code:'custom',path:[field],message:field==='rationale'?'Enter a rationale':'Enter an implementation approach'});
  if(!(selectableActivityIndexes[v.workstream] as readonly number[]).includes(v.activity))ctx.addIssue({code:'custom',path:['activity'],message:'Choose a valid allowable activity'});
  const isOther=isOtherActivity(v.workstream,v.activity);
  if(isOther&&!v.customActivity)ctx.addIssue({code:'custom',path:['customActivity'],message:'Enter the activity name'});
  if(!isOther&&v.customActivity)ctx.addIssue({code:'custom',path:['customActivity'],message:'An activity name only applies when Others (specify) is selected'});
  if(v.equipment)ctx.addIssue({code:'custom',path:['equipment'],message:'Material type no longer applies; choose the material as the activity'});
  const isTextbook=v.workstream==='tlm'&&v.activity===textbookActivityIndex;
  if(isTextbook&&!v.textbookClasses.length)ctx.addIssue({code:'custom',path:['textbookClasses'],message:'Choose at least one class for the textbooks'});
  if(isTextbook&&!v.textbookSubject)ctx.addIssue({code:'custom',path:['textbookSubject'],message:'Choose a subject for the textbooks'});
  if(!isTextbook&&(v.textbookClasses.length||v.textbookSubject))ctx.addIssue({code:'custom',path:['textbookClasses'],message:'Class and subject only apply to textbooks'});
  if(!Number.isSafeInteger(Math.round(v.unitCost*100)*v.quantity))ctx.addIssue({code:'custom',path:['unitCost'],message:'Line total is too large'});
});
export type ActivityLine = z.infer<typeof activityLineSchema> & {id:number;/** Reference code set by the database (migration 053), e.g. UBEC/SUBEB/SBMC/012/2026 · Q1–Q4. */code?:string;/** The client key the line was created with (migration 058), null for older lines. */clientKey?:string|null;schools?:LineSchool[];documents?:LineDocument[];/** UBEC161/163: items per school on the distribution list, by school id (items bought for schools). */allocations?:Record<string,number>};
export type ActivitySnapshotLine = Omit<ActivityLine,'unitCost'|'targetGroup'|'implementationApproach'|'customActivity'|'textbookClasses'|'textbookSubject'|'equipmentCategory'|'equipmentType'|'subscriptionTypes'|'websiteType'|'item'|'censusType'|'frequency'|'schoolIds'|'beneficiary'|'schoolQuantities'|'trainingProvider'|'targetParticipants'|'schoolLevels'|'trainingDays'|'venueType'> & {unit_cost:string;target_group:string;implementation_approach?:string;custom_activity?:string;textbook_classes?:string[];textbook_subject?:string;equipment_category?:string;equipment_type?:string;subscription_types?:string[];website_type?:string;item?:string;census_type?:string;/** Visits (migration 078), monitoring officer allowances only. */frequency?:number|null;/** ICT procurement beneficiaries (migration 080). */beneficiary?:string|null;
  /** Teacher Development training details (migration 040). */
  training_provider?:string;target_participants?:string;school_levels?:string[];training_days?:number|null;venue_type?:string};
export type ComponentDocument = {id:string;component:typeof documentWorkstreams[number];name:string;size:number};
/** Coordinates since 17 October 2026 ('' when the School list has none); older snapshots are filled in when read (lib/distribution-coordinates.ts). */
export type DistributionSchool = {id:number;name:string;lga:string;level:string;location:string;enrolment?:number;latitude?:string;longitude?:string;
  /** DNEMIS learners per class (P1…JSS3), read by the TLM editor for the textbook quantity warning; not in snapshots. */
  enrolmentByClass?:Record<string,{male?:number;female?:number}>|null};
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
