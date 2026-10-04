'use client';
import {useEffect,useState} from 'react';
import {Alert,AlertTitle,AlertDescription} from '@/components/ui/alert';
import {Button} from '@/components/ui/button';
import {switchUser} from '@/lib/impersonation-client';
import {stateDisplayName} from '@/lib/state-names';
import {toast} from 'sonner';
type Status={isAdmin:boolean;impersonating:boolean;session?:{name:string;role:string;stateCode:string;expiresAt:string}|null};
export function ImpersonationBanner(){
  const [status,setStatus]=useState<Status|null>(null),[busy,setBusy]=useState(false),[now,setNow]=useState(0);
  useEffect(()=>{
    let alive=true;
    const load=()=>{void fetch('/api/admin/impersonation?status=1',{cache:'no-store'}).then(async r=>r.ok?await r.json() as Status:null).then(next=>{if(alive){setNow(Date.now());setStatus(next);}}).catch(()=>{});};
    const changed=(event:StorageEvent)=>{if(event.key==='ubec-identity-change')window.location.reload();};
    load();window.addEventListener('focus',load);window.addEventListener('storage',changed);
    const timer=setInterval(load,60000);
    return ()=>{alive=false;clearInterval(timer);window.removeEventListener('focus',load);window.removeEventListener('storage',changed);};
  },[]);
  if(!status?.isAdmin||!status.impersonating)return null;
  const expired=!status.session||new Date(status.session.expiresAt).getTime()<=now;
  async function stop(){setBusy(true);try{await switchUser();}catch(e){toast.error(e instanceof Error?e.message:'Unable to return to admin.');setBusy(false);}}
  return <div className="impersonation-strip" role="region" aria-label="Impersonation">
    <Alert className="impersonation-strip-inner">
      <AlertTitle className="impersonation-strip-label">{expired?'Session ended':'Impersonating'}</AlertTitle>
      <AlertDescription className="impersonation-strip-description">
        {expired ? null : <>
          <span>Acting as <strong>{status.session!.name}</strong></span>
          <span className="impersonation-strip-context">{status.session!.role} · {stateDisplayName(status.session!.stateCode)}</span>
        </>}
      </AlertDescription>
      <div className="impersonation-strip-actions">
        <Button variant="ghost" size="sm" asChild><a href="/admin/users">Switch user</a></Button>
        <Button size="sm" disabled={busy} onClick={stop}>{busy?'Returning…':'Return to admin'}</Button>
      </div>
    </Alert>
  </div>;
}
