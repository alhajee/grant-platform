'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, FieldContent, FieldDescription, FieldLabel, FieldTitle } from '@/components/ui/field';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import type { SchoolRegisterSource } from '@/lib/school-register-source';

type Option = { value: SchoolRegisterSource; id: string; title: string; description: string };
const options: Option[] = [
  { value: 'dnemis_only', id: 'school-source-dnemis', title: 'DNEMIS only', description: 'Every school comes from the DNEMIS sync. Nobody can add, edit, delete or bulk-import schools by hand; the School register is read-only.' },
  { value: 'dnemis_and_manual', id: 'school-source-manual', title: 'DNEMIS and manual changes', description: 'The Executive Chairman, the BEAP Chair and staff they authorise can also add, edit, delete and bulk-import schools. The next sync still replaces DNEMIS fields.' },
];

async function errorOf(response: Response, fallback: string) {
  const body = await response.json().catch(() => ({})) as { error?: string };
  return body.error || fallback;
}

/** Admin > Integrations: where every state's School register comes from. */
export function AdminSchoolRegisterSource() {
  const [saved, setSaved] = useState<SchoolRegisterSource | null>(null), [draft, setDraft] = useState<SchoolRegisterSource | null>(null);
  const [error, setError] = useState(''), [saving, setSaving] = useState(false);
  const load = useCallback(async () => {
    setError('');
    try {
      const response = await fetch('/api/admin/school-register-source', { cache: 'no-store' });
      if (!response.ok) throw Error(await errorOf(response, 'Unable to load the school register setting.'));
      const { source } = await response.json() as { source: SchoolRegisterSource };
      setSaved(source); setDraft(source);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to load the school register setting.'); }
  }, []);
  useEffect(() => { void Promise.resolve().then(load); }, [load]);

  const save = async () => {
    if (!draft) return;
    setSaving(true);
    try {
      const response = await fetch('/api/admin/school-register-source', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ source: draft }) });
      if (!response.ok) throw Error(await errorOf(response, 'Unable to save the school register setting.'));
      const { source } = await response.json() as { source: SchoolRegisterSource };
      setSaved(source); setDraft(source);
      toast.success(source === 'dnemis_only' ? 'Schools now come from DNEMIS only' : 'Manual school changes allowed');
    } catch (cause) { toast.error(cause instanceof Error ? cause.message : 'Unable to save the school register setting.'); }
    finally { setSaving(false); }
  };

  if (error) return <Alert variant="destructive"><AlertTitle>School register setting unavailable</AlertTitle><AlertDescription>{error}<Button variant="outline" size="sm" onClick={() => void load()}>Try again</Button></AlertDescription></Alert>;
  if (!saved || !draft) return <Skeleton className="h-56 w-full" />;
  const dirty = draft !== saved;
  return <Card>
    <CardHeader className="border-b">
      <CardTitle>School register source</CardTitle>
      <CardDescription>Applies to every state&apos;s School register.</CardDescription>
    </CardHeader>
    <CardContent>
      <RadioGroup className="max-w-4xl md:grid-cols-2" value={draft} onValueChange={value => setDraft(value as SchoolRegisterSource)} aria-label="School register source">
        {options.map(option => <FieldLabel key={option.value} htmlFor={option.id}><Field orientation="horizontal"><FieldContent><FieldTitle>{option.title}</FieldTitle><FieldDescription>{option.description}</FieldDescription></FieldContent><RadioGroupItem id={option.id} value={option.value} /></Field></FieldLabel>)}
      </RadioGroup>
    </CardContent>
    <CardFooter className="justify-between border-t">
      <Badge variant={dirty ? 'outline' : 'secondary'}>{dirty ? 'Unsaved changes' : 'Saved'}</Badge>
      <Button onClick={() => void save()} disabled={saving || !dirty}>{saving && <Spinner data-icon="inline-start" />}Save changes</Button>
    </CardFooter>
  </Card>;
}
