import { Table,TableBody,TableCell,TableHead,TableHeader,TableRow,TableFooter } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDownIcon } from 'lucide-react';
import { DocumentFiles } from '@/components/document-files';
import { Fragment,type ReactNode } from 'react';
import { auditGaps,quantityLabel,kindNames,groupDeliverables,type InfrastructurePackage,type InfraDocument } from '@/lib/infrastructure-model';
const money=new Intl.NumberFormat('en-NG',{style:'currency',currency:'NGN'});
/** Header row naming a deliverable group (Infrastructure, Furniture, Equipment, WASH…) in an infrastructure table. */
export function DeliverableGroupRow({group,colSpan,sticky=false}:{group:string;colSpan:number;/** Keep the label in view while a wide table scrolls sideways. */sticky?:boolean}){return <TableRow className="bg-muted/60 hover:bg-muted/60"><TableCell colSpan={colSpan} className="py-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">{sticky?<span className="sticky left-2">{group}</span>:group}</TableCell></TableRow>;}
/** Renders rows under deliverable group headers; furniture-only packages stay ungrouped because their items are free text. */
export function GroupedRows<T extends {key:string}>({rows,colSpan,grouped=true,render}:{rows:T[];colSpan:number;grouped?:boolean;render:(row:T)=>ReactNode}){return grouped?groupDeliverables(rows).map(g=><Fragment key={g.group}><DeliverableGroupRow group={g.group} colSpan={colSpan}/>{g.rows.map(render)}</Fragment>):<>{rows.map(render)}</>;}
/** Read-only audit: every Minimum Standard row, and the Other Requirements rows that were filled in. */
export function AuditSummaryTable({input,enrolment}:{input:InfrastructurePackage['input'];enrolment:number}){
 const gaps=auditGaps(input,enrolment).filter(g=>g.included);
 return <Table><TableHeader><TableRow>{['Requirement','Standard','Required','Existing','Functional','Non-functional','Additional','Extra'].map(v=><TableHead key={v}>{v}</TableHead>)}</TableRow></TableHeader><TableBody><GroupedRows rows={gaps} colSpan={8} render={g=><TableRow key={g.key}><TableCell className="whitespace-normal">{g.label}{g.category==='other'&&<Badge variant="outline" className="ml-1.5">Other</Badge>}</TableCell><TableCell className="whitespace-normal">{g.category==='other'?'—':g.key==='fence'?`${input.fenceRequired} metres`:g.standard}</TableCell>{[g.category==='other'?'—':g.required,g.existing,g.functional,g.nonFunctional,g.additional,g.extra].map((v,i)=><TableCell key={i}>{v}</TableCell>)}</TableRow>}/></TableBody></Table>;
}
export function InfrastructurePackageDetails({record}:{record:InfrastructurePackage}){
 const {input,result}=record;
 return <div className="flex flex-col gap-5">
  <div className="flex flex-wrap items-center gap-3"><Badge variant="secondary">{kindNames[input.kind]}</Badge><span>{result.modelLabel} · {result.enrolment} learners</span>{input.kind==='new'&&input.targeting==='hope'&&<Badge variant="outline">HOPE</Badge>}</div>
  <p>{input.components.join(' · ')}{input.observations&&` · ${input.observations}`}</p>
  {input.kind==='whole'&&<Collapsible className="package-audit"><CollapsibleTrigger asChild><Button variant="ghost" size="sm" className="package-audit-trigger"><ChevronDownIcon data-icon="inline-start" />School audit</Button></CollapsibleTrigger><CollapsibleContent><AuditSummaryTable input={input} enrolment={result.enrolment}/>{input.conditionNotes&&<p>{input.dilapidation}: {input.conditionNotes}</p>}</CollapsibleContent></Collapsible>}
  <Table><TableHeader><TableRow>{['Requirement','Quantity','Cost basis','Strategy / duration','Amount'].map(v=><TableHead key={v}>{v}</TableHead>)}</TableRow></TableHeader><TableBody><GroupedRows rows={result.items} colSpan={5} grouped={input.kind!=='furniture'} render={item=><TableRow key={item.key}><TableCell className="whitespace-normal"><strong>{item.label}</strong>{item.operation&&<p>{item.operation}</p>}</TableCell><TableCell>{quantityLabel(item.quantity,item.unit)}</TableCell><TableCell>{input.kind==='new'&&input.targeting==='nonhope'&&item.key!=='package'?'Included in package':item.lump?'Lump sum':money.format(item.cost)+' / unit'}</TableCell><TableCell>{item.strategy||'—'}{item.duration&&<p>{item.duration}</p>}</TableCell><TableCell className="tabular-nums">{input.kind==='new'&&input.targeting==='nonhope'&&item.key!=='package'?'—':money.format(item.total)}</TableCell></TableRow>}/></TableBody><TableFooter><TableRow><TableCell colSpan={4}>Total</TableCell><TableCell>{money.format(result.total)}</TableCell></TableRow></TableFooter></Table>
 </div>;
}
export function InfrastructureDocumentLinks({documents}:{documents:InfraDocument[]}){return <DocumentFiles documents={documents.map(doc=>({...doc,url:'/api/infrastructure/documents?id='+doc.id,description:[{boq:'BOQ',survey:'Geophysical survey report',drawings:'Drawings',land:'Land documentation',photo:'Photographic evidence'}[doc.kind],doc.schoolName].filter(Boolean).join(' · ')}))}/>;}
