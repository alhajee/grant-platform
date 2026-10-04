'use client';
import {useCallback,useEffect,useState} from 'react';
import {AdminUsers,type AdminManagedUser} from '@/components/admin-users';
import {AdminHeader} from '@/components/admin-header';
import {Alert,AlertTitle,AlertDescription} from '@/components/ui/alert';
import {Button} from '@/components/ui/button';
import {Skeleton} from '@/components/ui/skeleton';
import {switchUser} from '@/lib/impersonation-client';
import type {LocalUser} from '@/lib/local-session';

type Data={user:LocalUser;users:AdminManagedUser[]};

export default function AdminUsersPage(){
  const [data,setData]=useState<Data|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState<number|null>(null);
  const load=useCallback(async()=>{setError('');try{const response=await fetch('/api/admin/impersonation',{cache:'no-store'});if(response.status===401){window.location.replace('/');return;}const result=await response.json() as Data&{error?:string};if(!response.ok)throw Error(result.error||'Unable to load users.');setData(result);}catch(e){setError(e instanceof Error?e.message:'Unable to load users.');}},[]);
  useEffect(()=>{void Promise.resolve().then(load);},[load]);
  const enter=useCallback(async(id:number)=>{setBusy(id);setError('');try{await switchUser(id);}catch(e){setError(e instanceof Error?e.message:'Unable to switch users.');setBusy(null);}},[]);
  return <div className="beap-page min-h-screen w-full"><AdminHeader current="users" user={data?.user??null}/><main id="main-content" className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 pb-12 pt-8"><div><h1 className="text-3xl font-semibold tracking-tight">Users</h1></div>
    {error&&<Alert variant="destructive"><AlertTitle>Unable to continue</AlertTitle><AlertDescription>{error}<Button variant="outline" size="sm" onClick={load}>Try again</Button></AlertDescription></Alert>}
    {!data&&!error?<Skeleton className="h-96 w-full"/>:data&&<AdminUsers users={data.users} busy={busy} onSwitch={enter} onChanged={load}/>}
  </main></div>;
}
