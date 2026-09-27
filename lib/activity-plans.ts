import { z } from 'zod';
export const activityWorkstreams = ['sbmc', 'tlm'] as const;
export type ActivityWorkstream = typeof activityWorkstreams[number];
export const activityNames = {
  sbmc: ['School-Based Management Committees', 'Low-cost rehabilitation of community ECCDE centres', 'Small-scale school improvement projects', 'School operations and development planning', 'Capacity building of SBMC members', 'Sensitization campaigns', 'Support to private/community schools and stakeholders', 'Others'],
  tlm: ['Purchase of TLMs to Schools', 'Capacity Building of Teachers on the Implementation of the Revised TLMs', 'Distribution of TLMs to Schools', 'Monitoring of TLMs', 'Others'],
} as const;
export const selectableActivityIndexes = { sbmc: [0,1,2,3,4,5,6,7], tlm: [0,2,3,4] } as const;
export const otherActivityIndex = { sbmc: 7, tlm: 4 } as const;
export const activityLabel = (workstream: ActivityWorkstream, activity: number, customActivity = '') => activity === otherActivityIndex[workstream] && customActivity ? customActivity : activityNames[workstream][activity] ?? 'Unknown activity';
export const materialTypes = ['Textbooks', 'Teachers guide', 'Interactive learning materials', 'Teaching aids & basic devices'] as const;
export const textbookClasses = ['Primary 1', 'Primary 2', 'Primary 3', 'Primary 4', 'Primary 5', 'Primary 6', 'JSS 1', 'JSS 2', 'JSS 3'] as const;
export const textbookSubjects = ['English/literacy (Core)', 'Mathematics/Numeracy (Core)', 'Basic Science (Core)', 'Social Studies', 'Nigerian languages (one local language textbook)', 'Physical and Health Education', 'History'] as const;
export const implementationStrategies = ['NCB', 'Request for quotation', 'Market survey', 'Single source/Direct contracting', 'Prequalification', 'Quality and cost based', 'Consultant Qualification', 'E-payment/Cash transfer', 'Credit School account', 'Credit SBMC school account', 'Credit staff concern account', 'Direct payment to vendor'] as const;
export const targetGroups = ['National level', 'State level', 'LGA level', 'Community level', 'Schools', 'All Learners', 'All Learners and Teachers', 'ECCDE Learners', 'Primary School Learners', 'JSS Learners', 'Teachers', 'ECCDE Learners and Teachers', 'Primary School Learners and Teachers', 'JSS Learners and Teachers'] as const;
export const activityLineSchema = z.object({
  workstream: z.enum(activityWorkstreams), activity: z.number().int().min(0),
  description: z.string().trim().min(1, 'Enter a description.').max(1000),
  rationale: z.string().trim().max(1000).default(''),
  implementationApproach: z.string().trim().max(1000).default(''),
  quantity: z.number().int().min(1).max(1000000),
  unitCost: z.number().positive().max(999999999999.99).refine(n=>Math.abs(n*100-Math.round(n*100))<.001, 'Use at most two decimal places.'),
  strategy: z.enum(implementationStrategies), targetGroup: z.enum(targetGroups), location: z.enum(['Rural','Urban']),
  equipment: z.string().max(100).default(''),
  customActivity: z.string().trim().max(160).default(''),
  textbookClasses: z.array(z.enum(textbookClasses)).max(textbookClasses.length).default([]),
  textbookSubject: z.string().max(100).default(''),
}).superRefine((v,ctx)=>{
  if(v.workstream==='sbmc') for(const field of ['rationale','implementationApproach'] as const) if(!v[field])ctx.addIssue({code:'custom',path:[field],message:field==='rationale'?'Enter a rationale.':'Enter an implementation approach.'});
  if(!selectableActivityIndexes[v.workstream].some(activity=>activity===v.activity))ctx.addIssue({code:'custom',path:['activity'],message:'Choose a valid allowable activity.'});
  const isOther=v.activity===otherActivityIndex[v.workstream];
  if(isOther&&!v.customActivity)ctx.addIssue({code:'custom',path:['customActivity'],message:'Enter the allowable activity.'});
  if(!isOther&&v.customActivity)ctx.addIssue({code:'custom',path:['customActivity'],message:'A custom activity only applies when Others is selected.'});
  if(v.workstream==='tlm'&&v.activity===0&&!materialTypes.some(m=>m===v.equipment))ctx.addIssue({code:'custom',path:['equipment'],message:'Choose a material type.'});
  if(!(v.workstream==='tlm'&&v.activity===0)&&v.equipment)ctx.addIssue({code:'custom',path:['equipment'],message:'Material type only applies to TLM purchases.'});
  const isTextbook=v.workstream==='tlm'&&v.activity===0&&v.equipment==='Textbooks';
  if(isTextbook&&!v.textbookClasses.length)ctx.addIssue({code:'custom',path:['textbookClasses'],message:'Choose at least one class for the textbooks.'});
  if(isTextbook&&!textbookSubjects.some(subject=>subject===v.textbookSubject))ctx.addIssue({code:'custom',path:['textbookSubject'],message:'Choose a subject for the textbooks.'});
  if(!isTextbook&&(v.textbookClasses.length||v.textbookSubject))ctx.addIssue({code:'custom',path:['textbookClasses'],message:'Class and subject only apply to textbooks.'});
  if(!Number.isSafeInteger(Math.round(v.unitCost*100)*v.quantity))ctx.addIssue({code:'custom',path:['unitCost'],message:'Line total is too large.'});
});
export type ActivityLine = z.infer<typeof activityLineSchema> & {id:number};
export type ActivitySnapshotLine = Omit<ActivityLine,'unitCost'|'targetGroup'|'implementationApproach'|'customActivity'|'textbookClasses'|'textbookSubject'> & {unit_cost:string;target_group:string;implementation_approach?:string;custom_activity?:string;textbook_classes?:string[];textbook_subject?:string};
export type DistributionSchool = {id:number;name:string;lga:string;level:string;location:string};
