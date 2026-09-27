'use client';
import {useCallback,useEffect,useMemo,useState} from 'react';
import {createColumnHelper} from '@tanstack/react-table';
import {type DataTableFeatures} from '@/components/data-table-features';
import {DataTable} from '@/components/data-table';
import {DataTableColumnHeader} from '@/components/data-table-column-header';
import {AccountMenu} from '@/components/workspace-account-menu';
import {UbecLogo} from '@/components/ubec-logo';
import {Card,CardHeader,CardTitle,CardDescription,CardContent} from '@/components/ui/card';
import {Table,TableBody,TableCell,TableHead,TableHeader,TableRow} from '@/components/ui/table';
import {Button} from '@/components/ui/button';
import {Badge} from '@/components/ui/badge';
import {Alert,AlertTitle,AlertDescription} from '@/components/ui/alert';
import {Skeleton} from '@/components/ui/skeleton';
import {UserRoundCogIcon} from 'lucide-react';
import {stateDisplayName} from '@/lib/state-names';
import {subebDepartmentName} from '@/lib/subeb-departments';
import {departmentName} from '@/lib/ubec';
import {switchUser} from '@/lib/impersonation-client';
import type {LocalUser} from '@/lib/local-session';
type User={id:number;name:string;email:string;role:string;department:string|null;stateCode:string;active:boolean};
type History={id:string;adminName:string;targetName:string;role:string;stateCode:string;startedAt:string;endedAt:string|null;expiresAt:string;requestCount:number};
type Data={user:LocalUser;users:User[];history:History[]};
const helper=createColumnHelper<DataTableFeatures,User>();
export default function AdminPage(){
  const [data,setData]=useState<Data|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState<number|null>(null);
  const [now]=useState(Date.now);
  const load=useCallback(async()=>{setError('');try{const r=await fetch('/api/admin/impersonation',{cache:'no-store'});if(r.status===401){window.location.replace('/');return;}const result=await r.json() as Data & {error?:string};if(!r.ok)throw Error(result.error||'Unable to load users.');setData(result);}catch(e){setError(e instanceof Error?e.message:'Unable to load users.');}},[]);
  useEffect(()=>{void Promise.resolve().then(load);},[load]);
  const enter=useCallback(async(id:number)=>{setBusy(id);setError('');try{await switchUser(id);}catch(e){setError(e instanceof Error?e.message:'Unable to switch users.');setBusy(null);}},[]);
  const columns=useMemo(()=>helper.columns([
    helper.accessor('name',{enableHiding:false,header:({column})=><DataTableColumnHeader column={column} title="User"/>,filterFn:(row,_id,value)=>[row.original.name,row.original.email,row.original.role,stateDisplayName(row.original.stateCode),row.original.department&&subebDepartmentName(row.original.department)].join(' ').toLowerCase().includes(String(value).toLowerCase()),cell:({row})=><div><p className="font-medium">{row.original.name}</p><p className="text-xs text-muted-foreground">{row.original.email}</p></div>}),
    helper.accessor('role',{header:({column})=><DataTableColumnHeader column={column} title="Role"/>}),
    helper.accessor('stateCode',{header:({column})=><DataTableColumnHeader column={column} title="State / workspace"/>,cell:info=>stateDisplayName(info.getValue())}),
    helper.accessor('department',{header:({column})=><DataTableColumnHeader column={column} title="Department"/>,cell:({row})=>row.original.department?(row.original.role.startsWith('UBEC ')?departmentName(row.original.department):subebDepartmentName(row.original.department)):'—'}),
    helper.accessor('active',{header:({column})=><DataTableColumnHeader column={column} title="Status"/>,cell:info=><Badge variant={info.getValue()?'secondary':'outline'}>{info.getValue()?'Active':'Inactive'}</Badge>}),
    helper.display({id:'actions',enableHiding:false,header:'',cell:({row})=><Button variant="outline" size="sm" disabled={!row.original.active||busy!==null} onClick={()=>void enter(row.original.id)} aria-label={`Act as ${row.original.name}`}><UserRoundCogIcon data-icon="inline-start"/>{busy===row.original.id?'Switching…':'Act as user'}</Button>}),
  ]),[busy,enter]);
  return <div className="min-h-screen bg-muted/30"><header className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-6 py-5"><a href="/admin" className="flex items-center gap-3 font-semibold"><UbecLogo/>BEAPMS Portal</a><AccountMenu user={data?.user??null}/></header><main id="main-content" className="mx-auto flex max-w-7xl flex-col gap-6 px-6 pb-8"><div><p className="text-sm text-muted-foreground">Super admin</p><h1 className="text-3xl font-semibold tracking-tight">Demo workspace</h1></div>
    {error&&<Alert variant="destructive"><AlertTitle>Unable to continue</AlertTitle><AlertDescription>{error}<Button variant="outline" size="sm" onClick={load}>Try again</Button></AlertDescription></Alert>}
    {!data&&!error?<Skeleton className="h-96 w-full"/>:data&&<><Card><CardHeader><CardTitle>Switch user</CardTitle><CardDescription>Use the selected user’s permissions. Sessions last up to one hour and are recorded.</CardDescription></CardHeader><CardContent className="flex flex-col gap-4"><DataTable data={data.users} columns={columns} searchPlaceholder="Search users…" itemLabel="users" columnLabels={{role:'Role',stateCode:'State / workspace',department:'Department',active:'Status'}} /></CardContent></Card>
    <Card><CardHeader><CardTitle>Recent impersonation sessions</CardTitle><CardDescription>Write requests are logged as attempts; each workflow keeps its own outcome history.</CardDescription></CardHeader><CardContent><Table><TableHeader><TableRow><TableHead>Administrator</TableHead><TableHead>Acting as</TableHead><TableHead>Started</TableHead><TableHead>Status</TableHead><TableHead>Write attempts</TableHead></TableRow></TableHeader><TableBody>{data.history.length?data.history.map(item=><TableRow key={item.id}><TableCell>{item.adminName}</TableCell><TableCell>{item.targetName}<p className="text-xs text-muted-foreground">{item.role} · {stateDisplayName(item.stateCode)}</p></TableCell><TableCell>{new Date(item.startedAt).toLocaleString('en-GB')}</TableCell><TableCell>{item.endedAt?'Ended':new Date(item.expiresAt).getTime()<=now?'Expired':'Active'}</TableCell><TableCell>{item.requestCount}</TableCell></TableRow>):<TableRow><TableCell colSpan={5}>No impersonation sessions yet.</TableCell></TableRow>}</TableBody></Table></CardContent></Card></>}
  </main></div>;
}
