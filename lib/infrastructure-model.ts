import { z } from 'zod';
import { lineQuartersSchema } from './line-quarters.ts';
import { lineDatesShape } from './line-dates.ts';
import { targetGroupField } from './target-groups.ts';
import { MONEY_SCALE_NUMBER, hasMoneyDecimals, maxUnitCost, minorOfNumber, moneyDecimalsMessage } from './money.ts';
import { requirements, fenceDeliverable, appliesToStream, auditKeys, describableKeys, deliverableDescription, solarKva, type DeliverableCategory, type SchoolStream } from './infrastructure-deliverables.ts';
export { quantityLabel, requirements, fenceDeliverable, minimumKeys, appliesToStream, eccdeOnlyKeys, isEccdeItem, standardText, deliverableGroups, deliverableGroup, deliverableCategory, deliverableInfo, deliverableDescription, groupDeliverables, inDeliverableOrder, type DeliverableCategory, type SchoolStream } from './infrastructure-deliverables.ts';

/**
 * Infrastructure implementation strategies: the procurement list every component uses (UBEC159, 28 October 2026);
 * Request for quotation is the default (UBEC10). Credit SBMC school account (October 2026) is retired: packages that
 * carry it load, and saving asks for a listed one.
 */
export const strategies = ['Request for quotation', 'ICB', 'NCB', 'Market survey', 'Single source/Direct contracting', 'Prequalification', 'Quality and cost based', 'Consultant Qualification', 'Least cost', 'Non-Consultancy', 'Non-Applicable'] as const;
export type InfrastructureStrategy = typeof strategies[number];
export const defaultStrategy: InfrastructureStrategy = strategies[0];
const strategyMessage = 'Choose an implementation strategy from the list';
const strategySchema = z.enum(strategies, { errorMap: () => ({ message: strategyMessage }) });
/** Whether a saved strategy is still offered (older packages may carry a retired one until it is changed). */
export const isListedStrategy = (value: string): value is InfrastructureStrategy => (strategies as readonly string[]).includes(value);
export const kindNames = { new: 'New Construction', whole: 'Whole School Renovation/Expansion', furniture: 'Furniture/Equipment' } as const;
/** New Construction models (Deliverables workbook). Whole School is sized by enrolment and has no model. */
export const modelNames = ['Model 1 · Small School', 'Model 2 · Medium School', 'Model 3 · Large School'];
export const modelFor = (enrolment: number) => enrolment <= 240 ? 0 : enrolment <= 320 ? 1 : 2;
const quantity = z.number().int().min(0).max(1000000);
// UBEC238: costs take up to four decimals (₦1,250.0202) and are totalled exactly in minor units (lib/money.ts).
const amount = z.number().min(0).max(maxUnitCost).refine(hasMoneyDecimals, moneyDecimalsMessage);
// Existing/functional stay unset until the auditor enters them (a Minimum Standard row is complete once both are set).
// additional: the auditor's own figure (unset = the calculated shortfall). extra: retired "Extra beyond standard", kept so older rows keep their totals.
const auditRow = z.object({ existing: quantity.optional(), functional: quantity.optional(), additional: quantity.optional(), extra: quantity.default(0) }).refine(v => (v.functional ?? 0) <= (v.existing ?? 0), 'Functional cannot exceed existing');
const modelIndex = z.number().int().min(0).max(2);
/** UBEC171: one block make-up as saved before 7 November 2026 (classrooms, offices and stores), repeated over the Primary/JSS classrooms. */
const blockShape = z.object({ classrooms: z.number().int().min(1, 'A block needs at least 1 classroom').max(30, 'Use at most 30 classrooms per block'), offices: z.number().int().min(0).max(10, 'Use at most 10 offices per block'), stores: z.number().int().min(0).max(10, 'Use at most 10 stores per block') });
export type ClassroomBlock = z.infer<typeof blockShape>;
/** Which classrooms a group of blocks holds (client, 7 November 2026: ECCDE classrooms are grouped too). */
export const blockClassroomTypes = ['primary', 'eccde'] as const;
export type BlockClassroomType = typeof blockClassroomTypes[number];
/**
 * UBEC171 (7 November 2026): a group of identical blocks; a kind's classrooms and toilets are shared across several groups
 * of different sizes. A block holds classrooms (Primary/JSS or ECCDE), offices, stores and toilet compartments; a block of
 * toilets alone is allowed (client: "if they are going to be grouped on their own, fine"). Groups saved before toilets and
 * ECCDE were grouped read as Primary/JSS blocks with no toilets.
 */
/**
 * UBEC252 (10 November 2026, client: "aside from classroom, office and store, include other facilities in the grouping"): rooms
 * of the Whole School audit that are built inside a block, as spaces of a building: the staff room and the Other Facilities
 * rooms (workshop, laboratories, library, ICT room, sick bay), and (client, 11 November 2026) the admin block, multipurpose hall
 * and hostel rooms. The gate house and staff quarters stay out, as does everything that is not a room (fence, water, power,
 * furniture, equipment, external works).
 * Nouns are [one, many], in the order the label lists them.
 */
export const blockFacilityNouns = {
 staffroom: ['staff room', 'staff rooms'], workshop: ['workshop', 'workshops'], scienceLab: ['science laboratory', 'science laboratories'],
 roboticsLab: ['robotic/AI laboratory', 'robotic/AI laboratories'], vocationalLab: ['vocational laboratory', 'vocational laboratories'],
 library: ['library', 'libraries'], ictRoom: ['ICT/computer room', 'ICT/computer rooms'], clinic: ['sick bay', 'sick bays'],
 adminBlock: ['admin block', 'admin blocks'], multipurposeHall: ['multipurpose hall', 'multipurpose halls'], hostel: ['hostel room', 'hostel rooms'],
} as const satisfies Record<string, readonly [string, string]>;
export type BlockFacility = keyof typeof blockFacilityNouns;
export const blockFacilityKeys = Object.keys(blockFacilityNouns) as BlockFacility[];
const isBlockFacility = (key: string): key is BlockFacility => key in blockFacilityNouns;
/** "1 staff room", "2 science laboratories". */
export const facilityText = (key: BlockFacility, n: number) => `${n} ${blockFacilityNouns[key][n === 1 ? 0 : 1]}`;
/** Other facilities one block holds, by audit key (absent on groups saved before 10 November 2026 = none). */
const blockFacilitiesShape = z.record(z.number().int().min(0).max(10, 'Use at most 10 of a facility per block'))
 .refine(f => Object.keys(f).every(isBlockFacility), 'Only rooms built inside a block can be grouped');
