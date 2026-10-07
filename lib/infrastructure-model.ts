import { z } from 'zod';
import { implementationStrategies } from './activity-plans.ts';
import { lineQuartersSchema } from './line-quarters.ts';
import { requirements, fenceDeliverable, appliesToModel, auditKeys, standardText, solarKva, type DeliverableCategory } from './infrastructure-deliverables.ts';
export { quantityLabel, requirements, fenceDeliverable, minimumKeys, appliesToModel, standardText, deliverableGroups, deliverableGroup, deliverableCategory, deliverableInfo, groupDeliverables, inDeliverableOrder, type DeliverableCategory } from './infrastructure-deliverables.ts';

// Request for quotation leads the infrastructure list and is the default method (UBEC10).
export const strategies = ['Request for quotation', ...implementationStrategies.filter(s => s !== 'Request for quotation')] as [typeof implementationStrategies[number], ...typeof implementationStrategies[number][]];
export const defaultStrategy = strategies[0];
export const kindNames = { new: 'New Construction', whole: 'Whole School Renovation/Expansion', furniture: 'Furniture/Equipment' } as const;
export const modelNames = ['Model 1 · Small School', 'Model 2 · Medium School', 'Model 3 · Large School'];
export const modelFor = (enrolment: number) => enrolment <= 240 ? 0 : enrolment <= 320 ? 1 : 2;
const quantity = z.number().int().min(0).max(1000000);
const amount = z.number().min(0).max(99999999999.99).refine(n => Math.abs(n * 100 - Math.round(n * 100)) < .001, 'Use at most two decimal places.');
// Existing/functional stay unset until the auditor enters them (a Minimum Standard row is complete once both are set); older packages always have both.
const auditRow = z.object({existing:quantity.optional(), functional:quantity.optional(), extra:quantity.default(0)}).refine(v=>(v.functional??0)<=(v.existing??0),'Functional cannot exceed existing.');
const modelIndex = z.number().int().min(0).max(2);
export const profileSchema = z.object({male:quantity, female:quantity, latitude:z.string().max(30).refine(v=>!v||(Number.isFinite(Number(v))&&Math.abs(Number(v))<=90),'Invalid latitude.'),longitude:z.string().max(30).refine(v=>!v||(Number.isFinite(Number(v))&&Math.abs(Number(v))<=180),'Invalid longitude.')});
export const packageSchema = z.object({
 kind:z.enum(['new','whole','furniture']),schoolId:z.number().int().positive(),
 components:z.array(z.enum(['ECCDE','Primary','JSS'])).min(1).max(3),
 targeting:z.enum(['hope','nonhope']).default('nonhope'), grouping:z.enum(['standard','storey']).default('standard'),
 land:z.object({available:z.boolean(),documented:z.boolean(),unencumbered:z.boolean()}).default({available:false,documented:false,unencumbered:false}),
 documentIds:z.array(z.string().uuid()).max(30).default([]),
 audit:z.record(auditRow).default({}).refine(a=>Object.keys(a).every(k=>auditKeys.has(k)),'Unknown audit deliverable.'),
 /** Whole School: the chosen model (0-2, Model I-III) whose Minimum Standard the audit fills; omitted (older packages) = the model enrolment suggests. */
 model:modelIndex.optional(),fenceRequired:quantity.default(0),fenceLength:quantity.default(0),
 prices:z.record(amount).default({}),classroomStrategy:z.enum(strategies).default(defaultStrategy),
 packageCosts:z.record(z.object({cost:amount,strategy:z.enum(strategies),duration:z.string().trim().max(100)})).default({}),
 lumpSum:amount.default(0),duration:z.string().trim().max(100).default(''),contingency:amount.default(0),preliminaries:amount.default(0),
 // Retired (no longer asked): kept so packages saved earlier still load.
 observations:z.string().max(5000).default(''),dilapidation:z.enum(['Minor repairs required','Moderate deterioration','Unsafe / reconstruction recommended','Severe dilapidation / major rehabilitation']).default('Minor repairs required'),conditionNotes:z.string().max(5000).default(''),
 furniture:z.array(z.object({description:z.string().trim().min(1).max(500),quantity:quantity.refine(n=>n>0),cost:amount.refine(n=>n>0)})).max(100).default([]),
 /** Timeline: implementation quarters within the plan's quarters (migration 050, also the package's quarters column); omitted = the plan's quarters. */
 quarters:lineQuartersSchema.optional(),
});
export const landDeclarationCount = (input: Pick<InfrastructureInput, 'land'>) => Object.values(input.land ?? {}).filter(Boolean).length;
export type InfrastructureInput = z.infer<typeof packageSchema>;
export type SchoolProfile = z.infer<typeof profileSchema>;
export type InfrastructureSchool = {id:number;name:string;lga:string;level:string;location:string;male:number;female:number;latitude:string;longitude:string;enrolmentByClass?:Record<string,{male:number;female:number}>|null};
export type SchoolComponent = 'ECCDE'|'Primary'|'JSS';
/** School components come from the School register (level plus classes with learners); editors show them read-only. */
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
export type InfraDocument = {id:string;kind:'drawings'|'boq'|'survey'|'land'|'photo';name:string;size:number;schoolId?:number|null;schoolName?:string|null};
export type PackageItem = {key:string;label:string;quantity:number;unit:string;lump:boolean;cost:number;total:number;strategy:string;duration:string;operation?:string};
export type InfrastructurePackage = {id:number;/** Reference code (migration 053), e.g. UBEC/SUBEB/INFRA/007/2026 · Q1–Q4. */code?:string;version:number;kind:InfrastructureInput['kind'];input:InfrastructureInput;result:ReturnType<typeof calculateInfrastructure>;school:InfrastructureSchool;total_cost:string;
 /** Timeline (infrastructure_packages.quarters, migration 050): authoritative over input.quarters, which packages saved earlier lack. */
 quarters?:number[]};
