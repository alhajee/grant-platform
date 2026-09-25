import { z } from 'zod';
export const activityWorkstreams = ['sbmc', 'tlm'] as const;
export type ActivityWorkstream = typeof activityWorkstreams[number];
export const activityNames = {
  sbmc: ['School-Based Management Committees', 'Low-cost rehabilitation of community ECCDE centres', 'Small-scale school improvement projects', 'School operations and development planning', 'Capacity building of SBMC members', 'Sensitization campaigns', 'Support to private/community schools and stakeholders'],
  tlm: ['Purchase of TLMs to Schools', 'Capacity Building of Teachers on the Implementation of the Revised TLMs', 'Distribution of TLMs to Schools', 'Monitoring of TLMs'],
} as const;
export const materialTypes = ['Textbooks', 'Interactive learning materials', 'Teaching aids & basic devices'] as const;
export const implementationStrategies = ['Request for quotation', 'Market survey', 'Single source/Direct contracting', 'Prequalification', 'Quality and cost based', 'Consultant Qualification', 'E-payment/Cash transfer', 'Credit School account', 'Credit SBMC school account', 'Credit staff concern account', 'Direct payment to vendor'] as const;
export const targetGroups = ['National level', 'State level', 'LGA level', 'Community level', 'Schools', 'All Learners', 'All Learners and Teachers', 'ECCDE Learners', 'Primary School Learners', 'JSS Learners', 'Teachers', 'ECCDE Learners and Teachers', 'Primary School Learners and Teachers', 'JSS Learners and Teachers'] as const;
export const activityLineSchema = z.object({
  workstream: z.enum(activityWorkstreams), activity: z.number().int().min(0),
  description: z.string().trim().min(1, 'Enter a description.').max(1000),
  quantity: z.number().int().min(1).max(1000000),
  unitCost: z.number().positive().max(999999999999.99).refine(n=>Math.abs(n*100-Math.round(n*100))<.001, 'Use at most two decimal places.'),
  strategy: z.enum(implementationStrategies), targetGroup: z.enum(targetGroups), location: z.enum(['Rural','Urban']),
  equipment: z.string().max(100).default(''),
}).superRefine((v,ctx)=>{
  if(v.activity>=activityNames[v.workstream].length)ctx.addIssue({code:'custom',path:['activity'],message:'Choose a valid activity.'});
  if(v.workstream==='tlm'&&v.activity===0&&!materialTypes.some(m=>m===v.equipment))ctx.addIssue({code:'custom',path:['equipment'],message:'Choose a material type.'});
  if(!(v.workstream==='tlm'&&v.activity===0)&&v.equipment)ctx.addIssue({code:'custom',path:['equipment'],message:'Material type only applies to TLM purchases.'});
  if(!Number.isSafeInteger(Math.round(v.unitCost*100)*v.quantity))ctx.addIssue({code:'custom',path:['unitCost'],message:'Line total is too large.'});
});
export type ActivityLine = z.infer<typeof activityLineSchema> & {id:number};
export type ActivitySnapshotLine = Omit<ActivityLine,'unitCost'|'targetGroup'> & {unit_cost:string;target_group:string};
export type DistributionSchool = {id:number;name:string;lga:string;level:string;location:string};