const blockGroupShape = z.object({
 count: z.number().int().min(1, 'Enter at least 1 block').max(100, 'Use at most 100 blocks in one group'),
 classrooms: z.number().int().min(0).max(30, 'Use at most 30 classrooms per block'),
 offices: z.number().int().min(0).max(10, 'Use at most 10 offices per block'),
 stores: z.number().int().min(0).max(10, 'Use at most 10 stores per block'),
 toilets: z.number().int().min(0).max(30, 'Use at most 30 toilets per block').default(0),
 classroomType: z.enum(blockClassroomTypes).default('primary'),
 facilities: blockFacilitiesShape.optional(),
}).refine(g => g.classrooms + g.toilets + facilityTotal(g.facilities) > 0, 'A block needs at least 1 classroom, toilet or other facility');
export type BlockGroup = z.infer<typeof blockGroupShape>;
export type BlockFacilities = Partial<Record<string, number>>;
/** Every facility in one block, added up. */
export function facilityTotal(f: BlockFacilities | undefined): number { return Object.values(f ?? {}).reduce<number>((t, n) => t + (n ?? 0), 0); }
/** A group's facilities in label order, without zeros. */
export function facilityEntries(f: BlockFacilities | undefined): [BlockFacility, number][] {
 return blockFacilityKeys.flatMap(key => (f?.[key] ?? 0) > 0 ? [[key, f![key]!] as [BlockFacility, number]] : []);
}
/** Groups of blocks, or (packages saved before 7 November 2026) one block make-up repeated over the classrooms. */
const blockGroupsShape = z.union([z.array(blockGroupShape).max(30, 'Use at most 30 groups of blocks'), blockShape]);
/** construct: the Additional (new) classrooms and toilets; renovate: the non-functional classrooms. */
export type BlockKind = 'construct' | 'renovate';
export const profileSchema = z.object({male:quantity, female:quantity, latitude:z.string().max(30).refine(v=>!v||(Number.isFinite(Number(v))&&Math.abs(Number(v))<=90),'Invalid latitude'),longitude:z.string().max(30).refine(v=>!v||(Number.isFinite(Number(v))&&Math.abs(Number(v))<=180),'Invalid longitude')});
export const maxDescriptionLength = 500;
/** Other Facilities rows a New Construction package may add (October 2026). */
export const otherFacilityKeys = new Set(requirements.filter(r => r.category === 'other').map(r => r.key));
export const packageSchema = z.object({
 kind:z.enum(['new','whole','furniture']),schoolId:z.number().int().positive(),
 components:z.array(z.enum(['ECCDE','Primary','JSS'])).min(1).max(3),
 targeting:z.enum(['hope','nonhope']).default('nonhope'),
 /** Retired classroom grouping (Standard/Storey): kept so older packages load; ignored. */
 grouping:z.enum(['standard','storey']).default('standard'),
 /** New Construction land declaration & agreement: all three must be ticked; `documented` carries the C of O / R of O / Community Agreement upload. */
 land:z.object({available:z.boolean(),documented:z.boolean(),unencumbered:z.boolean()}).default({available:false,documented:false,unencumbered:false}),
 documentIds:z.array(z.string().uuid()).max(100).default([]),
 /** Whole School photographic evidence: photo document id -> the audit row it shows (client feedback: one upload per row with non-functional units). */
 photoKeys:z.record(z.string().uuid(),z.string().max(40)).default({}).refine(p=>Object.values(p).every(k=>auditKeys.has(k)),'Unknown audit deliverable for a photo'),
 audit:z.record(auditRow).default({}).refine(a=>Object.keys(a).every(k=>auditKeys.has(k)),'Unknown audit deliverable'),
 /** Edited descriptions by requirement key (17 October 2026): New Construction rows replace the workbook text ('' = blank), Whole School rows add one. */
 /** New Construction: Other Facilities to add, by deliverable (how many; 0 or absent = not added). */
 otherFacilities:z.record(quantity).default({}).refine(o=>Object.keys(o).every(k=>otherFacilityKeys.has(k)),'Only Other Facilities can be added here'),
 descriptions:z.record(z.string().trim().max(maxDescriptionLength,`Use up to ${maxDescriptionLength} characters for a description`)).default({}).refine(d=>Object.keys(d).every(k=>describableKeys.has(k)),'Unknown requirement for a description'),
 /** New Construction: the chosen model (0-2, Model I-III). Whole School packages saved before October 2026 may carry one; it is ignored. */
 model:modelIndex.optional(),fenceRequired:quantity.default(0),fenceLength:quantity.default(0),
 prices:z.record(amount).default({}),classroomStrategy:strategySchema.default(defaultStrategy),
 /**
  * Whole School costs by item key. notCosted (client, 7 November 2026): the item is costed inside another item, so it needs no cost,
  * strategy or duration (absent = the item's default: Handwashing Station and Magnetic Board are not costed, everything else is).
  */
 packageCosts:z.record(z.object({cost:amount.default(0),strategy:strategySchema.default(defaultStrategy),duration:z.string().trim().max(100).default(''),notCosted:z.boolean().optional()})).default({}),
 lumpSum:amount.default(0),duration:z.string().trim().max(100).default(''),contingency:amount.default(0),preliminaries:amount.default(0),
 // Retired (no longer asked): kept so packages saved earlier still load.
 observations:z.string().max(5000).default(''),dilapidation:z.enum(['Minor repairs required','Moderate deterioration','Unsafe / reconstruction recommended','Severe dilapidation / major rehabilitation']).default('Minor repairs required'),conditionNotes:z.string().max(5000).default(''),
 /** UBEC171: Whole School classrooms grouped by block, for new construction and for renovation: groups of blocks of different sizes (absent = not grouped). */
 blocks:z.object({construct:blockGroupsShape.optional(),renovate:blockGroupsShape.optional()}).default({}),
 furniture:z.array(z.object({description:z.string().trim().min(1).max(500),quantity:quantity.refine(n=>n>0),cost:amount.refine(n=>n>0)})).max(100).default([]),
 /** Timeline: implementation quarters within the plan's quarters (migration 050, also the package's quarters column); omitted = the plan's quarters. */
 quarters:lineQuartersSchema.optional(),
 /** Expected start and due dates inside the timeline (migration 059, also the package's date columns); omitted = kept or the whole timeline. */
 ...lineDatesShape,
 /** UBEC254 (migration 099, also the package's target_group column): one or more target groups, joined ("ECCDE Learners, Teachers"); '' on packages saved before, asked on their next save. */
 targetGroup:targetGroupField,
});
/** UBEC254: a package names its target group(s) before it is saved (new saves and edits). */
export const targetGroupMessage = 'Choose the target group';
export const targetGroupProblem = (input: Pick<InfrastructureInput, 'targetGroup'>) => input.targetGroup ? null : targetGroupMessage;
export const landDeclarationCount = (input: Pick<InfrastructureInput, 'land'>) => Object.values(input.land ?? {}).filter(Boolean).length;
/** All three land declarations ticked (client feedback, October 2026). */
export const allLandDeclared = (input: Pick<InfrastructureInput, 'land'>) => !!input.land?.available && !!input.land?.documented && !!input.land?.unencumbered;
export type InfrastructureInput = z.infer<typeof packageSchema>;
export type SchoolProfile = z.infer<typeof profileSchema>;
export type SchoolTeachers = { male: number; female: number };
export type InfrastructureSchool = {id:number;name:string;lga:string;level:string;location:string;/** DNEMIS school code */code?:string|null;male:number;female:number;latitude:string;longitude:string;enrolmentByClass?:Record<string,{male:number;female:number}>|null;/** DNEMIS D.2 teachers (migration 044). */teachers?:SchoolTeachers|null};
export type SchoolComponent = 'ECCDE'|'Primary'|'JSS';
/** School components come from DNEMIS (level plus classes with learners); editors show them read-only. */
export function schoolComponents(school:Pick<InfrastructureSchool,'level'|'enrolmentByClass'>):SchoolComponent[] {
  const byClass=school.enrolmentByClass??{}, has=(prefix:string)=>Object.entries(byClass).some(([key,value])=>(key===prefix||key.startsWith(prefix))&&(Number(value?.male)||0)+(Number(value?.female)||0)>0);
  const level=String(school.level??'').toLowerCase();
  const found=new Set<SchoolComponent>();
  if(level.includes('eccde')||has('ECCDE'))found.add('ECCDE');
  if(level.includes('primary')||has('P'))found.add('Primary');
  if(level.includes('jss')||level.includes('junior')||has('JSS'))found.add('JSS');
  const ordered=(['ECCDE','Primary','JSS'] as const).filter(c=>found.has(c));
  return ordered.length?ordered:['Primary'];
}
/** JSS-only schools take the JSS list; every other school (Primary, ECCDE or mixed) the Primary/ECCDE list. */
export const schoolStream = (components: readonly SchoolComponent[]): SchoolStream => components.some(c => c === 'Primary' || c === 'ECCDE') ? 'primary' : 'jss';

