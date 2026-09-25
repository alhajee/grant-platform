'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { planPeriod } from '@/lib/action-plans';
import { cn } from '@/lib/utils';
import { ArrowLeft, Send, UsersRound, Check, MessageSquare, History } from 'lucide-react';
import { UbecShell } from '@/components/ubec-shell';
import { PlanReviewContent } from '@/components/plan-review-content';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Field, FieldLabel, FieldGroup, FieldSet, FieldLegend } from '@/components/ui/field';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectGroup, SelectItem } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { departments, pillarDepartments, departmentName, activePillars, isUbec, nationalStatusLabels, type UbecDetail } from '@/lib/ubec';
import { beapPillars } from '@/lib/beap-pillars';
import { toast } from 'sonner';
type Action = 'submit'|'assign'|'feedback'|'return'|'approve';
const titles:Record<Action,string>={submit:'Send to UBEC',assign:'Assign departments',feedback:'Submit departmental review',return:'Return to SUBEB',approve:'Approve action plan'};
const date=new Intl.DateTimeFormat('en-GB',{dateStyle:'medium',timeStyle:'short'});
const pillarName=(id:string)=>id==='tlm'?'Teaching & Learning Materials':beapPillars.find(p=>p.id===id)?.name??id;
export default function Review(){
  const [data,setData]=useState<UbecDetail|null>(null),[error,setError]=useState(''),[loading,setLoading]=useState(true),[selected,setSelected]=useState('current');
  const [action,setAction]=useState<Action|null>(null),[comment,setComment]=useState(''),[recommendation,setRecommendation]=useState('endorse'),[assignmentId,setAssignmentId]=useState<number|undefined>(),[choices,setChoices]=useState<string[]>([]),[saving,setSaving]=useState(false),[formError,setFormError]=useState('');
  const requestId=useRef(0),busy=useRef(false);
  const path=()=>`/api/ubec/review?plan=${encodeURIComponent(new URLSearchParams(window.location.search).get('plan')??'')}`;
const load=useCallback(async(value='current')=>{const ticket=++requestId.current;setLoading(true);setError('');try{const response=await fetch(path()+(value==='current'?'':`&round=${value}`),{cache:'no-store'});if(response.status===401){window.location.replace('/');return;}const result=await response.json() as UbecDetail & {error?:string};if(!response.ok)throw new Error(result.error);if(ticket===requestId.current){setData(result);setSelected(value);}}catch(e){if(ticket===requestId.current)setError(e instanceof Error?e.message:'Unable to load review.');}finally{if(ticket===requestId.current)setLoading(false);}},[]);
  useEffect(()=>{void Promise.resolve().then(() => load());},[load]);
  function open(next:Action,id?:number){setComment('');setFormError('');setRecommendation('endorse');setAssignmentId(id);setChoices(data?.round?activePillars(data.round.snapshot).map(p=>`${p}:${pillarDepartments[p]}`):[]);setAction(next);}
  async function confirm(){if(!action||!data||busy.current)return;busy.current=true;setSaving(true);setFormError('');try{const response=await fetch(path(),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,version:data.plan.version,roundId:data.round?.id,comment,...(action==='assign'?{assignments:choices.map(choice=>{const [pillar,department]=choice.split(':');return {pillar,department};})}:{}),...(action==='feedback'?{assignmentId,recommendation}:{})})});const result=await response.json() as {error?:string};if(!response.ok)throw new Error(result.error);setAction(null);toast.success('Review updated');await load();}catch(e){setFormError(e instanceof Error?e.message:'Unable to save.');}finally{busy.current=false;setSaving(false);}}
  const national=data?isUbec(data.role):false,es=data?.role==='UBEC Executive Secretary',reviewer=data?.role==='UBEC Department Reviewer';
  const current=selected==='current',openRound=current&&data?.round&&['received','reviewing'].includes(data.round.status)&&!loading&&!error;
  const canSubmit=data?.role==='Executive Chairman'&&data.plan.status==='awaiting_chairman'&&current&&!loading&&!error;
  const content=<div className="ubec-review-workspace">
    <Button asChild variant="ghost" size="sm"><Link href={national?'/ubec':`/beap/review?plan=${data?.plan.id??''}`}><ArrowLeft data-icon="inline-start"/>{national?'Overview':'State review'}</Link></Button>
    <div className="national-page-title"><div><span className="national-eyebrow">{data?.plan.stateName??'ACTION PLAN'}</span><h1>{data?`${planPeriod({startYear:data.plan.start_year,endYear:data.plan.end_year,fundingQuarters:data.plan.funding_quarters})} action plan`:'Plan review'}</h1></div><div className="review-actions">
    {canSubmit&&<Button onClick={()=>open('submit')}><Send data-icon="inline-start"/>{data.round?'Send to UBEC':'Send to UBEC'}</Button>}
    {es&&openRound&&<><Button variant="outline" onClick={()=>open('assign')}><UsersRound data-icon="inline-start"/>Assign departments</Button><Button variant="outline" onClick={()=>open('return')}><MessageSquare data-icon="inline-start"/>Return to SUBEB</Button><Button disabled={!data.assignments.length||data.assignments.some(a=>!a.completed_at)} onClick={()=>open('approve')}><Check data-icon="inline-start"/>Approve plan</Button></>}
    </div></div>
    {error&&<Alert variant="destructive"><AlertTitle>Review unavailable</AlertTitle><AlertDescription>{error}<Button variant="outline" onClick={()=>load(selected)}>Retry</Button></AlertDescription></Alert>}
    {loading?<Skeleton className="h-64"/>:data&&!error&&<>
      <div className="national-review-meta"><Badge variant={data.round?.status==='returned'?'warning':'secondary'}>{data.round?nationalStatusLabels[data.round.status]:'Ready for UBEC submission'}</Badge>{data.round&&<span>Received {date.format(new Date(data.round.submitted_at))}</span>}{data.rounds.length>0&&<Select value={selected} onValueChange={load}><SelectTrigger aria-label="UBEC submission version"><History/><SelectValue/></SelectTrigger><SelectContent><SelectGroup><SelectItem value="current">Current submission</SelectItem>{data.rounds.map(r=><SelectItem key={r.id} value={String(r.id)}>Submission {r.number} · {date.format(new Date(r.submitted_at))}</SelectItem>)}</SelectGroup></SelectContent></Select>}</div>
      {!current&&<Alert><AlertTitle>Historical submission</AlertTitle><AlertDescription>This saved version is read-only.</AlertDescription></Alert>}
      {data.round?.decision&&<Alert className="mb-6"><AlertTitle>{data.round.status==='returned'?'UBEC ES feedback':'UBEC ES decision'}</AlertTitle><AlertDescription className="review-comment">{data.round.decision}</AlertDescription></Alert>}
      {!data.round&&<Alert><AlertTitle>Ready to send to UBEC</AlertTitle><AlertDescription>Send the completed plan to start UBEC review. The plan remains locked while under review.</AlertDescription></Alert>}
      {data.round&&<>
      <section className="national-reviews">{data.assignments.length>0&&<div className="national-section-heading"><h2>Departmental reviews</h2><span>{data.assignments.filter(a=>a.completed_at).length} of {data.assignments.length} complete</span></div>}
      {!data.assignments.length?<Alert className="review-assignment-notice"><UsersRound/><AlertTitle>{national?'Departments not assigned':'Departmental review'}</AlertTitle><AlertDescription>{national?'Assign departments to begin the review.':'Feedback will appear with the UBEC ES decision.'}</AlertDescription></Alert>:<div className="national-review-cards">{data.assignments.map(a=><Card key={a.id}><CardHeader><CardTitle>{departmentName(a.department)}</CardTitle><div className="national-review-card-meta"><span>{pillarName(a.pillar)}</span><Badge variant={a.recommendation==='changes'?'warning':'secondary'}>{a.completed_at?a.recommendation==='changes'?'Changes recommended':'Endorsed':'Pending review'}</Badge></div></CardHeader><CardContent>{a.feedback?<><p className="review-comment">{a.feedback}</p><small>{a.reviewer} · {date.format(new Date(a.completed_at!))}</small></>:reviewer&&openRound?<Button variant="outline" onClick={()=>open('feedback',a.id)}>Add review<ArrowLeft className="rotate-180" data-icon="inline-end"/></Button>:<p className="text-muted-foreground">Awaiting departmental feedback.</p>}</CardContent></Card>)}</div>}
      </section><PlanReviewContent key={data.round.id} snapshot={data.round.snapshot}/>
      <Card className="mt-6"><CardHeader><CardTitle>Review trail</CardTitle></CardHeader><CardContent><ol className="national-activity">{data.events.map(e=><li key={e.id}><span className="national-activity-dot"/><div><strong>{({submit:'Submitted to UBEC',assign:'Departments assigned',feedback:'Departmental feedback submitted',return:'Returned to SUBEB',approve:'Approved by UBEC'} as Record<string,string>)[e.action]}</strong><span>{e.actor} · {date.format(new Date(e.created_at))}</span>{e.comment&&<p className="review-comment">{e.comment}</p>}</div></li>)}</ol></CardContent></Card>
      </>}
    </>}
    <Dialog open={!!action} onOpenChange={value=>{if(!value&&!saving)setAction(null);}}><DialogContent className={cn('national-dialog', action==='assign'?'sm:max-w-2xl':'sm:max-w-lg')} showCloseButton={!saving} onEscapeKeyDown={e=>{if(saving)e.preventDefault();}} onInteractOutside={e=>{if(saving)e.preventDefault();}}><DialogHeader><DialogTitle>{action?titles[action]:''}</DialogTitle><DialogDescription>{action==='assign'?'Choose lead and supporting departments for each populated pillar. Existing assignments are retained.':action==='return'?'Your consolidated feedback will be sent to the SUBEB Executive Chairman and Data Entry Staff for revision.':action==='approve'?'All departmental reviews must be complete. Approval does not disburse funds.':action==='feedback'?'Your recommendation goes to the UBEC ES, who makes the final decision.':'Only the SUBEB Executive Chairman can send this completed plan to UBEC.'}</DialogDescription></DialogHeader>
    <form onSubmit={e=>{e.preventDefault();void confirm();}}><FieldGroup>
    {action==='assign'&&data?.round&&<div className="national-assignment-options">{activePillars(data.round.snapshot).map(p=><FieldSet key={p}><FieldLegend>{pillarName(p)}</FieldLegend>{departments.map(d=>{const key=`${p}:${d.id}`,exists=data.assignments.some(a=>a.pillar===p&&a.department===d.id);return <Field key={key} orientation="horizontal"><Checkbox id={key} disabled={saving||exists} checked={exists||choices.includes(key)} onCheckedChange={checked=>setChoices(previous=>checked?[...previous,key]:previous.filter(v=>v!==key))}/><FieldLabel htmlFor={key}>{d.name}{pillarDepartments[p]===d.id?' · Lead':''}{exists?' · Assigned':''}</FieldLabel></Field>;})}</FieldSet>)}</div>}
    {action==='feedback'&&<Field><FieldLabel htmlFor="recommendation">Recommendation</FieldLabel><Select value={recommendation} onValueChange={setRecommendation} disabled={saving}><SelectTrigger id="recommendation"><SelectValue/></SelectTrigger><SelectContent><SelectGroup><SelectItem value="endorse">Endorse this pillar</SelectItem><SelectItem value="changes">Recommend changes</SelectItem></SelectGroup></SelectContent></Select></Field>}
    {action!=='assign'&&<Field><FieldLabel htmlFor="ubec-comment">{action==='return'?'Consolidated changes required':action==='submit'?data?.round?'Response to UBEC feedback':'Comment (optional)':'Review notes'}</FieldLabel><Textarea id="ubec-comment" value={comment} onChange={e=>setComment(e.target.value)} maxLength={5000} required={action!=='submit'||!!data?.round} disabled={saving} rows={5}/></Field>}
    {formError&&<Alert variant="destructive"><AlertDescription>{formError}</AlertDescription></Alert>}
    </FieldGroup><DialogFooter className="mt-6"><Button type="button" variant="outline" onClick={()=>setAction(null)} disabled={saving}>Cancel</Button><Button type="submit" disabled={saving}>{saving&&<Spinner data-icon="inline-start"/>}{action?titles[action]:''}</Button></DialogFooter></form></DialogContent></Dialog>
  </div>;
  return national?<UbecShell review user={data?.user}>{content}</UbecShell>:<main className="national-main national-state-review">{content}</main>;
}
