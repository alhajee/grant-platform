'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowRightIcon, RotateCcwIcon, TriangleAlertIcon } from 'lucide-react';
import { toast } from 'sonner';
import { NoOfficersArt, PipelineIdleArt, UbecEmpty } from '@/components/empty-art/ubec-flow';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Combobox, ComboboxChip, ComboboxChips, ComboboxChipsInput, ComboboxContent, ComboboxEmpty, ComboboxItem, ComboboxList, useComboboxAnchor } from '@/components/ui/combobox';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { ImplementedPillar } from '@/lib/beap-pillars';

type Officer = { id: number; name: string; email: string };
type Department = {
  department: string; name: string; short: string; components: { pillar: ImplementedPillar; name: string; defaults: number[] }[];
  defaultLimit: number; limit: number; custom: boolean; active: number; warning: string | null; officers: Officer[];
};
type Plan = { planId: number; state: string; period: string; round: number; releasedAt: string | null; atDirector: number; released: number };
type Settings = { departments: Department[]; plans: Plan[] };
type Draft = { limits: Record<string, string>; defaults: Record<string, number[]> };

const draftOf = (settings: Settings): Draft => ({
  limits: Object.fromEntries(settings.departments.map(d => [d.department, String(d.limit)])),
  defaults: Object.fromEntries(settings.departments.flatMap(d => d.components.map(c => [c.pillar, c.defaults]))),
});
const sameIds = (a: readonly number[], b: readonly number[]) => a.length === b.length && [...a].sort().every((id, i) => id === [...b].sort()[i]);
const validLimit = (value: string) => /^\d{1,2}$/.test(value) && Number(value) >= 1 && Number(value) <= 50;

async function errorOf(response: Response, fallback: string) {
  const body = await response.json().catch(() => ({})) as { error?: string };
  return body.error || fallback;
}

