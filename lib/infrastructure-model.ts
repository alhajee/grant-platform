import { z } from 'zod';
import { lineQuartersSchema } from './line-quarters.ts';
import { requirements, fenceDeliverable, appliesToStream, auditKeys, solarKva, type DeliverableCategory, type SchoolStream } from './infrastructure-deliverables.ts';
export { quantityLabel, requirements, fenceDeliverable, minimumKeys, appliesToStream, eccdeOnlyKeys, standardText, deliverableGroups, deliverableGroup, deliverableCategory, deliverableInfo, deliverableDescription, groupDeliverables, inDeliverableOrder, type DeliverableCategory, type SchoolStream } from './infrastructure-deliverables.ts';

/** Infrastructure implementation strategies: only these three (client feedback, October 2026); Request for quotation is the default (UBEC10). */
export const strategies = ['Request for quotation', 'NCB', 'Credit SBMC school account'] as const;
export type InfrastructureStrategy = typeof strategies[number];
export const defaultStrategy: InfrastructureStrategy = strategies[0];
const strategyMessage = 'Choose Request for quotation, NCB or Credit SBMC school account as the implementation strategy.';
const strategySchema = z.enum(strategies, { errorMap: () => ({ message: strategyMessage }) });
/** Whether a saved strategy is still offered (older packages may carry a retired one until it is changed). */
export const isListedStrategy = (value: string): value is InfrastructureStrategy => (strategies as readonly string[]).includes(value);
export const kindNames = { new: 'New Construction', whole: 'Whole School Renovation/Expansion', furniture: 'Furniture/Equipment' } as const;
/** New Construction models (Deliverables workbook). Whole School is sized by enrolment and has no model. */
export const modelNames = ['Model 1 · Small School', 'Model 2 · Medium School', 'Model 3 · Large School'];
export const modelFor = (enrolment: number) => enrolment <= 240 ? 0 : enrolment <= 320 ? 1 : 2;
const quantity = z.number().int().min(0).max(1000000);
const amount = z.number().min(0).max(99999999999.99).refine(n => Math.abs(n * 100 - Math.round(n * 100)) < .001, 'Use at most two decimal places.');
// Existing/functional stay unset until the auditor enters them (a Minimum Standard row is complete once both are set).
// additional: the auditor's own figure (unset = the calculated shortfall). extra: retired "Extra beyond standard", kept so older rows keep their totals.
const auditRow = z.object({ existing: quantity.optional(), functional: quantity.optional(), additional: quantity.optional(), extra: quantity.default(0) }).refine(v => (v.functional ?? 0) <= (v.existing ?? 0), 'Functional cannot exceed existing.');
const modelIndex = z.number().int().min(0).max(2);
export const profileSchema = z.object({male:quantity, female:quantity, latitude:z.string().max(30).refine(v=>!v||(Number.isFinite(Number(v))&&Math.abs(Number(v))<=90),'Invalid latitude.'),longitude:z.string().max(30).refine(v=>!v||(Number.isFinite(Number(v))&&Math.abs(Number(v))<=180),'Invalid longitude.')});
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
 photoKeys:z.record(z.string().uuid(),z.string().max(40)).default({}).refine(p=>Object.values(p).every(k=>auditKeys.has(k)),'Unknown audit deliverable for a photo.'),
 audit:z.record(auditRow).default({}).refine(a=>Object.keys(a).every(k=>auditKeys.has(k)),'Unknown audit deliverable.'),
 /** New Construction: the chosen model (0-2, Model I-III). Whole School packages saved before October 2026 may carry one; it is ignored. */
 model:modelIndex.optional(),fenceRequired:quantity.default(0),fenceLength:quantity.default(0),
 prices:z.record(amount).default({}),classroomStrategy:strategySchema.default(defaultStrategy),
 packageCosts:z.record(z.object({cost:amount,strategy:strategySchema,duration:z.string().trim().max(100)})).default({}),
 lumpSum:amount.default(0),duration:z.string().trim().max(100).default(''),contingency:amount.default(0),preliminaries:amount.default(0),
 // Retired (no longer asked): kept so packages saved earlier still load.
 observations:z.string().max(5000).default(''),dilapidation:z.enum(['Minor repairs required','Moderate deterioration','Unsafe / reconstruction recommended','Severe dilapidation / major rehabilitation']).default('Minor repairs required'),conditionNotes:z.string().max(5000).default(''),
 furniture:z.array(z.object({description:z.string().trim().min(1).max(500),quantity:quantity.refine(n=>n>0),cost:amount.refine(n=>n>0)})).max(100).default([]),
 /** Timeline: implementation quarters within the plan's quarters (migration 050, also the package's quarters column); omitted = the plan's quarters. */
 quarters:lineQuartersSchema.optional(),
});
export const landDeclarationCount = (input: Pick<InfrastructureInput, 'land'>) => Object.values(input.land ?? {}).filter(Boolean).length;
/** All three land declarations ticked (client feedback, October 2026). */
export const allLandDeclared = (input: Pick<InfrastructureInput, 'land'>) => !!input.land?.available && !!input.land?.documented && !!input.land?.unencumbered;
export type InfrastructureInput = z.infer<typeof packageSchema>;
export type SchoolProfile = z.infer<typeof profileSchema>;
export type SchoolTeachers = { male: number; female: number };
export type InfrastructureSchool = {id:number;name:string;lga:string;level:string;location:string;male:number;female:number;latitude:string;longitude:string;enrolmentByClass?:Record<string,{male:number;female:number}>|null;/** DNEMIS D.2 teachers (migration 044). */teachers?:SchoolTeachers|null};
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
 * classrooms ECCDE ÷ 30, Primary ÷ 40, JSS ÷ 40; office = store = classrooms ÷ 3; toilets = enrolment ÷ 20; staff room = teachers ÷ 9
 * (1 when DNEMIS has no teacher figure); magnetic boards = teachers' furniture = classrooms. From the workbook remarks: dual desks 20 per
 * Primary/JSS classroom, ECCDE furniture 6 per ECCDE classroom, storage 1 per classroom, office and staff room. Everything else keeps the
 * workbook's fixed minimum standard. The fence is entered (input.fenceRequired).
 */