/** Enrolment by level and teachers, the inputs of the Whole School formulas. */
export type SchoolFacts = { total: number; eccde: number; primary: number; jss: number; teachers: number | null };
/**
 * Enrolment by level from DNEMIS enrolment_by_class (ECCDE → ECCDE, P1-P6 → Primary, JSS1-3 → JSS). A school without class
 * figures counts its whole enrolment at its register level. Teachers: DNEMIS D.2 male + female (null when unknown or zero).
 */
export function schoolFacts(school: Pick<InfrastructureSchool, 'level' | 'male' | 'female' | 'enrolmentByClass' | 'teachers'>): SchoolFacts {
  const total = (Number(school.male) || 0) + (Number(school.female) || 0);
  let eccde = 0, primary = 0, jss = 0;
  for (const [key, value] of Object.entries(school.enrolmentByClass ?? {})) {
    const learners = (Number(value?.male) || 0) + (Number(value?.female) || 0);
    if (key.startsWith('ECCDE')) eccde += learners; else if (key.startsWith('JSS')) jss += learners; else if (/^P\d/.test(key)) primary += learners;
  }
  if (eccde + primary + jss === 0) {
    const level = String(school.level ?? '').toLowerCase();
    if (level.includes('eccde')) eccde = total; else if (level.includes('jss') || level.includes('junior')) jss = total; else primary = total;
  }
  const teachers = school.teachers ? (Number(school.teachers.male) || 0) + (Number(school.teachers.female) || 0) : 0;
  return { total, eccde, primary, jss, teachers: teachers > 0 ? teachers : null };
}
/** Callers that only know the total (older code paths, tests): the whole enrolment at the package's level. */
const factsFromTotal = (total: number, components: readonly SchoolComponent[]): SchoolFacts => {
  const stream = schoolStream(components), eccdeOnly = components.length === 1 && components[0] === 'ECCDE';
  return { total, eccde: eccdeOnly ? total : 0, primary: stream === 'primary' && !eccdeOnly ? total : 0, jss: stream === 'jss' ? total : 0, teachers: null };
};
export type SchoolBasis = number | SchoolFacts;
const toFacts = (school: SchoolBasis, components: readonly SchoolComponent[]) => typeof school === 'number' ? factsFromTotal(school, components) : school;
const totalOf = (school: SchoolBasis) => typeof school === 'number' ? school : school.total;

/** Rounding of every Whole School formula: always up, since a part classroom, room or compartment still has to be provided. */
const per = (n: number, d: number) => n > 0 ? Math.ceil(n / d) : 0;
const working = (label: string, n: number, d: number) => { const exact = n / d, result = per(n, d); return `${label} ${n.toLocaleString('en-NG')} ÷ ${d} = ${Number.isInteger(exact) ? result : `${Math.round(exact * 100) / 100} → ${result}`}`; };
export type WholeRequirement = { qty: number; basis: string };
/**
 * Whole School Minimum Standard quantities from enrolment (client feedback, October 2026), rounded up:
 * classrooms ECCDE ÷ 30, Primary ÷ 40, JSS ÷ 40; office = store = classrooms ÷ 3; toilets = (Primary + JSS) ÷ 20 (ECCDE blocks have their own toilets); staff room = teachers ÷ 9
 * (1 when DNEMIS has no teacher figure); magnetic boards = teachers' furniture = classrooms. From the workbook remarks: dual desks 20 per
 * Primary/JSS classroom, ECCDE furniture 6 per ECCDE classroom, storage 1 per classroom, office and staff room. Everything else keeps the
 * workbook's fixed minimum standard. The fence is entered (input.fenceRequired).
 */
export function wholeRequirements(facts: SchoolFacts, stream: SchoolStream): Record<string, WholeRequirement> {
  const priRooms = per(facts.primary, 40) + per(facts.jss, 40);
  const eccdeRooms = stream === 'primary' ? per(facts.eccde, 30) : 0;
  const classrooms = priRooms + eccdeRooms, offices = per(classrooms, 3);
  const staffrooms = facts.teachers ? per(facts.teachers, 9) : 1;
  // ECCDE learners use the ECCDE block's own toilets, so the toilet blocks serve Primary and JSS only.
  const toiletLearners = facts.primary + facts.jss;
  const priBasis = facts.primary > 0 && facts.jss > 0 ? `${working('Primary', facts.primary, 40)}; ${working('JSS', facts.jss, 40)}; together ${priRooms}` : facts.jss > 0 ? working('JSS enrolment', facts.jss, 40) : working('Primary enrolment', facts.primary, 40);
  const rooms = `${classrooms} classroom${classrooms === 1 ? '' : 's'}`;
  const need: Record<string, WholeRequirement> = {
    classroomPri: { qty: priRooms, basis: `${priBasis}. 40 learners per classroom.` },
    classroomEccde: { qty: eccdeRooms, basis: `${working('ECCDE enrolment', facts.eccde, 30)}. 30 learners per classroom.` },
    office: { qty: offices, basis: `${working('Classrooms', classrooms, 3)}. One office for every 3 classrooms.` },
    store: { qty: offices, basis: `${working('Classrooms', classrooms, 3)}. One store for every 3 classrooms.` },
    toilet: { qty: per(toiletLearners, 20), basis: `${working('Primary and JSS enrolment', toiletLearners, 20)}. One compartment for every 20 learners; ECCDE learners use the ECCDE block's own toilets.` },
    staffroom: { qty: staffrooms, basis: facts.teachers ? `${working('Teachers', facts.teachers, 9)}. One staff room for every 9 teachers.` : 'DNEMIS has no teacher figure for this school: 1 staff room' },
    eccdeFurniture: { qty: eccdeRooms * 6, basis: `6 sets per ECCDE classroom × ${eccdeRooms}.` },
    dualDesk: { qty: priRooms * 20, basis: `20 sets per Primary/JSS classroom × ${priRooms}.` },
    magneticBoard: { qty: classrooms, basis: `One per classroom: ${rooms}.` },
    teachersFurniture: { qty: classrooms, basis: `One set per classroom: ${rooms}.` },
    storageShelf: { qty: classrooms + offices + staffrooms, basis: `One in each classroom, office and staff room: ${classrooms} + ${offices} + ${staffrooms}.` },
  };
  for (const r of requirements) if (r.category === 'minimum' && !need[r.key]) need[r.key] = { qty: r.qty[0], basis: r.key === 'solarPower' ? `${classrooms <= 11 ? solarKva[0] : solarKva[2]} KVA (10 KVA above 11 classrooms).` : r.tick ? 'Required for every school' : `${r.qty[0]} ${r.unit} for every school.` };
  return need;
}
/** The Primary/JSS classroom row is named after the school's learners. */
const classroomLabel = (facts: SchoolFacts, stream: SchoolStream) => facts.primary > 0 && facts.jss > 0 ? 'Classroom · Primary & JSS' : stream === 'jss' || (facts.jss > 0 && facts.primary === 0) ? 'Classroom · JSS' : 'Classroom · Primary';

