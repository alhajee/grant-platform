'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import { createColumnHelper } from '@tanstack/react-table';
import { KeyRoundIcon, MoreHorizontalIcon, PencilIcon, PlusIcon, UserRoundCogIcon } from 'lucide-react';
import { DataTable } from '@/components/data-table';
import { DataTableColumnHeader } from '@/components/data-table-column-header';
import type { DataTableFeatures } from '@/components/data-table-features';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Spinner } from '@/components/ui/spinner';
import { Switch } from '@/components/ui/switch';
import { subebDisplayName } from '@/lib/state-names';
import { subebDepartmentName, subebDepartments } from '@/lib/subeb-departments';
import { departmentName, departments as ubecDepartments } from '@/lib/ubec';
import { toast } from 'sonner';
import { DepartmentCheckboxes } from '@/components/department-checkboxes';

export type AdminManagedUser = { id:number; name:string; email:string; role:string; department:string|null; departments:string[]; stateCode:string; active:boolean; canCreatePlan:boolean; isBeapChair:boolean };
type Form = Omit<AdminManagedUser, 'id'>;
const helper = createColumnHelper<DataTableFeatures, AdminManagedUser>();
const blank = (stateCode:string):Form => ({ name:'', email:'', role:stateCode === 'UBEC' ? 'UBEC Department Reviewer' : 'Data Entry Staff', department:'', departments:[], stateCode, active:true, canCreatePlan:false, isBeapChair:false });

const workspaceName = (stateCode:string) => stateCode === 'UBEC' ? 'UBEC' : subebDisplayName(stateCode);
const roleNeedsDepartment = (role:string) => ['Data Entry Staff','Director','UBEC Department Reviewer'].includes(role);
const departmentNames = (user:AdminManagedUser) => (user.departments ?? []).map(value => user.stateCode === 'UBEC' ? departmentName(value) : subebDepartmentName(value));
const NO_DEPARTMENT = 'No department', CHAIR = 'BEAP Chair';
// Facet filters receive the selected values; a row matches when it has any of them.
const anyOf = (values:string[]) => (selected:unknown) => !Array.isArray(selected) || !selected.length || values.some(value => selected.includes(value));
const roleValues = (user:AdminManagedUser) => user.isBeapChair ? [user.role, CHAIR] : [user.role];
const departmentValues = (user:AdminManagedUser) => departmentNames(user).length ? departmentNames(user) : [NO_DEPARTMENT];
const statusValue = (user:AdminManagedUser) => user.active ? 'active' : 'inactive';
function facetOptions(users:AdminManagedUser[], values:(user:AdminManagedUser)=>string[], label:(value:string)=>string = value => value) {
  const counts = new Map<string, number>();
  for (const user of users) for (const value of new Set(values(user))) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts].map(([value, count]) => ({ value, label: label(value), count })).sort((a, b) => a.label.localeCompare(b.label));
}
const departmentLabel = (user:AdminManagedUser) => user.stateCode !== 'UBEC' && user.departments?.length === subebDepartments.length ? 'All departments' : user.departments?.length ? user.departments.map(value => user.stateCode === 'UBEC' ? departmentName(value) : subebDepartmentName(value)).join(', ') : '—';

