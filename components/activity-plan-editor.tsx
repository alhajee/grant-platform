'use client';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { ChevronLeftIcon, ChevronRightIcon, DownloadIcon, InfoIcon, LockIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ButtonGroup, ButtonGroupSeparator } from '@/components/ui/button-group';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { CurrencyInput } from '@/components/currency-input';
import { Textarea } from '@/components/ui/textarea';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Table, TableHeader, TableBody, TableFooter, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { DiscardChangesDialog } from '@/components/discard-changes-dialog';
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel } from '@/components/ui/alert-dialog';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Combobox, ComboboxChip, ComboboxChips, ComboboxChipsInput, ComboboxContent, ComboboxEmpty, ComboboxItem, ComboboxList, useComboboxAnchor } from '@/components/ui/combobox';
import { SchoolLevelFilter, allLevels, filterByLevel, type SchoolLevelChoice } from '@/components/school-level-filter';
import { activityHints, activityInfo, isAdvisoryShare, strategyLabel, splitStrategy, nonApplicableStrategy, maxStrategyDetailLength, activityNames, activityLineSchema, activityTitles, allocateByEnrolment, capActivities, emptyDistributionMessage, hasDistribution, isOtherActivity, maxActivityNameLength, selectableActivityIndexes, textbookActivityIndex, textbookClasses, textbookSubjects, implementationStrategies, targetGroups, splitTargetGroups, joinTargetGroups, type ActivityLine, type ActivityWorkstream, type DistributionSchool } from '@/lib/activity-plans';
import { activityBudgetProblem, componentEnvelopeKobo, activityCap, activityCapKobo, activityPercent, activityFixedCaps, isCapped, isCappedFor, type BudgetLine } from '@/lib/activity-budget';
import { budgetPairs, pairOf, sideSplits, storedAllocation } from '@/lib/budget-pairs';
import { isSplitMode } from '@/lib/funding-policy';
import { compulsoryFor, isCompulsory, lineDocumentSlots, maxFrequency, needsFrequency, quantityFromSchools } from '@/lib/activity-extras';
import { requiredFirstProblem } from '@/lib/component-readiness';
import { FieldHelp } from '@/components/field-help';
import { LineDocumentsField, LineExtraFields, LineSchoolPicker, uploadLineDocuments, type PendingDocument } from '@/components/activity-line-extras';
import { ActivityLinePanel, lineSearchText } from '@/components/activity-line-panel';
import type { InlineField } from '@/components/line-panel/line-table';
import { scrollLineIntoView, useLineFlash, usePanelMode } from '@/components/line-panel/use-line-panel';
import { SharedBudgetPanel } from '@/components/shared-budget-panel';
import { LockedOverlay, type LockReason } from '@/components/locked-overlay/locked-overlay';
import { ActivitySelectionPanel } from '@/components/activity-selection';
import { choosesUpFront, chosenActivities, planSelection } from '@/lib/activity-selection';
import { TeacherTrainingFields } from '@/components/teacher-training-fields';
import { textbookAllocation, textbookLearners, textbookQuantityWarning } from '@/lib/textbook-enrolment';
import { isPriceListActivity, priceListActivities, procurementItemLabel, type ProcurementItem } from '@/lib/procurement';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

