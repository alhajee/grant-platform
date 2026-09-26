import type { Snapshot } from './plan-review';

export function infrastructureDocumentProblem(snapshot: Snapshot): string | null {
 const documents=snapshot.infrastructureDocuments??[];
 if(!documents.some(d=>d.kind==='drawings'&&!d.schoolId))return 'Attach the plan drawings before sending Infrastructure.';
 const schools=new Map<number,{name:string;survey:boolean}>();
 for(const line of snapshot.infrastructure){
  const id=line.package?.input.schoolId??line.school.id;
  if(!id)return 'Associate supporting documents with each infrastructure school before sending.';
  const survey=line.package?.kind!=='furniture';
  schools.set(id,{name:line.school.name,survey:survey||schools.get(id)?.survey===true});
 }
 for(const [id,school] of schools){
  for(const kind of school.survey?['boq','survey']:['boq']){
   if(!documents.some(d=>d.schoolId===id&&d.kind===kind))return `Attach ${kind==='boq'?'a BOQ':'a site / geophysical survey'} for ${school.name} before sending Infrastructure.`;
  }
 }
 return null;
}
