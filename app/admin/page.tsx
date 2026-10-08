'use client';
import {useCallback,useEffect,useState} from 'react';
import {AdminActivity} from '@/components/admin-activity';
import {AdminHeader,useAdminMe} from '@/components/admin-header';
import {AdminSettings} from '@/components/admin-settings/admin-settings';
import {rememberSection,rememberedSection,sectionFromUrl,type SettingsSection} from '@/components/admin-settings/sections';
import {Button} from '@/components/ui/button';
import {Alert,AlertTitle,AlertDescription} from '@/components/ui/alert';
import {Skeleton} from '@/components/ui/skeleton';
import {Tabs,TabsContent,TabsList,TabsTrigger} from '@/components/ui/tabs';
type Tab='settings'|'activity';
/** `/admin?section=officers` (or `#officers`) opens a settings section, `/admin?tab=activity` the Activity tab; Users has its own page. */
export default function AdminPage(){
  const {me,error,reload}=useAdminMe();
  const [tab,setTab]=useState<Tab>('settings'),[section,setSection]=useState<SettingsSection>('workflow');
  useEffect(()=>{void Promise.resolve().then(()=>{
    const search=new URLSearchParams(window.location.search),wanted=search.get('tab');
    if(wanted==='users'){window.location.replace('/admin/users');return;}
    if(wanted==='activity'){setTab('activity');return;}
    const next=sectionFromUrl(search,window.location.hash)??rememberedSection()??'workflow';
    setSection(next);rememberSection(next);
    window.history.replaceState(null,'',`/admin?section=${next}`);
  });},[]);
  const chooseTab=useCallback((value:string)=>{const next=value as Tab;setTab(next);window.history.replaceState(null,'',next==='activity'?'/admin?tab=activity':`/admin?section=${section}`);},[section]);
  const chooseSection=useCallback((next:SettingsSection)=>{setSection(next);rememberSection(next);window.history.replaceState(null,'',`/admin?section=${next}`);window.scrollTo({top:0});},[]);
  return <Tabs value={tab} onValueChange={chooseTab} className="beap-page min-h-screen w-full gap-0"><AdminHeader current="admin" user={me?.user??null}/><main id="main-content" className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 pb-12 pt-8 sm:px-6"><div><h1 className="text-3xl font-semibold tracking-tight">Administrator workspace</h1></div>
    {error&&<Alert variant="destructive"><AlertTitle>Unable to continue</AlertTitle><AlertDescription>{error}<Button variant="outline" size="sm" onClick={()=>void reload()}>Try again</Button></AlertDescription></Alert>}
    {!me&&!error?<Skeleton className="h-96 w-full"/>:me&&<><TabsList variant="line" className="admin-section-tabs"><TabsTrigger value="settings">Settings</TabsTrigger><TabsTrigger value="activity">Activity</TabsTrigger></TabsList>
      <TabsContent value="settings" forceMount hidden={tab!=='settings'} className="pt-2"><AdminSettings section={section} onSection={chooseSection}/></TabsContent>
      <TabsContent value="activity"><AdminActivity/></TabsContent></>}
  </main></Tabs>;
}