// UBEC68: the client's training budget guide (Literacy, ECCDE, Curriculum), served from public/templates.
const trainingBudgetTemplate='/templates/teacher-development-budget-template.xlsx';
import { FileUpload, DocumentFiles } from '@/components/document-files';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { saveBlockedReason } from '@/components/activity-save-reason';
import { currentPlanHref, planPeriod, type ActionPlan } from '@/lib/action-plans';
import { budgetKobo, sbmcBudgetProblem } from '@/lib/sbmc-budget';
import { infrastructurePoolProblem } from '@/lib/infrastructure-pool';
import { QuarterTimeline } from '@/components/quarter-timeline';
import { lineQuartersProblem, planQuarters } from '@/lib/line-quarters';
import { keepDatesInWindow, lineDatesProblem } from '@/lib/line-dates';
import { LineDatesField } from '@/components/line-dates';
import './activity-plan-editor.css';
import { EnvelopeMeter } from './envelope-meter';
import { IctConnectPanel } from './ict-connect-panel';
import { ComponentSummaryDialog } from './component-summary-dialog';
import { cellMatches, connectionDroppedMessage, isConnectionDropped, newClientKey, postJson } from '@/lib/save-request';
import { nairaFormat } from '@/lib/money-format';
const money=nairaFormat;
const count=new Intl.NumberFormat('en-NG');
// Base UI clears a multi-select when Escape is pressed with its list closed; a stray Escape must not wipe the chosen groups or classes.
const keepsChoices=(details:{reason?:string})=>details.reason==='escape-key';
const pickerLimit=200;
const blankFor=(workstream:ActivityWorkstream,quarters:number[]=[])=>({activity:String(selectableActivityIndexes[workstream][0]),customActivity:'',description:'',rationale:'',implementationApproach:'',quantity:'1',unitCost:'',strategy:'',targetGroup:'',equipment:'',textbookClasses:[] as string[],textbookSubject:'',equipmentCategory:'' as ''|'Mobility'|'Office equipment',equipmentType:'',subscriptionTypes:[] as string[],websiteType:'',item:'',censusType:'',frequency:'',schoolIds:[] as number[],trainingProvider:'',targetParticipants:'',schoolLevels:[] as string[],trainingDays:'',venueType:'',quarters,startDate:null as string|null,dueDate:null as string|null,priceItemId:''});
const extrasReset={equipmentCategory:'' as ''|'Mobility'|'Office equipment',equipmentType:'',subscriptionTypes:[] as string[],websiteType:'',item:'',censusType:'',frequency:'',schoolIds:[] as number[],priceItemId:''};
type Draft=ReturnType<typeof blankFor> & {id?:number};
// The line as the schema and API take it: numbers parsed, empty training days as null (Teacher Development).
// One-per-school activities (ICT Establishment of DLC) take their quantity from the schools chosen.
// UBEC164: monitoring officer allowances enter officers and visits; the line's quantity is officers × visits.
const visitsOf=(draft:Pick<Draft,'activity'|'frequency'>,workstream:ActivityWorkstream)=>needsFrequency(workstream,Number(draft.activity))?Math.max(1,Number(draft.frequency)||1):1;
const lineQuantity=(draft:Draft,workstream:ActivityWorkstream)=>Number(draft.quantity||0)*visitsOf(draft,workstream);
const payload=(draft:Draft,workstream:ActivityWorkstream)=>({...draft,strategy:draft.strategy.trim(),workstream,activity:Number(draft.activity),quantity:quantityFromSchools(workstream,Number(draft.activity))&&draft.schoolIds.length?draft.schoolIds.length:lineQuantity(draft,workstream),frequency:needsFrequency(workstream,Number(draft.activity))?visitsOf(draft,workstream):null,unitCost:Number(draft.unitCost),trainingDays:draft.trainingDays===''?null:Number(draft.trainingDays),priceItemId:draft.priceItemId?Number(draft.priceItemId):null});
type Data={plan:ActionPlan;canEdit:boolean;/** Only the BEAP Chair sets budget splits. */canSplit?:boolean;lines:ActivityLine[];schools:DistributionSchool[];distribution:DistributionSchool[];renovated:number[];documents:{id:string;name:string;size:number}[];partnerProposed?:string|null;documentsRequired?:boolean};
const shortTitle=(workstream:ActivityWorkstream)=>workstream==='tlm'?'TLM':activityTitles[workstream];
const proformaAccept='.pdf,.docx,.xlsx,.xls,.png,.jpg,.jpeg';
export function ActivityPlanEditor({workstream}:{workstream:ActivityWorkstream}){
 const empty=blankFor(workstream);
 const [data,setData]=useState<Data|null>(null),[draft,setDraft]=useState<Draft>(empty),[baseline,setBaseline]=useState<Draft>(empty);
 const [error,setError]=useState(''),[busy,setBusy]=useState(false),[view,setView]=useState('budget'),[picked,setPicked]=useState<number[]>([]),[pinned,setPinned]=useState<number[]>([]),[schoolQuery,setSchoolQuery]=useState(''),[schoolLevel,setSchoolLevel]=useState<SchoolLevelChoice>(allLevels),[query,setQuery]=useState('');
 const [summaryOpen,setSummaryOpen]=useState(false);
 const [pending,setPending]=useState<null|(()=>void)>(null),[removal,setRemoval]=useState<{entity:'line'|'school';id:number}|null>(null);
 const classesAnchor=useComboboxAnchor(),targetAnchor=useComboboxAnchor();
 const panel=usePanelMode(),{flashId,flash}=useLineFlash();
 // A new item's client key (migration 058): made on its first save attempt and kept for every retry of the same draft,
 // so a save whose reply was lost on a weak connection is never stored twice. A new or discarded draft gets a new key.
 const createKey=useRef<string|null>(null);
 const lock=useRef(false),dirty=JSON.stringify(draft)!==JSON.stringify(baseline);
 const required=<span className="text-destructive" aria-label="required">*</span>;
 const title=activityTitles[workstream],name=shortTitle(workstream),capped=data?isCappedFor(workstream,data.plan):isCapped(workstream),withDistribution=hasDistribution(workstream);
 const endpoint=()=>currentPlanHref('/api/activities')+(currentPlanHref('/api/activities').includes('?')?'&':'?')+'workstream='+workstream;
 const load=useCallback(async()=>{const r=await fetch(currentPlanHref('/api/activities')+(currentPlanHref('/api/activities').includes('?')?'&':'?')+'workstream='+workstream,{cache:'no-store'});if(!r.ok)throw new Error((await r.json() as {error?:string}).error||'Unable to load component');const next=await r.json() as Data;setData(next);{const quarters=planQuarters(next.plan),offered=chosenActivities(workstream,planSelection(workstream,next.plan)),fill=(d:Draft)=>{const q=!d.id&&!d.quarters.length?{...d,quarters}:d;return !q.id&&offered.length&&!offered.includes(Number(q.activity))?{...q,activity:String(offered[0])}:q;};setDraft(fill);setBaseline(fill);}{const suggested=(next.renovated??[]).filter(id=>!next.distribution.some(d=>d.id===id));setPicked(suggested);setPinned(suggested);};setError('');return next;},[workstream]);
 useEffect(()=>{void Promise.resolve().then(load).catch(e=>setError(e.message));},[load]);
 // UBEC88: a new Textbooks item is one per learner of its classes on the distribution list (DNEMIS); the quantity follows
 // that count until someone types their own. Saved items are never changed.
 // UBEC130: the state's approved Procurement price list, for the activities that buy goods (migration 074).
 const buysGoods=!!priceListActivities[workstream],[priceList,setPriceList]=useState<{items:ProcurementItem[];required:boolean}|null>(null);
 useEffect(()=>{if(!buysGoods)return;void fetch('/api/procurement/items',{cache:'no-store'}).then(r=>r.ok?r.json() as Promise<{items:ProcurementItem[];required:boolean}>:null).then(body=>{if(body)setPriceList({items:body.items.filter(i=>i.status==='approved'),required:body.required});}).catch(()=>{});},[buysGoods]);
 const pricedActivity=isPriceListActivity(workstream,Number(draft.activity));
 const textbookSuggestion=workstream==='tlm'&&Number(draft.activity)===textbookActivityIndex?textbookLearners(draft.textbookClasses,data?.distribution??[]):0,lastSuggestion=useRef<number|null>(null);
 useEffect(()=>{
  if(!textbookSuggestion||draft.id){lastSuggestion.current=null;return;}
  const follows=draft.quantity==='1'||draft.quantity===''||draft.quantity===String(lastSuggestion.current);
  lastSuggestion.current=textbookSuggestion;
  if(follows&&draft.quantity!==String(textbookSuggestion))setDraft(d=>({...d,quantity:String(textbookSuggestion)}));
 },[textbookSuggestion,draft.id,draft.quantity]);
 useEffect(()=>{const warn=(e:BeforeUnloadEvent)=>{if(dirty){e.preventDefault();e.returnValue='';}};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);},[dirty]);
 const [pendingDocs,setPendingDocs]=useState<PendingDocument[]>([]);
 // A new item's timeline starts as all of the plan's quarters, so narrowing it is one click.
 // Quality Assurance offers only the activities chosen up front (migration 061); other components every listed one.
 const selection=data?planSelection(workstream,data.plan):undefined,offered=chosenActivities(workstream,selection);
 const blank=blankFor(workstream,data?planQuarters(data.plan):[]),fresh=offered.includes(Number(blank.activity))||!offered.length?blank:{...blank,activity:String(offered[0])};
 // A new item keeps the activity just worked on, so the panel stays on it after a save or cancel.
 const freshFor=(activity:string)=>offered.includes(Number(activity))?{...fresh,activity}:fresh;
 const reset=(activity:string=draft.activity)=>{createKey.current=null;const next=freshFor(activity);setDraft(next);setBaseline(next);setPendingDocs([]);};
 const guard=(run:()=>void)=>{if(dirty)setPending(()=>run);else run();};
 const perSchool=quantityFromSchools(workstream,Number(draft.activity)), visits=needsFrequency(workstream,Number(draft.activity));
 const training=workstream==='teachers',splitSide=data&&sideSplits(data.plan,workstream)?workstream:null,sharesBudget=!!splitSide;
 // ICT and Teacher Development, and TLM in split mode (with Infrastructure), first split their shared budget (lib/budget-pairs.ts).
 const needsSplit=!!splitSide&&!!data&&storedAllocation(data.plan,splitSide)==null&&(splitSide!=='tlm'||data.plan.stateLodgment!=null);
 // Quality Assurance: the activities are chosen first (ActivitySelectionPanel opens by itself until then).
 const needsChoice=choosesUpFront(workstream)&&!!data&&data.plan.qualityActivities==null;
 const disabled=busy||!data?.canEdit||!!error||needsSplit||needsChoice;
 // Why the form is locked (not while it is only saving), shown above it.
 const lockReason:LockReason|null=!data||busy?null:error?{title:'Could not load this component',detail:'Reload the page and try again'}
  :!data.canEdit?{title:'Locked at this review stage',detail:'This component is with a reviewer or outside your departments, so its items cannot be changed now'}
  :needsSplit&&budgetPairs[pairOf(splitSide!)].envelope(data.plan)==null?{title:'Plan funding not set',detail:`Set the plan's funding on the plan page (Edit plan), then share the budget and add ${name} items`}
  :needsSplit?{title:'Waiting for the budget split',detail:data.canSplit?`Use “Set the budget split” above to decide how much of the shared budget ${name} will use`:`The BEAP Chair sets how much of the shared budget ${name} will use. You can add items once it is set`}
  :needsChoice?{title:'Choose the activities first',detail:`Use “Choose activities” above to pick the ${name} activities, then add items to them`}:null;
 const total=(data?.lines.reduce((s,l)=>s+Math.round(l.unitCost*100)*l.quantity,0)??0)/100;
 const envelopeKobo=data?componentEnvelopeKobo(data.plan,workstream):null;
 const envelope=envelopeKobo===null?null:Number(envelopeKobo)/100;
 // Shared-pool mode: TLM shares one pool with Infrastructure's school packages (partnerProposed), so "left" counts both.
 const pooled=workstream==='tlm'&&!!data&&!isSplitMode(data.plan),poolUsed=pooled?Number(data?.partnerProposed??0):0;
 const savedKobo=(data?.lines??[]).reduce((sum,l)=>sum+budgetKobo(l.unitCost.toFixed(2))*BigInt(l.quantity),BigInt(0));
 const draftCheck=activityLineSchema.safeParse(payload(draft,workstream)),draftValid=draftCheck.success;
 const quartersProblem=data?lineQuartersProblem(draft.quarters,data.plan):null,datesProblem=data?lineDatesProblem(draft,draft.quarters,data.plan.implementationYear):null,timelineProblem=quartersProblem??datesProblem;
 const draftQuantity=lineQuantity(draft,workstream);
 const draftKobo=Number.isSafeInteger(draftQuantity) && draftQuantity>=0 && Number(draft.unitCost)>=0 && Number(draft.unitCost)<=999999999999.99 ? budgetKobo(Number(draft.unitCost||0).toFixed(2))*BigInt(draftQuantity) : BigInt(0);
 const previous=data?.lines.find(l=>l.id===draft.id);
 const projected=savedKobo-(previous?budgetKobo(previous.unitCost.toFixed(2))*BigInt(previous.quantity):BigInt(0))+draftKobo;
 const savedLines:BudgetLine[]=(data?.lines??[]).map(l=>({activity:l.activity,kobo:budgetKobo(l.unitCost.toFixed(2))*BigInt(l.quantity)}));
 const projectedLines=[...savedLines.filter((_,i)=>data?.lines[i].id!==draft.id),{activity:Number(draft.activity),kobo:draftKobo}];
 // Same rule as the save API: a change that does not raise what its activity's cap covers is always allowed.
 const lowersCap=!!previous&&capActivities(workstream,Number(draft.activity)).includes(previous.activity)&&draftKobo<=budgetKobo(previous.unitCost.toFixed(2))*BigInt(previous.quantity);
 // Required activities first (same rule as the save API): optional items wait until each compulsory activity has one.
 const requiredFirst=data&&view==='budget'?requiredFirstProblem(workstream,data.lines.filter(l=>l.id!==draft.id),Number(draft.activity),previous?.activity,data.plan):null;
 const budgetError=!data?null:requiredFirst??(workstream==='sbmc'?sbmcBudgetProblem(projected,data.plan)??(draftKobo>BigInt(0)?activityBudgetProblem(workstream,projectedLines,data.plan,{pending:true}):null):pooled&&draftKobo>(previous?budgetKobo(previous.unitCost.toFixed(2))*BigInt(previous.quantity):BigInt(0))?infrastructurePoolProblem(data.plan,{infrastructure:budgetKobo(Number(data.partnerProposed??0).toFixed(2)),tlm:projected}):capped&&draftKobo>BigInt(0)&&!lowersCap?activityBudgetProblem(workstream,projectedLines,data.plan,{pending:true,only:Number(draft.activity)}):null);
 const activityKobo=(activity:number)=>savedLines.filter(l=>l.activity===activity).reduce((sum,l)=>sum+l.kobo,BigInt(0));
 const groupKobo=(activity:number)=>capActivities(workstream,activity).reduce((sum,a)=>sum+activityKobo(a),BigInt(0));
 const shareNote=(activity:number)=>{const fixed=activityFixedCaps[workstream]?.[activity];if(fixed!==undefined)return `Up to ${money.format(Number(fixed)/100)} for all its items · ${money.format(Number(activityKobo(activity))/100)} used`;const share=activityPercent(workstream,activity,selection),shared=capActivities(workstream,activity).length>1;return share===undefined?null:`${share} of the ${activityTitles[workstream]} allocation${shared?' (shared)':''}${envelopeKobo===null?'':` · up to ${money.format(Number(activityCapKobo(workstream,envelopeKobo,activity,selection))/100)} · ${money.format(Number(groupKobo(activity))/100)} used`}`;};
 // The chosen activity's own cap (Curriculum shares, SBMC monitoring, ICT Model Smart Schools), live with the draft: what it may use, what its
 // items use with this one, and what is left. The component meter shows the whole component; this line is the limit that applies here.
 const draftActivity=Number(draft.activity),draftCap=activityCap(workstream,envelopeKobo,draftActivity,selection),draftShare=activityPercent(workstream,draftActivity,selection),draftGroup=capActivities(workstream,draftActivity);
 const draftActivityUsed=savedLines.filter((l,i)=>draftGroup.includes(l.activity)&&data?.lines[i].id!==draft.id).reduce((sum,l)=>sum+l.kobo,BigInt(0))+draftKobo;
 // UBEC162/173: Curriculum's shares and the optional QA activities are guides; going over them is allowed.
 const guideOnly=isAdvisoryShare(workstream,draftActivity);
 const capLeft=draftCap?draftCap.kobo-draftActivityUsed:null,naira=(kobo:bigint)=>money.format(Number(kobo)/100);
 // A compact meter: the limit and its share, how much of it is used, and what is left (red when over).
 const capUsedPercent=draftCap&&draftCap.kobo>BigInt(0)?Math.min(100,Number(draftActivityUsed*BigInt(10000)/draftCap.kobo)/100):0;
 const capPartners=draftGroup.filter(a=>a!==draftActivity).map(a=>activityNames[workstream][a]);
 const capGuide=needsChoice?null:draftCap&&capLeft!==null?<div className="activity-cap-card" data-over={(!guideOnly&&capLeft<BigInt(0))||undefined} data-guide={guideOnly||undefined} aria-live="polite">
   <div><span>{guideOnly?'Suggested':'Up to'} <strong>{naira(draftCap.kobo)}</strong></span><span>{draftShare===undefined?'for all its items':`${draftShare} of ${title}${guideOnly?' · a guide, not a limit':''}`}</span></div>
   <Progress value={capUsedPercent} aria-label="Share of the activity limit used"/>
   <div><span>{naira(draftActivityUsed)} used{capPartners.length?` with ${capPartners.join(', ')}`:''}</span><strong>{capLeft<BigInt(0)?guideOnly?`${naira(-capLeft)} above the guide`:`${naira(-capLeft)} over`:`${naira(capLeft)} left`}</strong></div>
  </div>
  :draftShare!==undefined?<FieldDescription>Up to {draftShare} of {title} once the plan funding is set</FieldDescription>:null;
 function review(){if(data){const problem=workstream==='sbmc'?sbmcBudgetProblem(savedKobo,data.plan,true)??activityBudgetProblem(workstream,savedLines,data.plan):pooled?infrastructurePoolProblem(data.plan,{infrastructure:budgetKobo(Number(data.partnerProposed??0).toFixed(2)),tlm:savedKobo}):activityBudgetProblem(workstream,savedLines,data.plan);if(problem){toast.error(problem);return;}if(hasDistribution(workstream)&&savedLines.length&&!data.distribution.length){toast.error(emptyDistributionMessage(workstream));guard(()=>{reset();setView('distribution');});return;}}guard(()=>setSummaryOpen(true));}
 async function upload(files:File[]){if(lock.current)return;lock.current=true;setBusy(true);let added=0;try{for(const file of files){const form=new FormData();form.set('workstream',workstream);form.set('file',file);const r=await fetch(currentPlanHref('/api/activities/documents'),{method:'POST',body:form});const result=await r.json() as {error?:string};if(!r.ok)throw new Error(result.error||'Unable to upload');added++;}toast.success(`Uploaded ${added} proforma invoice${added===1?'':'s'}.`);}catch(e){toast.error(e instanceof Error?e.message:'Unable to upload');}finally{lock.current=false;setBusy(false);await load().catch(()=>undefined);}}
 async function removeDocument(id:string){if(lock.current)return;lock.current=true;setBusy(true);try{const r=await fetch(currentPlanHref('/api/activities/documents')+(currentPlanHref('/api/activities/documents').includes('?')?'&':'?')+`workstream=${workstream}&id=${encodeURIComponent(id)}`,{method:'DELETE'});const result=await r.json() as {error?:string};if(!r.ok)throw new Error(result.error);toast.success('Removed.');await load();}catch(e){toast.error(e instanceof Error?e.message:'Unable to remove');}finally{lock.current=false;setBusy(false);}}
 type MutateBody={entity:'line'|'school';action:'create'|'update'|'delete';id?:number}&Record<string,unknown>;
 type MutateResult={error?:string;added?:number;skipped?:number;id?:number;replayed?:boolean};
 /** Sends a change; on a dropped connection, reloads and finds a new line by its key. Null = the outcome is still unknown (the draft and key stay). */
 async function send(body:MutateBody,clientKey:string|undefined):Promise<MutateResult|null>{
  try{const reply=await postJson<MutateResult>(endpoint(),{...body,workstream,...(clientKey?{clientKey}:{})});if(!reply.ok)throw new Error(reply.data.error||'Unable to save');return reply.data;}
  catch(cause){
   if(!isConnectionDropped(cause))throw cause;
   const next=await load().catch(()=>null),landed=clientKey?next?.lines.find(l=>l.clientKey===clientKey):undefined;
   if(landed)return {id:landed.id,replayed:true};
   toast.error(connectionDroppedMessage);return null;
  }
 }
 async function mutate(body:MutateBody){if(lock.current)return;lock.current=true;setBusy(true);try{
  const isCreate=body.entity==='line'&&body.action==='create',clientKey=isCreate?(createKey.current??=newClientKey()):undefined;
  const result=await send(body,clientKey);if(!result)return;
  // Files picked before the item existed upload now that it has an id.
  const files=pendingDocs;let uploadFailed=false;
  if(isCreate&&result.id&&files.length&&lineDocumentSlots(workstream,Number(draft.activity)).length){try{await uploadLineDocuments(workstream,result.id,files);}catch(err){uploadFailed=true;toast.error(err instanceof Error?err.message:'Unable to upload the documents');}}
  reset();setRemoval(null);const next=await load();
  // The saved line flashes and scrolls into view in the panel.
  const savedId=body.entity==='line'&&body.action!=='delete'?result.id??body.id:undefined;if(savedId&&next.lines.some(l=>l.id===savedId))flash(savedId);
  // If an upload failed, keep the new item open so the documents can be attached again.
  const created=uploadFailed&&result.id?next.lines.find(l=>l.id===result.id):undefined;if(created){const d=toDraft(created);setDraft(d);setBaseline(d);}toast.success(result.added===undefined?'Saved.':`Added ${count.format(result.added)} school${result.added===1?'':'s'}${result.skipped?` · ${count.format(result.skipped)} already on the list`:''}.`);}catch(e){toast.error(e instanceof Error?e.message:'Unable to save');}finally{lock.current=false;setBusy(false);}}
 function save(e:FormEvent){e.preventDefault();const parsed=activityLineSchema.safeParse(payload(draft,workstream));if(!parsed.success){setError('');toast.error(parsed.error.issues[0].message);return;}if(timelineProblem){toast.error(timelineProblem);return;}if(budgetError){toast.error(budgetError);return;}void mutate({...parsed.data,entity:'line',action:draft.id?'update':'create',id:draft.id});}
 function toDraft(l:ActivityLine):Draft{return {id:l.id,activity:String(l.activity),customActivity:l.customActivity??'',description:l.description,rationale:l.rationale??'',implementationApproach:l.implementationApproach??'',quantity:String(l.frequency?l.quantity/l.frequency:l.quantity),frequency:l.frequency?String(l.frequency):'',unitCost:String(l.unitCost),strategy:l.strategy,targetGroup:l.targetGroup,equipment:l.equipment,textbookClasses:l.textbookClasses??[],textbookSubject:l.textbookSubject??'',equipmentCategory:l.equipmentCategory??'',equipmentType:l.equipmentType??'',subscriptionTypes:l.subscriptionTypes??[],websiteType:l.websiteType??'',item:l.item??'',censusType:l.censusType??'',priceItemId:l.priceItemId?String(l.priceItemId):'',schoolIds:l.schoolIds??[],trainingProvider:l.trainingProvider??'',targetParticipants:l.targetParticipants??'',schoolLevels:l.schoolLevels??[],trainingDays:l.trainingDays==null?'':String(l.trainingDays),venueType:l.venueType??'',quarters:l.quarters??planQuarters(data?.plan),startDate:l.startDate??null,dueDate:l.dueDate??null};}
 function edit(l:ActivityLine){guard(()=>{createKey.current=null;const d=toDraft(l);setDraft(d);setBaseline(d);setView('budget');panel.follow();});}
 // UBEC188/191: ?line=<id> (from the plan page's UBEC rejections) opens that item in the form once the lines load.
 const linkedLine=useRef<string|null|undefined>(undefined);
 useEffect(()=>{
  if(!data)return;
  if(linkedLine.current===undefined)linkedLine.current=new URLSearchParams(window.location.search).get('line');
  const wanted=linkedLine.current;if(!wanted)return;
  linkedLine.current=null;
  const line=data.lines.find(l=>String(l.id)===wanted);
  const url=new URL(window.location.href);url.searchParams.delete('line');window.history.replaceState(null,'',url);
  if(line)void Promise.resolve().then(()=>{createKey.current=null;const d=toDraft(line);setDraft(d);setBaseline(d);setView('budget');panel.follow();});
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[data]);
 function start(activity:number){guard(()=>{createKey.current=null;const next={...fresh,activity:String(activity)};setDraft(next);setBaseline(next);setPendingDocs([]);panel.follow();requestAnimationFrame(()=>document.getElementById('activity')?.focus());});}
 // Quantity, unit cost or description edited in the table: the whole line goes through the same schema and API as the form.
 async function saveCell(id:number,field:InlineField,value:string):Promise<string|null>{
  const line=data?.lines.find(l=>l.id===id);if(!line)return 'This item is no longer in the plan';
  const before=toDraft(line),parsed=activityLineSchema.safeParse(payload({...before,[field]:value},workstream));
  if(!parsed.success)return parsed.error.issues[0].message;
  // Updates are idempotent (by id), so after a dropped connection the list is reloaded and the cell can simply be saved again.
  try{const reply=await postJson<{error?:string}>(endpoint(),{...parsed.data,entity:'line',action:'update',id,workstream});if(!reply.ok)return reply.data.error||'Unable to save this change';}
  catch{const now=(await load().catch(()=>null))?.lines.find(l=>l.id===id);if(!now||!cellMatches(now,field,value))return connectionDroppedMessage;}
  // The form keeps its draft; if it shows this line unchanged, it picks up the saved values.
  const next=await load().catch(()=>null),saved=next?.lines.find(l=>l.id===id);
  if(saved){const d=toDraft(saved),was=JSON.stringify(before);setBaseline(b=>b.id===id?d:b);setDraft(current=>current.id===id&&JSON.stringify(current)===was?d:current);}
  return null;
 }
 /** Target group: one or more, kept in the draft as the stored text ("Schools, Teachers"). */
 function targetGroupPicker(){const chosen=splitTargetGroups(draft.targetGroup);return <Field><FieldLabel htmlFor="targetGroup">Target group {required}</FieldLabel><Combobox multiple items={[...targetGroups]} value={chosen} onValueChange={(groups,details)=>{if(!keepsChoices(details))setDraft({...draft,targetGroup:joinTargetGroups(groups)});}}><ComboboxChips ref={targetAnchor}><>{chosen.map(group=><ComboboxChip key={group}>{group}</ComboboxChip>)}</><ComboboxChipsInput id="targetGroup" placeholder={chosen.length?'Add another group…':'Choose one or more groups…'} aria-required="true" /></ComboboxChips><ComboboxContent anchor={targetAnchor}><ComboboxEmpty>No groups match your search</ComboboxEmpty><ComboboxList>{targetGroups.map(group=><ComboboxItem key={group} value={group}>{group}</ComboboxItem>)}</ComboboxList></ComboboxContent></Combobox></Field>;}
 function select(key:'strategy'|'textbookSubject',label:string,options:readonly string[]){
  // UBEC159: Non-Applicable names what is used instead ("Non-Applicable: E-payment"), typed in a box under the list.
  const name=key==='strategy'?strategyLabel:(o:string)=>o,split=key==='strategy'?splitStrategy(draft.strategy):{strategy:draft[key],detail:''},value=split.strategy,retired=!!value&&!options.includes(value);
  return <><Field><FieldLabel htmlFor={key}>{label} {required}</FieldLabel><NativeSelect id={key} required value={value} onChange={e=>setDraft({...draft,[key]:e.target.value})}><NativeSelectOption value="">Choose…</NativeSelectOption>{retired&&<NativeSelectOption value={value} disabled>{name(value)} (no longer offered)</NativeSelectOption>}{options.map(o=><NativeSelectOption key={o} value={o}>{name(o)}</NativeSelectOption>)}</NativeSelect></Field>
   {key==='strategy'&&value===nonApplicableStrategy&&<Field><FieldLabel htmlFor="strategyDetail">What is used instead {required}</FieldLabel><Input id="strategyDetail" required maxLength={maxStrategyDetailLength} placeholder="e.g. E-payment/cash transfer, direct payment to vendor" value={split.detail} onChange={e=>{const typed=e.target.value.replace(/^\s+/,'').slice(0,maxStrategyDetailLength);setDraft({...draft,strategy:typed?`${nonApplicableStrategy}: ${typed}`:nonApplicableStrategy});}}/><FieldDescription>Attach the BPP waiver under Supporting documents</FieldDescription></Field>}</>;}
 const filtered=data?.lines.filter(l=>lineSearchText(workstream,l).includes(query.trim().toLowerCase()))??[];
 // TLM has a long checklist, so only activities with saved items get a section.
 const displayActivityIndexes=[...new Set([...(workstream==='tlm'?[]:offered),...(data?.lines.map(line=>line.activity)??[])])].sort((a,b)=>a-b);
 const visibleLines=displayActivityIndexes.flatMap(activity=>filtered.filter(line=>line.activity===activity));
 const selectedLineIndex=draft.id?visibleLines.findIndex(line=>line.id===draft.id):-1;
 const legacyActivity=!(selectableActivityIndexes[workstream] as readonly number[]).includes(Number(draft.activity));
 const pickable=selectableActivityIndexes[workstream].filter(i=>offered.includes(i));
 const navigateLine=(offset:number)=>{const line=visibleLines[selectedLineIndex+offset];if(line)edit(line);};
 const renovated=new Set(data?.renovated??[]),listed=new Set(data?.distribution.map(s=>s.id)??[]);
 const renovatedFirst=(list:DistributionSchool[])=>[...list].sort((a,b)=>Number(renovated.has(b.id))-Number(renovated.has(a.id)));
 // Picker order: this plan's Infrastructure schools first (suggested and ticked on load), then schools already on the list, then ticked ones, then the rest.
 // Ticks only reorder when the search changes, so rows don't jump while the user is ticking.
 const pinnedPicks=new Set(pinned);
 const pickerRank=(id:number)=>renovated.has(id)?0:listed.has(id)?1:pinnedPicks.has(id)?2:3;
 const pickerOrder=(list:DistributionSchool[])=>[...list].sort((a,b)=>pickerRank(a.id)-pickerRank(b.id));
 const distribution=renovatedFirst(data?.distribution??[]);
 // UBEC73: warned, not refused, when a textbook quantity is above the learners in its classes on the distribution list.
 const textbookWarning=workstream==='tlm'&&Number(draft.activity)===textbookActivityIndex?textbookQuantityWarning(Number(draft.quantity),draft.textbookClasses,data?.distribution??[]):null;
 const missingRenovated=[...renovated].filter(id=>!listed.has(id));
 const shares=allocateByEnrolment(Math.round(total*100),distribution),learnerTotal=distribution.reduce((sum,s)=>sum+(s.enrolment??0),0);
 const needle=schoolQuery.trim().toLowerCase();
 const matches=pickerOrder(filterByLevel(data?.schools??[],schoolLevel).filter(s=>!needle||`${s.name} ${s.lga} ${s.level}`.toLowerCase().includes(needle)));
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
    <header className="editor-heading"><h1>{view==='distribution'?'Add schools':draft.id?'Edit budget item':'Add a budget item'}</h1>{training&&<Button asChild variant="outline" size="sm" className="rounded-full"><a href={trainingBudgetTemplate} download="BEAPMS Training Budget Template.xlsx" title="Literacy, ECCDE and Curriculum training budget guides"><DownloadIcon data-icon="inline-start"/>Budget template</a></Button>}</header>
    {error&&<Alert variant="destructive"><AlertTitle>Unable to load</AlertTitle><AlertDescription>{error}<Button variant="outline" onClick={()=>void load().catch(e=>setError(e.message))}>Retry</Button></AlertDescription></Alert>}
    {splitSide&&data&&!error&&<SharedBudgetPanel key={storedAllocation(data.plan,splitSide)??'unset'} side={splitSide} plan={data.plan} proposed={total} partnerProposed={Number(data.partnerProposed??0)} canEdit={!!data.canSplit&&!busy} onSaved={async()=>{await load();}}/>}
    {workstream==='ict'&&data&&!error&&<IctConnectPanel plan={data.plan} waivers={data.documents} canEdit={data.canEdit&&!busy} onSaved={async()=>{await load();}}/>}
    {choosesUpFront(workstream)&&data&&!error&&<ActivitySelectionPanel key={JSON.stringify(data.plan.qualityActivities)} workstream={workstream} plan={data.plan} lines={savedLines} canEdit={data.canEdit&&!busy} onSaved={async()=>{await load();}}/>}
    <form id="activity-form" onSubmit={view==='budget'?save:e=>{e.preventDefault();if(picked.length)void mutate({entity:'school',action:'create',schoolIds:picked});}}><LockedOverlay reason={lockReason}><fieldset disabled={disabled}><FieldGroup>
     {view==='distribution'?<Field><FieldLabel htmlFor="school-search">Schools {required}</FieldLabel><Input id="school-search" type="search" placeholder="Search by school, LGA or level…" value={schoolQuery} onChange={e=>{setPinned(picked);setSchoolQuery(e.target.value);}}/>
      <SchoolLevelFilter schools={data?.schools??[]} value={schoolLevel} disabled={disabled} onChange={level=>{setPinned(picked);setSchoolLevel(level);}}/>
      <div className="school-picker" role="group" aria-label="Schools to add"><label className="school-pick school-pick-all"><Checkbox checked={allPicked?true:somePicked?'indeterminate':false} disabled={disabled||!addable.length} onCheckedChange={v=>toggleAll(v===true)} aria-label="Select all matching schools"/><span>Select all{needle||schoolLevel!==allLevels?' matching':''} ({count.format(addable.length)})</span>{picked.length>0&&<Badge variant="secondary" className="ml-auto">{count.format(picked.length)} selected</Badge>}</label>
       {matches.slice(0,pickerLimit).map(s=>{const on=listed.has(s.id);return <label key={s.id} className="school-pick" data-listed={on||undefined}><Checkbox checked={on||pickedSet.has(s.id)} disabled={disabled||on} onCheckedChange={v=>togglePick(s.id,v===true)} aria-label={`Select ${s.name}`}/><span className="school-option"><span>{s.name}</span><small>{s.lga} · {s.level}{s.enrolment?` · ${count.format(s.enrolment)} learners`:''}</small></span><span className="school-pick-badges">{renovated.has(s.id)&&!on&&<Badge variant="warning">Suggested · Infrastructure</Badge>}{renovated.has(s.id)&&on&&<Badge variant="warning">Infrastructure</Badge>}{on&&<Badge variant="outline">On the list</Badge>}</span></label>;})}
       {!matches.length&&<p className="school-pick-empty">{data?.schools.length===0?'No schools are available in your state register':schoolLevel!==allLevels?`No ${schoolLevel} schools match your search`:'No schools match your search'}</p>}
       {matches.length>pickerLimit&&<p className="school-pick-empty">Showing {pickerLimit} of {count.format(matches.length)} schools. Search to narrow the list; Select all still covers every match.</p>}
      </div></Field>:<>
      <Field><FieldLabel htmlFor="activity">Allowable activity {required}</FieldLabel><NativeSelect id="activity" required value={draft.activity} onChange={e=>{setDraft({...draft,...extrasReset,activity:e.target.value,customActivity:'',equipment:'',textbookClasses:[],textbookSubject:''});panel.follow();}}>{legacyActivity&&<NativeSelectOption value={draft.activity} disabled>{activityNames[workstream][Number(draft.activity)]??'Earlier activity'} (no longer available)</NativeSelectOption>}{pickable.map(i=><NativeSelectOption value={i} key={i}>{activityNames[workstream][i]}{isCompulsory(workstream,i)?' · Required':''}</NativeSelectOption>)}</NativeSelect>{legacyActivity?<FieldDescription className="text-destructive">This item uses an earlier activity. Choose one from the current list to save it.</FieldDescription>:activityHints[workstream]?.[Number(draft.activity)]&&<FieldDescription className="activity-note"><InfoIcon aria-hidden="true"/><span>Includes: {activityHints[workstream]?.[Number(draft.activity)]}</span></FieldDescription>}{activityInfo[workstream]?.[Number(draft.activity)]&&<FieldDescription className="activity-note"><InfoIcon aria-hidden="true"/><span>{activityInfo[workstream]?.[Number(draft.activity)]}</span></FieldDescription>}{capGuide}{requiredFirst&&<Alert variant="destructive"><AlertTitle>Required activities first</AlertTitle><AlertDescription>{requiredFirst}</AlertDescription></Alert>}</Field>
      {isOtherActivity(workstream,Number(draft.activity))&&<Field><FieldLabel htmlFor="customActivity">Activity name <span className="text-destructive" aria-label="required">*</span></FieldLabel><Input id="customActivity" required maxLength={maxActivityNameLength} value={draft.customActivity} onChange={e=>setDraft({...draft,customActivity:e.target.value})} placeholder="Name the activity" /><FieldDescription>Use this for an allowable activity that is not in the list</FieldDescription></Field>}
      {training&&<TeacherTrainingFields draft={draft} onChange={next=>setDraft({...draft,...next})}/>}
      {(workstream==='quality'||workstream==='gscci'||workstream==='planning')&&<LineExtraFields workstream={workstream} draft={draft} onChange={next=>setDraft({...draft,...next})}/>}
      {!training&&<Field><FieldLabel htmlFor="description">Description {required}</FieldLabel><Textarea id="description" required maxLength={1000} value={draft.description} onChange={e=>setDraft({...draft,description:e.target.value})}/></Field>}
      {workstream==='tlm'&&Number(draft.activity)===textbookActivityIndex&&<>
       <Field><FieldLabel htmlFor="textbookClasses">Classes <span className="text-destructive" aria-label="required">*</span></FieldLabel><Combobox multiple items={[...textbookClasses]} value={draft.textbookClasses} onValueChange={(classes,details)=>{if(!keepsChoices(details))setDraft({...draft,textbookClasses:classes});}}><ComboboxChips ref={classesAnchor}><>{draft.textbookClasses.map(className=><ComboboxChip key={className}>{className}</ComboboxChip>)}</><ComboboxChipsInput id="textbookClasses" placeholder={draft.textbookClasses.length?'Add another class…':'Choose one or more classes…'} aria-required="true" /></ComboboxChips><ComboboxContent anchor={classesAnchor}><ComboboxEmpty>No classes match your search</ComboboxEmpty><ComboboxList>{textbookClasses.map(className=><ComboboxItem key={className} value={className}>{className}</ComboboxItem>)}</ComboboxList></ComboboxContent></Combobox></Field>
       {select('textbookSubject','Subject',textbookSubjects)}
      </>}
      {workstream!=='quality'&&workstream!=='gscci'&&workstream!=='planning'&&<LineExtraFields workstream={workstream} draft={draft} onChange={next=>setDraft({...draft,...next})}/>}
      <LineSchoolPicker workstream={workstream} draft={draft} schools={data?.schools??[]} disabled={disabled} onChange={schoolIds=>setDraft({...draft,schoolIds,...(perSchool?{quantity:String(schoolIds.length||1)}:{})})}/>
      {workstream==='sbmc'&&([ ['rationale','Rationale'],['implementationApproach','Implementation approach'] ] as const).map(([key,label])=><Field key={key}><FieldLabel htmlFor={key}>{label} {required}</FieldLabel><Textarea id={key} required maxLength={1000} value={draft[key]} onChange={e=>setDraft({...draft,[key]:e.target.value})}/></Field>)}
      {pricedActivity&&priceList&&<Field><FieldLabel htmlFor="priceItem">Item from the price list {priceList.required&&required}</FieldLabel>
       <NativeSelect id="priceItem" value={draft.priceItemId} required={priceList.required} onChange={e=>{const picked=priceList.items.find(i=>String(i.id)===e.target.value);setDraft(picked?{...draft,priceItemId:String(picked.id),unitCost:picked.unitPrice.toFixed(2),description:draft.description||[picked.name,picked.description].filter(Boolean).join(' – ')}:{...draft,priceItemId:''});}}>
        <NativeSelectOption value="">{priceList.required?'Choose an item…':'Not from the price list (type the cost)'}</NativeSelectOption>
        {draft.priceItemId&&!priceList.items.some(i=>String(i.id)===draft.priceItemId)&&<NativeSelectOption value={draft.priceItemId}>Saved item (no longer on the list)</NativeSelectOption>}
        {priceList.items.map(i=><NativeSelectOption key={i.id} value={String(i.id)}>{procurementItemLabel(i)} — {money.format(i.unitPrice)}</NativeSelectOption>)}
       </NativeSelect>
       <FieldDescription>{!priceList.items.length?`Procurement has not approved any items yet${priceList.required?'. Ask Procurement to add the item':''}`:draft.priceItemId?'The unit cost is the price on the list':'Pick the item and its price is filled in. If it is not listed, ask Procurement to add it'}</FieldDescription></Field>}
      <FieldGroup className={visits?'grid grid-cols-2 gap-4 sm:grid-cols-3':'grid grid-cols-2 gap-4'}><Field><FieldLabel htmlFor="quantity">{training?'Quantity (Number of Participants)':visits?'Quantity (No. of officers)':'Quantity'} {required}</FieldLabel><Input id="quantity" type="number" min="1" max="1000000" step="1" required readOnly={perSchool} aria-readonly={perSchool||undefined} className={perSchool?'bg-muted':undefined} value={perSchool?String(draft.schoolIds.length||''):draft.quantity} onChange={e=>setDraft({...draft,quantity:e.target.value})}/>{perSchool&&<FieldDescription>One per school: the number of schools chosen</FieldDescription>}{textbookSuggestion>0&&<FieldDescription>One per learner: {count.format(textbookSuggestion)} in the chosen classes (DNEMIS)</FieldDescription>}{textbookWarning&&<FieldDescription className="textbook-warning" role="status">{textbookWarning}</FieldDescription>}</Field>{visits&&<Field><FieldLabel htmlFor="frequency">Frequency (No. of visits) {required}</FieldLabel><Input id="frequency" type="number" min="1" max={maxFrequency} step="1" required placeholder="1" value={draft.frequency} onChange={e=>setDraft({...draft,frequency:e.target.value})}/><FieldDescription>Sub-total = officers × visits × unit cost</FieldDescription></Field>}<Field><FieldLabel htmlFor="unitCost">{training?'Unit cost per teacher (₦)':'Unit cost (₦)'} {required}{workstream==='tlm'&&<FieldHelp>What the cost covers falls under the guidelines and customization (Track &amp; Trace, Customization, Academic)</FieldHelp>}</FieldLabel><CurrencyInput id="unitCost" placeholder="0.00" maxIntegerDigits={12} required readOnly={!!draft.priceItemId} aria-readonly={!!draft.priceItemId||undefined} className={draft.priceItemId?'bg-muted':undefined} value={draft.unitCost} onValueChange={unitCost=>setDraft({...draft,unitCost})}/></Field></FieldGroup>
      {textbookSuggestion>0&&<Collapsible className="textbook-allocation"><CollapsibleTrigger asChild><Button type="button" variant="ghost" size="sm" className="rounded-full"><ChevronRightIcon data-icon="inline-start" className="textbook-allocation-chevron"/>Allocation by school · {count.format(textbookAllocation(draft.textbookClasses,data?.distribution??[]).length)} schools</Button></CollapsibleTrigger>
       <CollapsibleContent><Table className="textbook-allocation-table"><TableHeader><TableRow><TableHead>School</TableHead><TableHead>LGA</TableHead><TableHead className="text-right">Textbooks</TableHead></TableRow></TableHeader><TableBody>{textbookAllocation(draft.textbookClasses,data?.distribution??[]).map(({school,learners})=><TableRow key={school.id}><TableCell>{school.name}</TableCell><TableCell>{school.lga}</TableCell><TableCell className="text-right">{count.format(learners)}</TableCell></TableRow>)}</TableBody></Table><FieldDescription>One textbook per learner in the chosen classes, from DNEMIS. Schools with no DNEMIS figures for these classes are not listed</FieldDescription></CollapsibleContent></Collapsible>}
      {training?<Field><FieldLabel htmlFor="description">Description {required}</FieldLabel><Textarea id="description" required maxLength={1000} value={draft.description} onChange={e=>setDraft({...draft,description:e.target.value})}/></Field>
       :<>{select('strategy',workstream==='sbmc'?'Procurement strategy':'Implementation strategy',implementationStrategies)}{targetGroupPicker()}</>}
      <QuarterTimeline id="activity-quarters" size="compact" required help="The quarters in which this item will be implemented. Only this plan's quarters can be chosen." value={draft.quarters} onChange={quarters=>setDraft({...draft,quarters,...keepDatesInWindow(draft,quarters,data?.plan.implementationYear)})} available={data?planQuarters(data.plan):[]} disabled={disabled} error={quartersProblem??undefined} selectAll={!!data&&planQuarters(data.plan).length>1}/>
      <LineDatesField id="activity-dates" value={{startDate:draft.startDate,dueDate:draft.dueDate}} onChange={dates=>setDraft({...draft,...dates})} quarters={draft.quarters} year={data?.plan.implementationYear} disabled={disabled} error={datesProblem}/>
      <LineDocumentsField workstream={workstream} activity={Number(draft.activity)} lineId={draft.id&&previous?.activity===Number(draft.activity)?draft.id:undefined} documents={previous?.documents??[]} pending={pendingDocs} onPendingChange={setPendingDocs} required={data?.documentsRequired===true} disabled={disabled} onChanged={async()=>{await load();}}/>
      {budgetError&&!requiredFirst&&<Alert variant="destructive"><AlertTitle>Allocation limit</AlertTitle><AlertDescription>{budgetError}</AlertDescription></Alert>}
     </>}
    </FieldGroup></fieldset></LockedOverlay></form>
   </div></ScrollArea><div className="editor-footer"><div className="line-total"><span>{view==='budget'?capped?'Sub-total':'Line total':'Distribution schools'}</span><strong>{view==='budget'?money.format((Math.round(Number(draft.unitCost||0)*100)*draftQuantity)/100):data?.distribution.length??0}</strong></div><div className="footer-actions">{draft.id&&<><Button variant="ghost" disabled={busy} onClick={()=>guard(()=>reset())}>Cancel</Button><ButtonGroup className="activity-line-navigation" aria-label="Budget item navigation"><Button size="icon" variant="secondary" aria-label="Previous budget item" title="Previous budget item" disabled={disabled||selectedLineIndex<=0} onClick={()=>navigateLine(-1)}><ChevronLeftIcon/></Button><ButtonGroupSeparator/><Button size="icon" variant="secondary" aria-label="Next budget item" title="Next budget item" disabled={disabled||selectedLineIndex<0||selectedLineIndex===visibleLines.length-1} onClick={()=>navigateLine(1)}><ChevronRightIcon/></Button></ButtonGroup></>}{(()=>{const blocked=disabled||(view==='distribution'&&!picked.length)||(view==='budget'&&(!draftValid||!!timelineProblem))||!!budgetError;
   // A disabled button gets no hover, so the reason sits on a wrapper the pointer and keyboard can reach.
   const reason=blocked?saveBlockedReason({busy,canEdit:!!data?.canEdit,failed:!!error,needsIctAllocation:needsSplit,splitName:name,view:view==='distribution'?'distribution':'budget',pickedSchools:picked.length,issues:draftCheck.success?[]:draftCheck.error.issues,timelineError:timelineProblem,budgetError}):null;
   const button=<Button form="activity-form" type="submit" disabled={blocked}>{lockReason&&<LockIcon data-icon="inline-start"/>}{busy?'Saving…':draft.id?'Save changes':view==='budget'?'Add item':`Add ${picked.length?count.format(picked.length)+' ':''}school${picked.length===1?'':'s'}`}</Button>;
   return reason?<Tooltip delayDuration={0}><TooltipTrigger asChild><span className="save-button-wrap" tabIndex={0} aria-label={reason}>{button}</span></TooltipTrigger><TooltipContent side="top" className="soft-tip max-w-64">{reason}</TooltipContent></Tooltip>:button;})()}</div></div></section>
   <section className="workspace-pane preview-pane" aria-label="Saved component"><ScrollArea className="pane-scroll">{view==='distribution'?<article className="preview-document sports-preview">
    <div className="plan-overview"><div><span>Proposed {name} budget</span><strong>{error?'Unavailable':data?money.format(total):'Loading…'}</strong></div>{!data?null:envelope===null?<p>{sharesBudget&&data.plan.stateLodgment!=null?(workstream==='ict'?'ICT allocation not set':`${name} budget not set`):'Funding envelope not set'}</p>:<EnvelopeMeter label={pooled?'Shared with Infrastructure':workstream==='ict'?'ICT allocation':training?'Teacher Development budget':sharesBudget?`${name} allocation`:'Funding envelope'} envelope={envelope} used={total} partner={pooled?{label:'Infrastructure',amount:poolUsed}:undefined} />}</div>
    {envelope!==null&&poolUsed+total>envelope&&<Alert variant="destructive"><AlertTitle>Above funding envelope</AlertTitle><AlertDescription>{pooled?'Infrastructure and TLM together exceed':'The planned total exceeds'} the envelope by {money.format(poolUsed+total-envelope)}.</AlertDescription></Alert>}
    <h2>Distribution list</h2>
     {missingRenovated.length>0&&<Alert className="mb-4"><AlertTitle>{count.format(missingRenovated.length)} Infrastructure school{missingRenovated.length===1?' is':'s are'} not on the list</AlertTitle><AlertDescription>Schools with an Infrastructure package in this plan are suggested for the distribution list<Button variant="outline" size="sm" disabled={disabled} onClick={()=>void mutate({entity:'school',action:'create',schoolIds:missingRenovated})}>Add Infrastructure schools</Button></AlertDescription></Alert>}
     <p className="distribution-note">Allocation shares the {name} budget ({money.format(total)}) across the listed schools by enrolment.</p>
     <Table className="distribution-table"><TableHeader><TableRow><TableHead>School</TableHead><TableHead>LGA</TableHead><TableHead>Level</TableHead><TableHead>Location</TableHead><TableHead className="text-right">Learners</TableHead><TableHead className="text-right">Allocation (₦)</TableHead><TableHead>Actions</TableHead></TableRow></TableHeader><TableBody>{distribution.map(s=><TableRow key={s.id}><TableCell><span className="flex flex-wrap items-center gap-2">{s.name}{renovated.has(s.id)&&<Badge variant="warning">Infrastructure</Badge>}</span></TableCell><TableCell>{s.lga}</TableCell><TableCell>{s.level}</TableCell><TableCell>{s.location}</TableCell><TableCell className="text-right tabular-nums">{count.format(s.enrolment??0)}</TableCell><TableCell className="text-right tabular-nums whitespace-nowrap">{shares.has(s.id)?money.format(shares.get(s.id)!/100):'—'}</TableCell><TableCell><Button variant="ghost" size="sm" disabled={disabled} onClick={()=>setRemoval({entity:'school',id:s.id})}>Remove</Button></TableCell></TableRow>)}{!distribution.length&&<TableRow><TableCell colSpan={7}>Add at least one school before sending {name} for review.</TableCell></TableRow>}</TableBody>{distribution.length>0&&<TableFooter><TableRow><TableCell colSpan={4}>Total · {count.format(distribution.length)} school{distribution.length===1?'':'s'}</TableCell><TableCell className="text-right tabular-nums">{count.format(learnerTotal)}</TableCell><TableCell className="text-right tabular-nums whitespace-nowrap">{shares.size?money.format(total):'—'}</TableCell><TableCell/></TableRow></TableFooter>}</Table>
   </article>:<article className="preview-document line-panel-document">
    <ActivityLinePanel workstream={workstream} activities={offered} lines={data?.lines??null} setup={data?.plan??null} documentsRequired={data?.documentsRequired===true}
     summary={{label:`Proposed ${name} budget`,total:error?'Unavailable':data?money.format(total):'Loading…',meter:!data?null:envelope===null?<p>{sharesBudget&&data.plan.stateLodgment!=null?(workstream==='ict'?'ICT allocation not set':`${name} budget not set`):'Funding envelope not set'}</p>:<EnvelopeMeter label={pooled?'Shared with Infrastructure':workstream==='ict'?'ICT allocation':training?'Teacher Development budget':sharesBudget?`${name} allocation`:'Funding envelope'} envelope={envelope} used={total} partner={pooled?{label:'Infrastructure',amount:poolUsed}:undefined} />}}
     notices={<>{envelope!==null&&poolUsed+total>envelope&&<Alert variant="destructive"><AlertTitle>Above funding envelope</AlertTitle><AlertDescription>{pooled?'Infrastructure and TLM together exceed':'The planned total exceeds'} the envelope by {money.format(poolUsed+total-envelope)}.</AlertDescription></Alert>}{workstream==='monitoring'&&<section className="activity-documents" aria-labelledby="proforma-title"><div className="flex items-baseline justify-between gap-3"><h2 id="proforma-title">Proforma Invoice</h2><span className="text-sm text-muted-foreground">Optional · {data?.documents.length??0} file{data?.documents.length===1?'':'s'}</span></div><FileUpload compact id="proforma-invoice" label="Proforma Invoice" multiple accept={proformaAccept} disabled={disabled} busy={busy} onFiles={upload}/>{!!data?.documents.length&&<DocumentFiles compact documents={data.documents.map(d=>({...d,url:'/api/activities/documents?id='+d.id,description:'Proforma invoice'}))} disabled={disabled} onRemove={data.canEdit?id=>void removeDocument(id):undefined}/>}</section>}</>}
     selectedActivity={Number(draft.activity)} selectedId={draft.id} dirtyId={dirty?draft.id:undefined} mode={panel.mode} onMode={panel.setMode} query={query} onQuery={setQuery} flashId={flashId}
     inlineEditable={!disabled} actionsDisabled={disabled} viewOnly={!!data&&!data.canEdit} shareNote={shareNote} onSaveCell={saveCell} onEdit={edit} onRemove={l=>guard(()=>setRemoval({entity:'line',id:l.id}))} onStart={start}/>
   </article>}</ScrollArea></section>
  </div>
 </div><AlertDialog open={!!removal} onOpenChange={o=>{if(!o&&!busy)setRemoval(null);}}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Remove this {removal?.entity==='school'?'school':'item'}?</AlertDialogTitle><AlertDialogDescription>This removes it from this plan only</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel><Button variant="destructive" disabled={busy} onClick={()=>removal&&void mutate({...removal,action:'delete'})}>Remove</Button></AlertDialogFooter></AlertDialogContent></AlertDialog>
 {data&&<ComponentSummaryDialog open={summaryOpen} onOpenChange={setSummaryOpen} workstream={workstream} title={title} lines={data.lines} envelope={envelope} distribution={withDistribution?data.distribution.length:null}
  missing={compulsoryFor(workstream,data.plan).filter(a=>!data.lines.some(l=>l.activity===a)).map(a=>activityNames[workstream][a])}
  onContinue={()=>window.location.assign(currentPlanHref('/beap/review')+'#send-'+workstream)}/>}
 <DiscardChangesDialog open={!!pending} saved="Your saved items stay as they are" onKeep={()=>setPending(null)} onDiscard={()=>{const run=pending;reset();setPending(null);run?.();}}/>
 </div>;
}