export type InfraDocument = {id:string;kind:'drawings'|'boq'|'survey'|'land'|'land_area'|'photo'|'supporting';name:string;size:number;schoolId?:number|null;schoolName?:string|null};
export type PackageItem = {key:string;label:string;quantity:number;unit:string;lump:boolean;cost:number;total:number;strategy:string;duration:string;operation?:string;/** UBEC171: how the classrooms and toilets are grouped into blocks, or the offices/stores/toilets the blocks already hold. */grouping?:string;/** Not costed (7 November 2026): listed with its quantity but costed inside another item, ₦0. */notCosted?:boolean;/** Results saved on 7 November 2026 before Costed / Not costed: the provision note (not costed). */provision?:string;/** A Whole School block item (one per group of blocks): what one block holds. */block?:BlockItemMakeup;/** Packages calculated since 17 October 2026; older ones fall back to the workbook text. */description?:string};
/** A row's description: the edited one, else (New Construction) the workbook text; Whole School rows have none until one is entered. */
export const requirementDescription=(input:Pick<InfrastructureInput,'kind'|'descriptions'>,key:string,model:number)=>input.descriptions?.[key]??(input.kind==='new'?deliverableDescription(key,model):'');
/** What one block of a block item holds (deliverables count from it). */
export type BlockItemMakeup = { kind: BlockKind; classroomType: BlockClassroomType; classrooms: number; offices: number; stores: number; toilets: number; /** UBEC252: other facilities in one block (absent = none). */facilities?: Partial<Record<BlockFacility, number>> };
/** How a Not costed item reads wherever it is shown (costing step, package details, workbook, UBEC). */
export const notCostedNote = 'Not costed · included in another item’s cost';
/** Whether a result item has no cost of its own: Not costed, or a provision of a result saved before the choice existed. */
export const isNotCostedItem = (item: Pick<PackageItem, 'notCosted' | 'provision'>) => !!item.notCosted || !!item.provision;
/** The item's operation as shown: a Not costed item says so; toilets saved before October 2026 stored "Supply / installation". */
export const itemOperation=(item:Pick<PackageItem,'key'|'operation'>&{provision?:string;notCosted?:boolean})=>item.notCosted?notCostedNote:item.provision?item.provision:item.key==='toilet'&&item.operation==='Supply / installation'?'Supply / New Construction':item.operation;
export type InfrastructureResult = ReturnType<typeof calculateInfrastructure>;
export type InfrastructurePackage = {id:number;/** The client key the package was created with (migration 058), null for older packages. */client_key?:string|null;/** Reference code (migration 053), e.g. UBEC/SUBEB/INFRA/007/2026 · Q1–Q4. */code?:string;version:number;kind:InfrastructureInput['kind'];input:InfrastructureInput;result:InfrastructureResult;school:InfrastructureSchool;total_cost:string;
 /** Timeline (infrastructure_packages.quarters, migration 050): authoritative over input.quarters, which packages saved earlier lack. */
 quarters?:number[];
 /** Expected start and due dates (migration 059, YYYY-MM-DD): authoritative over input.startDate/dueDate; null on packages saved before. */
 start_date?:string|null;due_date?:string|null;
 /** UBEC254 (migration 099): authoritative over input.targetGroup; '' on packages saved before. */
 target_group?:string};
// Exact money: naira ⇄ minor units (1/10,000 naira, lib/money.ts).
const units = (n:number) => minorOfNumber(n);
const money = (n:number) => Math.round(n)/MONEY_SCALE_NUMBER;
/** The model a New Construction package is built to: the chosen one, else (older packages) the one enrolment suggests. */
export const packageModel=(input:Pick<InfrastructureInput,'kind'|'model'>,enrolment:number)=>input.kind==='new'&&input.model!==undefined?input.model:modelFor(enrolment);
/** Classroom block rows per model (no block of 3, client feedback October 2026). */
export const classroomBlocks=(model:number)=>model===0?[{key:'classBlock6',label:'Block of 6 classrooms with office and store',count:1}]:model===1?[{key:'classBlock9',label:'Block of 9 classrooms with 2 offices and 2 stores',count:1}]:[{key:'classBlock6',label:'Block of 6 classrooms with office and store',count:2}];
/** The ECCDE block a model builds (UBEC67): the Small School model has 1 ECCDE classroom, the others 2. */
export const eccdeBlockFor=(model:number)=>model===0?{key:'eccdeBlock1',label:'ECCDE block · 1 classroom, nanny station and sleeping bay'}:{key:'eccdeBlock',label:'ECCDE block · 2 classrooms, nanny station and sleeping bay'};
/** One-line summary of a model's standard, for the model choice. */
export const modelSummary=(model:number,stream:SchoolStream='primary')=>{const qty=(key:string)=>requirements.find(r=>r.key===key)?.qty[model]??0;return `${qty('classroomPri')+(stream==='primary'?qty('classroomEccde'):0)} classrooms · ${qty('dualDesk')} dual desks · ${qty('toilet')} toilets`;};
/** New Construction rows a model and list ask for, before costing (classroom blocks, ECCDE block, the Minimum Standard rows and the fence). */
export function newConstructionRows(model:number,stream:SchoolStream,fenceLength:number){
 const rows:{key:string;label:string;quantity:number;unit:string;lump:boolean}[]=classroomBlocks(model).map(b=>({key:b.key,label:b.label,quantity:b.count,unit:'blocks',lump:true}));
 if(stream==='primary')rows.push({...eccdeBlockFor(model),quantity:1,unit:'block',lump:true});
 for(const r of requirements.filter(r=>r.category==='minimum'&&!['classroomPri','classroomEccde','office','store'].includes(r.key)&&r.qty[model]>0&&appliesToStream(r.key,stream)))rows.push({key:r.key,label:r.label+(r.key==='solarPower'?` · ${solarKva[model]} KVA`:''),quantity:r.qty[model],unit:r.unit,lump:!!r.lump});
 rows.push({key:'fence',label:'Perimeter wall fence with concertina security wire',quantity:fenceLength,unit:'metres',lump:false});
 return rows;
}
/**
 * Rows whose non-functional units are renovated: civil works, and toilets (UBEC255, 11 November 2026: "11 required, 11
 * existing, 5 functional": the 6 non-functional are renovated, not built again). For these the shortfall is required − existing.
 */
