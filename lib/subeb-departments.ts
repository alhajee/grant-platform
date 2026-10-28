// SUBEB operational departments from the reference, distinct from UBEC's directory.
export const subebDepartments = [
  {id:'physical',name:'Physical Planning'},
  {id:'academic',name:'Academic Services'},
  {id:'me',name:'Monitoring & Evaluation'},
  {id:'teachers',name:'Teacher Development'},
  {id:'ict',name:'ICT'},
  {id:'social',name:'Social Mobilisation'},
  {id:'planning',name:'Planning, EMIS & Data Platform'},
] as const;
/**
 * Support departments (UBEC130, October 2026): they own no components. Procurement keeps the state's price list;
 * Finance uploads the plan's Finance documents. Each has a Director and Data Entry Staff like the others.
 */
export const supportDepartments = [
  {id:'procurement',name:'Procurement'},
  {id:'finance',name:'Finance'},
  // UBEC183 (28 October 2026): Special Programmes, an oversight department with a Director and Data Entry Officer.
  {id:'special',name:'Special Programmes'},
] as const;
/** Every SUBEB department a user can hold. */
export const stateDepartments = [...subebDepartments, ...supportDepartments] as const;
export const isSupportDepartment=(id:string)=>supportDepartments.some(d=>d.id===id);
export const subebDepartmentName=(id:string)=>stateDepartments.find(d=>d.id===id)?.name ?? id;