export function wholeRequirements(facts: SchoolFacts, stream: SchoolStream): Record<string, WholeRequirement> {
  const priRooms = per(facts.primary, 40) + per(facts.jss, 40);
  const eccdeRooms = stream === 'primary' ? per(facts.eccde, 30) : 0;
  const classrooms = priRooms + eccdeRooms, offices = per(classrooms, 3);
  const staffrooms = facts.teachers ? per(facts.teachers, 9) : 1;
  const learners = facts.eccde + facts.primary + facts.jss;
  const priBasis = facts.primary > 0 && facts.jss > 0 ? `${working('Primary', facts.primary, 40)}; ${working('JSS', facts.jss, 40)}; together ${priRooms}` : facts.jss > 0 ? working('JSS enrolment', facts.jss, 40) : working('Primary enrolment', facts.primary, 40);
  const rooms = `${classrooms} classroom${classrooms === 1 ? '' : 's'}`;
  const need: Record<string, WholeRequirement> = {
    classroomPri: { qty: priRooms, basis: `${priBasis}. 40 learners per classroom.` },
    classroomEccde: { qty: eccdeRooms, basis: `${working('ECCDE enrolment', facts.eccde, 30)}. 30 learners per classroom.` },
    office: { qty: offices, basis: `${working('Classrooms', classrooms, 3)}. One office for every 3 classrooms.` },
    store: { qty: offices, basis: `${working('Classrooms', classrooms, 3)}. One store for every 3 classrooms.` },
    toilet: { qty: per(learners, 20), basis: `${working('Enrolment', learners, 20)}. One compartment for every 20 learners.` },
    staffroom: { qty: staffrooms, basis: facts.teachers ? `${working('Teachers', facts.teachers, 9)}. One staff room for every 9 teachers.` : 'DNEMIS has no teacher figure for this school: 1 staff room.' },
    eccdeFurniture: { qty: eccdeRooms * 6, basis: `6 sets per ECCDE classroom × ${eccdeRooms}.` },
    dualDesk: { qty: priRooms * 20, basis: `20 sets per Primary/JSS classroom × ${priRooms}.` },
    magneticBoard: { qty: classrooms, basis: `One per classroom: ${rooms}.` },
    teachersFurniture: { qty: classrooms, basis: `One set per classroom: ${rooms}.` },
    storageShelf: { qty: classrooms + offices + staffrooms, basis: `One in each classroom, office and staff room: ${classrooms} + ${offices} + ${staffrooms}.` },
  };
  for (const r of requirements) if (r.category === 'minimum' && !need[r.key]) need[r.key] = { qty: r.qty[0], basis: r.key === 'solarPower' ? `${classrooms <= 11 ? solarKva[0] : solarKva[2]} KVA (10 KVA above 11 classrooms).` : r.tick ? 'Required for every school.' : `${r.qty[0]} ${r.unit} for every school.` };
  return need;
}
/** The Primary/JSS classroom row is named after the school's learners. */
const classroomLabel = (facts: SchoolFacts, stream: SchoolStream) => facts.primary > 0 && facts.jss > 0 ? 'Classroom · Primary & JSS' : stream === 'jss' || (facts.jss > 0 && facts.primary === 0) ? 'Classroom · JSS' : 'Classroom · Primary';

