import { z } from 'zod';
import { implementationStrategies } from './activity-plans.ts';

// Request for quotation leads the infrastructure list and is the default method (UBEC10).
export const strategies = ['Request for quotation', ...implementationStrategies.filter(s => s !== 'Request for quotation')] as [typeof implementationStrategies[number], ...typeof implementationStrategies[number][]];
export const defaultStrategy = strategies[0];
export const kindNames = { new: 'New Construction', whole: 'Whole School Renovation/Expansion', furniture: 'Furniture/Equipment' } as const;
export const modelNames = ['Model 1 · Small School', 'Model 2 · Medium School', 'Model 3 · Large School'];
export const modelFor = (enrolment: number) => enrolment <= 240 ? 0 : enrolment <= 320 ? 1 : 2;
type Requirement = { key: string; label: string; qty: number[]; unit: string; civil?: boolean; lump?: boolean; block?: number };
// UBEC "Deliverables for proposed UBEC model school typologies" (18 Sept 2026). qty = Model I/II/III requirement;
// 0 means the typology sets no standard quantity (audited, and costed only as an extra beyond standard).
export const requirements: Requirement[] = [
 {key:'classroomPri',label:'Primary / general classrooms',qty:[6,9,12],unit:'classrooms',civil:true,block:3},
 {key:'classroomEccde',label:'ECCDE block · 2 classrooms, nanny station, sleeping bay and 2 toilets',qty:[2,2,2],unit:'classrooms',civil:true,block:2},
 {key:'office',label:'Office',qty:[1,2,2],unit:'offices',civil:true},
 {key:'store',label:'Store',qty:[1,2,2],unit:'stores',civil:true},
 {key:'toilet',label:'Toilet compartments · excluding ECCDE toilets',qty:[14,26,26],unit:'compartments',lump:true},
 {key:'workshop',label:'Workshop',qty:[0,0,0],unit:'rooms',civil:true},
 {key:'scienceLab',label:'Science laboratory',qty:[0,0,0],unit:'rooms',civil:true},
 {key:'roboticsLab',label:'Robotic / AI laboratory',qty:[0,0,0],unit:'rooms',civil:true},
 {key:'vocationalLab',label:'Vocational laboratory',qty:[0,0,0],unit:'rooms',civil:true},
 {key:'library',label:'Library / e-library',qty:[0,0,0],unit:'rooms',civil:true},
 {key:'ictRoom',label:'ICT / computer room',qty:[0,0,0],unit:'rooms',civil:true},
 {key:'adminBlock',label:'Admin block',qty:[0,0,0],unit:'blocks',civil:true},
 {key:'staffroom',label:'Staff room',qty:[1,1,2],unit:'rooms'},
 {key:'gatehouse',label:'Gate house',qty:[1,1,1],unit:'units',civil:true},
 {key:'multipurposeHall',label:'Multipurpose hall',qty:[0,0,0],unit:'halls',civil:true},
 {key:'staffQuarters',label:'Staff quarters',qty:[0,0,0],unit:'units',civil:true},
 {key:'hostel',label:'Hostel room',qty:[0,0,0],unit:'rooms',civil:true},
 {key:'clinic',label:'Clinic / sick bay',qty:[0,0,0],unit:'units',civil:true},
 {key:'eccdeFurniture',label:'ECCDE plastic furniture · 1 table and 5 chairs',qty:[12,12,12],unit:'sets'},
 {key:'dualDesk',label:'Dual-seater desk · wood and metal frame',qty:[120,180,240],unit:'sets'},
 {key:'singleSeater',label:'Single-seater plastic chair and table with locker',qty:[0,0,0],unit:'sets'},
 {key:'magneticBoard',label:'Magnetic board',qty:[8,11,14],unit:'sets'},
 {key:'teachersFurniture',label:'Teachers’ furniture · chair and table with drawer',qty:[17,20,32],unit:'sets'},
 {key:'hmFurniture',label:'Head teacher / principal furniture',qty:[1,1,1],unit:'sets'},
 {key:'storageShelf',label:'Storage shelf / cupboard',qty:[9,12,15],unit:'units'},
 {key:'workshopFurniture',label:'Workshop furniture',qty:[0,0,0],unit:'sets'},
 {key:'labFurniture',label:'Laboratory furniture',qty:[0,0,1],unit:'sets'},
 {key:'libraryFurniture',label:'Library furniture',qty:[0,0,0],unit:'sets'},
 {key:'playEquipment',label:'Play equipment',qty:[1,1,1],unit:'sets'},
 {key:'kgBed',label:'Kindergarten bed',qty:[1,1,1],unit:'units'},
 {key:'desktop',label:'Desktop computer',qty:[0,0,0],unit:'units'},
 {key:'laptop',label:'Laptop computer',qty:[0,0,0],unit:'units'},
 {key:'tablet',label:'Tablet',qty:[0,0,0],unit:'units'},
 {key:'smartBoard',label:'Interactive smart board',qty:[0,0,0],unit:'units'},
 {key:'ictAccessories',label:'ICT accessories',qty:[0,0,0],unit:'sets'},
 {key:'networking',label:'Networking equipment',qty:[0,0,0],unit:'sets'},
 {key:'workshopEquipment',label:'Workshop equipment',qty:[0,0,0],unit:'sets'},
 {key:'labEquipment',label:'Laboratory equipment',qty:[0,0,0],unit:'sets'},
 {key:'libraryEquipment',label:'Library equipment',qty:[0,0,0],unit:'sets'},
 {key:'sportsEquipment',label:'Sports equipment',qty:[0,0,0],unit:'sets'},
 {key:'solarBorehole',label:'Solar borehole with overhead tank',qty:[1,1,1],unit:'systems'},
 {key:'handpumpBorehole',label:'Handpump borehole',qty:[0,0,0],unit:'units'},
 {key:'deepWell',label:'Deep well',qty:[0,0,0],unit:'units'},
 {key:'handwashing',label:'Handwashing station',qty:[1,1,1],unit:'units'},
 {key:'rwh',label:'Rainwater harvesting system',qty:[1,1,1],unit:'systems'},
 {key:'wasteBin',label:'Waste bin',qty:[0,0,0],unit:'units'},
 {key:'playground',label:'Playground',qty:[1,1,1],unit:'units'},
 {key:'landscaping',label:'Soft and hard landscaping',qty:[1,1,1],unit:'units'},
 {key:'drainage',label:'Drainage and external works',qty:[0,0,0],unit:'lots',lump:true},
 {key:'football',label:'Football pitch with associated facilities',qty:[1,1,1],unit:'units'},
 {key:'volleyball',label:'Volleyball court with associated facilities',qty:[1,1,1],unit:'units'},
 {key:'solarPower',label:'Hybrid solar power system',qty:[1,1,1],unit:'systems'},
 {key:'solarLight',label:'All-in-one standalone outdoor solar light',qty:[20,30,30],unit:'sets'},
 {key:'erosionControl',label:'Erosion control measures',qty:[0,0,0],unit:'lots',lump:true},
];
// Deliverable groups from UBEC's "Deliverables for proposed UBEC model school typologies" (UBEC14).
export const deliverableGroups = ['Infrastructure (Construction/Renovation)', 'Furniture', 'Equipment', 'WASH Facilities', 'Special Projects/Facilities', 'Package costs'] as const;
const groupKeys: Record<string, number> = {classroomPri:0,classroomEccde:0,office:0,store:0,toilet:0,workshop:0,scienceLab:0,roboticsLab:0,vocationalLab:0,library:0,ictRoom:0,adminBlock:0,staffroom:0,fence:0,gatehouse:0,multipurposeHall:0,staffQuarters:0,hostel:0,clinic:0,block3os:0,block3:0,block6os:0,eccdeBlock:0,eccdeFurniture:1,dualDesk:1,singleSeater:1,magneticBoard:1,teachersFurniture:1,hmFurniture:1,storageShelf:1,workshopFurniture:1,labFurniture:1,libraryFurniture:1,playEquipment:2,kgBed:2,desktop:2,laptop:2,tablet:2,smartBoard:2,ictAccessories:2,networking:2,workshopEquipment:2,labEquipment:2,libraryEquipment:2,sportsEquipment:2,solarBorehole:3,handpumpBorehole:3,deepWell:3,handwashing:3,rwh:3,wasteBin:3,playground:4,landscaping:4,drainage:4,football:4,volleyball:4,solarPower:4,solarLight:4,erosionControl:4};
// Position in the typology document (S/N), so the fence (13) sits between the staff room and the gate house.
const deliverableIndex: Record<string, number> = Object.fromEntries(["classroomPri", "classroomEccde", "office", "store", "toilet", "workshop", "scienceLab", "roboticsLab", "vocationalLab", "library", "ictRoom", "adminBlock", "staffroom", "fence", "gatehouse", "multipurposeHall", "staffQuarters", "hostel", "clinic", "block3os", "block3", "block6os", "eccdeBlock", "eccdeFurniture", "dualDesk", "singleSeater", "magneticBoard", "teachersFurniture", "hmFurniture", "storageShelf", "workshopFurniture", "labFurniture", "libraryFurniture", "playEquipment", "kgBed", "desktop", "laptop", "tablet", "smartBoard", "ictAccessories", "networking", "workshopEquipment", "labEquipment", "libraryEquipment", "sportsEquipment", "solarBorehole", "handpumpBorehole", "deepWell", "handwashing", "rwh", "wasteBin", "playground", "landscaping", "drainage", "football", "volleyball", "solarPower", "solarLight", "erosionControl"].map((key, index) => [key, index]));
export const deliverableGroup = (key: string) => deliverableGroups[groupKeys[key.replace(/-(renovate|construct)$/, '')] ?? 5];
const baseKey = (key: string) => key.replace(/-(renovate|construct)$/, '');
const byDocument = <T extends { key: string }>(a: T, b: T) => (deliverableIndex[baseKey(a.key)] ?? 999) - (deliverableIndex[baseKey(b.key)] ?? 999);
export function groupDeliverables<T extends { key: string }>(rows: T[]) { return deliverableGroups.map(group => ({ group, rows: rows.filter(row => deliverableGroup(row.key) === group).sort(byDocument) })).filter(g => g.rows.length); }
export const inDeliverableOrder = <T extends { key: string }>(rows: T[]) => groupDeliverables(rows).flatMap(g => g.rows);
const quantity = z.number().int().min(0).max(1000000);
const amount = z.number().min(0).max(99999999999.99).refine(n => Math.abs(n * 100 - Math.round(n * 100)) < .001, 'Use at most two decimal places.');
const auditRow = z.object({existing:quantity, functional:quantity, extra:quantity}).refine(v=>v.functional<=v.existing,'Functional cannot exceed existing.');
export const profileSchema = z.object({male:quantity, female:quantity, latitude:z.string().max(30).refine(v=>!v||(Number.isFinite(Number(v))&&Math.abs(Number(v))<=90),'Invalid latitude.'),longitude:z.string().max(30).refine(v=>!v||(Number.isFinite(Number(v))&&Math.abs(Number(v))<=180),'Invalid longitude.')});
export const packageSchema = z.object({
 kind:z.enum(['new','whole','furniture']),schoolId:z.number().int().positive(),
 components:z.array(z.enum(['ECCDE','Primary','JSS'])).min(1).max(3),
 targeting:z.enum(['hope','nonhope']).default('nonhope'), grouping:z.enum(['standard','storey']).default('standard'),
 land:z.object({available:z.boolean(),documented:z.boolean(),unencumbered:z.boolean()}).default({available:false,documented:false,unencumbered:false}),
 documentIds:z.array(z.string().uuid()).max(30).default([]),
 audit:z.record(auditRow).default({}),fenceRequired:quantity.default(0),fenceLength:quantity.default(0),
 prices:z.record(amount).default({}),classroomStrategy:z.enum(strategies).default(defaultStrategy),
 packageCosts:z.record(z.object({cost:amount,strategy:z.enum(strategies),duration:z.string().trim().max(100)})).default({}),
 lumpSum:amount.default(0),duration:z.string().trim().max(100).default(''),contingency:amount.default(0),preliminaries:amount.default(0),
 observations:z.string().max(5000).default(''),dilapidation:z.enum(['Minor repairs required','Moderate deterioration','Unsafe / reconstruction recommended','Severe dilapidation / major rehabilitation']).default('Minor repairs required'),conditionNotes:z.string().max(5000).default(''),
 furniture:z.array(z.object({description:z.string().trim().min(1).max(500),quantity:quantity.refine(n=>n>0),cost:amount.refine(n=>n>0)})).max(100).default([]),
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
  otherSubtotal+=add('eccdeBlock','ECCDE block · 2 classrooms, nanny station, sleeping bay and 2 toilets',1,'block',true,input.targeting==='hope'?input.prices.eccdeBlock??0:0);
  for(const r of requirements.filter(r=>!['classroomPri','classroomEccde','office','store'].includes(r.key)&&r.qty[model]>0)) otherSubtotal+=add(r.key,r.label+(r.key==='solarPower'?` · ${[5,7.5,10][model]} KVA`:''),r.qty[model],r.unit,!!r.lump,input.targeting==='hope'?input.prices[r.key]??0:0);
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
 if(input.kind==='whole'&&!input.observations.trim())return 'Enter the site observations.';
 const primaryAudit=input.audit.classroomPri;
 if(input.kind==='whole'&&primaryAudit&&primaryAudit.existing>primaryAudit.functional&&!input.conditionNotes.trim())return 'Enter the structural condition notes.';
 const result=calculateInfrastructure(input,enrolment);
 if(!result.items.length||result.total<=0)return 'Add and cost the required items before saving.';
 if(!Number.isSafeInteger(cents(result.total)))return 'The package total is too large.';
 if(input.kind==='whole'&&result.items.some(i=>i.cost<=0||!i.duration))return 'Enter a cost and duration for each intervention.';
 if(input.kind==='new'&&input.targeting==='nonhope'&&!input.duration)return 'Enter the construction duration.';
 return null;
}
