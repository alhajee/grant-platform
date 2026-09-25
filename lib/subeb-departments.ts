// SUBEB operational departments from the reference, distinct from UBEC's directory.
export const subebDepartments = [
  {id:'physical',name:'Physical Planning'},
  {id:'academic',name:'Academic Services'},
  {id:'me',name:'Monitoring & Evaluation'},
  {id:'teachers',name:'Teacher Development'},
  {id:'ict',name:'ICT'},
  {id:'social',name:'Social Mobilisation'},
  {id:'planning',name:'Planning, Research & Statistics'},
] as const;
export const subebDepartmentName=(id:string)=>subebDepartments.find(d=>d.id===id)?.name ?? id;
