import { Table,TableBody,TableCell,TableHead,TableHeader,TableRow,TableFooter } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDownIcon } from 'lucide-react';
import { DocumentFiles } from '@/components/document-files';
import { Fragment,type ReactNode } from 'react';
import { auditGaps,quantityLabel,kindNames,groupDeliverables,deliverableDescription,type InfrastructurePackage,type InfraDocument,type SchoolBasis } from '@/lib/infrastructure-model';
const money=new Intl.NumberFormat('en-NG',{style:'currency',currency:'NGN'});
/** Header row naming a deliverable group (Infrastructure, Furniture, Equipment, WASH…) in an infrastructure table. */
export function DeliverableGroupRow({group,colSpan,sticky=false}:{group:string;colSpan:number;/** Keep the label in view while a wide table scrolls sideways. */sticky?:boolean}){return <TableRow className="bg-muted/60 hover:bg-muted/60"><TableCell colSpan={colSpan} className="py-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">{sticky?<span className="sticky left-2">{group}</span>:group}</TableCell></TableRow>;}
/** Renders rows under deliverable group headers; furniture-only packages stay ungrouped because their items are free text. */
export function GroupedRows<T extends {key:string}>({rows,colSpan,grouped=true,render}:{rows:T[];colSpan:number;grouped?:boolean;render:(row:T)=>ReactNode}){return grouped?groupDeliverables(rows).map(g=><Fragment key={g.group}><DeliverableGroupRow group={g.group} colSpan={colSpan}/>{g.rows.map(render)}</Fragment>):<>{rows.map(render)}</>;}
/** The enrolment basis a saved result was calculated from (Whole School results carry it since October 2026; older ones only the total). */
export const resultBasis=(result:InfrastructurePackage['result']):SchoolBasis=>'basis' in result&&result.basis?{total:result.enrolment,...result.basis}:result.enrolment;
/** Read-only audit: every Minimum Standard row, and the Other Facilities rows that were filled in. */
export function AuditSummaryTable({input,school}:{input:InfrastructurePackage['input'];school:SchoolBasis}){
 const gaps=auditGaps(input,school).filter(g=>g.included);
 return <Table><TableHeader><TableRow>{['Requirement','Required','Existing','Functional','Non-functional','Additional'].map(v=><TableHead key={v}>{v}</TableHead>)}</TableRow></TableHeader><TableBody><GroupedRows rows={gaps} colSpan={6} render={g=><TableRow key={g.key}><TableCell className="whitespace-normal">{g.label}{g.category==='other'&&<Badge variant="outline" className="ml-1.5">Other facility</Badge>}</TableCell>{[g.category==='other'?'—':g.key==='fence'?`${input.fenceRequired} metres`:g.required,g.existing,g.functional,g.nonFunctional,g.additional].map((v,i)=><TableCell key={i}>{v}</TableCell>)}</TableRow>}/></TableBody></Table>;
}
/** Learners (and, for New Construction, the model) a package was sized for. */
function packageBasis(record:InfrastructurePackage){const {input,result}=record;const basis='basis' in result?result.basis:undefined;const levels=basis?[['ECCDE',basis.eccde],['Primary',basis.primary],['JSS',basis.jss]].filter(([,n])=>Number(n)>0).map(([l,n])=>`${l} ${Number(n).toLocaleString()}`):[];return [input.kind==='new'?result.modelLabel:'',`${result.enrolment.toLocaleString()} learners${levels.length?` (${levels.join(' · ')})`:''}`,basis&&input.kind==='whole'?(basis.teachers?`${basis.teachers} teachers`:'teachers not recorded'):''].filter(Boolean).join(' · ');}
export function InfrastructurePackageDetails({record}:{record:InfrastructurePackage}){
 const {input,result}=record;
 // New Construction (one lump-sum package): requirements with their description, no per-row costs (client feedback, October 2026).
 const lumpSum=input.kind==='new'&&input.targeting==='nonhope';
 const packageRow=result.items.find(item=>item.key==='package');
 return <div className="flex flex-col gap-5">
  <div className="flex flex-wrap items-center gap-3"><Badge variant="secondary">{kindNames[input.kind]}</Badge><span>{packageBasis(record)}</span>{input.kind==='new'&&input.targeting==='hope'&&<Badge variant="outline">HOPE</Badge>}</div>
  <p>{input.components.join(' · ')}{input.observations&&` · ${input.observations}`}</p>
  {input.kind==='whole'&&<Collapsible className="package-audit"><CollapsibleTrigger asChild><Button variant="ghost" size="sm" className="package-audit-trigger"><ChevronDownIcon data-icon="inline-start" />School audit</Button></CollapsibleTrigger><CollapsibleContent><AuditSummaryTable input={input} school={resultBasis(result)}/>{input.conditionNotes&&<p>{input.dilapidation}: {input.conditionNotes}</p>}</CollapsibleContent></Collapsible>}
  {lumpSum?<>
   <Table><TableHeader><TableRow>{['Requirement','Quantity','Description'].map(v=><TableHead key={v}>{v}</TableHead>)}</TableRow></TableHeader><TableBody><GroupedRows rows={result.items} colSpan={3} render={item=><TableRow key={item.key}><TableCell className="whitespace-normal"><strong>{item.label}</strong></TableCell><TableCell>{quantityLabel(item.quantity,item.unit)}</TableCell><TableCell className="whitespace-normal text-muted-foreground">{deliverableDescription(item.key,result.model)}</TableCell></TableRow>}/></TableBody></Table>
   <dl className="grid gap-3 text-sm sm:grid-cols-3 [&_dt]:text-muted-foreground [&_dd]:font-medium"><div><dt>Complete construction package</dt><dd className="tabular-nums">{money.format(packageRow?.total??result.total)}</dd></div>{packageRow?.strategy&&<div><dt>Implementation strategy</dt><dd>{packageRow.strategy}</dd></div>}{packageRow?.duration&&<div><dt>Duration</dt><dd>{packageRow.duration}</dd></div>}</dl>
  </>:<Table><TableHeader><TableRow>{['Requirement','Quantity','Cost basis','Strategy / duration','Amount'].map(v=><TableHead key={v}>{v}</TableHead>)}</TableRow></TableHeader><TableBody><GroupedRows rows={result.items} colSpan={5} grouped={input.kind!=='furniture'} render={item=><TableRow key={item.key}><TableCell className="whitespace-normal"><strong>{item.label}</strong>{item.operation&&<p>{item.operation}</p>}</TableCell><TableCell>{quantityLabel(item.quantity,item.unit)}</TableCell><TableCell>{item.lump?'Lump sum':money.format(item.cost)+' / unit'}</TableCell><TableCell>{item.strategy||'—'}{item.duration&&<p>{item.duration}</p>}</TableCell><TableCell className="tabular-nums">{money.format(item.total)}</TableCell></TableRow>}/></TableBody><TableFooter><TableRow><TableCell colSpan={4}>Total</TableCell><TableCell>{money.format(result.total)}</TableCell></TableRow></TableFooter></Table>}
 </div>;
}
export function InfrastructureDocumentLinks({documents}:{documents:InfraDocument[]}){return <DocumentFiles documents={documents.map(doc=>({...doc,url:'/api/infrastructure/documents?id='+doc.id,description:[{boq:'BOQ',survey:'Geophysical survey report',drawings:'Drawings',land:'C of O, R of O or Community Agreement',photo:'Photographic evidence'}[doc.kind],doc.schoolName].filter(Boolean).join(' · ')}))}/>;}
