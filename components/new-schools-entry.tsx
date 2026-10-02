'use client';

import { useEffect, useId, useState } from 'react';
import { SchoolIcon } from 'lucide-react';
import { SchoolEntryForm } from '@/components/school-register-form';
import { SchoolBulkUpload } from '@/components/school-register-import';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { RegisterOptions, RegisterSchool } from '@/lib/school-register';

// Shared with the School register page (UBEC07) and used by plan creation (UBEC03).
export { SchoolEntryForm, type SchoolEntryFormProps } from '@/components/school-register-form';
export { SchoolBulkUpload, type SchoolBulkUploadProps } from '@/components/school-register-import';

export type AddedSchool = Pick<RegisterSchool, 'id' | 'name' | 'lga' | 'level'>;
export type NewSchoolsEntryProps = {
  /** Number shown in the step badge, matching the plan dialog's numbered sections. */
  step?: number;
  disabled?: boolean;
  /** Every school added through this step so far (single and bulk), newest first. */
  onAdded?: (schools: AddedSchool[]) => void;
};

/**
 * Optional plan-creation step: "Do you have a new school you wish to add?" then single or bulk entry.
 * Schools go straight into the state register (they do not depend on the plan being created).
 */
export function NewSchoolsEntry({ step = 4, disabled = false, onAdded }: NewSchoolsEntryProps) {
  const id = useId();
  const [wanted, setWanted] = useState(false);
  const [options, setOptions] = useState<RegisterOptions | null>(null), [error, setError] = useState('');
  const [added, setAdded] = useState<AddedSchool[]>([]);
  useEffect(() => {
    if (!wanted || options) return;
    const controller = new AbortController();
    fetch('/api/schools/options', { cache: 'no-store', signal: controller.signal }).then(async response => {
      const body = await response.json().catch(() => ({})) as RegisterOptions & { error?: string };
      if (!response.ok) throw Error(body.error || 'Unable to load the school register.');
      setOptions(body);
    }).catch((cause: unknown) => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Unable to load the school register.'); });
    return () => controller.abort();
  }, [wanted, options]);
  const record = (schools: AddedSchool[]) => { if (!schools.length) return; const next = [...schools, ...added]; setAdded(next); onAdded?.(next); };

  return <Field className="gap-3 rounded-xl border bg-card p-3 shadow-xs" data-disabled={disabled || undefined}>
    <div className="flex items-start gap-3">
      <span className="grid size-6 shrink-0 place-items-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">{step}</span>
      <Field orientation="horizontal" className="w-auto">
        <Checkbox id={`${id}-wanted`} checked={wanted} disabled={disabled} onCheckedChange={value => setWanted(value === true)} />
        <div className="flex flex-col gap-1"><FieldLabel htmlFor={`${id}-wanted`}>Do you have a new school you wish to add?</FieldLabel><FieldDescription>Optional. New schools are added to your state&apos;s School register so they can be chosen in this plan.</FieldDescription></div>
      </Field>
    </div>
    {wanted && <div className="flex flex-col gap-4 pt-1">
      {error ? <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>
        : !options ? <Skeleton className="h-40 w-full" />
        : !options.canManage ? <Alert><AlertDescription>Only the Executive Chairman, the BEAP Chair or staff they authorise can add schools. Ask them to add the school in the School register.</AlertDescription></Alert>
        : <Tabs defaultValue="single">
          <TabsList><TabsTrigger value="single">Single entry</TabsTrigger><TabsTrigger value="bulk">Bulk entry</TabsTrigger></TabsList>
          <TabsContent value="single" className="pt-3"><SchoolEntryForm lgas={options.lgas} onSaved={school => record([school])} /></TabsContent>
          <TabsContent value="bulk" className="pt-3"><SchoolBulkUpload onImported={result => record(result.schools)} /></TabsContent>
        </Tabs>}
      {added.length > 0 && <div className="flex flex-col gap-2 rounded-lg border bg-muted/40 p-3">
        <p className="flex items-center gap-2 text-sm font-medium"><SchoolIcon className="size-4" aria-hidden="true" />Added to the register <Badge variant="secondary">{added.length}</Badge></p>
        <ul className="flex flex-col gap-1 text-sm">{added.slice(0, 8).map(school => <li key={school.id}>{school.name} <span className="text-muted-foreground">· {school.lga} · {school.level}</span></li>)}{added.length > 8 && <li className="text-muted-foreground">and {added.length - 8} more</li>}</ul>
      </div>}
    </div>}
  </Field>;
}
