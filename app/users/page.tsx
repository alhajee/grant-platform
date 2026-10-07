'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { PlusIcon } from 'lucide-react';
import { UsersDataTable } from './data-table';
import type { User } from './columns';
import { SubebHeader } from '@/components/subeb-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Field, FieldContent, FieldDescription, FieldLabel, FieldGroup, FieldError } from '@/components/ui/field';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { subebDepartments as departments } from '@/lib/subeb-departments';
import { toast } from 'sonner';
import { DepartmentCheckboxes } from '@/components/department-checkboxes';

type Directory = { users: User[]; department: string | null; departments: string[]; role: string; actorId: number; stateName: string };
const blank = { name: '', email: '', role: 'Data Entry Staff', department: '', departments: [] as string[], active: true, canCreatePlan: false, canManageSchools: false, isBeapChair: false };
export default function UsersPage() {
  const [data, setData] = useState<Directory | null>(null);
  const [loading, setLoading] = useState(true), [error, setError] = useState('');
  const [editing, setEditing] = useState<User | 'new' | null>(null), [form, setForm] = useState(blank);
  const [reset, setReset] = useState<User | null>(null), [credentials, setCredentials] = useState<{email:string;password:string}|null>(null);
  const [saving, setSaving] = useState(false), [formError, setFormError] = useState('');
  const pending = useRef(false);
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const response = await fetch('/api/users', { cache: 'no-store' });
      if (response.status === 401) { window.location.replace('/'); return; }
      const result = await response.json() as Directory & { error?: string };
      if (!response.ok) throw new Error(result.error);
      setData(result);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to load users.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void Promise.resolve().then(load); }, [load]);
  const open = (user: User | 'new') => { setEditing(user); setForm(user === 'new' ? {...blank} : {...user, department:user.department ?? '', departments:user.departments ?? (user.department ? [user.department] : [])}); setFormError(''); };
  async function save(passwordReset = false) {
    if (pending.current || (!editing && !reset)) return;
    pending.current=true; setSaving(true); setFormError('');
    const email = passwordReset ? reset!.email : form.email;
    try {
      const body = passwordReset ? { id:reset!.id, action:'reset_password' } : { name:form.name, role:form.role, department:form.departments[0] ?? null, departments:form.departments, active:form.active, ...(data?.role === 'Executive Chairman' ? {canCreatePlan:form.canCreatePlan,canManageSchools:form.canManageSchools,isBeapChair:form.isBeapChair} : {}), ...(editing === 'new' ? {email:form.email} : {id:(editing as User).id}) };
      const response = await fetch('/api/users', { method:editing === 'new' && !passwordReset ? 'POST' : 'PATCH', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body) });
      const result = await response.json() as { error?: string; password?: string };
      if (!response.ok) throw new Error(result.error);
      setEditing(null); setReset(null);
      if (result.password) setCredentials({email,password:result.password});
      toast.success(passwordReset ? 'Password reset' : 'User saved');
      await load();
    } catch (cause) { setFormError(cause instanceof Error ? cause.message : 'Unable to save changes.'); }
    finally { pending.current=false; setSaving(false); }
  }
  return <div className="dashboard-page"><SubebHeader users /><main className="state-users-main">
    <div className="state-users-heading"><div><p className="text-muted-foreground">{data?.stateName ?? 'SUBEB'}</p><h1>Users</h1></div>{data && !error && <Button onClick={() => open('new')}><PlusIcon data-icon="inline-start" />Add user</Button>}</div>
    {error && <Alert variant="destructive"><AlertTitle>Users unavailable</AlertTitle><AlertDescription>{error}<Button variant="outline" onClick={load}>Try again</Button></AlertDescription></Alert>}
    {loading ? <Skeleton className="h-80 w-full" /> : data && !error && <>
      <UsersDataTable users={data.users} actorId={data.actorId} actorRole={data.role} actorDepartments={data.departments} onEdit={open} onReset={user=>{setReset(user);setFormError('');}} />
    </>}
    <Dialog open={Boolean(editing)} onOpenChange={open=>{if(!open&&!saving)setEditing(null);}}><DialogContent aria-describedby={undefined} className="max-h-[calc(100dvh-2rem)] overflow-y-auto" showCloseButton={!saving}><DialogHeader><DialogTitle>{editing==='new'?'Add state user':'Edit state user'}</DialogTitle></DialogHeader><form onSubmit={e=>{e.preventDefault();void save();}}><FieldGroup className="gap-4">
      <Field><FieldLabel htmlFor="user-name">Full name</FieldLabel><Input id="user-name" required minLength={2} maxLength={120} disabled={saving} value={form.name} onChange={e=>setForm({...form,name:e.target.value})} /></Field>
      <Field><FieldLabel htmlFor="user-email">Email address</FieldLabel><Input id="user-email" type="email" required disabled={saving||editing!=='new'} value={form.email} onChange={e=>setForm({...form,email:e.target.value})} /></Field>
      <Field><FieldLabel htmlFor="user-role">Role</FieldLabel><NativeSelect id="user-role" disabled={saving} value={form.role} onChange={e=>setForm({...form,role:e.target.value,department:'',departments:[],isBeapChair:false})}><NativeSelectOption value="Data Entry Staff">Data Entry Staff</NativeSelectOption>{data?.role==='Executive Chairman'&&<NativeSelectOption value="Director">Director</NativeSelectOption>}</NativeSelect></Field>
      <DepartmentCheckboxes departments={departments.filter(d=>data?.role!=='Director'||data.departments.includes(d.id))} selected={form.departments} disabled={saving} onChange={values=>setForm({...form,departments:values,department:values[0]??''})}/>
      <Field><FieldLabel htmlFor="user-active">Account access</FieldLabel><NativeSelect id="user-active" disabled={saving} value={String(form.active)} onChange={e=>setForm({...form,active:e.target.value==='true'})}><NativeSelectOption value="true">Active</NativeSelectOption><NativeSelectOption value="false">Inactive</NativeSelectOption></NativeSelect></Field>
      {data?.role==='Executive Chairman' && <Field orientation="horizontal" data-disabled={saving}><FieldLabel htmlFor="user-create-plan">Allow creating action plans</FieldLabel><Switch id="user-create-plan" disabled={saving||form.isBeapChair} checked={form.isBeapChair||form.canCreatePlan} onCheckedChange={canCreatePlan=>setForm({...form,canCreatePlan})} /></Field>}
      {data?.role==='Executive Chairman' && <Field orientation="horizontal" data-disabled={saving}><FieldContent><FieldLabel htmlFor="user-manage-schools">Allow managing the School register</FieldLabel><FieldDescription>Opens the School register. Adding or changing schools also needs the administrator to allow manual changes; otherwise schools come from DNEMIS only.</FieldDescription></FieldContent><Switch id="user-manage-schools" disabled={saving||form.isBeapChair} checked={form.isBeapChair||form.canManageSchools} onCheckedChange={canManageSchools=>setForm({...form,canManageSchools})} /></Field>}
      {data?.role==='Executive Chairman' && form.role==='Director' && <Field orientation="horizontal" data-disabled={saving}><FieldLabel htmlFor="user-beap-chair">Appoint as SUBEB BEAP Chair</FieldLabel><Switch id="user-beap-chair" disabled={saving} checked={form.isBeapChair} onCheckedChange={isBeapChair=>setForm({...form,isBeapChair})} /></Field>}
      {formError&&<FieldError role="alert">{formError}</FieldError>}
    </FieldGroup><DialogFooter className="mt-6"><Button type="button" variant="outline" disabled={saving} onClick={()=>setEditing(null)}>Cancel</Button><Button type="submit" disabled={saving||form.departments.length===0}>{saving&&<Spinner data-icon="inline-start" />}Save user</Button></DialogFooter></form></DialogContent></Dialog>
    <Dialog open={Boolean(reset)} onOpenChange={open=>{if(!open&&!saving)setReset(null);}}><DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto" showCloseButton={!saving}><DialogHeader><DialogTitle>Reset password?</DialogTitle><DialogDescription>{reset?.name} will be signed out. A new password will be shown once for you to share securely.</DialogDescription></DialogHeader>{formError&&<FieldError role="alert">{formError}</FieldError>}<DialogFooter><Button variant="outline" disabled={saving} onClick={()=>setReset(null)}>Cancel</Button><Button disabled={saving} onClick={()=>void save(true)}>{saving&&<Spinner data-icon="inline-start" />}Reset password</Button></DialogFooter></DialogContent></Dialog>
    <Dialog open={Boolean(credentials)} onOpenChange={open=>{if(!open)setCredentials(null);}}><DialogContent><DialogHeader><DialogTitle>Login details</DialogTitle><DialogDescription>Copy these details and share them securely. This password will not be shown again.</DialogDescription></DialogHeader><FieldGroup><Field><FieldLabel htmlFor="credential-email">Email</FieldLabel><Input id="credential-email" readOnly value={credentials?.email??''} /></Field><Field><FieldLabel htmlFor="credential-password">Password</FieldLabel><Input id="credential-password" readOnly value={credentials?.password??''} /></Field></FieldGroup><DialogFooter><Button onClick={()=>setCredentials(null)}>Done</Button></DialogFooter></DialogContent></Dialog>
  </main></div>;
}