/** Admin > Workflow settings: Assessment Officer limits per UBEC department and default officers per component (migration 056). */
export function AdminUbecOfficers() {
  const [saved, setSaved] = useState<Settings | null>(null), [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState(''), [saving, setSaving] = useState(false);
  const load = useCallback(async () => {
    setError('');
    try {
      const response = await fetch('/api/admin/ubec-officers', { cache: 'no-store' });
      if (!response.ok) throw Error(await errorOf(response, 'Unable to load the UBEC Assessment Officer settings.'));
      const settings = await response.json() as Settings;
      setSaved(settings); setDraft(draftOf(settings));
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to load the UBEC Assessment Officer settings.'); }
  }, []);
  useEffect(() => { void Promise.resolve().then(load); }, [load]);

  const changes = useMemo(() => {
    if (!saved || !draft) return null;
    const limits = saved.departments.filter(d => draft.limits[d.department] !== String(d.limit))
      .map(d => ({ department: d.department, limit: Number(draft.limits[d.department]) === d.defaultLimit ? null : Number(draft.limits[d.department]) }));
    const defaults = saved.departments.flatMap(d => d.components).filter(c => !sameIds(draft.defaults[c.pillar] ?? [], c.defaults)).map(c => ({ pillar: c.pillar, officerIds: draft.defaults[c.pillar] ?? [] }));
    return { limits, defaults };
  }, [saved, draft]);
  const invalid = !!draft && Object.values(draft.limits).some(value => !validLimit(value));

  const save = async () => {
    if (!changes || invalid) return;
    setSaving(true);
    try {
      const response = await fetch('/api/admin/ubec-officers', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(changes) });
      if (!response.ok) throw Error(await errorOf(response, 'Unable to save the UBEC Assessment Officer settings.'));
      const settings = await response.json() as Settings;
      setSaved(settings); setDraft(draftOf(settings));
      toast.success('UBEC Assessment Officer settings saved');
    } catch (cause) { toast.error(cause instanceof Error ? cause.message : 'Unable to save the UBEC Assessment Officer settings.'); }
    finally { setSaving(false); }
  };

  if (error) return <Alert variant="destructive"><AlertTitle>UBEC Assessment Officer settings unavailable</AlertTitle><AlertDescription>{error}<Button variant="outline" size="sm" onClick={() => void load()}>Try again</Button></AlertDescription></Alert>;
  if (!saved || !draft || !changes) return <Skeleton className="h-96 w-full" />;
  const dirty = changes.limits.length > 0 || changes.defaults.length > 0;
  return <div className="flex flex-col gap-6">
    <Card>
      <CardHeader className="border-b">
        <CardTitle>UBEC Assessment Officers</CardTitle>
        <CardDescription>How many active Assessment Officers each UBEC department may have, and who the release assigns to each component. Without a default officer the Director assigns, as before; the Director can always add, remove or change officers.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-0 p-0">
        {saved.departments.map((department, index) => <div key={department.department}>
          {index > 0 && <Separator />}
          <DepartmentRow department={department} limit={draft.limits[department.department]} defaults={draft.defaults} disabled={saving}
            onLimit={value => setDraft(current => current && ({ ...current, limits: { ...current.limits, [department.department]: value } }))}
            onDefaults={(pillar, ids) => setDraft(current => current && ({ ...current, defaults: { ...current.defaults, [pillar]: ids } }))} />
        </div>)}
      </CardContent>
      <CardFooter className="justify-between border-t">
        <Badge variant={dirty ? 'outline' : 'secondary'}>{invalid ? 'Enter limits from 1 to 50' : dirty ? 'Unsaved changes' : 'Saved'}</Badge>
        <Button onClick={() => void save()} disabled={saving || !dirty || invalid}>{saving && <Spinner data-icon="inline-start" />}Save changes</Button>
      </CardFooter>
    </Card>
    <ReleasedPlans plans={saved.plans} />
  </div>;
}

function DepartmentRow({ department, limit, defaults, disabled, onLimit, onDefaults }: {
  department: Department; limit: string; defaults: Record<string, number[]>; disabled: boolean;
  onLimit: (value: string) => void; onDefaults: (pillar: ImplementedPillar, ids: number[]) => void;
}) {
  const id = `officer-limit-${department.department}`;
  const numeric = validLimit(limit) ? Number(limit) : null;
  const over = numeric !== null && department.active > numeric;
  return <section className="grid gap-4 px-6 py-5 lg:grid-cols-[minmax(0,15rem)_minmax(0,1fr)]" aria-labelledby={`${id}-title`}>
    <div className="flex flex-col gap-3">
      <div>
        <h3 id={`${id}-title`} className="font-semibold leading-tight">{department.name} <span className="text-muted-foreground">({department.short})</span></h3>
        <p className="text-sm text-muted-foreground">{department.components.length} {department.components.length === 1 ? 'component' : 'components'} · <span data-testid={`active-${department.department}`}>{department.active} active {department.active === 1 ? 'officer' : 'officers'}</span></p>
      </div>
      <Field>
        <FieldLabel htmlFor={id}>Officer limit</FieldLabel>
        <div className="flex items-center gap-2">
          <Input id={id} type="number" inputMode="numeric" min={1} max={50} className="w-20" value={limit} disabled={disabled} aria-invalid={!validLimit(limit) || undefined} onChange={event => onLimit(event.target.value)} />
          <Button type="button" variant="ghost" size="sm" disabled={disabled || limit === String(department.defaultLimit)} onClick={() => onLimit(String(department.defaultLimit))}><RotateCcwIcon data-icon="inline-start" />Reset</Button>
        </div>
        <FieldDescription>Default: {department.defaultLimit} (one per component)</FieldDescription>
      </Field>
      {over && <Alert className="border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100"><TriangleAlertIcon /><AlertDescription>{department.active} active, limit {numeric}: no new officers until one is deactivated.</AlertDescription></Alert>}
    </div>
    <div className="flex min-w-0 flex-col gap-3">
      {department.officers.length === 0
        ? <UbecEmpty art={<NoOfficersArt />} title={`No Assessment Officers in ${department.short} yet`} compact>Add them on Users or the UBEC Officers page. Until then the Director assigns officers on each plan.</UbecEmpty>
        : department.components.map(component => <DefaultOfficers key={component.pillar} pillar={component.pillar} name={component.name} officers={department.officers} value={defaults[component.pillar] ?? []} disabled={disabled} onChange={ids => onDefaults(component.pillar, ids)} />)}
    </div>
  </section>;
}

function DefaultOfficers({ pillar, name, officers, value, disabled, onChange }: { pillar: string; name: string; officers: Officer[]; value: number[]; disabled: boolean; onChange: (ids: number[]) => void }) {
  const anchor = useComboboxAnchor(), id = `default-officers-${pillar}`;
  const label = (officerId: number) => officers.find(o => o.id === officerId)?.name ?? 'Officer';
  return <Field>
    <FieldLabel htmlFor={id}>{name}</FieldLabel>
    <Combobox multiple items={officers.map(o => o.id)} value={value} onValueChange={ids => onChange(ids as number[])} itemToStringLabel={officerId => label(officerId as number)} disabled={disabled}>
      <ComboboxChips ref={anchor}>
        <>{value.map(officerId => <ComboboxChip key={officerId}>{label(officerId)}</ComboboxChip>)}</>
        <ComboboxChipsInput id={id} placeholder={value.length ? 'Add another officer…' : 'Director assigns'} />
      </ComboboxChips>
      <ComboboxContent anchor={anchor}>
        <ComboboxEmpty>No officer matches your search.</ComboboxEmpty>
        <ComboboxList>{officers.map(o => <ComboboxItem key={o.id} value={o.id}><span className="flex flex-col"><span>{o.name}</span><small className="text-muted-foreground">{o.email}</small></span></ComboboxItem>)}</ComboboxList>
      </ComboboxContent>
    </Combobox>
  </Field>;
}

const date = new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium' });
function ReleasedPlans({ plans }: { plans: Plan[] }) {
  return <Card>
    <CardHeader className="border-b">
      <CardTitle>Plans in department assessment</CardTitle>
      <CardDescription>Open a plan to assign or reassign Assessment Officers on components still with their Director. The same rules apply as for the Director: active officers of the component&apos;s department and a comment.</CardDescription>
    </CardHeader>
    <CardContent>
      {plans.length ? <Table><TableHeader><TableRow><TableHead>SUBEB</TableHead><TableHead>Plan</TableHead><TableHead>Released</TableHead><TableHead>With Directors</TableHead><TableHead className="text-right"><span className="sr-only">Open</span></TableHead></TableRow></TableHeader><TableBody>
        {plans.map(plan => <TableRow key={plan.planId}>
          <TableCell className="font-medium">{plan.state}</TableCell>
          <TableCell>{plan.period} BEAP · Submission {plan.round}</TableCell>
          <TableCell>{plan.releasedAt ? date.format(new Date(plan.releasedAt)) : '—'}</TableCell>
          <TableCell>{plan.atDirector} of {plan.released} components</TableCell>
          <TableCell className="text-right"><Button asChild variant="outline" size="sm" className="rounded-full"><a href={`/ubec/review?plan=${plan.planId}`}>Assign officers<ArrowRightIcon data-icon="inline-end" /></a></Button></TableCell>
        </TableRow>)}
      </TableBody></Table> : <UbecEmpty art={<PipelineIdleArt />} title="No plans in department assessment">Plans appear here once the UBEC BEAP Chair releases them.</UbecEmpty>}
    </CardContent>
  </Card>;
}
