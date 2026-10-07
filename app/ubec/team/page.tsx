'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { PlusIcon } from 'lucide-react';
import { toast } from 'sonner';
import { UbecShell } from '@/components/ubec-shell';
import { NoOfficersArt, UbecEmpty } from '@/components/empty-art/ubec-flow';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { departmentLabel } from '@/lib/ubec';

type Officer = { id: number; name: string; email: string; department: string; active: boolean; open: number; completed: number };
type Data = { officers: Officer[]; departments: string[]; user: { name: string; role: string; department: string | null } };

/** Assessment Officers of the Director's department (any component department for the UBEC BEAP Chair). */
export default function TeamPage() {
  const [data, setData] = useState<Data | null>(null), [error, setError] = useState(''), [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false), [form, setForm] = useState({ name: '', email: '', department: '' }), [saving, setSaving] = useState(false), [formError, setFormError] = useState('');
  const [credentials, setCredentials] = useState<{ email: string; password: string } | null>(null);
  const busy = useRef(false);
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const response = await fetch('/api/ubec/officers', { cache: 'no-store' });
      if (response.status === 401) { window.location.replace('/'); return; }
      const result = await response.json() as Data & { error?: string };
      if (!response.ok) throw new Error(result.error);
      setData(result);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to load Assessment Officers.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void Promise.resolve().then(load); }, [load]);
  async function save() {
    if (busy.current || !data) return;
    busy.current = true; setSaving(true); setFormError('');
    try {
      const response = await fetch('/api/ubec/officers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: form.name, email: form.email, department: form.department || data.departments[0] }) });
      const result = await response.json() as { error?: string; password?: string };
      if (!response.ok) throw new Error(result.error || 'The officer could not be added.');
      setAdding(false); setCredentials({ email: form.email, password: result.password ?? '' }); toast.success('Assessment Officer added'); await load();
    } catch (cause) { setFormError(cause instanceof Error ? cause.message : 'The officer could not be added.'); }
    finally { busy.current = false; setSaving(false); }
  }
  return <UbecShell team user={data?.user}>
    <div className="national-page-title"><div><span className="national-eyebrow">{data?.departments.length === 1 ? departmentLabel(data.departments[0]) : 'UBEC'}</span><h1>Assessment Officers</h1></div>{data && <Button onClick={() => { setForm({ name: '', email: '', department: data.departments[0] }); setFormError(''); setAdding(true); }}><PlusIcon data-icon="inline-start" />Add officer</Button>}</div>
    {error && <Alert variant="destructive"><AlertTitle>Officers unavailable</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
    {loading && !data ? <Skeleton className="h-64 w-full rounded-2xl" /> : data && <Card><CardHeader><CardTitle>Your officers <Badge variant="secondary">{data.officers.length}</Badge></CardTitle><CardDescription>One officer per component by default. An officer can hold several components of the same department.</CardDescription></CardHeader><CardContent>
      {data.officers.length ? <Table><TableHeader><TableRow><TableHead>Officer</TableHead><TableHead>Department</TableHead><TableHead>Open assessments</TableHead><TableHead>Completed</TableHead><TableHead>Status</TableHead></TableRow></TableHeader><TableBody>
        {data.officers.map(o => <TableRow key={o.id}><TableCell><strong>{o.name}</strong><small className="block text-muted-foreground">{o.email}</small></TableCell><TableCell>{departmentLabel(o.department)}</TableCell><TableCell>{o.open}</TableCell><TableCell>{o.completed}</TableCell><TableCell><Badge variant={o.active ? 'secondary' : 'outline'}>{o.active ? 'Active' : 'Inactive'}</Badge></TableCell></TableRow>)}
      </TableBody></Table> : <UbecEmpty art={<NoOfficersArt />} title="No Assessment Officers yet">Add an officer, then assign them to components from the plan page.</UbecEmpty>}
    </CardContent></Card>}
    <Dialog open={adding} onOpenChange={open => { if (!open && !saving) setAdding(false); }}><DialogContent className="national-dialog" showCloseButton={!saving}><DialogHeader><DialogTitle>Add Assessment Officer</DialogTitle><DialogDescription>They sign in with a one-time password you share securely.</DialogDescription></DialogHeader>
      <form onSubmit={event => { event.preventDefault(); void save(); }}><FieldGroup>
        <Field><FieldLabel htmlFor="officer-name">Full name</FieldLabel><Input id="officer-name" required minLength={2} maxLength={120} disabled={saving} value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} /></Field>
        <Field><FieldLabel htmlFor="officer-email">Email address</FieldLabel><Input id="officer-email" type="email" required disabled={saving} value={form.email} onChange={event => setForm({ ...form, email: event.target.value })} /></Field>
        {data && data.departments.length > 1 && <Field><FieldLabel htmlFor="officer-department">Department</FieldLabel><NativeSelect id="officer-department" disabled={saving} value={form.department} onChange={event => setForm({ ...form, department: event.target.value })}>{data.departments.map(d => <NativeSelectOption key={d} value={d}>{departmentLabel(d)}</NativeSelectOption>)}</NativeSelect></Field>}
        {formError && <FieldError role="alert">{formError}</FieldError>}
      </FieldGroup><DialogFooter className="mt-6"><Button type="button" variant="outline" disabled={saving} onClick={() => setAdding(false)}>Cancel</Button><Button type="submit" disabled={saving}>{saving && <Spinner data-icon="inline-start" />}Add officer</Button></DialogFooter></form>
    </DialogContent></Dialog>
    <Dialog open={!!credentials} onOpenChange={open => { if (!open) setCredentials(null); }}><DialogContent className="national-dialog"><DialogHeader><DialogTitle>Login details</DialogTitle><DialogDescription>Copy and share these details securely. The password will not be shown again.</DialogDescription></DialogHeader><FieldGroup><Field><FieldLabel htmlFor="officer-cred-email">Email</FieldLabel><Input id="officer-cred-email" readOnly value={credentials?.email ?? ''} /></Field><Field><FieldLabel htmlFor="officer-cred-password">Password</FieldLabel><Input id="officer-cred-password" readOnly value={credentials?.password ?? ''} /></Field></FieldGroup><DialogFooter><Button onClick={() => setCredentials(null)}>Done</Button></DialogFooter></DialogContent></Dialog>
  </UbecShell>;
}