// UBEC255: toilets; UBEC252 (client, 11 November 2026): a non-functional staff room is renovated too, so it can go in renovation blocks.
const renovatable=(r:{key:string;civil?:boolean})=>!!r.civil||r.key==='toilet'||r.key==='staffroom';
export type AuditGap=ReturnType<typeof auditGaps>[number];
/** Whole School audit rows: requirements from enrolment (wholeRequirements), what the auditor entered, and what is to be built. */
export function auditGaps(input:InfrastructureInput, school:SchoolBasis) {
 const facts=toFacts(school,input.components),stream=schoolStream(input.components),need=wholeRequirements(facts,stream);
 const fence={...fenceDeliverable,qty:[0,0,0],lump:false,renovates:renovatable(fenceDeliverable),block:undefined as number|undefined,standard:undefined as [string,string,string]|undefined};
 return [...requirements.map(r=>({...r,civil:!!r.civil,lump:!!r.lump,tick:!!r.tick,renovates:renovatable(r)})),fence].filter(r=>appliesToStream(r.key,stream)).map(r=>{
  const stored=input.audit[r.key];
  const existing=stored?.existing??0,functional=stored?.functional??0,extra=stored?.extra??0;
  const category:DeliverableCategory=r.category;
  const required=category==='other'?0:r.key==='fence'?input.fenceRequired:need[r.key]?.qty??0;
  // Calculated shortfall; a retired "Extra beyond standard" figure is added so older packages keep their totals.
  const calculated=Math.max(0,required-(r.renovates?existing:functional))+extra;
  const additional=stored?.additional??calculated;
  return {...r,label:r.key==='classroomPri'?classroomLabel(facts,stream):r.label,category,existing,functional,extra,entered:{existing:stored?.existing!==undefined,functional:stored?.functional!==undefined,additional:stored?.additional!==undefined},
   /** Other Facilities count only once something is entered. */
   included:category==='minimum'||!!stored,
   standard:category==='other'?'':r.key==='fence'?'Metres of fence the site needs':need[r.key]?.basis??'',required,nonFunctional:Math.max(0,existing-functional),calculated,additional,toBuild:additional};
 });
}
/** Why one audit row is incomplete or invalid (null when fine). Minimum Standard rows need existing and functional; Other Facilities are optional. */
export function auditRowProblem(gap:AuditGap,input:Pick<InfrastructureInput,'fenceRequired'>):string|null{
 if(gap.category==='minimum'){
  if(gap.key==='fence'&&input.fenceRequired<=0)return 'Enter the fence length required (metres)';
  if(!gap.entered.existing&&!gap.entered.functional)return 'Enter existing and functional';
  if(!gap.entered.existing)return 'Enter existing';
  if(!gap.entered.functional)return 'Enter functional';
 }else if(gap.entered.functional&&!gap.entered.existing)return 'Enter existing too';
 return gap.functional>gap.existing?'Functional cannot exceed existing':null;
}
/** The first Minimum Standard (or invalid Other Facilities) row that blocks a Whole School package. */
export function wholeAuditProblem(input:InfrastructureInput,school:SchoolBasis):string|null{
 if(input.kind!=='whole')return null;
 for(const gap of auditGaps(input,school)){const problem=auditRowProblem(gap,input);if(problem)return `${gap.label}: ${problem.charAt(0).toLowerCase()+problem.slice(1)}`;}
 return null;
}
export const minimumAuditCount=(input:InfrastructureInput,school:SchoolBasis)=>{const rows=auditGaps(input,school).filter(g=>g.category==='minimum');return {complete:rows.filter(g=>!auditRowProblem(g,input)).length,total:rows.length};};
/** Rows that need photographic evidence: every audit row with non-functional units (client feedback: per item). */
export const photoRows=(gaps:AuditGap[])=>gaps.filter(g=>g.included&&g.nonFunctional>0);
/** Photo ids attached to a package for one audit row. Photos attached before per-row evidence (no row) count for the Primary/JSS classroom row, as the old rule did. */
export function rowPhotoIds(input:Pick<InfrastructureInput,'photoKeys'|'documentIds'>,photoIds:readonly string[],key:string):string[]{
 const attached=new Set(input.documentIds);
 return photoIds.filter(id=>attached.has(id)&&(input.photoKeys?.[id]===key||(key==='classroomPri'&&!input.photoKeys?.[id])));
}
/** The first row with non-functional units but no photo of its own, as a message (used only while the Supporting documents setting is Required). */
export function photoEvidenceProblem(input:InfrastructureInput,gaps:AuditGap[],photoIds:readonly string[]):string|null{
 if(input.kind!=='whole')return null;
 const missing=photoRows(gaps).find(g=>!rowPhotoIds(input,photoIds,g.key).length);
 return missing?`Attach photographic evidence for ${missing.label}: non-functional units are recorded`:null;
}
/** What a kind of block grouping must hold: Primary/JSS classrooms, ECCDE classrooms and toilet compartments. */
export type BlockCounts = { classrooms: number; eccde: number; toilets: number };
export type BlockGrouping = { counts: BlockCounts; grouped: BlockCounts; left: BlockCounts; blocks: number; offices: number; stores: number; /** Toilets inside blocks that also hold classrooms (they come off the Toilet row). */toiletsWithClassrooms: number; /** UBEC252: other facilities the blocks hold, in all, by audit key. */facilities: Partial<Record<BlockFacility, number>>; groups: BlockGroup[] };
/** A group as stored: groups saved before 7 November 2026 have no toilets or classroom type. */
type StoredGroup = Omit<BlockGroup, 'toilets' | 'classroomType'> & Partial<Pick<BlockGroup, 'toilets' | 'classroomType'>>;
type StoredBlocks = StoredGroup[] | ClassroomBlock | undefined;
const noCounts: BlockCounts = { classrooms: 0, eccde: 0, toilets: 0 };
const countsOf = (counts: number | BlockCounts): BlockCounts => typeof counts === 'number' ? { ...noCounts, classrooms: counts } : counts;
const fullGroup = (g: StoredGroup): BlockGroup => ({ ...g, toilets: g.toilets ?? 0, classroomType: g.classroomType ?? 'primary' });
/** The groups of blocks stored for a kind. A single make-up saved before 7 November 2026 becomes its full blocks plus one smaller block for the Primary/JSS classrooms left over. */
export function toBlockGroups(classrooms: number, stored: StoredBlocks): BlockGroup[] {
 if (!stored) return [];
 if (Array.isArray(stored)) return stored.map(fullGroup);
 if (classrooms <= 0) return [];
 const full = Math.floor(classrooms / stored.classrooms), remainder = classrooms % stored.classrooms;
 return [...(full ? [{ ...stored, count: full }] : []), ...(remainder ? [{ ...stored, classrooms: remainder, count: 1 }] : [])].map(fullGroup);
}
/** What a list of groups holds. */
export function groupedCounts(groups: readonly BlockGroup[]): BlockCounts {
 return groups.reduce((t, g) => ({ classrooms: t.classrooms + (g.classroomType === 'eccde' ? 0 : g.count * g.classrooms), eccde: t.eccde + (g.classroomType === 'eccde' ? g.count * g.classrooms : 0), toilets: t.toilets + g.count * g.toilets }), noCounts);
}
/** Classrooms and toilets shared into groups of blocks; null when not grouped or nothing to group. A number means Primary/JSS classrooms only. */
export function groupIntoBlocks(counts: number | BlockCounts, stored: StoredBlocks): BlockGrouping | null {
 const need = countsOf(counts);
 const groups = toBlockGroups(need.classrooms, stored);
 if (!groups.length || need.classrooms + need.eccde + need.toilets <= 0) return null;
 const sum = (pick: (g: BlockGroup) => number) => groups.reduce((total, g) => total + g.count * pick(g), 0);
 const grouped = groupedCounts(groups);
 return { counts: need, grouped, left: { classrooms: need.classrooms - grouped.classrooms, eccde: need.eccde - grouped.eccde, toilets: need.toilets - grouped.toilets },
  blocks: sum(() => 1), offices: sum(g => g.offices), stores: sum(g => g.stores), toiletsWithClassrooms: sum(g => g.classrooms > 0 ? g.toilets : 0), facilities: groupedFacilities(groups), groups };
}
/** Other facilities a list of groups holds, in all (blocks × per block). */
export function groupedFacilities(groups: readonly BlockGroup[]): Partial<Record<BlockFacility, number>> {
 const total: Partial<Record<BlockFacility, number>> = {};
 for (const g of groups) for (const [key, n] of facilityEntries(g.facilities)) total[key] = (total[key] ?? 0) + g.count * n;
 return total;
}
const plural = (n: number, one: string) => `${n} ${n === 1 ? one : one + 's'}`;
/** "6 classrooms, 1 office, 1 store, 4 toilets" (ECCDE: "2 ECCDE classrooms, 2 toilets"). */
type MakeupInput = Pick<BlockGroup, 'classrooms' | 'offices' | 'stores'> & Partial<Pick<BlockGroup, 'toilets' | 'classroomType' | 'facilities'>>;
/** Offices, stores and other facilities of one block ("1 office, 1 store, 1 staff room"). */
const roomParts = (g: MakeupInput) => [g.offices ? plural(g.offices, 'office') : '', g.stores ? plural(g.stores, 'store') : '', ...facilityEntries(g.facilities).map(([key, n]) => facilityText(key, n))].filter(Boolean);
/** "6 classrooms, 1 office, 1 store, 1 staff room, 4 toilets" (ECCDE: "2 ECCDE classrooms, 2 toilets"). */
export const blockMakeup = (g: MakeupInput) =>
 [g.classrooms ? plural(g.classrooms, g.classroomType === 'eccde' ? 'ECCDE classroom' : 'classroom') : '', ...roomParts(g), g.toilets ? plural(g.toilets, 'toilet') : ''].filter(Boolean).join(', ');
