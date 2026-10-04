'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { UbecShell } from '@/components/ubec-shell';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Field, FieldGroup, FieldLabel, FieldError } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { beapComponents, strategicPillars, componentSections } from '@/lib/beap-pillars';
import { subebDepartmentName } from '@/lib/subeb-departments';
import { allocationSchema, percent, type FundingPolicy, type Allocation } from '@/lib/funding-policy';
import { toast } from 'sonner';

type Data={policy:FundingPolicy;history:FundingPolicy[];canEdit:boolean;user:{name:string;role:string}};
export default function AllocationsPage(){
  const [data,setData]=useState<Data|null>(null),[values,setValues]=useState<Record<string,string>>({});
  const [error,setError]=useState(''),[saving,setSaving]=useState(false),[loading,setLoading]=useState(true);
  const pending=useRef(false);
  const apply=(next:Data)=>{setData(next);setValues(Object.fromEntries(Object.entries(next.policy.allocation.shares).map(([id,bp])=>[id,String(bp/100)])));};
  const load=useCallback(async()=>{setLoading(true);setError('');try{const r=await fetch('/api/funding-policy',{cache:'no-store'});if(r.status===401){window.location.replace('/');return;}if(!r.ok)throw Error('Unable to load allocations.');const next=await r.json() as Data;if(!next.user.role.startsWith('UBEC ')){window.location.replace('/dashboard');return;}apply(next);}catch(e){setError(e instanceof Error?e.message:'Unable to load allocations.');}finally{setLoading(false);}},[]);
  useEffect(()=>{void Promise.resolve().then(load);},[load]);
  const validNumber=(value:string)=>/^\d{1,3}(\.\d{1,2})?$/.test(value);
  const allocation={shares:Object.fromEntries(beapComponents.map(c=>[c.id,Math.round(Number(values[c.id])*100)]))} as Allocation;
  const validInputs=Object.values(values).length===9&&Object.values(values).every(validNumber);
  const parsed=allocationSchema.safeParse(allocation);
  const total=Object.values(allocation.shares).reduce((a,b)=>a+(Number.isFinite(b)?b:0),0);
  const dirty=!!data&&(beapComponents.some(c=>allocation.shares[c.id]!==data.policy.allocation.shares[c.id]));
  async function save(){if(!data||pending.current||!validInputs||!parsed.success)return;pending.current=true;setSaving(true);setError('');try{const r=await fetch('/api/funding-policy',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({version:data.policy.id,allocation:parsed.data})});const result=await r.json() as {policy:FundingPolicy;error?:string};if(!r.ok)throw Error(result.error||'Unable to save allocations.');apply({...data,policy:result.policy,history:[result.policy,...data.history].slice(0,20)});toast.success('Allocations saved for new plans');}catch(e){setError(e instanceof Error?e.message:'Unable to save allocations.');}finally{pending.current=false;setSaving(false);}}
  return <UbecShell user={data?.user} allocations><div className="national-page-title"><div><span className="national-eyebrow">UBEC SETTINGS</span><h1>Funding allocations</h1></div>{data&&<Badge variant="secondary">Version {data.policy.id}</Badge>}</div>
    {error&&<Alert variant="destructive" className="mb-4"><AlertTitle>Allocations unavailable</AlertTitle><AlertDescription>{error}<Button variant="outline" size="sm" onClick={load} disabled={saving}>Reload saved allocations</Button></AlertDescription></Alert>}
    {loading?<Skeleton className="h-96 w-full"/>:data&&<div className={`grid items-start gap-6 ${data.canEdit?'lg:grid-cols-[1.7fr_1fr]':'max-w-4xl'}`}>
      <Card><CardHeader><CardTitle>Component allocation</CardTitle><CardDescription>Changes apply to new plans. Existing plans retain their allocation version.</CardDescription></CardHeader><CardContent><FieldGroup className="gap-6">
        {strategicPillars.map((pillar,index)=><section key={pillar.id} aria-labelledby={`allocation-${pillar.id}`} className="flex flex-col gap-3"><div className="flex items-center justify-between gap-3"><h2 id={`allocation-${pillar.id}`} className="font-semibold">{index+1}. {pillar.name}</h2><Badge variant="outline">{percent(pillar.components.reduce((sum,id)=>sum+(allocation.shares[id]||0),0))}%</Badge></div>
          {pillar.components.map(id=>{const component=beapComponents.find(c=>c.id===id)!;return <Field key={id} orientation="horizontal" data-invalid={!!values[id]&&(!validNumber(values[id])||Number(values[id])>100)}><div className="min-w-0 flex-1"><FieldLabel htmlFor={`share-${id}`}>{component.name}</FieldLabel><p className="mt-1 text-xs text-muted-foreground">{componentSections[id].map(s=>subebDepartmentName(s.department)).join(' / ')}</p></div><div className="flex items-center gap-2"><Input id={`share-${id}`} aria-invalid={!!values[id]&&(!validNumber(values[id])||Number(values[id])>100)} className="w-24" inputMode="decimal" aria-label={`${component.name} percentage`} value={values[id]??''} disabled={!data.canEdit||saving} onChange={e=>setValues({...values,[id]:e.target.value})}/><span aria-hidden="true">%</span></div></Field>;})}
        </section>)}
      </FieldGroup></CardContent><CardFooter className="flex flex-wrap justify-between gap-4"><span className="font-semibold tabular-nums" aria-live="polite">Total: {percent(total)}% / 100%</span>{data.canEdit&&<Button onClick={save} disabled={saving||!dirty||!validInputs||!parsed.success}>{saving&&<Spinner data-icon="inline-start"/>}Save allocations</Button>}{dirty&&(!validInputs||!parsed.success)&&<FieldError>Enter percentages with up to two decimal places. Components must total 100%.</FieldError>}</CardFooter></Card>
      {data.canEdit&&<Card><CardHeader><CardTitle>Allocation history</CardTitle></CardHeader><CardContent><ul className="flex flex-col gap-4">{data.history.map(policy=><li key={policy.id} className="flex justify-between gap-3 text-sm"><div><p className="font-medium">Version {policy.id}</p><p className="text-muted-foreground">{policy.createdBy}</p></div><time className="text-muted-foreground">{new Date(policy.createdAt).toLocaleDateString('en-GB')}</time></li>)}</ul></CardContent></Card>}
    </div>}
  </UbecShell>;
}
