import { z } from 'zod';
import { implementationStrategies } from './activity-plans.ts';

export const strategies = implementationStrategies;
export const kindNames = { new: 'New Construction', whole: 'Whole School Renovation/Expansion', furniture: 'Furniture/Equipment' } as const;
export const modelNames = ['Model 1 · Small School', 'Model 2 · Medium School', 'Model 3 · Large School'];
export const modelFor = (enrolment: number) => enrolment <= 240 ? 0 : enrolment <= 320 ? 1 : 2;
type Requirement = { key: string; label: string; qty: number[]; unit: string; civil?: boolean; lump?: boolean; block?: number };
export const requirements: Requirement[] = [
 {key:'classroomPri',label:'Primary / general classrooms',qty:[6,9,12],unit:'classrooms',civil:true,block:3},
 {key:'classroomEccde',label:'ECCDE block · 2 classrooms, nanny station, sleeping bay and 2 toilets',qty:[2,2,2],unit:'classrooms',civil:true,block:2},
 {key:'office',label:'Office',qty:[1,2,2],unit:'offices',civil:true},
 {key:'store',label:'Store',qty:[1,2,2],unit:'stores',civil:true},
 {key:'toilet',label:'Toilet compartments · excluding ECCDE toilets',qty:[14,26,26],unit:'compartments',lump:true},
 {key:'staffroom',label:'Staff room',qty:[1,1,2],unit:'rooms'},
 {key:'gatehouse',label:'Gate house',qty:[1,1,1],unit:'units',civil:true},
 {key:'eccdeFurniture',label:'ECCDE plastic furniture · 1 table and 5 chairs',qty:[12,12,12],unit:'sets'},
 {key:'dualDesk',label:'Dual-seater desk · wood and metal frame',qty:[120,180,240],unit:'sets'},
 {key:'magneticBoard',label:'Magnetic board',qty:[8,11,14],unit:'sets'},
 {key:'teachersFurniture',label:'Teachers’ furniture · chair and table with drawer',qty:[17,20,32],unit:'sets'},
 {key:'hmFurniture',label:'Head teacher / principal furniture',qty:[1,1,1],unit:'sets'},
 {key:'storageShelf',label:'Storage shelf / cupboard',qty:[9,12,15],unit:'units'},
 {key:'playEquipment',label:'Play equipment',qty:[1,1,1],unit:'sets'},
 {key:'kgBed',label:'Kindergarten bed',qty:[1,1,1],unit:'units'},
 {key:'solarBorehole',label:'Solar borehole with overhead tank',qty:[1,1,1],unit:'systems'},
 {key:'handwashing',label:'Handwashing station',qty:[1,1,1],unit:'units'},
 {key:'rwh',label:'Rainwater harvesting system',qty:[1,1,1],unit:'systems'},
 {key:'playground',label:'Playground',qty:[1,1,1],unit:'units'},
 {key:'landscaping',label:'Soft and hard landscaping',qty:[1,1,1],unit:'units'},
 {key:'football',label:'Football pitch with associated facilities',qty:[1,1,1],unit:'units'},
 {key:'volleyball',label:'Volleyball court with associated facilities',qty:[1,1,1],unit:'units'},
 {key:'solarPower',label:'Hybrid solar power system',qty:[1,1,1],unit:'systems'},
 {key:'solarLight',label:'Outdoor solar light',qty:[20,30,30],unit:'sets'},
];
const quantity = z.number().int().min(0).max(1000000);
const amount = z.number().min(0).max(99999999999.99).refine(n => Math.abs(n * 100 - Math.round(n * 100)) < .001, 'Use at most two decimal places.');
const auditRow = z.object({existing:quantity, functional:quantity, extra:quantity}).refine(v=>v.functional<=v.existing,'Functional cannot exceed existing.');
export const profileSchema = z.object({male:quantity, female:quantity, latitude:z.string().max(30).refine(v=>!v||(Number.isFinite(Number(v))&&Math.abs(Number(v))<=90),'Invalid latitude.'),longitude:z.string().max(30).refine(v=>!v||(Number.isFinite(Number(v))&&Math.abs(Number(v))<=180),'Invalid longitude.')});
export const packageSchema = z.object({
 kind:z.enum(['new','whole','furniture']),schoolId:z.number().int().positive(),
 components:z.array(z.enum(['ECCDE','Primary','JSS'])).min(1).max(3),
 targeting:z.enum(['hope','nonhope']).default('hope'), grouping:z.enum(['standard','storey']).default('standard'),
 land:z.object({available:z.boolean(),documented:z.boolean(),unencumbered:z.boolean()}).default({available:false,documented:false,unencumbered:false}),
 documentIds:z.array(z.string().uuid()).max(30).default([]),
 audit:z.record(auditRow).default({}),fenceRequired:quantity.default(0),fenceLength:quantity.default(0),
 prices:z.record(amount).default({}),classroomStrategy:z.enum(strategies).default('NCB'),
 packageCosts:z.record(z.object({cost:amount,strategy:z.enum(strategies),duration:z.string().trim().max(100)})).default({}),
 lumpSum:amount.default(0),duration:z.string().trim().max(100).default(''),contingency:amount.default(0),preliminaries:amount.default(0),
 observations:z.string().max(5000).default(''),dilapidation:z.enum(['Minor repairs required','Moderate deterioration','Unsafe / reconstruction recommended','Severe dilapidation / major rehabilitation']).default('Minor repairs required'),conditionNotes:z.string().max(5000).default(''),
 furniture:z.array(z.object({description:z.string().trim().min(1).max(500),quantity:quantity.refine(n=>n>0),cost:amount.refine(n=>n>0)})).max(100).default([]),
});
export type InfrastructureInput = z.infer<typeof packageSchema>;
export type SchoolProfile = z.infer<typeof profileSchema>;
export type InfrastructureSchool = {id:number;name:string;lga:string;level:string;location:string;male:number;female:number;latitude:string;longitude:string};
export type InfraDocument = {id:string;kind:'drawings'|'boq'|'survey'|'land'|'photo';name:string;size:number;schoolId?:number|null;schoolName?:string|null};
export type PackageItem = {key:string;label:string;quantity:number;unit:string;lump:boolean;cost:number;total:number;strategy:string;duration:string;operation?:string};
export type InfrastructurePackage = {id:number;version:number;kind:InfrastructureInput['kind'];input:InfrastructureInput;result:ReturnType<typeof calculateInfrastructure>;school:InfrastructureSchool;total_cost:string};
const cents = (n:number) => Math.round(n*100);
const money = (n:number) => Math.round(n)/100;
export function auditGaps(input:InfrastructureInput, enrolment:number) {
 const model=modelFor(enrolment);
 return [...requirements,{key:'fence',label:'Perimeter fence',qty:[input.fenceRequired,input.fenceRequired,input.fenceRequired],unit:'metres',civil:true}].map(r=>{
  const row=input.audit[r.key]??{existing:0,functional:0,extra:0};
  const deficit=Math.max(0,r.qty[model]-(r.civil?row.existing:row.functional));
  const additional=r.block&&r.key!=='classroomEccde'?Math.ceil(deficit/r.block)*r.block:deficit;
  return {...r,...row,required:r.qty[model],nonFunctional:row.existing-row.functional,additional,toBuild:additional+row.extra};
 });
}
export function calculateInfrastructure(input:InfrastructureInput,enrolment:number) {
 const model=modelFor(enrolment),items:PackageItem[]=[];
 let classroomSubtotal=0,otherSubtotal=0,vat=0;
 function add(key:string,label:string,quantity:number,unit:string,lump:boolean,cost:number,strategy='NCB',duration='',operation?:string){
  const total=money(cents(cost)*(lump?1:quantity));
  items.push({key,label,quantity,unit,lump,cost,total,strategy,duration,operation});return total;
 }
 if(input.kind==='furniture') input.furniture.forEach((r,i)=>add('furniture-'+i,r.description,r.quantity,'units',false,r.cost,'',''));
 if(input.kind==='whole') for(const gap of auditGaps(input,enrolment)){
  const addGap=(key:string,operation:string,qty:number,lump:boolean,unit=gap.unit)=>{const price=input.packageCosts[key];add(key,gap.label,qty,unit,lump,price?.cost??0,price?.strategy??'NCB',price?.duration??'',operation);};
  if(gap.civil&&gap.nonFunctional>0)addGap(gap.key+'-renovate','Renovation',gap.nonFunctional,true);
  if(gap.toBuild>0)addGap(gap.civil?gap.key+'-construct':gap.key,gap.civil?'New construction':'Supply / installation',gap.key==='classroomEccde'?1:gap.toBuild,!!(gap.civil||gap.lump),gap.key==='classroomEccde'?'block':gap.unit);
 }
 if(input.kind==='new'){
  const blocks=model>0&&input.grouping==='storey'?[{key:'block6os',label:'Storey block of 6 classrooms with 2 offices and 2 stores',count:1},{key:'block3',label:'Block of 3 classrooms',count:model===1?1:2}]:[{key:'block3os',label:'Block of 3 classrooms with office and store',count:model===0?1:2},{key:'block3',label:'Block of 3 classrooms',count:model===2?2:1}];
  for(const b of blocks)classroomSubtotal+=add(b.key,b.label,b.count,'blocks',true,input.targeting==='hope'?input.prices[b.key]??0:0,input.classroomStrategy);
  otherSubtotal+=add('eccdeBlock','ECCDE block · 2 classrooms, nanny station, sleeping bay and 2 toilets',1,'block',true,input.targeting==='hope'?input.prices.eccdeBlock??0:0);
  for(const r of requirements.filter(r=>!['classroomPri','classroomEccde','office','store'].includes(r.key))) otherSubtotal+=add(r.key,r.label+(r.key==='solarPower'?` · ${[5,7.5,10][model]} KVA`:''),r.qty[model],r.unit,!!r.lump,input.targeting==='hope'?input.prices[r.key]??0:0);
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
 if(input.kind==='new'&&!Object.values(input.land).every(Boolean))return 'Confirm all three land declarations.';
 if(input.kind==='new'&&modelFor(enrolment)===0&&input.grouping==='storey')return 'The small-school model uses standard classroom blocks.';
 const result=calculateInfrastructure(input,enrolment);
 if(!result.items.length||result.total<=0)return 'Add and cost the required items before saving.';
 if(!Number.isSafeInteger(cents(result.total)))return 'The package total is too large.';
 if(input.kind==='whole'&&result.items.some(i=>i.cost<=0||!i.duration))return 'Enter a cost and duration for each intervention.';
 if(input.kind==='new'&&input.targeting==='nonhope'&&!input.duration)return 'Enter the construction duration.';
 return null;
}