/** Toilets without classrooms read as a toilet block ("Toilet block of 6 compartments, 1 store"). */
const isToiletBlock = (g: MakeupInput) => !g.classrooms && (g.toilets ?? 0) > 0;
const toiletBlockMakeup = (g: MakeupInput) => [plural(g.toilets ?? 0, 'compartment'), ...roomParts(g)].join(', ');
/** "2 blocks of 6 classrooms, 1 office, 1 store, 4 toilets" for one group; a block of toilets alone reads "1 toilet block of 6 compartments". */
export const blockGroupText = (g: BlockGroup) => isToiletBlock(g) ? `${plural(g.count, 'toilet block')} of ${toiletBlockMakeup(g)}` : `${plural(g.count, 'block')} of ${blockMakeup(g)}`;
/** "4 classrooms, 2 toilets" still to place, or '' when nothing is left. */
const leftText = (left: BlockCounts) => [left.classrooms > 0 ? plural(left.classrooms, 'classroom') : '', left.eccde > 0 ? plural(left.eccde, 'ECCDE classroom') : '', left.toilets > 0 ? plural(left.toilets, 'toilet') : ''].filter(Boolean).join(', ');
/** Every group of a kind, plus what is not in a block yet. */
export function blockGroupingText(g: BlockGrouping): string {
 const text = g.groups.map(blockGroupText).join('; '), left = leftText(g.left);
 return left ? `${text} · ${left} not in a block yet` : text;
}
/**
 * What a Whole School package builds (Additional) and renovates (non-functional), the counts block grouping draws from:
 * Primary/JSS classrooms, ECCDE classrooms and toilets. Non-functional toilets are renovated like classrooms (UBEC255).
 */
export function classroomBlockCounts(input: InfrastructureInput, school: SchoolBasis): Record<BlockKind, BlockCounts> {
 if (input.kind !== 'whole') return { construct: noCounts, renovate: noCounts };
 const gaps = auditGaps(input, school), row = (key: string) => gaps.find(g => g.key === key);
 const renovate = (key: string) => { const g = row(key); return g?.renovates ? g.nonFunctional : 0; };
 return {
  construct: { classrooms: row('classroomPri')?.toBuild ?? 0, eccde: row('classroomEccde')?.toBuild ?? 0, toilets: row('toilet')?.toBuild ?? 0 },
  renovate: { classrooms: renovate('classroomPri'), eccde: renovate('classroomEccde'), toilets: renovate('toilet') },
 };
}
/**
 * UBEC252: the other facilities a kind may put in its blocks, with how many there are: new ones (Additional) for construction,
 * non-functional rooms for renovation (the staff room too, since 11 November 2026).
 */