export type InfraDocument = {id:string;kind:'drawings'|'boq'|'survey'|'land'|'photo';name:string;size:number;schoolId?:number|null;schoolName?:string|null};
export type PackageItem = {key:string;label:string;quantity:number;unit:string;lump:boolean;cost:number;total:number;strategy:string;duration:string;operation?:string};
export type InfrastructureResult = ReturnType<typeof calculateInfrastructure>;
export type InfrastructurePackage = {id:number;/** The client key the package was created with (migration 058), null for older packages. */client_key?:string|null;/** Reference code (migration 053), e.g. UBEC/SUBEB/INFRA/007/2026 · Q1–Q4. */code?:string;version:number;kind:InfrastructureInput['kind'];input:InfrastructureInput;result:InfrastructureResult;school:InfrastructureSchool;total_cost:string;
 /** Timeline (infrastructure_packages.quarters, migration 050): authoritative over input.quarters, which packages saved earlier lack. */
 quarters?:number[]};
const cents = (n:number) => Math.round(n*100);
const money = (n:number) => Math.round(n)/100;
/** The model a New Construction package is built to: the chosen one, else (older packages) the one enrolment suggests. */
export const packageModel=(input:Pick<InfrastructureInput,'kind'|'model'>,enrolment:number)=>input.kind==='new'&&input.model!==undefined?input.model:modelFor(enrolment);
/** Classroom block rows per model (no block of 3, client feedback October 2026). */
export const classroomBlocks=(model:number)=>model===0?[{key:'classBlock6',label:'Block of 6 classrooms with office and store',count:1}]:model===1?[{key:'classBlock9',label:'Block of 9 classrooms with 2 offices and 2 stores',count:1}]:[{key:'classBlock6',label:'Block of 6 classrooms with office and store',count:2}];
/** One-line summary of a model's standard, for the model choice. */
export const modelSummary=(model:number,stream:SchoolStream='primary')=>{const qty=(key:string)=>requirements.find(r=>r.key===key)?.qty[model]??0;return `${qty('classroomPri')+(stream==='primary'?qty('classroomEccde'):0)} classrooms · ${qty('dualDesk')} dual desks · ${qty('toilet')} toilets`;};
/** New Construction rows a model and list ask for, before costing (classroom blocks, ECCDE block, the Minimum Standard rows and the fence). */
export function newConstructionRows(model:number,stream:SchoolStream,fenceLength:number){
 const rows:{key:string;label:string;quantity:number;unit:string;lump:boolean}[]=classroomBlocks(model).map(b=>({key:b.key,label:b.label,quantity:b.count,unit:'blocks',lump:true}));
 if(stream==='primary')rows.push({key:'eccdeBlock',label:'ECCDE block · 2 classrooms, nanny station and sleeping bay',quantity:1,unit:'block',lump:true});
 for(const r of requirements.filter(r=>r.category==='minimum'&&!['classroomPri','classroomEccde','office','store'].includes(r.key)&&r.qty[model]>0&&appliesToStream(r.key,stream)))rows.push({key:r.key,label:r.label+(r.key==='solarPower'?` · ${solarKva[model]} KVA`:''),quantity:r.qty[model],unit:r.unit,lump:!!r.lump});
 rows.push({key:'fence',label:'Perimeter wall fence with concertina security wire',quantity:fenceLength,unit:'metres',lump:false});
 return rows;
}
export type AuditGap=ReturnType<typeof auditGaps>[number];
/** Whole School audit rows: requirements from enrolment (wholeRequirements), what the auditor entered, and what is to be built. */
export function auditGaps(input:InfrastructureInput, school:SchoolBasis) {
 const facts=toFacts(school,input.components),stream=schoolStream(input.components),need=wholeRequirements(facts,stream);
 const fence={...fenceDeliverable,qty:[0,0,0],lump:false,block:undefined as number|undefined,standard:undefined as [string,string,string]|undefined};
 return [...requirements.map(r=>({...r,civil:!!r.civil,lump:!!r.lump,tick:!!r.tick})),fence].filter(r=>appliesToStream(r.key,stream)).map(r=>{
  const stored=input.audit[r.key];
  const existing=stored?.existing??0,functional=stored?.functional??0,extra=stored?.extra??0;
  const category:DeliverableCategory=r.category;
  const required=category==='other'?0:r.key==='fence'?input.fenceRequired:need[r.key]?.qty??0;
  // Calculated shortfall; a retired "Extra beyond standard" figure is added so older packages keep their totals.
  const calculated=Math.max(0,required-(r.civil?existing:functional))+extra;
  const additional=stored?.additional??calculated;
  return {...r,label:r.key==='classroomPri'?classroomLabel(facts,stream):r.label,category,existing,functional,extra,entered:{existing:stored?.existing!==undefined,functional:stored?.functional!==undefined,additional:stored?.additional!==undefined},
   /** Other Facilities count only once something is entered. */
   included:category==='minimum'||!!stored,
   standard:category==='other'?'':r.key==='fence'?'Metres of fence the site needs.':need[r.key]?.basis??'',required,nonFunctional:Math.max(0,existing-functional),calculated,additional,toBuild:additional};
 });
}
/** Why one audit row is incomplete or invalid (null when fine). Minimum Standard rows need existing and functional; Other Facilities are optional. */
export function auditRowProblem(gap:AuditGap,input:Pick<InfrastructureInput,'fenceRequired'>):string|null{
 if(gap.category==='minimum'){
  if(gap.key==='fence'&&input.fenceRequired<=0)return 'Enter the fence length required (metres).';
  if(!gap.entered.existing&&!gap.entered.functional)return 'Enter existing and functional.';
  if(!gap.entered.existing)return 'Enter existing.';
  if(!gap.entered.functional)return 'Enter functional.';
 }else if(gap.entered.functional&&!gap.entered.existing)return 'Enter existing too.';
 return gap.functional>gap.existing?'Functional cannot exceed existing.':null;
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
 return missing?`Attach photographic evidence for ${missing.label}: non-functional units are recorded.`:null;
}
export function calculateInfrastructure(input:InfrastructureInput,school:SchoolBasis) {
 const enrolment=totalOf(school),facts=toFacts(school,input.components),stream=schoolStream(input.components);
 const model=packageModel(input,enrolment),items:PackageItem[]=[];
 let classroomSubtotal=0,otherSubtotal=0,vat=0;
 function add(key:string,label:string,quantity:number,unit:string,lump:boolean,cost:number,strategy:string=defaultStrategy,duration='',operation?:string){
  const total=money(cents(cost)*(lump?1:quantity));
  items.push({key,label,quantity,unit,lump,cost,total,strategy,duration,operation});return total;
 }
 if(input.kind==='furniture') input.furniture.forEach((r,i)=>add('furniture-'+i,r.description,r.quantity,'units',false,r.cost,'',''));
 if(input.kind==='whole') for(const gap of auditGaps(input,facts)){
  const addGap=(key:string,operation:string,qty:number,lump:boolean,unit=gap.unit)=>{const price=input.packageCosts[key];add(key,gap.label,qty,unit,lump,price?.cost??0,price?.strategy??defaultStrategy,price?.duration??'',operation);};
  if(gap.civil&&gap.nonFunctional>0)addGap(gap.key+'-renovate','Renovation',gap.nonFunctional,true);
  // New ECCDE classrooms are built as ECCDE blocks of 2 classrooms.
  if(gap.toBuild>0)addGap(gap.civil?gap.key+'-construct':gap.key,gap.civil?'New construction':'Supply / installation',gap.key==='classroomEccde'?Math.ceil(gap.toBuild/2):gap.toBuild,!!(gap.civil||gap.lump),gap.key==='classroomEccde'?'blocks':gap.unit);
 }
 if(input.kind==='new'){
  const price=(key:string)=>input.targeting==='hope'?input.prices[key]??0:0;
  for(const row of newConstructionRows(model,stream,input.fenceLength)){
   const total=add(row.key,row.label,row.quantity,row.unit,row.lump,price(row.key),row.key.startsWith('classBlock')?input.classroomStrategy:defaultStrategy);
   if(row.key.startsWith('classBlock'))classroomSubtotal+=total;else otherSubtotal+=total;
  }
  if(input.targeting==='nonhope')add('package','Complete construction package',1,'lot',true,input.lumpSum,input.classroomStrategy,input.duration);
  else{
   otherSubtotal+=add('contingency','Contingency',1,'lot',true,input.contingency,'—');
   otherSubtotal+=add('preliminaries','Preliminaries',1,'lot',true,input.preliminaries,'—');
   vat=money(Math.round((cents(otherSubtotal)+(input.classroomStrategy==='NCB'?cents(classroomSubtotal):0))*75/1000));
   add('vat','VAT (7.5%)',1,'lot',true,vat,'—');
  }
 }
 const total=money(items.reduce((sum,item)=>sum+cents(item.total),0));
 // Only New Construction has a model; Whole School records the enrolment basis of its formulas instead.
 return {model,modelLabel:input.kind==='new'?modelNames[model]:'',enrolment,...(input.kind==='whole'?{basis:{eccde:facts.eccde,primary:facts.primary,jss:facts.jss,teachers:facts.teachers}}:{}),items,classroomSubtotal,otherSubtotal,vat,total};
}
/** Why a package cannot be saved (null when it can). Land documents and photos are checked where the documents are known (API and editor). */
export function packageProblem(input:InfrastructureInput,school:SchoolBasis){
 const enrolment=totalOf(school);
 if(enrolment<=0&&input.kind!=='furniture')return 'Record the school’s enrolment before creating its package.';
 if(input.kind==='new'&&!allLandDeclared(input))return 'Tick all three land declarations.';
 if(input.kind==='new'&&input.model===undefined)return 'Choose the school model.';
 if(input.kind==='new'&&input.fenceLength<=0)return 'Enter the perimeter fence length (metres).';
 const auditProblem=wholeAuditProblem(input,school);if(auditProblem)return auditProblem;
 const result=calculateInfrastructure(input,school);
 if(!result.items.length||result.total<=0)return 'Add and cost the required items before saving.';
 if(!Number.isSafeInteger(cents(result.total)))return 'The package total is too large.';
 if(input.kind==='whole'&&result.items.some(i=>i.cost<=0||!i.duration))return 'Enter a cost and duration for each intervention.';
 if(input.kind==='new'&&input.targeting==='nonhope'&&!input.duration)return 'Enter the construction duration.';
 return null;
}
/** Land documents (C of O, R of O or Community Agreement) a New Construction package needs: at least one, for declaration 2. */
export const landDocumentProblem=(input:Pick<InfrastructureInput,'kind'|'land'>,attached:number)=>input.kind==='new'&&attached<1?'Attach the C of O, R of O or Community Agreement document.':null;
