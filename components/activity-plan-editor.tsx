'use client';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ButtonGroup, ButtonGroupSeparator } from '@/components/ui/button-group';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { CurrencyInput } from '@/components/currency-input';
import { Textarea } from '@/components/ui/textarea';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Table, TableHeader, TableBody, TableFooter, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { DiscardChangesDialog } from '@/components/discard-changes-dialog';
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel } from '@/components/ui/alert-dialog';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Combobox, ComboboxChip, ComboboxChips, ComboboxChipsInput, ComboboxContent, ComboboxEmpty, ComboboxItem, ComboboxList, useComboboxAnchor } from '@/components/ui/combobox';
import { activityHints, activityInfo, activityNames, activityLineSchema, activityTitles, allocateByEnrolment, activityShareCaps, hasDistribution, isOtherActivity, maxActivityNameLength, selectableActivityIndexes, textbookActivityIndex, textbookClasses, textbookSubjects, implementationStrategies, targetGroups, type ActivityLine, type ActivityWorkstream, type DistributionSchool } from '@/lib/activity-plans';
import { activityBudgetProblem, componentEnvelopeKobo, activityCapKobo, activityFixedCaps, isCapped, isCappedFor, type BudgetLine } from '@/lib/activity-budget';
import { sideSplits, storedAllocation } from '@/lib/budget-pairs';
import { isSplitMode } from '@/lib/funding-policy';
import { isCompulsory, lineDocumentLabel } from '@/lib/activity-extras';
import { LineDocumentsField, LineExtraFields, LineSchoolPicker, RequiredBadge, uploadLineDocuments } from '@/components/activity-line-extras';
import { ActivityLinePanel, lineSearchText } from '@/components/activity-line-panel';
import type { InlineField } from '@/components/line-panel/line-table';
import { scrollLineIntoView, useLineFlash, usePanelMode } from '@/components/line-panel/use-line-panel';
import { SharedBudgetPanel } from '@/components/shared-budget-panel';
import { TeacherTrainingFields } from '@/components/teacher-training-fields';
import { FileUpload, DocumentFiles } from '@/components/document-files';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { saveBlockedReason } from '@/components/activity-save-reason';
import { currentPlanHref, planPeriod, type ActionPlan } from '@/lib/action-plans';
import { budgetKobo, sbmcBudgetProblem } from '@/lib/sbmc-budget';
import { infrastructurePoolProblem } from '@/lib/infrastructure-pool';
import { QuarterTimeline } from '@/components/quarter-timeline';
import { lineQuartersProblem, planQuarters } from '@/lib/line-quarters';
import './activity-plan-editor.css';
import { EnvelopeMeter } from './envelope-meter';
const money=new Intl.NumberFormat('en-NG',{style:'currency',currency:'NGN'});
const count=new Intl.NumberFormat('en-NG');
const pickerLimit=200;
const blankFor=(workstream:ActivityWorkstream,quarters:number[]=[])=>({activity:String(selectableActivityIndexes[workstream][0]),customActivity:'',description:'',rationale:'',implementationApproach:'',quantity:'1',unitCost:'',strategy:'',targetGroup:'',equipment:'',textbookClasses:[] as string[],textbookSubject:'',equipmentType:'',subscriptionTypes:[] as string[],websiteType:'',schoolIds:[] as number[],trainingProvider:'',targetParticipants:'',schoolLevels:[] as string[],trainingDays:'',venueType:'',quarters});
const extrasReset={equipmentType:'',subscriptionTypes:[] as string[],websiteType:'',schoolIds:[] as number[]};
type Draft=ReturnType<typeof blankFor> & {id?:number};
// The line as the schema and API take it: numbers parsed, empty training days as null (Teacher Development).
const payload=(draft:Draft,workstream:ActivityWorkstream)=>({...draft,workstream,activity:Number(draft.activity),quantity:Number(draft.quantity),unitCost:Number(draft.unitCost),trainingDays:draft.trainingDays===''?null:Number(draft.trainingDays)});
type Data={plan:ActionPlan;canEdit:boolean;lines:ActivityLine[];schools:DistributionSchool[];distribution:DistributionSchool[];renovated:number[];documents:{id:string;name:string;size:number}[];partnerProposed?:string|null;documentsRequired?:boolean};
const shortTitle=(workstream:ActivityWorkstream)=>workstream==='tlm'?'TLM':activityTitles[workstream];
const proformaAccept='.pdf,.docx,.xlsx,.xls,.png,.jpg,.jpeg';
export function ActivityPlanEditor({workstream}:{workstream:ActivityWorkstream}){
 const empty=blankFor(workstream);
 const [data,setData]=useState<Data|null>(null),[draft,setDraft]=useState<Draft>(empty),[baseline,setBaseline]=useState<Draft>(empty);
 const [error,setError]=useState(''),[busy,setBusy]=useState(false),[view,setView]=useState('budget'),[picked,setPicked]=useState<number[]>([]),[pinned,setPinned]=useState<number[]>([]),[schoolQuery,setSchoolQuery]=useState(''),[query,setQuery]=useState('');
 const [pending,setPending]=useState<null|(()=>void)>(null),[removal,setRemoval]=useState<{entity:'line'|'school';id:number}|null>(null);
 const classesAnchor=useComboboxAnchor();
 const panel=usePanelMode(),{flashId,flash}=useLineFlash();
 const lock=useRef(false),dirty=JSON.stringify(draft)!==JSON.stringify(baseline);
 const required=<span className="text-destructive" aria-label="required">*</span>;
 const title=activityTitles[workstream],name=shortTitle(workstream),capped=data?isCappedFor(workstream,data.plan):isCapped(workstream),withDistribution=hasDistribution(workstream);
 const endpoint=()=>currentPlanHref('/api/activities')+(currentPlanHref('/api/activities').includes('?')?'&':'?')+'workstream='+workstream;
 const load=useCallback(async()=>{const r=await fetch(currentPlanHref('/api/activities')+(currentPlanHref('/api/activities').includes('?')?'&':'?')+'workstream='+workstream,{cache:'no-store'});if(!r.ok)throw new Error((await r.json() as {error?:string}).error||'Unable to load component.');const next=await r.json() as Data;setData(next);{const quarters=planQuarters(next.plan),fill=(d:Draft)=>!d.id&&!d.quarters.length?{...d,quarters}:d;setDraft(fill);setBaseline(fill);}{const suggested=(next.renovated??[]).filter(id=>!next.distribution.some(d=>d.id===id));setPicked(suggested);setPinned(suggested);};setError('');return next;},[workstream]);
 useEffect(()=>{void Promise.resolve().then(load).catch(e=>setError(e.message));},[load]);
 useEffect(()=>{const warn=(e:BeforeUnloadEvent)=>{if(dirty){e.preventDefault();e.returnValue='';}};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);},[dirty]);
 const [pendingDocs,setPendingDocs]=useState<File[]>([]);
 // A new item's timeline starts as all of the plan's quarters, so narrowing it is one click.
 const fresh=blankFor(workstream,data?planQuarters(data.plan):[]);
 // A new item keeps the activity just worked on, so the panel stays on it after a save or cancel.
 const freshFor=(activity:string)=>(selectableActivityIndexes[workstream] as readonly number[]).includes(Number(activity))?{...fresh,activity}:fresh;
 const reset=(activity:string=draft.activity)=>{const next=freshFor(activity);setDraft(next);setBaseline(next);setPendingDocs([]);};
 const guard=(run:()=>void)=>{if(dirty)setPending(()=>run);else run();};
 const training=workstream==='teachers',splitSide=data&&sideSplits(data.plan,workstream)?workstream:null,sharesBudget=!!splitSide;
 // ICT and Teacher Development, and TLM in split mode (with Infrastructure), first split their shared budget (lib/budget-pairs.ts).
 const needsSplit=!!splitSide&&!!data&&storedAllocation(data.plan,splitSide)==null&&(splitSide!=='tlm'||data.plan.stateLodgment!=null);
 const disabled=busy||!data?.canEdit||!!error||needsSplit;
 const total=(data?.lines.reduce((s,l)=>s+Math.round(l.unitCost*100)*l.quantity,0)??0)/100;
 const envelopeKobo=data?componentEnvelopeKobo(data.plan,workstream):null;
 const envelope=envelopeKobo===null?null:Number(envelopeKobo)/100;
 // Shared-pool mode: TLM shares one pool with Infrastructure's school packages (partnerProposed), so "left" counts both.
 const pooled=workstream==='tlm'&&!!data&&!isSplitMode(data.plan),poolUsed=pooled?Number(data?.partnerProposed??0):0;
 const savedKobo=(data?.lines??[]).reduce((sum,l)=>sum+budgetKobo(l.unitCost.toFixed(2))*BigInt(l.quantity),BigInt(0));
 const draftCheck=activityLineSchema.safeParse(payload(draft,workstream)),draftValid=draftCheck.success;
 const timelineProblem=data?lineQuartersProblem(draft.quarters,data.plan):null;
 const draftKobo=Number.isSafeInteger(Number(draft.quantity)) && Number(draft.quantity)>=0 && Number(draft.unitCost)>=0 && Number(draft.unitCost)<=999999999999.99 ? budgetKobo(Number(draft.unitCost||0).toFixed(2))*BigInt(Number(draft.quantity||0)) : BigInt(0);
 const previous=data?.lines.find(l=>l.id===draft.id);
 const projected=savedKobo-(previous?budgetKobo(previous.unitCost.toFixed(2))*BigInt(previous.quantity):BigInt(0))+draftKobo;
 const savedLines:BudgetLine[]=(data?.lines??[]).map(l=>({activity:l.activity,kobo:budgetKobo(l.unitCost.toFixed(2))*BigInt(l.quantity)}));
 const projectedLines=[...savedLines.filter((_,i)=>data?.lines[i].id!==draft.id),{activity:Number(draft.activity),kobo:draftKobo}];
 const budgetError=!data?null:workstream==='sbmc'?sbmcBudgetProblem(projected,data.plan)??(draftKobo>BigInt(0)?activityBudgetProblem(workstream,projectedLines,data.plan):null):pooled&&draftKobo>(previous?budgetKobo(previous.unitCost.toFixed(2))*BigInt(previous.quantity):BigInt(0))?infrastructurePoolProblem(data.plan,{infrastructure:budgetKobo(Number(data.partnerProposed??0).toFixed(2)),tlm:projected}):capped&&draftKobo>BigInt(0)?activityBudgetProblem(workstream,projectedLines,data.plan):null;
 const activityKobo=(activity:number)=>savedLines.filter(l=>l.activity===activity).reduce((sum,l)=>sum+l.kobo,BigInt(0));
 const shareNote=(activity:number)=>{const fixed=activityFixedCaps[workstream]?.[activity];if(fixed!==undefined)return `Up to ${money.format(Number(fixed)/100)} for all its items · ${money.format(Number(activityKobo(activity))/100)} used`;const share=activityShareCaps[workstream]?.[activity];return share===undefined?null:`${share/100}% of the ${activityTitles[workstream]} allocation${envelopeKobo===null?'':` · up to ${money.format(Number(activityCapKobo(workstream,envelopeKobo,activity))/100)} · ${money.format(Number(activityKobo(activity))/100)} used`}`;};
 function review(){if(data){const problem=workstream==='sbmc'?sbmcBudgetProblem(savedKobo,data.plan,true)??activityBudgetProblem(workstream,savedLines,data.plan):pooled?infrastructurePoolProblem(data.plan,{infrastructure:budgetKobo(Number(data.partnerProposed??0).toFixed(2)),tlm:savedKobo}):activityBudgetProblem(workstream,savedLines,data.plan);if(problem){toast.error(problem);return;}}guard(()=>window.location.assign(currentPlanHref('/beap/review')+'#review-'+workstream));}
 async function upload(files:File[]){if(lock.current)return;lock.current=true;setBusy(true);let added=0;try{for(const file of files){const form=new FormData();form.set('workstream',workstream);form.set('file',file);const r=await fetch(currentPlanHref('/api/activities/documents'),{method:'POST',body:form});const result=await r.json() as {error?:string};if(!r.ok)throw new Error(result.error||'Unable to upload.');added++;}toast.success(`Uploaded ${added} proforma invoice${added===1?'':'s'}.`);}catch(e){toast.error(e instanceof Error?e.message:'Unable to upload.');}finally{lock.current=false;setBusy(false);await load().catch(()=>undefined);}}
 async function removeDocument(id:string){if(lock.current)return;lock.current=true;setBusy(true);try{const r=await fetch(currentPlanHref('/api/activities/documents')+(currentPlanHref('/api/activities/documents').includes('?')?'&':'?')+`workstream=${workstream}&id=${encodeURIComponent(id)}`,{method:'DELETE'});const result=await r.json() as {error?:string};if(!r.ok)throw new Error(result.error);toast.success('Removed.');await load();}catch(e){toast.error(e instanceof Error?e.message:'Unable to remove.');}finally{lock.current=false;setBusy(false);}}
 async function mutate(body:object){if(lock.current)return;lock.current=true;setBusy(true);try{const r=await fetch(endpoint(),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...body,workstream})});const result=await r.json() as {error?:string;added?:number;skipped?:number;id?:number};if(!r.ok)throw new Error(result.error);
  // Files picked before the item existed upload now that it has an id.
  const isCreate='action' in body&&body.action==='create',files=pendingDocs;let uploadFailed=false;
  if(isCreate&&result.id&&files.length&&lineDocumentLabel(workstream,Number(draft.activity))){try{await uploadLineDocuments(workstream,result.id,files);}catch(err){uploadFailed=true;toast.error(err instanceof Error?err.message:'Unable to upload the documents.');}}
  reset();setRemoval(null);const next=await load();
  // The saved line flashes and scrolls into view in the panel.
  const sent=body as {entity?:string;action?:string;id?:number},savedId=sent.entity==='line'&&sent.action!=='delete'?result.id??sent.id:undefined;if(savedId&&next.lines.some(l=>l.id===savedId))flash(savedId);
  // If an upload failed, keep the new item open so the documents can be attached again.
  const created=uploadFailed&&result.id?next.lines.find(l=>l.id===result.id):undefined;if(created){const d=toDraft(created);setDraft(d);setBaseline(d);}toast.success(result.added===undefined?'Saved.':`Added ${count.format(result.added)} school${result.added===1?'':'s'}${result.skipped?` · ${count.format(result.skipped)} already on the list`:''}.`);}catch(e){toast.error(e instanceof Error?e.message:'Unable to save.');}finally{lock.current=false;setBusy(false);}}
 function save(e:FormEvent){e.preventDefault();const parsed=activityLineSchema.safeParse(payload(draft,workstream));if(!parsed.success){setError('');toast.error(parsed.error.issues[0].message);return;}if(timelineProblem){toast.error(timelineProblem);return;}if(budgetError){toast.error(budgetError);return;}void mutate({...parsed.data,entity:'line',action:draft.id?'update':'create',id:draft.id});}
 function toDraft(l:ActivityLine):Draft{return {id:l.id,activity:String(l.activity),customActivity:l.customActivity??'',description:l.description,rationale:l.rationale??'',implementationApproach:l.implementationApproach??'',quantity:String(l.quantity),unitCost:String(l.unitCost),strategy:l.strategy,targetGroup:l.targetGroup,equipment:l.equipment,textbookClasses:l.textbookClasses??[],textbookSubject:l.textbookSubject??'',equipmentType:l.equipmentType??'',subscriptionTypes:l.subscriptionTypes??[],websiteType:l.websiteType??'',schoolIds:l.schoolIds??[],trainingProvider:l.trainingProvider??'',targetParticipants:l.targetParticipants??'',schoolLevels:l.schoolLevels??[],trainingDays:l.trainingDays==null?'':String(l.trainingDays),venueType:l.venueType??'',quarters:l.quarters??planQuarters(data?.plan)};}
 function edit(l:ActivityLine){guard(()=>{const d=toDraft(l);setDraft(d);setBaseline(d);setView('budget');panel.follow();});}
 function start(activity:number){guard(()=>{const next={...fresh,activity:String(activity)};setDraft(next);setBaseline(next);setPendingDocs([]);panel.follow();requestAnimationFrame(()=>document.getElementById('activity')?.focus());});}
 // Quantity, unit cost or description edited in the table: the whole line goes through the same schema and API as the form.
 async function saveCell(id:number,field:InlineField,value:string):Promise<string|null>{
  const line=data?.lines.find(l=>l.id===id);if(!line)return 'This item is no longer in the plan.';
  const before=toDraft(line),parsed=activityLineSchema.safeParse(payload({...before,[field]:value},workstream));
  if(!parsed.success)return parsed.error.issues[0].message;
  try{const r=await fetch(endpoint(),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...parsed.data,entity:'line',action:'update',id,workstream})});const result=await r.json().catch(()=>({})) as {error?:string};if(!r.ok)return result.error||'Unable to save this change.';}
  catch{return 'Unable to reach the server. Check your connection and try again.';}
  // The form keeps its draft; if it shows this line unchanged, it picks up the saved values.
  const next=await load().catch(()=>null),saved=next?.lines.find(l=>l.id===id);
  if(saved){const d=toDraft(saved),was=JSON.stringify(before);setBaseline(b=>b.id===id?d:b);setDraft(current=>current.id===id&&JSON.stringify(current)===was?d:current);}
  return null;
 }
 function select(key:'strategy'|'targetGroup'|'textbookSubject',label:string,options:readonly string[]){return <Field><FieldLabel htmlFor={key}>{label} {required}</FieldLabel><NativeSelect id={key} required value={draft[key]} onChange={e=>setDraft({...draft,[key]:e.target.value})}><NativeSelectOption value="">Choose…</NativeSelectOption>{options.map(o=><NativeSelectOption key={o} value={o}>{o}</NativeSelectOption>)}</NativeSelect></Field>;}
 const filtered=data?.lines.filter(l=>lineSearchText(workstream,l).includes(query.trim().toLowerCase()))??[];
 // TLM has a long checklist, so only activities with saved items get a section.
 const displayActivityIndexes=[...new Set([...(workstream==='tlm'?[]:selectableActivityIndexes[workstream] as readonly number[]),...(data?.lines.map(line=>line.activity)??[])])].sort((a,b)=>a-b);
 const visibleLines=displayActivityIndexes.flatMap(activity=>filtered.filter(line=>line.activity===activity));
 const selectedLineIndex=draft.id?visibleLines.findIndex(line=>line.id===draft.id):-1;
 const legacyActivity=!(selectableActivityIndexes[workstream] as readonly number[]).includes(Number(draft.activity));
 const navigateLine=(offset:number)=>{const line=visibleLines[selectedLineIndex+offset];if(line)edit(line);};
 const renovated=new Set(data?.renovated??[]),listed=new Set(data?.distribution.map(s=>s.id)??[]);
 const renovatedFirst=(list:DistributionSchool[])=>[...list].sort((a,b)=>Number(renovated.has(b.id))-Number(renovated.has(a.id)));
 // Picker order: this plan's renovated schools first (suggested and ticked on load), then schools already on the list, then ticked ones, then the rest.
 // Ticks only reorder when the search changes, so rows don't jump while the user is ticking.
 const pinnedPicks=new Set(pinned);
 const pickerRank=(id:number)=>renovated.has(id)?0:listed.has(id)?1:pinnedPicks.has(id)?2:3;
 const pickerOrder=(list:DistributionSchool[])=>[...list].sort((a,b)=>pickerRank(a.id)-pickerRank(b.id));
 const distribution=renovatedFirst(data?.distribution??[]);
 const missingRenovated=[...renovated].filter(id=>!listed.has(id));
 const shares=allocateByEnrolment(Math.round(total*100),distribution),learnerTotal=distribution.reduce((sum,s)=>sum+(s.enrolment??0),0);
 const needle=schoolQuery.trim().toLowerCase();
 const matches=pickerOrder((data?.schools??[]).filter(s=>!needle||`${s.name} ${s.lga} ${s.level}`.toLowerCase().includes(needle)));
 const addable=matches.filter(s=>!listed.has(s.id)),pickedSet=new Set(picked),allPicked=addable.length>0&&addable.every(s=>pickedSet.has(s.id)),somePicked=addable.some(s=>pickedSet.has(s.id));
 const togglePick=(id:number,on:boolean)=>setPicked(on?[...new Set([...picked,id])]:picked.filter(p=>p!==id));
 const toggleAll=(on:boolean)=>{const ids=new Set(addable.map(s=>s.id));setPicked(on?[...new Set([...picked,...ids])]:picked.filter(p=>!ids.has(p)));};
 useEffect(()=>{
  if(!draft.id)return;
  const frame=requestAnimationFrame(()=>{
   if(draft.id)scrollLineIntoView(draft.id);
  });
  return()=>cancelAnimationFrame(frame);
 },[draft.id]);
 return <div className="portal-shell activity-shell" data-workstream={workstream}><div className="portal-workspace">
  <header className="workspace-header editor-page-header"><div className="editor-header-heading"><Button variant="ghost" onClick={()=>guard(()=>window.location.assign(currentPlanHref('/beap/review')))}>← Basic Education Action Plan</Button><span className="editor-plan-title">{title}{data?' · '+planPeriod(data.plan):''}</span></div><Button variant="outline" disabled={busy} onClick={review}>Review & send</Button></header>
  {withDistribution&&<Tabs value={view} onValueChange={v=>guard(()=>{reset();setView(v);})}><TabsList className="m-3"><TabsTrigger value="budget">Budget activities</TabsTrigger><TabsTrigger value="distribution">Distribution list</TabsTrigger></TabsList></Tabs>}
  <div className="activity-split">
   <section className="workspace-pane editor-pane" aria-label={`${title} editor`}><ScrollArea className="pane-scroll"><div className="editor-canvas">
    <header className="editor-heading"><h1>{view==='distribution'?'Add schools':draft.id?'Edit budget item':'Add a budget item'}</h1></header>
    {error&&<Alert variant="destructive"><AlertTitle>Unable to load</AlertTitle><AlertDescription>{error}<Button variant="outline" onClick={()=>void load().catch(e=>setError(e.message))}>Retry</Button></AlertDescription></Alert>}
    {splitSide&&data&&!error&&<SharedBudgetPanel key={storedAllocation(data.plan,splitSide)??'unset'} side={splitSide} plan={data.plan} proposed={total} partnerProposed={Number(data.partnerProposed??0)} canEdit={data.canEdit&&!busy} onSaved={async()=>{await load();}}/>}
    {data&&!data.canEdit&&<Alert><AlertTitle>Read-only</AlertTitle><AlertDescription>This component cannot be edited by your account at its current review stage.</AlertDescription></Alert>}
    <form id="activity-form" onSubmit={view==='budget'?save:e=>{e.preventDefault();if(picked.length)void mutate({entity:'school',action:'create',schoolIds:picked});}}><fieldset disabled={disabled}><FieldGroup>
     {view==='distribution'?<Field><FieldLabel htmlFor="school-search">Schools {required}</FieldLabel><Input id="school-search" type="search" placeholder="Search by school, LGA or level…" value={schoolQuery} onChange={e=>{setPinned(picked);setSchoolQuery(e.target.value);}}/>
      <div className="school-picker" role="group" aria-label="Schools to add"><label className="school-pick school-pick-all"><Checkbox checked={allPicked?true:somePicked?'indeterminate':false} disabled={disabled||!addable.length} onCheckedChange={v=>toggleAll(v===true)} aria-label="Select all matching schools"/><span>Select all{needle?' matching':''} ({count.format(addable.length)})</span>{picked.length>0&&<Badge variant="secondary" className="ml-auto">{count.format(picked.length)} selected</Badge>}</label>
       {matches.slice(0,pickerLimit).map(s=>{const on=listed.has(s.id);return <label key={s.id} className="school-pick" data-listed={on||undefined}><Checkbox checked={on||pickedSet.has(s.id)} disabled={disabled||on} onCheckedChange={v=>togglePick(s.id,v===true)} aria-label={`Select ${s.name}`}/><span className="school-option"><span>{s.name}</span><small>{s.lga} · {s.level}{s.enrolment?` · ${count.format(s.enrolment)} learners`:''}</small></span><span className="school-pick-badges">{renovated.has(s.id)&&!on&&<Badge variant="warning">Suggested · Renovated</Badge>}{renovated.has(s.id)&&on&&<Badge variant="warning">Renovated</Badge>}{on&&<Badge variant="outline">On the list</Badge>}</span></label>;})}
       {!matches.length&&<p className="school-pick-empty">{data?.schools.length===0?'No schools are available in your state register.':'No schools match your search.'}</p>}
       {matches.length>pickerLimit&&<p className="school-pick-empty">Showing {pickerLimit} of {count.format(matches.length)} schools. Search to narrow the list; Select all still covers every match.</p>}
      </div></Field>:<>
      <Field><FieldLabel htmlFor="activity">Allowable activity {required}</FieldLabel><NativeSelect id="activity" required value={draft.activity} onChange={e=>{setDraft({...draft,...extrasReset,activity:e.target.value,customActivity:'',equipment:'',textbookClasses:[],textbookSubject:''});panel.follow();}}>{legacyActivity&&<NativeSelectOption value={draft.activity} disabled>{activityNames[workstream][Number(draft.activity)]??'Earlier activity'} (no longer available)</NativeSelectOption>}{selectableActivityIndexes[workstream].map(i=><NativeSelectOption value={i} key={i}>{activityNames[workstream][i]}{isCompulsory(workstream,i)?' · Required':''}</NativeSelectOption>)}</NativeSelect>{legacyActivity?<FieldDescription className="text-destructive">This item uses an earlier activity. Choose one from the current list to save it.</FieldDescription>:activityHints[workstream]?.[Number(draft.activity)]&&<FieldDescription>Includes: {activityHints[workstream]?.[Number(draft.activity)]}</FieldDescription>}{shareNote(Number(draft.activity))&&<FieldDescription>{activityFixedCaps[workstream]?'':'Share: '}{shareNote(Number(draft.activity))}</FieldDescription>}{isCompulsory(workstream,Number(draft.activity))&&<span className="activity-picked-meta"><RequiredBadge workstream={workstream} activity={Number(draft.activity)}/><span>Every plan must include this activity.</span></span>}{activityInfo[workstream]?.[Number(draft.activity)]&&<FieldDescription>{activityInfo[workstream]?.[Number(draft.activity)]}</FieldDescription>}</Field>
      {isOtherActivity(workstream,Number(draft.activity))&&<Field><FieldLabel htmlFor="customActivity">Activity name <span className="text-destructive" aria-label="required">*</span></FieldLabel><Input id="customActivity" required maxLength={maxActivityNameLength} value={draft.customActivity} onChange={e=>setDraft({...draft,customActivity:e.target.value})} placeholder="Name the activity" /><FieldDescription>Use this for an allowable activity that is not in the list.</FieldDescription></Field>}
      {training&&<TeacherTrainingFields draft={draft} onChange={next=>setDraft({...draft,...next})}/>}
      {!training&&<Field><FieldLabel htmlFor="description">Description {required}</FieldLabel><Textarea id="description" required maxLength={1000} value={draft.description} onChange={e=>setDraft({...draft,description:e.target.value})}/></Field>}
      {workstream==='tlm'&&Number(draft.activity)===textbookActivityIndex&&<>
       <Field><FieldLabel htmlFor="textbookClasses">Classes <span className="text-destructive" aria-label="required">*</span></FieldLabel><Combobox multiple items={[...textbookClasses]} value={draft.textbookClasses} onValueChange={classes=>setDraft({...draft,textbookClasses:classes})}><ComboboxChips ref={classesAnchor}><>{draft.textbookClasses.map(className=><ComboboxChip key={className}>{className}</ComboboxChip>)}</><ComboboxChipsInput id="textbookClasses" placeholder={draft.textbookClasses.length?'Add another class…':'Choose one or more classes…'} aria-required="true" /></ComboboxChips><ComboboxContent anchor={classesAnchor}><ComboboxEmpty>No classes match your search.</ComboboxEmpty><ComboboxList>{textbookClasses.map(className=><ComboboxItem key={className} value={className}>{className}</ComboboxItem>)}</ComboboxList></ComboboxContent></Combobox></Field>
       {select('textbookSubject','Subject',textbookSubjects)}
      </>}
      <LineExtraFields workstream={workstream} draft={draft} onChange={next=>setDraft({...draft,...next})}/>
      <LineSchoolPicker workstream={workstream} draft={draft} schools={data?.schools??[]} disabled={disabled} onChange={schoolIds=>setDraft({...draft,schoolIds})}/>
      {workstream==='sbmc'&&([ ['rationale','Rationale'],['implementationApproach','Implementation approach'] ] as const).map(([key,label])=><Field key={key}><FieldLabel htmlFor={key}>{label} {required}</FieldLabel><Textarea id={key} required maxLength={1000} value={draft[key]} onChange={e=>setDraft({...draft,[key]:e.target.value})}/></Field>)}
      <FieldGroup className="grid grid-cols-2 gap-4"><Field><FieldLabel htmlFor="quantity">{training?'Quantity (Number of Participants)':'Quantity'} {required}</FieldLabel><Input id="quantity" type="number" min="1" max="1000000" step="1" required value={draft.quantity} onChange={e=>setDraft({...draft,quantity:e.target.value})}/></Field><Field><FieldLabel htmlFor="unitCost">{training?'Unit cost per teacher (₦)':'Unit cost (₦)'} {required}</FieldLabel><CurrencyInput id="unitCost" placeholder="0.00" maxIntegerDigits={12} required value={draft.unitCost} onValueChange={unitCost=>setDraft({...draft,unitCost})}/></Field></FieldGroup>
      {training?<Field><FieldLabel htmlFor="description">Description {required}</FieldLabel><Textarea id="description" required maxLength={1000} value={draft.description} onChange={e=>setDraft({...draft,description:e.target.value})}/></Field>
       :<>{select('strategy',workstream==='sbmc'?'Procurement strategy':'Implementation strategy',implementationStrategies)}{select('targetGroup','Target group',targetGroups)}</>}
      <QuarterTimeline id="activity-quarters" size="compact" required help="The quarters in which this item will be implemented. Only this plan's quarters can be chosen." value={draft.quarters} onChange={quarters=>setDraft({...draft,quarters})} available={data?planQuarters(data.plan):[]} disabled={disabled} error={timelineProblem??undefined} selectAll={!!data&&planQuarters(data.plan).length>1}/>
      <LineDocumentsField workstream={workstream} activity={Number(draft.activity)} lineId={draft.id&&previous?.activity===Number(draft.activity)?draft.id:undefined} documents={previous?.documents??[]} pending={pendingDocs} onPendingChange={setPendingDocs} required={data?.documentsRequired===true} disabled={disabled} onChanged={async()=>{await load();}}/>
      {budgetError&&<Alert variant="destructive"><AlertTitle>Allocation limit</AlertTitle><AlertDescription>{budgetError}</AlertDescription></Alert>}
     </>}
    </FieldGroup></fieldset></form>
   </div></ScrollArea><div className="editor-footer"><div className="line-total"><span>{view==='budget'?capped?'Sub-total':'Line total':'Distribution schools'}</span><strong>{view==='budget'?money.format((Math.round(Number(draft.unitCost||0)*100)*Number(draft.quantity||0))/100):data?.distribution.length??0}</strong></div><div className="footer-actions">{draft.id&&<><Button variant="ghost" disabled={busy} onClick={()=>guard(()=>reset())}>Cancel</Button><ButtonGroup className="activity-line-navigation" aria-label="Budget item navigation"><Button size="icon" variant="secondary" aria-label="Previous budget item" title="Previous budget item" disabled={disabled||selectedLineIndex<=0} onClick={()=>navigateLine(-1)}><ChevronLeftIcon/></Button><ButtonGroupSeparator/><Button size="icon" variant="secondary" aria-label="Next budget item" title="Next budget item" disabled={disabled||selectedLineIndex<0||selectedLineIndex===visibleLines.length-1} onClick={()=>navigateLine(1)}><ChevronRightIcon/></Button></ButtonGroup></>}{(()=>{const blocked=disabled||(view==='distribution'&&!picked.length)||(view==='budget'&&(!draftValid||!!timelineProblem))||!!budgetError;
   // A disabled button gets no hover, so the reason sits on a wrapper the pointer and keyboard can reach.
   const reason=blocked?saveBlockedReason({busy,canEdit:!!data?.canEdit,failed:!!error,needsIctAllocation:needsSplit,splitName:name,view:view==='distribution'?'distribution':'budget',pickedSchools:picked.length,issues:draftCheck.success?[]:draftCheck.error.issues,timelineError:timelineProblem,budgetError}):null;
   const button=<Button form="activity-form" type="submit" disabled={blocked}>{busy?'Saving…':draft.id?'Save changes':view==='budget'?'Add item':`Add ${picked.length?count.format(picked.length)+' ':''}school${picked.length===1?'':'s'}`}</Button>;
   return reason?<Tooltip delayDuration={0}><TooltipTrigger asChild><span className="save-button-wrap" tabIndex={0} aria-label={reason}>{button}</span></TooltipTrigger><TooltipContent side="top" className="soft-tip max-w-64">{reason}</TooltipContent></Tooltip>:button;})()}</div></div></section>
   <section className="workspace-pane preview-pane" aria-label="Saved component"><ScrollArea className="pane-scroll">{view==='distribution'?<article className="preview-document sports-preview">
    <div className="plan-overview"><div><span>Proposed {name} budget</span><strong>{error?'Unavailable':data?money.format(total):'Loading…'}</strong></div>{!data?null:envelope===null?<p>{sharesBudget&&data.plan.stateLodgment!=null?(workstream==='ict'?'ICT allocation not set':`${name} budget not set`):'Funding envelope not set'}</p>:<EnvelopeMeter label={pooled?'Shared with Infrastructure':workstream==='ict'?'ICT allocation':training?'Teacher Development budget':sharesBudget?`${name} allocation`:'Funding envelope'} envelope={envelope} used={total} partner={pooled?{label:'Infrastructure',amount:poolUsed}:undefined} />}</div>
    {envelope!==null&&poolUsed+total>envelope&&<Alert variant="destructive"><AlertTitle>Above funding envelope</AlertTitle><AlertDescription>{pooled?'Infrastructure and TLM together exceed':'The planned total exceeds'} the envelope by {money.format(poolUsed+total-envelope)}.</AlertDescription></Alert>}
    <h2>Distribution list</h2>
     {missingRenovated.length>0&&<Alert className="mb-4"><AlertTitle>{count.format(missingRenovated.length)} renovated school{missingRenovated.length===1?' is':'s are'} not on the list</AlertTitle><AlertDescription>Schools in this plan&apos;s Whole School Renovation/Expansion packages are usually included.<Button variant="outline" size="sm" disabled={disabled} onClick={()=>void mutate({entity:'school',action:'create',schoolIds:missingRenovated})}>Add renovated schools</Button></AlertDescription></Alert>}
     <p className="distribution-note">Allocation shares the {name} budget ({money.format(total)}) across the listed schools by enrolment.</p>
     <Table className="distribution-table"><TableHeader><TableRow><TableHead>School</TableHead><TableHead>LGA</TableHead><TableHead>Level</TableHead><TableHead>Location</TableHead><TableHead className="text-right">Learners</TableHead><TableHead className="text-right">Allocation (₦)</TableHead><TableHead>Actions</TableHead></TableRow></TableHeader><TableBody>{distribution.map(s=><TableRow key={s.id}><TableCell><span className="flex flex-wrap items-center gap-2">{s.name}{renovated.has(s.id)&&<Badge variant="warning">Renovated</Badge>}</span></TableCell><TableCell>{s.lga}</TableCell><TableCell>{s.level}</TableCell><TableCell>{s.location}</TableCell><TableCell className="text-right tabular-nums">{count.format(s.enrolment??0)}</TableCell><TableCell className="text-right tabular-nums whitespace-nowrap">{shares.has(s.id)?money.format(shares.get(s.id)!/100):'—'}</TableCell><TableCell><Button variant="ghost" size="sm" disabled={disabled} onClick={()=>setRemoval({entity:'school',id:s.id})}>Remove</Button></TableCell></TableRow>)}{!distribution.length&&<TableRow><TableCell colSpan={7}>Add at least one school before sending {name} for review.</TableCell></TableRow>}</TableBody>{distribution.length>0&&<TableFooter><TableRow><TableCell colSpan={4}>Total · {count.format(distribution.length)} school{distribution.length===1?'':'s'}</TableCell><TableCell className="text-right tabular-nums">{count.format(learnerTotal)}</TableCell><TableCell className="text-right tabular-nums whitespace-nowrap">{shares.size?money.format(total):'—'}</TableCell><TableCell/></TableRow></TableFooter>}</Table>
   </article>:<article className="preview-document line-panel-document">
    <ActivityLinePanel workstream={workstream} lines={data?.lines??null} documentsRequired={data?.documentsRequired===true}
     summary={{label:`Proposed ${name} budget`,total:error?'Unavailable':data?money.format(total):'Loading…',meter:!data?null:envelope===null?<p>{sharesBudget&&data.plan.stateLodgment!=null?(workstream==='ict'?'ICT allocation not set':`${name} budget not set`):'Funding envelope not set'}</p>:<EnvelopeMeter label={pooled?'Shared with Infrastructure':workstream==='ict'?'ICT allocation':training?'Teacher Development budget':sharesBudget?`${name} allocation`:'Funding envelope'} envelope={envelope} used={total} partner={pooled?{label:'Infrastructure',amount:poolUsed}:undefined} />}}
     notices={<>{envelope!==null&&poolUsed+total>envelope&&<Alert variant="destructive"><AlertTitle>Above funding envelope</AlertTitle><AlertDescription>{pooled?'Infrastructure and TLM together exceed':'The planned total exceeds'} the envelope by {money.format(poolUsed+total-envelope)}.</AlertDescription></Alert>}{workstream==='monitoring'&&<section className="activity-documents" aria-labelledby="proforma-title"><div className="flex items-baseline justify-between gap-3"><h2 id="proforma-title">Proforma Invoice</h2><span className="text-sm text-muted-foreground">Optional · {data?.documents.length??0} file{data?.documents.length===1?'':'s'}</span></div><FileUpload compact id="proforma-invoice" label="Proforma Invoice" multiple accept={proformaAccept} disabled={disabled} busy={busy} onFiles={upload}/>{!!data?.documents.length&&<DocumentFiles compact documents={data.documents.map(d=>({...d,url:'/api/activities/documents?id='+d.id,description:'Proforma invoice'}))} disabled={disabled} onRemove={data.canEdit?id=>void removeDocument(id):undefined}/>}</section>}</>}
     selectedActivity={Number(draft.activity)} selectedId={draft.id} dirtyId={dirty?draft.id:undefined} mode={panel.mode} onMode={panel.setMode} query={query} onQuery={setQuery} flashId={flashId}
     inlineEditable={!disabled} actionsDisabled={disabled} viewOnly={!!data&&!data.canEdit} shareNote={shareNote} onSaveCell={saveCell} onEdit={edit} onRemove={l=>guard(()=>setRemoval({entity:'line',id:l.id}))} onStart={start}/>
   </article>}</ScrollArea></section>
  </div>
 </div><AlertDialog open={!!removal} onOpenChange={o=>{if(!o&&!busy)setRemoval(null);}}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Remove this {removal?.entity==='school'?'school':'item'}?</AlertDialogTitle><AlertDialogDescription>This removes it from this plan only.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel><Button variant="destructive" disabled={busy} onClick={()=>removal&&void mutate({...removal,action:'delete'})}>Remove</Button></AlertDialogFooter></AlertDialogContent></AlertDialog>
 <DiscardChangesDialog open={!!pending} saved="Your saved items stay as they are." onKeep={()=>setPending(null)} onDiscard={()=>{const run=pending;reset();setPending(null);run?.();}}/>
 </div>;
}