const cents = (n:number) => Math.round(n*100);
const money = (n:number) => Math.round(n)/100;
/** The model a package is costed to: a Whole School package's chosen model, otherwise (and for older packages) the one enrolment suggests. */
export const packageModel=(input:Pick<InfrastructureInput,'kind'|'model'>,enrolment:number)=>input.kind==='whole'&&input.model!==undefined?input.model:modelFor(enrolment);
/** One-line summary of a model's standard, for the model choice. */
export const modelSummary=(model:number)=>{const qty=(key:string)=>requirements.find(r=>r.key===key)?.qty[model]??0;return `${qty('classroomPri')+qty('classroomEccde')} classrooms · ${qty('dualDesk')} dual desks · ${qty('toilet')} toilets`;};
export type AuditGap=ReturnType<typeof auditGaps>[number];
export function auditGaps(input:InfrastructureInput, enrolment:number) {
 const model=packageModel(input,enrolment);
 const fence={...fenceDeliverable,qty:[input.fenceRequired,input.fenceRequired,input.fenceRequired],lump:false,block:undefined as number|undefined,standard:undefined as [string,string,string]|undefined};
 return [...requirements.map(r=>({...r,civil:!!r.civil,lump:!!r.lump,tick:!!r.tick})),fence].filter(r=>appliesToModel(r.key,model)).map(r=>{
  const stored=input.audit[r.key];
  const existing=stored?.existing??0,functional=stored?.functional??0,extra=stored?.extra??0;
  const deficit=Math.max(0,r.qty[model]-(r.civil?existing:functional));
  const additional=r.block&&r.key!=='classroomEccde'?Math.ceil(deficit/r.block)*r.block:deficit;
  const category:DeliverableCategory=r.category;
  return {...r,category,existing,functional,extra,entered:{existing:stored?.existing!==undefined,functional:stored?.functional!==undefined},
   /** Other Requirements rows count only once something is entered. */
   included:category==='minimum'||!!stored,
   standard:standardText(r.key,model),required:r.qty[model],nonFunctional:Math.max(0,existing-functional),additional,toBuild:additional+extra};
 });
}
/** Audit entries a model does not ask for (a Minimum Standard deliverable whose cell is empty for that model): discarded when the model changes. */
export const entriesNotIn=(input:Pick<InfrastructureInput,'audit'>,model:number)=>Object.keys(input.audit).filter(key=>!appliesToModel(key,model));
/** Why one audit row is incomplete or invalid (null when fine). Minimum Standard rows need existing and functional; Other Requirements are optional. */
export function auditRowProblem(gap:AuditGap,input:Pick<InfrastructureInput,'fenceRequired'>):string|null{
 if(gap.category==='minimum'){
  if(gap.key==='fence'&&input.fenceRequired<=0)return 'Enter the fence length required (metres).';
  if(!gap.entered.existing&&!gap.entered.functional)return 'Enter existing and functional.';
  if(!gap.entered.existing)return 'Enter existing.';
  if(!gap.entered.functional)return 'Enter functional.';
 }else if(gap.entered.functional&&!gap.entered.existing)return 'Enter existing too.';
 return gap.functional>gap.existing?'Functional cannot exceed existing.':null;
}
/** The first Minimum Standard (or invalid Other Requirements) row that blocks a Whole School package. */
export function wholeAuditProblem(input:InfrastructureInput,enrolment:number):string|null{
 if(input.kind!=='whole')return null;
 for(const gap of auditGaps(input,enrolment)){const problem=auditRowProblem(gap,input);if(problem)return `${gap.label}: ${problem.charAt(0).toLowerCase()+problem.slice(1)}`;}
 return null;
}
export const minimumAuditCount=(input:InfrastructureInput,enrolment:number)=>{const rows=auditGaps(input,enrolment).filter(g=>g.category==='minimum');return {complete:rows.filter(g=>!auditRowProblem(g,input)).length,total:rows.length};};
/** Photographic evidence is required while general classrooms are recorded as non-functional (unchanged rule; the upload now sits with the Bill of Quantities). */
export const photoEvidenceRequired=(input:Pick<InfrastructureInput,'kind'|'audit'>)=>input.kind==='whole'&&(input.audit.classroomPri?.existing??0)>(input.audit.classroomPri?.functional??0);
export function calculateInfrastructure(input:InfrastructureInput,enrolment:number) {
 const model=packageModel(input,enrolment),items:PackageItem[]=[];
 let classroomSubtotal=0,otherSubtotal=0,vat=0;
 function add(key:string,label:string,quantity:number,unit:string,lump:boolean,cost:number,strategy:string=defaultStrategy,duration='',operation?:string){
  const total=money(cents(cost)*(lump?1:quantity));
  items.push({key,label,quantity,unit,lump,cost,total,strategy,duration,operation});return total;
 }
 if(input.kind==='furniture') input.furniture.forEach((r,i)=>add('furniture-'+i,r.description,r.quantity,'units',false,r.cost,'',''));
 if(input.kind==='whole') for(const gap of auditGaps(input,enrolment)){
  const addGap=(key:string,operation:string,qty:number,lump:boolean,unit=gap.unit)=>{const price=input.packageCosts[key];add(key,gap.label,qty,unit,lump,price?.cost??0,price?.strategy??defaultStrategy,price?.duration??'',operation);};
  if(gap.civil&&gap.nonFunctional>0)addGap(gap.key+'-renovate','Renovation',gap.nonFunctional,true);
  if(gap.toBuild>0)addGap(gap.civil?gap.key+'-construct':gap.key,gap.civil?'New construction':'Supply / installation',gap.key==='classroomEccde'?1:gap.toBuild,!!(gap.civil||gap.lump),gap.key==='classroomEccde'?'block':gap.unit);
 }
 if(input.kind==='new'){
  const blocks=model>0&&input.grouping==='storey'?[{key:'block6os',label:'Storey block of 6 classrooms with 2 offices and 2 stores',count:1},{key:'block3',label:'Block of 3 classrooms',count:model===1?1:2}]:[{key:'block3os',label:'Block of 3 classrooms with office and store',count:model===0?1:2},{key:'block3',label:'Block of 3 classrooms',count:model===2?2:1}];
  for(const b of blocks)classroomSubtotal+=add(b.key,b.label,b.count,'blocks',true,input.targeting==='hope'?input.prices[b.key]??0:0,input.classroomStrategy);
  otherSubtotal+=add('eccdeBlock','ECCDE block · 2 classrooms, nanny station and sleeping bay',1,'block',true,input.targeting==='hope'?input.prices.eccdeBlock??0:0);
  for(const r of requirements.filter(r=>!['classroomPri','classroomEccde','office','store'].includes(r.key)&&r.qty[model]>0)) otherSubtotal+=add(r.key,r.label+(r.key==='solarPower'?` · ${solarKva[model]} KVA`:''),r.qty[model],r.unit,!!r.lump,input.targeting==='hope'?input.prices[r.key]??0:0);
  otherSubtotal+=add('fence','Perimeter wall fence with concertina security wire',input.fenceLength,'metres',false,input.targeting==='hope'?input.prices.fence??0:0);
  if(input.targeting==='nonhope')add('package','Complete construction package',1,'lot',true,input.lumpSum,input.classroomStrategy,input.duration);
  else{
   otherSubtotal+=add('contingency','Contingency',1,'lot',true,input.contingency,'—');
   otherSubtotal+=add('preliminaries','Preliminaries',1,'lot',true,input.preliminaries,'—');
   vat=money(Math.round((cents(otherSubtotal)+(input.classroomStrategy==='NCB'?cents(classroomSubtotal):0))*75/1000));
   add('vat','VAT (7.5%)',1,'lot',true,vat,'—');
  }
 }
 const total=money(items.reduce((sum,item)=>sum+cents(item.total),0));
 return {model,modelLabel:modelNames[model],enrolment,items,classroomSubtotal,otherSubtotal,vat,total};
}
export function packageProblem(input:InfrastructureInput,enrolment:number){
 if(enrolment<=0&&input.kind!=='furniture')return 'Record the school’s enrolment before creating its package.';
 if(input.kind==='new'&&!Object.values(input.land).some(Boolean))return 'Tick at least one land declaration.';
 if(input.kind==='new'&&modelFor(enrolment)===0&&input.grouping==='storey')return 'The small-school model uses standard classroom blocks.';
 if(input.kind==='whole'&&input.model===undefined)return 'Choose the school model for the audit.';
 const auditProblem=wholeAuditProblem(input,enrolment);if(auditProblem)return auditProblem;
 const result=calculateInfrastructure(input,enrolment);
 if(!result.items.length||result.total<=0)return 'Add and cost the required items before saving.';
 if(!Number.isSafeInteger(cents(result.total)))return 'The package total is too large.';
 if(input.kind==='whole'&&result.items.some(i=>i.cost<=0||!i.duration))return 'Enter a cost and duration for each intervention.';
 if(input.kind==='new'&&input.targeting==='nonhope'&&!input.duration)return 'Enter the construction duration.';
 return null;
}
