'use client';
import { useEffect, useState, useCallback, useRef } from 'react';
import { planPeriod } from '@/lib/action-plans';
import { ArrowUpRight, Search, RefreshCw } from 'lucide-react';
import { UbecOverview } from '@/components/ubec-overview';
import { UbecShell } from '@/components/ubec-shell';
import { UbecStateMap, UbecAttention } from '@/components/ubec-state-map';
import states from '@/lib/nigeria-map.json';
import { normalizeStateCode } from '@/lib/national-analytics';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { InputGroup, InputGroupInput, InputGroupAddon } from '@/components/ui/input-group';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectGroup, SelectItem } from '@/components/ui/select';
import { Table, TableHeader, TableHead, TableRow, TableBody, TableCell } from '@/components/ui/table';
import { departmentName, nationalStatusLabels, type UbecDashboard } from '@/lib/ubec';
const money = new Intl.NumberFormat('en-NG',{style:'currency',currency:'NGN',notation:'compact',maximumFractionDigits:2});
const date = new Intl.DateTimeFormat('en-GB',{dateStyle:'medium'});
const actionLabels: Record<string,string> = {submit:'Submitted to UBEC',assign:'Departments assigned',feedback:'Department review completed',return:'Returned to SUBEB',approve:'Approved by UBEC'};
export default function Dashboard() {
  const [data,setData] = useState<UbecDashboard|null>(null), [error,setError] = useState(''), [loading,setLoading] = useState(true);
  const [search,setSearch] = useState(''),[status,setStatus] = useState('all');
  const [year,setYear] = useState('all'), [state,setState] = useState('all');
  const requestId = useRef(0);
  const load=useCallback(async()=>{const id=++requestId.current;setLoading(true);setError('');try{const response=await fetch(`/api/ubec/dashboard${year==='all'?'':`?year=${year}`}`,{cache:'no-store'});if(id!==requestId.current)return;if(response.status===401){window.location.replace('/');return;}const result=await response.json() as UbecDashboard & {error?:string};if(id!==requestId.current)return;if(!response.ok)throw new Error(result.error);setData(result);}catch(e){if(id===requestId.current)setError(e instanceof Error?e.message:'Unable to load dashboard.');}finally{if(id===requestId.current)setLoading(false);}},[year]);
  useEffect(()=>{void Promise.resolve().then(load);},[load]);
  const items=data?.items??[], reviewer=data?.user.role==='UBEC Department Reviewer';
  const visible=items.filter(p=>(state==='all'||normalizeStateCode(p.stateCode)===state)&&(status==='all'||p.status===status)&&`${p.state} ${p.startYear} ${p.endYear}`.toLowerCase().includes(search.toLowerCase()));
  return <UbecShell user={data?.user}>
    <div className="national-page-title"><div><span className="national-eyebrow">{reviewer?departmentName(data?.user.department??''):'NATIONAL OVERVIEW'}</span><h1>{reviewer?'Department workspace':'Overview'}</h1></div><div className="national-dashboard-filters"><Select value={year} onValueChange={value=>{setYear(value);setState('all');setStatus('all');setSearch('');}}><SelectTrigger aria-label="Funding year"><SelectValue placeholder="Funding year" /></SelectTrigger><SelectContent><SelectGroup><SelectItem value="all">All funding years</SelectItem>{(data?.years??[]).map(value=><SelectItem key={value} value={String(value)}>{value}</SelectItem>)}</SelectGroup></SelectContent></Select><Button variant="outline" size="sm" onClick={load} disabled={loading}><RefreshCw data-icon="inline-start" />Refresh</Button></div></div>
    {year!=='all'&&<p className="national-period-note">Plans covering {year} · Whole-plan budgets, not annual allocations</p>}
    {error&&<Alert variant="destructive"><AlertTitle>Dashboard unavailable</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
    {loading?<div className="national-kpis"><Skeleton className="h-44"/><Skeleton className="h-44"/><Skeleton className="h-44"/></div>:data&&!error&&<>
    <UbecOverview data={data} onStage={stage=>{setStatus(stage);document.getElementById('submissions')?.scrollIntoView();}}>
      <section className="national-geographic-grid" aria-label="Geographic coverage and actions"><UbecStateMap items={items} reviewer={reviewer} selectedState={state} onState={code=>{setState(code);setStatus('all');setSearch('');}} /><UbecAttention items={items} reviewer={reviewer} /></section>
    </UbecOverview>
    <div className="national-state-filter"><Select value={state} onValueChange={setState}><SelectTrigger aria-label="Filter submissions by state"><SelectValue /></SelectTrigger><SelectContent><SelectGroup><SelectItem value="all">All states</SelectItem>{states.map(s=><SelectItem key={s.code} value={s.code}>{s.name}</SelectItem>)}</SelectGroup></SelectContent></Select>{state!=='all'&&<Button variant="ghost" size="sm" onClick={()=>setState('all')}>Clear state filter</Button>}</div>
    <section id="submissions" className="national-panel"><div className="national-section-heading"><h2>{reviewer?'Assigned submissions':'State submissions'} <Badge variant="secondary">{visible.length}</Badge></h2><span>Proposed, not disbursed funding</span></div><div className="national-table-tools"><InputGroup className="max-w-sm"><InputGroupInput aria-label="Search submissions" placeholder="Search state or funding year…" value={search} onChange={e=>setSearch(e.target.value)}/><InputGroupAddon><Search/></InputGroupAddon></InputGroup><Select value={status} onValueChange={setStatus}><SelectTrigger aria-label="Review status"><SelectValue/></SelectTrigger><SelectContent><SelectGroup><SelectItem value="all">All stages</SelectItem>{Object.entries(nationalStatusLabels).map(([id,name])=><SelectItem key={id} value={id}>{name}</SelectItem>)}</SelectGroup></SelectContent></Select></div>
    <Table><TableHeader><TableRow><TableHead>State / period</TableHead><TableHead>Stage</TableHead><TableHead>Received</TableHead><TableHead>Reviews</TableHead><TableHead className="text-right">Proposed budget</TableHead><TableHead><span className="sr-only">Open</span></TableHead></TableRow></TableHeader><TableBody>{visible.map(p=><TableRow key={p.id}><TableCell><strong>{p.state}</strong><small>{planPeriod(p)} · Submission {p.round}</small></TableCell><TableCell><Badge variant={p.status==='returned'?'warning':'secondary'}>{nationalStatusLabels[p.status]}</Badge></TableCell><TableCell>{date.format(new Date(p.submittedAt))}</TableCell><TableCell>{p.completed} complete{p.pending>0?` · ${p.pending} pending`:''}</TableCell><TableCell className="text-right tabular-nums">{money.format(p.budget)}</TableCell><TableCell><Button asChild variant="ghost" size="sm"><a href={`/ubec/review?plan=${p.planId}`}>Review<ArrowUpRight data-icon="inline-end"/></a></Button></TableCell></TableRow>)}{!visible.length&&<TableRow><TableCell colSpan={6} className="national-empty">{items.length?'No submissions match your filters.':reviewer?'Assigned submissions will appear here.':'No state plans have been submitted to UBEC yet.'}</TableCell></TableRow>}</TableBody></Table></section>
    <div className="national-lower-grid"><Card id="departments"><CardHeader><CardTitle>Department workload</CardTitle><CardDescription>Reviews in the latest submission cycle</CardDescription></CardHeader><CardContent>{data.workload.length?<div className="national-workload">{data.workload.map(d=><div key={d.department}><span>{departmentName(d.department)}</span><Badge variant="secondary">{d.pending} pending</Badge><small>{d.completed} complete</small></div>)}</div>:<p className="national-empty">No departmental assignments yet.</p>}</CardContent></Card><Card id="activity"><CardHeader><CardTitle>Recent activity</CardTitle></CardHeader><CardContent><ol className="national-activity">{data.activity.map(e=><li key={e.id}><span className="national-activity-dot"/><div><a href={`/ubec/review?plan=${e.plan_id}`}>{actionLabels[e.action]??e.action} <ArrowUpRight/></a><span>{e.stateName} · {e.actor}</span><small>{date.format(new Date(e.created_at))}</small></div></li>)}</ol>{!data.activity.length&&<p className="national-empty">No review activity yet.</p>}</CardContent></Card></div>
    </>}
  </UbecShell>;
}
