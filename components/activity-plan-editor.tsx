'use client';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from '@/components/ui/alert-dialog';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Combobox, ComboboxContent, ComboboxEmpty, ComboboxInput, ComboboxItem, ComboboxList } from '@/components/ui/combobox';
import { activityNames, activityLineSchema, materialTypes, implementationStrategies, targetGroups, type ActivityLine, type ActivityWorkstream, type DistributionSchool } from '@/lib/activity-plans';
import { currentPlanHref, planPeriod, type ActionPlan } from '@/lib/action-plans';
import { allocatedAmount, defaultAllocation } from '@/lib/funding-policy';
import './activity-plan-editor.css';
const money=new Intl.NumberFormat('en-NG',{style:'currency',currency:'NGN'});
const blank={activity:'0',description:'',quantity:'1',unitCost:'',strategy:'',targetGroup:'',location:'',equipment:''};
type Draft=typeof blank & {id?:number};
type Data={plan:ActionPlan;canEdit:boolean;lines:ActivityLine[];schools:DistributionSchool[];distribution:DistributionSchool[]};
export function ActivityPlanEditor({workstream}:{workstream:ActivityWorkstream}){
 const [data,setData]=useState<Data|null>(null),[draft,setDraft]=useState<Draft>(blank),[baseline,setBaseline]=useState<Draft>(blank);
 const [error,setError]=useState(''),[busy,setBusy]=useState(false),[view,setView]=useState('budget'),[school,setSchool]=useState(''),[query,setQuery]=useState('');
 const [pending,setPending]=useState<null|(()=>void)>(null),[removal,setRemoval]=useState<{entity:'line'|'school';id:number}|null>(null);
 const lock=useRef(false),dirty=JSON.stringify(draft)!==JSON.stringify(baseline);
 const title=workstream==='sbmc'?'SBMC':'Teaching & Learning Materials';
 const endpoint=()=>currentPlanHref('/api/activities')+(currentPlanHref('/api/activities').includes('?')?'&':'?')+'workstream='+workstream;
 const load=useCallback(async()=>{const r=await fetch(currentPlanHref('/api/activities')+(currentPlanHref('/api/activities').includes('?')?'&':'?')+'workstream='+workstream,{cache:'no-store'});if(!r.ok)throw new Error((await r.json() as {error?:string}).error||'Unable to load component.');setData(await r.json());setError('');},[workstream]);
 useEffect(()=>{void load().catch(e=>setError(e.message));},[load]);
 useEffect(()=>{const warn=(e:BeforeUnloadEvent)=>{if(dirty){e.preventDefault();e.returnValue='';}};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);},[dirty]);
 const reset=()=>{setDraft(blank);setBaseline(blank);};
 const guard=(run:()=>void)=>{if(dirty)setPending(()=>run);else run();};
 const disabled=busy||!data?.canEdit||!!error;
 const total=(data?.lines.reduce((s,l)=>s+Math.round(l.unitCost*100)*l.quantity,0)??0)/100;
 const policy=data?.plan.fundingPolicy?.allocation??defaultAllocation;
 const envelope=data?.plan.fundingTotal?Number(allocatedAmount(data.plan.fundingTotal,policy.shares[workstream==='tlm'?'infrastructure':'sbmc'],workstream==='tlm'?policy.tlmWithinInfrastructure:10000)):null;
 async function mutate(body:object){if(lock.current)return;lock.current=true;setBusy(true);try{const r=await fetch(endpoint(),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...body,workstream})});const result=await r.json() as {error?:string};if(!r.ok)throw new Error(result.error);reset();setSchool('');setRemoval(null);await load();toast.success('Saved.');}catch(e){toast.error(e instanceof Error?e.message:'Unable to save.');}finally{lock.current=false;setBusy(false);}}
 function save(e:FormEvent){e.preventDefault();const parsed=activityLineSchema.safeParse({...draft,workstream,activity:Number(draft.activity),quantity:Number(draft.quantity),unitCost:Number(draft.unitCost)});if(!parsed.success){setError('');toast.error(parsed.error.issues[0].message);return;}void mutate({...parsed.data,entity:'line',action:draft.id?'update':'create',id:draft.id});}
 function edit(l:ActivityLine){guard(()=>{const d={id:l.id,activity:String(l.activity),description:l.description,quantity:String(l.quantity),unitCost:String(l.unitCost),strategy:l.strategy,targetGroup:l.targetGroup,location:l.location,equipment:l.equipment};setDraft(d);setBaseline(d);setView('budget');});}
 function select(key:keyof typeof blank,label:string,options:readonly string[]){return <Field><FieldLabel htmlFor={key}>{label}</FieldLabel><NativeSelect id={key} required value={draft[key]} onChange={e=>setDraft({...draft,[key]:e.target.value})}><NativeSelectOption value="">Choose…</NativeSelectOption>{options.map(o=><NativeSelectOption key={o} value={o}>{o}</NativeSelectOption>)}</NativeSelect></Field>;}
 const filtered=data?.lines.filter(l=>[l.description,activityNames[workstream][l.activity],l.strategy,l.targetGroup,l.equipment].join(' ').toLowerCase().includes(query.toLowerCase()))??[];
 return <div className="portal-shell activity-shell"><div className="portal-workspace">
  <header className="workspace-header editor-page-header"><div className="editor-header-heading"><Button variant="ghost" onClick={()=>guard(()=>window.location.assign(currentPlanHref('/beap')))}>← Action plan</Button><span className="editor-plan-title">{title}{data?' · '+planPeriod(data.plan):''}</span></div><Button variant="outline" disabled={busy} onClick={()=>guard(()=>window.location.assign(currentPlanHref('/beap/review')+'#review-'+workstream))}>Review & send</Button></header>
  {workstream==='tlm'&&<Tabs value={view} onValueChange={v=>guard(()=>{reset();setView(v);})}><TabsList className="m-3"><TabsTrigger value="budget">Budget activities</TabsTrigger><TabsTrigger value="distribution">Distribution list</TabsTrigger></TabsList></Tabs>}
  <div className="activity-split">
   <section className="workspace-pane editor-pane" aria-label={`${title} editor`}><ScrollArea className="pane-scroll"><div className="editor-canvas">
    <header className="editor-heading"><h1>{view==='distribution'?'Add a school':draft.id?'Edit budget item':'Add a budget item'}</h1></header>
    {error&&<Alert variant="destructive"><AlertTitle>Unable to load</AlertTitle><AlertDescription>{error}<Button variant="outline" onClick={()=>void load().catch(e=>setError(e.message))}>Retry</Button></AlertDescription></Alert>}
    {data&&!data.canEdit&&<Alert><AlertTitle>Read-only</AlertTitle><AlertDescription>This component cannot be edited by your account at its current review stage.</AlertDescription></Alert>}
    <form id="activity-form" onSubmit={view==='budget'?save:e=>{e.preventDefault();void mutate({entity:'school',action:'create',schoolId:Number(school)});}}><fieldset disabled={disabled}><FieldGroup>
     {view==='distribution'?<Field><FieldLabel htmlFor="school">School</FieldLabel><Combobox items={data?.schools.filter(s=>!data.distribution.some(d=>d.id===s.id))??[]} value={data?.schools.find(s=>String(s.id)===school)??null} disabled={disabled} onValueChange={(s)=>setSchool(s?String(s.id):'')} itemToStringLabel={(s:DistributionSchool)=>s.name} itemToStringValue={(s:DistributionSchool)=>String(s.id)} isItemEqualToValue={(a,b)=>a.id===b.id}><ComboboxInput id="school" placeholder="Search your state school register…" showClear/><ComboboxContent><ComboboxEmpty>No schools match your search.</ComboboxEmpty><ComboboxList>{(s:DistributionSchool)=><ComboboxItem key={s.id} value={s}><span className="school-option"><span>{s.name}</span><small>{s.lga} · {s.level}</small></span></ComboboxItem>}</ComboboxList></ComboboxContent></Combobox>{data?.schools.length===0&&<p>No schools are available in your state register.</p>}</Field>:<>
      <Field><FieldLabel htmlFor="activity">Activity</FieldLabel><NativeSelect id="activity" value={draft.activity} onChange={e=>setDraft({...draft,activity:e.target.value,equipment:''})}>{activityNames[workstream].map((a,i)=><NativeSelectOption value={i} key={a}>{a}</NativeSelectOption>)}</NativeSelect></Field>
      {workstream==='tlm'&&draft.activity==='0'&&select('equipment','Material type',materialTypes)}
      <Field><FieldLabel htmlFor="description">Description</FieldLabel><Textarea id="description" required maxLength={1000} value={draft.description} onChange={e=>setDraft({...draft,description:e.target.value})}/></Field>
      <FieldGroup className="grid grid-cols-2 gap-4"><Field><FieldLabel htmlFor="quantity">Quantity</FieldLabel><Input id="quantity" type="number" min="1" max="1000000" step="1" required value={draft.quantity} onChange={e=>setDraft({...draft,quantity:e.target.value})}/></Field><Field><FieldLabel htmlFor="unitCost">Unit cost (₦)</FieldLabel><Input id="unitCost" type="number" min="0.01" step="0.01" required value={draft.unitCost} onChange={e=>setDraft({...draft,unitCost:e.target.value})}/></Field></FieldGroup>
      {select('strategy','Implementation strategy',implementationStrategies)}{select('targetGroup','Target group',targetGroups)}{select('location','Location',['Rural','Urban'])}
     </>}
    </FieldGroup></fieldset></form>
   </div></ScrollArea><div className="editor-footer"><div className="line-total"><span>{view==='budget'?'Line total':'Distribution schools'}</span><strong>{view==='budget'?money.format((Math.round(Number(draft.unitCost||0)*100)*Number(draft.quantity||0))/100):data?.distribution.length??0}</strong></div><div className="footer-actions">{draft.id&&<Button variant="ghost" disabled={busy} onClick={()=>guard(reset)}>Cancel</Button>}<Button form="activity-form" type="submit" disabled={disabled||(view==='distribution'&&!school)}>{busy?'Saving…':draft.id?'Save changes':view==='budget'?'Add item':'Add school'}</Button></div></div></section>
   <section className="workspace-pane preview-pane" aria-label="Saved component"><ScrollArea className="pane-scroll"><article className="preview-document sports-preview">
    <div className="plan-overview"><div><span>Proposed {workstream.toUpperCase()} budget</span><strong>{error?'Unavailable':data?money.format(total):'Loading…'}</strong></div><p>{!data?'':envelope===null?'Funding envelope not set':`Funding envelope: ${money.format(envelope)}`}</p></div>
    {envelope!==null&&total>envelope&&<Alert variant="destructive"><AlertTitle>Above funding envelope</AlertTitle><AlertDescription>The planned total exceeds the envelope by {money.format(total-envelope)}.</AlertDescription></Alert>}
    {view==='distribution'?<><h2>Distribution list</h2><Table><TableHeader><TableRow><TableHead>School</TableHead><TableHead>LGA</TableHead><TableHead>Level</TableHead><TableHead>Location</TableHead><TableHead>Actions</TableHead></TableRow></TableHeader><TableBody>{data?.distribution.map(s=><TableRow key={s.id}><TableCell>{s.name}</TableCell><TableCell>{s.lga}</TableCell><TableCell>{s.level}</TableCell><TableCell>{s.location}</TableCell><TableCell><Button variant="ghost" size="sm" disabled={disabled} onClick={()=>setRemoval({entity:'school',id:s.id})}>Remove</Button></TableCell></TableRow>)}{!data?.distribution.length&&<TableRow><TableCell colSpan={5}>Add at least one school before sending TLM for review.</TableCell></TableRow>}</TableBody></Table></>:<>
     <Input aria-label="Search budget items" placeholder="Search saved items…" value={query} onChange={e=>setQuery(e.target.value)} className="mb-4"/>
     {activityNames[workstream].map((name,i)=>{const lines=filtered.filter(l=>l.activity===i);if(query&&!lines.length)return null;return <section className="activity-table-section" key={name}><div className="flex items-start justify-between gap-4"><h2>{name}</h2><strong className="tabular-nums whitespace-nowrap">{money.format(lines.reduce((s,l)=>s+Math.round(l.unitCost*100)*l.quantity,0)/100)}</strong></div><Table><TableHeader><TableRow><TableHead>Description / targeting</TableHead><TableHead>Qty</TableHead><TableHead>Unit cost</TableHead><TableHead>Total</TableHead><TableHead>Actions</TableHead></TableRow></TableHeader><TableBody>{lines.map(l=><TableRow key={l.id}><TableCell><strong>{l.description}</strong>{l.equipment&&<div>{l.equipment}</div>}<div className="text-muted-foreground">{l.strategy}<br/>{l.targetGroup} · {l.location}</div></TableCell><TableCell>{l.quantity}</TableCell><TableCell className="whitespace-nowrap">{money.format(l.unitCost)}</TableCell><TableCell className="whitespace-nowrap">{money.format(Math.round(l.unitCost*100)*l.quantity/100)}</TableCell><TableCell><div className="flex gap-1"><Button variant="ghost" size="sm" disabled={disabled} onClick={()=>edit(l)}>Edit</Button><Button variant="ghost" size="sm" disabled={disabled} onClick={()=>guard(()=>setRemoval({entity:'line',id:l.id}))}>Remove</Button></div></TableCell></TableRow>)}{!lines.length&&<TableRow><TableCell colSpan={5}>No saved items.</TableCell></TableRow>}</TableBody></Table></section>;})}
     {query&&!filtered.length&&<p>No matching items.</p>}
    </>}
   </article></ScrollArea></section>
  </div>
 </div><AlertDialog open={!!removal} onOpenChange={o=>{if(!o&&!busy)setRemoval(null);}}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Remove this {removal?.entity==='school'?'school':'item'}?</AlertDialogTitle><AlertDialogDescription>This removes it from this plan only.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel><Button variant="destructive" disabled={busy} onClick={()=>removal&&void mutate({...removal,action:'delete'})}>Remove</Button></AlertDialogFooter></AlertDialogContent></AlertDialog>
 <AlertDialog open={!!pending} onOpenChange={o=>{if(!o)setPending(null);}}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Discard unsaved changes?</AlertDialogTitle><AlertDialogDescription>Your previously saved items will remain unchanged.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Keep editing</AlertDialogCancel><AlertDialogAction onClick={()=>{const run=pending;reset();setPending(null);run?.();}}>Discard changes</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
 </div>;
}