export function blockFacilityCounts(input: InfrastructureInput, school: SchoolBasis): Record<BlockKind, Partial<Record<BlockFacility, number>>> {
 const out: Record<BlockKind, Partial<Record<BlockFacility, number>>> = { construct: {}, renovate: {} };
 if (input.kind !== 'whole') return out;
 for (const gap of auditGaps(input, school)) {
  if (!isBlockFacility(gap.key) || !gap.included) continue;
  if (gap.toBuild > 0) out.construct[gap.key] = gap.toBuild;
  if (gap.renovates && gap.nonFunctional > 0) out.renovate[gap.key] = gap.nonFunctional;
 }
 return out;
}
/** UBEC252 (client, 11 November 2026): offices and stores in blocks are limited to the audit too: Additional to build, non-functional to renovate. */
export function blockRoomCounts(input: InfrastructureInput, school: SchoolBasis): Record<BlockKind, { offices: number; stores: number }> {
 if (input.kind !== 'whole') return { construct: { offices: 0, stores: 0 }, renovate: { offices: 0, stores: 0 } };
 const gaps = auditGaps(input, school), row = (key: string) => gaps.find(g => g.key === key);
 const built = (key: string) => row(key)?.toBuild ?? 0, renovated = (key: string) => { const g = row(key); return g?.renovates ? g.nonFunctional : 0; };
 return { construct: { offices: built('office'), stores: built('store') }, renovate: { offices: renovated('office'), stores: renovated('store') } };
}
/** Whether a kind has anything to group. */
export const hasBlockCounts = (c: BlockCounts) => c.classrooms + c.eccde + c.toilets > 0;
/** Blocks for each kind (null when not grouped or nothing to group). */
export function classroomGroupings(input: InfrastructureInput, school: SchoolBasis): Record<BlockKind, BlockGrouping | null> {
 const counts = classroomBlockCounts(input, school);
 return { construct: groupIntoBlocks(counts.construct, input.blocks?.construct), renovate: groupIntoBlocks(counts.renovate, input.blocks?.renovate) };
}
const blockVerb: Record<BlockKind, [string, string]> = { construct: ['build', 'built'], renovate: ['renovate', 'renovated'] };
const blockParts = [['classrooms', 'classroom'], ['eccde', 'ECCDE classroom'], ['toilets', 'toilet']] as const;
/** A grouped kind must place every Primary/JSS classroom, ECCDE classroom and toilet in a block, and no more (UBEC171): checked on Continue and on save. */
export function blockGroupingProblem(input: InfrastructureInput, school: SchoolBasis): string | null {
 const groupings = classroomGroupings(input, school);
 for (const kind of ['construct', 'renovate'] as const) {
  const g = groupings[kind];
  if (!g) continue;
  const [verb, done] = blockVerb[kind];
  for (const [part, one] of blockParts) {
   if (g.left[part] < 0) return `The blocks to ${verb} hold ${plural(g.grouped[part], one)}, but only ${g.counts[part]} ${g.counts[part] === 1 ? 'is' : 'are'} to be ${done}. Remove or change a group of blocks`;
   if (g.left[part] > 0) return `Put all ${plural(g.counts[part], one)} to ${verb} into blocks: ${plural(g.left[part], one)} left`;
  }
  // UBEC252: offices, stores and other facilities are optional in blocks, but never more than the audit has to build or renovate.
  const rooms = blockRoomCounts(input, school)[kind];
  for (const [part, one] of [['offices', 'office'], ['stores', 'store']] as const) {
   if (g[part] > rooms[part]) return `The blocks to ${verb} hold ${plural(g[part], one)}, but ${rooms[part] > 0 ? `only ${rooms[part]} ${rooms[part] === 1 ? 'is' : 'are'}` : 'none are'} to be ${done}. Remove or change a group of blocks`;
  }
  const available = blockFacilityCounts(input, school)[kind];
  for (const [key, held] of Object.entries(g.facilities) as [BlockFacility, number][]) {
   const max = available[key] ?? 0;
   if (held > max) return `The blocks to ${verb} hold ${facilityText(key, held)}, but ${max > 0 ? `only ${max} ${max === 1 ? 'is' : 'are'}` : 'none are'} to be ${done}. Remove or change a group of blocks`;
  }
 }
 return null;
}
/**
 * Costed / Not costed (client, 7 November 2026): every Whole School cost item may be marked Not costed when its cost is part of
 * another item (no cost, strategy or duration; ₦0). Handwashing stations (with the solar borehole) and magnetic boards (with the
 * classroom works) start Not costed; every other item starts Costed. The choice is stored as packageCosts[key].notCosted.
 */
export const notCostedByDefault = new Set(['handwashing', 'magneticBoard']);
const costBaseKey = (key: string) => key.replace(/-(renovate|construct)$/, '');
/** Whether a Whole School item is Not costed: the stored choice, else its default. */
export const isNotCosted = (input: Pick<InfrastructureInput, 'packageCosts'>, key: string) => input.packageCosts?.[key]?.notCosted ?? notCostedByDefault.has(costBaseKey(key));
/**
 * Block items (client, 7 November 2026: "after grouping, what has been grouped is what the cost item will now be"): the stable key of
 * one group of blocks, from its kind and make-up, so changing a group's make-up asks for its cost again while changing only how many
 * blocks keeps the cost per block. A second group with the same make-up gets "-2".
 */
