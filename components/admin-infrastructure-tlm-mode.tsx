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
import type { InfrastructureTlmMode } from '@/lib/funding-policy';

type Option = { value: InfrastructureTlmMode; id: string; title: string; description: string };
const options: Option[] = [
  { value: 'split', id: 'infra-tlm-split', title: 'Set a split', description: 'Each plan sets how much of the shared budget TLM uses; Infrastructure gets the rest. Each side stays within its own part, like Teacher Development and ICT.' },
  { value: 'shared_pool', id: 'infra-tlm-pool', title: 'One shared pool', description: 'Infrastructure and TLM draw from the whole shared budget, first come, first served. Together they may not exceed it. Any split already set is kept but ignored.' },
];

async function errorOf(response: Response, fallback: string) {
  const body = await response.json().catch(() => ({})) as { error?: string };
  return body.error || fallback;
}

/** Admin > Workflow settings: how Infrastructure and TLM share their 75% budget, for every state (migration 051). */
export function AdminInfrastructureTlmMode() {
  const [saved, setSaved] = useState<InfrastructureTlmMode | null>(null), [draft, setDraft] = useState<InfrastructureTlmMode | null>(null);
  const [error, setError] = useState(''), [saving, setSaving] = useState(false);
  const load = useCallback(async () => {
    setError('');
    try {
      const response = await fetch('/api/admin/infrastructure-tlm-mode', { cache: 'no-store' });
      if (!response.ok) throw Error(await errorOf(response, 'Unable to load the Infrastructure and TLM budget setting.'));
      const { mode } = await response.json() as { mode: InfrastructureTlmMode };
      setSaved(mode); setDraft(mode);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to load the Infrastructure and TLM budget setting.'); }
  }, []);
  useEffect(() => { void Promise.resolve().then(load); }, [load]);

  const save = async () => {
    if (!draft) return;
    setSaving(true);
    try {
      const response = await fetch('/api/admin/infrastructure-tlm-mode', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: draft }) });
      if (!response.ok) throw Error(await errorOf(response, 'Unable to save the Infrastructure and TLM budget setting.'));
      const { mode } = await response.json() as { mode: InfrastructureTlmMode };
      setSaved(mode); setDraft(mode);
      toast.success(mode === 'split' ? 'Infrastructure and TLM now set a split' : 'Infrastructure and TLM now share one pool');
    } catch (cause) { toast.error(cause instanceof Error ? cause.message : 'Unable to save the Infrastructure and TLM budget setting.'); }
    finally { setSaving(false); }
  };

  if (error) return <Alert variant="destructive"><AlertTitle>Infrastructure and TLM budget setting unavailable</AlertTitle><AlertDescription>{error}<Button variant="outline" size="sm" onClick={() => void load()}>Try again</Button></AlertDescription></Alert>;
  if (!saved || !draft) return <Skeleton className="h-56 w-full" />;
  const dirty = draft !== saved;
  return <Card>
    <CardHeader className="border-b">
      <CardTitle>Infrastructure and TLM budget</CardTitle>
      <CardDescription>Infrastructure and TLM share the infrastructure funding share. Applies to every state&apos;s plans.</CardDescription>
    </CardHeader>
    <CardContent>
      <RadioGroup className="max-w-4xl md:grid-cols-2" value={draft} onValueChange={value => setDraft(value as InfrastructureTlmMode)} aria-label="Infrastructure and TLM budget">
        {options.map(option => <FieldLabel key={option.value} htmlFor={option.id}><Field orientation="horizontal"><FieldContent><FieldTitle>{option.title}</FieldTitle><FieldDescription>{option.description}</FieldDescription></FieldContent><RadioGroupItem id={option.id} value={option.value} /></Field></FieldLabel>)}
      </RadioGroup>
    </CardContent>
    <CardFooter className="justify-between border-t">
      <Badge variant={dirty ? 'outline' : 'secondary'}>{dirty ? 'Unsaved changes' : 'Saved'}</Badge>
      <Button onClick={() => void save()} disabled={saving || !dirty}>{saving && <Spinner data-icon="inline-start" />}Save changes</Button>
    </CardFooter>
  </Card>;
}