export function AdminUsers({users,busy,onSwitch,onChanged}:{users:AdminManagedUser[];busy:number|null;onSwitch:(id:number)=>Promise<void>|void;onChanged:()=>Promise<void>|void}) {
  const workspaces = useMemo(() => [...new Set(users.map(user=>user.stateCode))].sort((a,b)=>a === 'UBEC' ? -1 : b === 'UBEC' ? 1 : workspaceName(a).localeCompare(workspaceName(b))), [users]);
  const initialWorkspace = workspaces[0] ?? 'UBEC';
  const [editing,setEditing] = useState<AdminManagedUser|'new'|null>(null);
  const [form,setForm] = useState<Form>(blank(initialWorkspace));
  const [reset,setReset] = useState<AdminManagedUser|null>(null);
  const [credentials,setCredentials] = useState<{email:string;password:string}|null>(null);
  const [saving,setSaving] = useState(false),[formError,setFormError] = useState('');
  const pending = useRef(false);

  const open = useCallback((user:AdminManagedUser|'new') => {
    setEditing(user);
    setForm(user === 'new' ? blank(initialWorkspace) : {...user,department:user.department ?? '',departments:user.departments ?? (user.department ? [user.department] : [])});
    setFormError('');
  },[initialWorkspace]);
  const changeWorkspace = (stateCode:string) => setForm(blank(stateCode));
  const changeRole = (role:string) => setForm(current=>({...current,role,department:'',departments:[],isBeapChair:false,canCreatePlan:false}));

  async function save(passwordReset=false) {
    if (pending.current || (!editing && !reset)) return;
    pending.current=true; setSaving(true); setFormError('');
    const email = passwordReset ? reset!.email : form.email;
    try {
      const body = passwordReset ? {id:reset!.id,action:'reset_password'} : {...form,department:form.departments[0] || null,...(editing === 'new' ? {} : {id:(editing as AdminManagedUser).id})};
      const response = await fetch('/api/admin/users',{method:editing === 'new' && !passwordReset ? 'POST' : 'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
      const result = await response.json() as {error?:string;password?:string};
      if (!response.ok) throw Error(result.error || 'Unable to save this user.');
      setEditing(null); setReset(null);
      if (result.password) setCredentials({email,password:result.password});
      toast.success(passwordReset ? 'Password reset' : editing === 'new' ? 'User added' : 'User updated');
      await onChanged();
    } catch (cause) { setFormError(cause instanceof Error ? cause.message : 'Unable to save changes.'); }
    finally { pending.current=false; setSaving(false); }
  }

  const facets = useMemo(()=>[
    {column:'role',title:'Role',options:facetOptions(users,roleValues)},
    {column:'stateCode',title:'Workspace',options:facetOptions(users,user=>[user.stateCode],workspaceName)},
    {column:'department',title:'Department',options:facetOptions(users,departmentValues)},
    {column:'active',title:'Status',options:facetOptions(users,user=>[statusValue(user)],value=>value==='active'?'Active':'Inactive')},
  ],[users]);
  const columns = useMemo(()=>helper.columns([
    helper.accessor('name',{enableHiding:false,header:({column})=><DataTableColumnHeader column={column} title="User"/>,filterFn:(row,_id,value)=>[row.original.name,row.original.email,row.original.role,workspaceName(row.original.stateCode),departmentLabel(row.original)].join(' ').toLowerCase().includes(String(value).toLowerCase()),cell:({row})=><div><p className="font-medium">{row.original.name}</p><p className="text-xs text-muted-foreground">{row.original.email}</p></div>}),
    helper.accessor('role',{filterFn:(row,_id,value)=>anyOf(roleValues(row.original))(value),header:({column})=><DataTableColumnHeader column={column} title="Role"/>,cell:({row})=><div className="flex flex-wrap items-center gap-2">{row.original.role}{row.original.isBeapChair&&<Badge variant="secondary">BEAP Chair</Badge>}</div>}),
    helper.accessor('stateCode',{filterFn:(row,_id,value)=>anyOf([row.original.stateCode])(value),header:({column})=><DataTableColumnHeader column={column} title="Workspace"/>,cell:info=>workspaceName(info.getValue())}),
    helper.accessor('department',{filterFn:(row,_id,value)=>anyOf(departmentValues(row.original))(value),header:({column})=><DataTableColumnHeader column={column} title="Department"/>,cell:({row})=>departmentLabel(row.original)}),
    helper.accessor('active',{filterFn:(row,_id,value)=>anyOf([statusValue(row.original)])(value),header:({column})=><DataTableColumnHeader column={column} title="Status"/>,cell:info=><Badge variant={info.getValue()?'secondary':'outline'}>{info.getValue()?'Active':'Inactive'}</Badge>}),
    helper.display({id:'actions',enableHiding:false,header:'',cell:({row})=><div className="flex justify-end"><DropdownMenu modal={false}><DropdownMenuTrigger asChild><Button variant="ghost" size="icon-sm" aria-label={`Manage ${row.original.name}`}><MoreHorizontalIcon/></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuGroup><DropdownMenuItem onSelect={()=>open(row.original)}><PencilIcon/>Edit user</DropdownMenuItem><DropdownMenuItem onSelect={()=>{setReset(row.original);setFormError('');}}><KeyRoundIcon/>Reset password</DropdownMenuItem><DropdownMenuSeparator/><DropdownMenuItem disabled={!row.original.active||busy!==null} onSelect={()=>void onSwitch(row.original.id)}><UserRoundCogIcon/>{busy===row.original.id?'Switching…':'Act as user'}</DropdownMenuItem></DropdownMenuGroup></DropdownMenuContent></DropdownMenu></div>}),
  ]),[busy,onSwitch,open]);

  const isUbec = form.stateCode === 'UBEC';
  const departments = isUbec ? ubecDepartments : subebDepartments;
  return <div className="flex flex-col gap-4">
    <div className="flex flex-wrap items-start justify-between gap-4"><div><h2 className="text-lg font-semibold">Manage users</h2></div><Button onClick={()=>open('new')} disabled={!workspaces.length}><PlusIcon data-icon="inline-start"/>Add user</Button></div>
    <DataTable data={users} columns={columns} searchPlaceholder="Search users…" itemLabel="users" columnLabels={{role:'Role',stateCode:'Workspace',department:'Department',active:'Status'}} facets={facets} />
    <Dialog open={Boolean(editing)} onOpenChange={openState=>{if(!openState&&!saving)setEditing(null);}}><DialogContent aria-describedby={undefined} className="max-h-[calc(100dvh-2rem)] overflow-y-auto" showCloseButton={!saving}><DialogHeader><DialogTitle>{editing==='new'?'Add user':'Edit user'}</DialogTitle></DialogHeader><form onSubmit={event=>{event.preventDefault();void save();}}><FieldGroup className="gap-4">
      <Field><FieldLabel htmlFor="admin-user-workspace">Workspace</FieldLabel><NativeSelect id="admin-user-workspace" required disabled={saving||editing!=='new'} value={form.stateCode} onChange={event=>changeWorkspace(event.target.value)}>{workspaces.map(code=><NativeSelectOption key={code} value={code}>{workspaceName(code)}</NativeSelectOption>)}</NativeSelect></Field>
      <Field><FieldLabel htmlFor="admin-user-name">Full name</FieldLabel><Input id="admin-user-name" required minLength={2} maxLength={120} disabled={saving} value={form.name} onChange={event=>setForm({...form,name:event.target.value})}/></Field>
      <Field><FieldLabel htmlFor="admin-user-email">Email address</FieldLabel><Input id="admin-user-email" type="email" required disabled={saving||editing!=='new'} value={form.email} onChange={event=>setForm({...form,email:event.target.value})}/></Field>
      <Field><FieldLabel htmlFor="admin-user-role">Role</FieldLabel><NativeSelect id="admin-user-role" disabled={saving} value={form.role} onChange={event=>changeRole(event.target.value)}>{isUbec?<><NativeSelectOption value="UBEC Department Reviewer">UBEC Department Reviewer</NativeSelectOption><NativeSelectOption value="UBEC Executive Secretary">UBEC Executive Secretary</NativeSelectOption></>:<><NativeSelectOption value="Data Entry Staff">Data Entry Staff</NativeSelectOption><NativeSelectOption value="Director">Director</NativeSelectOption><NativeSelectOption value="Executive Chairman">Executive Chairman</NativeSelectOption></>}</NativeSelect></Field>
      {roleNeedsDepartment(form.role) && (isUbec ? <Field><FieldLabel htmlFor="admin-user-department">Department</FieldLabel><NativeSelect id="admin-user-department" required disabled={saving} value={form.departments[0]??''} onChange={event=>setForm({...form,department:event.target.value,departments:[event.target.value]})}><NativeSelectOption value="" disabled>Select department</NativeSelectOption>{departments.map(item=><NativeSelectOption key={item.id} value={item.id}>{item.name}</NativeSelectOption>)}</NativeSelect></Field> : <DepartmentCheckboxes departments={departments} selected={form.departments} disabled={saving} onChange={values=>setForm({...form,departments:values,department:values[0]??''})}/>)}
      <Field><FieldLabel htmlFor="admin-user-active">Account access</FieldLabel><NativeSelect id="admin-user-active" disabled={saving} value={String(form.active)} onChange={event=>setForm({...form,active:event.target.value==='true'})}><NativeSelectOption value="true">Active</NativeSelectOption><NativeSelectOption value="false">Inactive</NativeSelectOption></NativeSelect></Field>
      {!isUbec&&<Field orientation="horizontal" data-disabled={saving}><FieldLabel htmlFor="admin-user-create-plan">Allow creating action plans</FieldLabel><Switch id="admin-user-create-plan" disabled={saving||form.isBeapChair} checked={form.isBeapChair||form.canCreatePlan} onCheckedChange={canCreatePlan=>setForm({...form,canCreatePlan})}/></Field>}
      {!isUbec&&form.role==='Director'&&<Field orientation="horizontal" data-disabled={saving}><FieldLabel htmlFor="admin-user-beap-chair">Appoint as SUBEB BEAP Chair</FieldLabel><Switch id="admin-user-beap-chair" disabled={saving} checked={form.isBeapChair} onCheckedChange={isBeapChair=>setForm({...form,isBeapChair,canCreatePlan:isBeapChair||form.canCreatePlan})}/></Field>}
      {formError&&<FieldError role="alert">{formError}</FieldError>}
    </FieldGroup><DialogFooter className="mt-6"><Button type="button" variant="outline" disabled={saving} onClick={()=>setEditing(null)}>Cancel</Button><Button type="submit" disabled={saving||(roleNeedsDepartment(form.role)&&form.departments.length===0)}>{saving&&<Spinner data-icon="inline-start"/>}Save user</Button></DialogFooter></form></DialogContent></Dialog>
    <Dialog open={Boolean(reset)} onOpenChange={openState=>{if(!openState&&!saving)setReset(null);}}><DialogContent showCloseButton={!saving}><DialogHeader><DialogTitle>Reset password?</DialogTitle><DialogDescription>{reset?.name} will be signed out. A new password will be shown once for secure sharing.</DialogDescription></DialogHeader>{formError&&<Alert variant="destructive"><AlertDescription>{formError}</AlertDescription></Alert>}<DialogFooter><Button variant="outline" disabled={saving} onClick={()=>setReset(null)}>Cancel</Button><Button disabled={saving} onClick={()=>void save(true)}>{saving&&<Spinner data-icon="inline-start"/>}Reset password</Button></DialogFooter></DialogContent></Dialog>
    <Dialog open={Boolean(credentials)} onOpenChange={openState=>{if(!openState)setCredentials(null);}}><DialogContent><DialogHeader><DialogTitle>Login details</DialogTitle><DialogDescription>Copy and share these details securely. The password will not be shown again.</DialogDescription></DialogHeader><FieldGroup><Field><FieldLabel htmlFor="admin-credential-email">Email</FieldLabel><Input id="admin-credential-email" readOnly value={credentials?.email??''}/></Field><Field><FieldLabel htmlFor="admin-credential-password">Password</FieldLabel><Input id="admin-credential-password" readOnly value={credentials?.password??''}/></Field></FieldGroup><DialogFooter><Button onClick={()=>setCredentials(null)}>Done</Button></DialogFooter></DialogContent></Dialog>
  </div>;
}