// UBEC252: other facilities join the key ("_staffroom1_library1"), so a group without any keeps its earlier key.
const blockKeyBase = (kind: BlockKind, g: BlockGroup) => `block-${kind}-${g.classroomType === 'eccde' ? 'e' : 'p'}${g.classrooms}c${g.offices}o${g.stores}s${g.toilets}t${facilityEntries(g.facilities).map(([key, n]) => `_${key}${n}`).join('')}`;
export const isBlockItemKey = (key: string) => /^block-(construct|renovate)-/.test(key);
/** The block items of a kind's groups, with their keys and labels ("Block of 6 classrooms, 1 office, 1 store"). */
export function blockItems(kind: BlockKind, groups: readonly BlockGroup[]): { key: string; label: string; group: BlockGroup }[] {
 const seen = new Map<string, number>();
 return groups.map(group => {
  const base = blockKeyBase(kind, group), n = (seen.get(base) ?? 0) + 1;
  seen.set(base, n);
  const label = isToiletBlock(group) ? `Toilet block of ${toiletBlockMakeup(group)}` : `Block of ${blockMakeup(group)}`;
  return { key: n === 1 ? base : `${base}-${n}`, label, group };
 });
}
/** Drops the costs of groups of blocks that no longer exist (after a grouping changes), so the Costing step asks for them again. */
export function pruneBlockCosts(input: InfrastructureInput, school: SchoolBasis): InfrastructureInput['packageCosts'] {
 const groupings = classroomGroupings(input, school);
 const live = new Set((['construct', 'renovate'] as const).flatMap(kind => blockItems(kind, groupings[kind]?.groups ?? []).map(b => b.key)));
 return Object.fromEntries(Object.entries(input.packageCosts ?? {}).filter(([key]) => !isBlockItemKey(key) || live.has(key)));
}
export function calculateInfrastructure(input:InfrastructureInput,school:SchoolBasis) {
 const enrolment=totalOf(school),facts=toFacts(school,input.components),stream=schoolStream(input.components);
 const model=packageModel(input,enrolment),items:PackageItem[]=[];
 let classroomSubtotal=0,otherSubtotal=0,vat=0;
 function add(key:string,label:string,quantity:number,unit:string,lump:boolean,cost:number,strategy:string=defaultStrategy,duration='',operation?:string,description?:string){
  const total=money(units(cost)*(lump?1:quantity));
  items.push({key,label,quantity,unit,lump,cost,total,strategy,duration,operation,description});return total;
 }
 if(input.kind==='furniture') input.furniture.forEach((r,i)=>add('furniture-'+i,r.description,r.quantity,'units',false,r.cost,'',''));
 const groupings=classroomGroupings(input,facts);
 // Costed / Not costed: a Not costed item keeps its quantity at ₦0 with no strategy or duration.
 const addCosted=(key:string,label:string,qty:number,unit:string,lump:boolean,operation:string,description?:string,extra?:Partial<PackageItem>)=>{
  if(isNotCosted(input,key)){items.push({key,label,quantity:qty,unit,lump,cost:0,total:0,strategy:'',duration:'',operation,notCosted:true,description,...extra});return;}
  const price=input.packageCosts[key];add(key,label,qty,unit,lump,price?.cost??0,price?.strategy??defaultStrategy,price?.duration??'',operation,description);
  if(extra)items[items.length-1]={...items[items.length-1],...extra};
 };
 if(input.kind==='whole'){
  // UBEC171 + costing (7 November 2026): each group of blocks is one cost item, costed per block (unit cost × blocks).
  for(const kind of ['construct','renovate'] as const)for(const b of blockItems(kind,groupings[kind]?.groups??[]))
   addCosted(b.key,b.label,b.group.count,'blocks',false,kind==='construct'?'New construction':'Renovation',undefined,{block:{kind,classroomType:b.group.classroomType,classrooms:b.group.classrooms,offices:b.group.offices,stores:b.group.stores,toilets:b.group.toilets,...(facilityTotal(b.group.facilities)>0?{facilities:Object.fromEntries(facilityEntries(b.group.facilities))}:{})}});
 }
 if(input.kind==='whole') for(const gap of auditGaps(input,facts)){
  const addGap=(key:string,operation:string,qty:number,lump:boolean,unit=gap.unit,grouping?:string)=>addCosted(key,gap.label,qty,unit,lump,operation,requirementDescription(input,gap.key,model),grouping?{grouping}:undefined);
  // Classrooms, toilets, offices and stores in blocks are costed in their block items, so they come off their own rows; offices
  // and stores left outside the blocks stay on their rows.
  // UBEC252: so do the other facilities (staff rooms, laboratories, library…) the blocks hold.
  const facility=isBlockFacility(gap.key)?gap.key:null;
  const inBlocks=(kind:BlockKind)=>{const g=groupings[kind];return !g?0:facility?g.facilities[facility]??0:gap.key==='classroomPri'?g.grouped.classrooms:gap.key==='classroomEccde'?g.grouped.eccde:gap.key==='office'?g.offices:gap.key==='store'?g.stores:gap.key==='toilet'?g.grouped.toilets:0;};
  const blockNote=(kind:BlockKind)=>{
   const held=inBlocks(kind);if(!held)return undefined;
   const text=facility?facilityText(facility,held):plural(held,gap.key==='classroomEccde'?'ECCDE classroom':gap.key==='classroomPri'?'classroom':gap.key);
   return `${text} ${held===1?'is':'are'} in the blocks`;
  };
  const renovate=Math.max(0,gap.nonFunctional-inBlocks('renovate')),construct=Math.max(0,gap.toBuild-inBlocks('construct'));
  if(gap.renovates&&renovate>0)addGap(gap.key+'-renovate','Renovation',renovate,true,gap.unit,blockNote('renovate'));
  // New ECCDE classrooms are built as ECCDE blocks of 2 classrooms, unless the new classrooms are grouped by block (their block
  // items then hold them). Toilets read "Supply / New Construction" (October 2026).
  const eccdePairs=gap.key==='classroomEccde'&&!groupings.construct;
  if(construct>0)addGap(gap.civil?gap.key+'-construct':gap.key,gap.civil?'New construction':gap.key==='toilet'?'Supply / New Construction':'Supply / installation',eccdePairs?Math.ceil(construct/2):construct,!!(gap.civil||gap.lump),eccdePairs?'blocks':gap.unit,gap.civil||gap.key==='toilet'||facility?blockNote('construct'):undefined);
 }
 if(input.kind==='new'){
  const price=(key:string)=>input.targeting==='hope'?input.prices[key]??0:0;
  for(const row of newConstructionRows(model,stream,input.fenceLength)){
   const total=add(row.key,row.label,row.quantity,row.unit,row.lump,price(row.key),row.key.startsWith('classBlock')?input.classroomStrategy:defaultStrategy,'',undefined,requirementDescription(input,row.key,model));
   if(row.key.startsWith('classBlock'))classroomSubtotal+=total;else otherSubtotal+=total;
  }
  // Other facilities the package adds (October 2026), listed with the model's rows; HOPE prices them like the others.
  for(const r of requirements.filter(r=>r.category==='other'&&(input.otherFacilities?.[r.key]??0)>0))otherSubtotal+=add(r.key,r.label,input.otherFacilities[r.key],r.unit,!!(r.civil||r.lump),price(r.key),defaultStrategy,'',undefined,requirementDescription(input,r.key,model));
  if(input.targeting==='nonhope')add('package','Complete construction package',1,'lot',true,input.lumpSum,input.classroomStrategy,input.duration,undefined,requirementDescription(input,'package',model));
  else{
   otherSubtotal+=add('contingency','Contingency',1,'lot',true,input.contingency,'—');
   otherSubtotal+=add('preliminaries','Preliminaries',1,'lot',true,input.preliminaries,'—');
   // VAT stays rounded to the kobo, as before (a share, like the allocations).
   const kobo=MONEY_SCALE_NUMBER/100;
   vat=money(Math.round((units(otherSubtotal)+(input.classroomStrategy==='NCB'?units(classroomSubtotal):0))*75/1000/kobo)*kobo);
   add('vat','VAT (7.5%)',1,'lot',true,vat,'—');
  }
 }
 const total=money(items.reduce((sum,item)=>sum+units(item.total),0));
 // Only New Construction has a model; Whole School records the enrolment basis of its formulas instead.
 return {model,modelLabel:input.kind==='new'?modelNames[model]:'',enrolment,...(input.kind==='whole'?{basis:{eccde:facts.eccde,primary:facts.primary,jss:facts.jss,teachers:facts.teachers}}:{}),items,classroomSubtotal,otherSubtotal,vat,total};
}
/** Why a package cannot be saved (null when it can). Land documents and photos are checked where the documents are known (API and editor). */
export function packageProblem(input:InfrastructureInput,school:SchoolBasis){
 const enrolment=totalOf(school);
 if(enrolment<=0&&input.kind!=='furniture')return 'Record the school’s enrolment before creating its package';
 if(input.kind==='new'&&!allLandDeclared(input))return 'Tick all three land declarations';
 if(input.kind==='new'&&input.model===undefined)return 'Choose the school model';
 if(input.kind==='new'&&input.fenceLength<=0)return 'Enter the perimeter fence length (metres)';
 const auditProblem=wholeAuditProblem(input,school);if(auditProblem)return auditProblem;
 const groupingProblem=input.kind==='whole'?blockGroupingProblem(input,school):null;if(groupingProblem)return groupingProblem;
 const result=calculateInfrastructure(input,school);
 if(!result.items.length||result.total<=0)return 'Add and cost the required items before saving';
 if(!Number.isSafeInteger(units(result.total)))return 'The package total is too large';
 if(input.kind==='whole'&&result.items.some(i=>!isNotCostedItem(i)&&(i.cost<=0||!i.duration)))return 'Enter a cost and duration for each Costed item, or mark it Not costed';
 if(input.kind==='new'&&input.targeting==='nonhope'&&!input.duration)return 'Enter the construction duration';
 return null;
}
/** Land documents (C of O, R of O or Community Agreement) a New Construction package needs: at least one, for declaration 2. */
/** New Construction land uploads, both always required: the evidence that the land is available (`land_area`, October 2026) and the C of O / R of O / Community Agreement (`land`). */
export const landDocumentProblem=(input:Pick<InfrastructureInput,'kind'|'land'>,attached:{land:number;landArea:number})=>input.kind!=='new'?null:attached.landArea<1?'Attach the document showing the land required for this model is available':attached.land<1?'Attach the C of O, R of O or Community Agreement document':null;
/** UBEC230: a New Construction package needs the school's drawings (at least one), always, whatever the Supporting documents setting. */
export const drawingsMessage = 'Attach the drawings for this school before saving the New Construction package';
export const drawingsDocumentProblem = (input: Pick<InfrastructureInput, 'kind'>, drawings: number) => input.kind === 'new' && drawings < 1 ? drawingsMessage : null;
