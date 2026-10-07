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

type Choice = 'optional' | 'required';
const options: { value: Choice; id: string; title: string; description: string }[] = [
  { value: 'optional', id: 'component-documents-optional', title: 'Optional', description: 'ICT and Teacher Development lines can still carry documents, but saving and every send step go ahead without them.' },
  { value: 'required', id: 'component-documents-required', title: 'Required', description: 'The ICT specification, supporting document and Bill of Quantities, and the Teacher Development supporting documents, must be uploaded before a component is sent.' },
];

async function errorOf(response: Response, fallback: string) {
  const body = await response.json().catch(() => ({})) as { error?: string };
  return body.error || fallback;
}

/** Admin > Workflow settings: whether component supporting documents are required (migration 052). */
export function AdminComponentDocuments() {
  const [saved, setSaved] = useState<Choice | null>(null), [draft, setDraft] = useState<Choice | null>(null);
  const [error, setError] = useState(''), [saving, setSaving] = useState(false);
  const load = useCallback(async () => {
    setError('');
    try {
      const response = await fetch('/api/admin/component-documents', { cache: 'no-store' });
      if (!response.ok) throw Error(await errorOf(response, 'Unable to load the supporting documents setting.'));
      const { required } = await response.json() as { required: boolean };
      const choice: Choice = required ? 'required' : 'optional';
      setSaved(choice); setDraft(choice);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to load the supporting documents setting.'); }
  }, []);
  useEffect(() => { void Promise.resolve().then(load); }, [load]);

  const save = async () => {
    if (!draft) return;
    setSaving(true);
    try {
      const response = await fetch('/api/admin/component-documents', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ required: draft === 'required' }) });
      if (!response.ok) throw Error(await errorOf(response, 'Unable to save the supporting documents setting.'));
      const { required } = await response.json() as { required: boolean };
      const choice: Choice = required ? 'required' : 'optional';
      setSaved(choice); setDraft(choice);
      toast.success(required ? 'Supporting documents are now required' : 'Supporting documents are now optional');
    } catch (cause) { toast.error(cause instanceof Error ? cause.message : 'Unable to save the supporting documents setting.'); }
    finally { setSaving(false); }
  };

  if (error) return <Alert variant="destructive"><AlertTitle>Supporting documents setting unavailable</AlertTitle><AlertDescription>{error}<Button variant="outline" size="sm" onClick={() => void load()}>Try again</Button></AlertDescription></Alert>;
  if (!saved || !draft) return <Skeleton className="h-56 w-full" />;
  const dirty = draft !== saved;
  return <Card>
    <CardHeader className="border-b">
      <CardTitle>Supporting documents</CardTitle>
      <CardDescription>Applies to every SUBEB. Infrastructure documents and the Rapid Assessment Tool (RAT) are always required.</CardDescription>
    </CardHeader>
    <CardContent>
      <RadioGroup className="max-w-4xl md:grid-cols-2" value={draft} onValueChange={value => setDraft(value as Choice)} aria-label="Supporting documents">
        {options.map(option => <FieldLabel key={option.value} htmlFor={option.id}><Field orientation="horizontal"><FieldContent><FieldTitle>{option.title}</FieldTitle><FieldDescription>{option.description}</FieldDescription></FieldContent><RadioGroupItem id={option.id} value={option.value} /></Field></FieldLabel>)}
      </RadioGroup>
    </CardContent>
    <CardFooter className="justify-between border-t">
      <Badge variant={dirty ? 'outline' : 'secondary'}>{dirty ? 'Unsaved changes' : 'Saved'}</Badge>
      <Button onClick={() => void save()} disabled={saving || !dirty}>{saving && <Spinner data-icon="inline-start" />}Save changes</Button>
    </CardFooter>
  </Card>;
}
