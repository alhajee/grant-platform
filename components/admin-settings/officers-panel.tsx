'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowRightIcon } from 'lucide-react';
import { toast } from 'sonner';
import { PipelineIdleArt, UbecEmpty } from '@/components/empty-art/ubec-flow';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { ImplementedPillar } from '@/lib/beap-pillars';
import { OfficersTable } from './officers-table';
import { changesOf, draftOf, maxLimit, minLimit, validLimit, type OfficerDraft, type OfficerSettings, type ReleasedPlan } from './officers-model';
import { PanelError, PanelSkeleton, SaveBar, SettingsCard, SettingsPanel } from './settings-primitives';
import { errorOf } from './use-setting';

const endpoint = '/api/admin/ubec-officers';

/** Admin settings: Assessment Officer limits per UBEC department and default officers per component (migration 056). */
export function OfficersPanel({ onDirty }: { onDirty?: (dirty: boolean) => void }) {
  const [saved, setSaved] = useState<OfficerSettings | null>(null), [draft, setDraft] = useState<OfficerDraft | null>(null);
  const [error, setError] = useState(''), [saving, setSaving] = useState(false);
  const apply = (settings: OfficerSettings) => { setSaved(settings); setDraft(draftOf(settings)); };
  const load = useCallback(async () => {
    setError('');
    try {
      const response = await fetch(endpoint, { cache: 'no-store' });
      if (!response.ok) throw Error(await errorOf(response, 'Unable to load the UBEC Assessment Officer settings.'));
      apply(await response.json() as OfficerSettings);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to load the UBEC Assessment Officer settings.'); }
  }, []);
  useEffect(() => { void Promise.resolve().then(load); }, [load]);

  const changes = useMemo(() => saved && draft ? changesOf(saved, draft) : null, [saved, draft]);
  const dirty = !!changes && (changes.limits.length > 0 || changes.defaults.length > 0);
  const invalid = !!draft && Object.values(draft.limits).some(value => !validLimit(value));
  useEffect(() => { onDirty?.(dirty); }, [dirty, onDirty]);

  const save = async () => {
    if (!changes || invalid) return;
    setSaving(true);
    try {
      const response = await fetch(endpoint, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(changes) });
      if (!response.ok) throw Error(await errorOf(response, 'Unable to save the UBEC Assessment Officer settings.'));
      apply(await response.json() as OfficerSettings);
      toast.success('UBEC Assessment Officer settings saved');
    } catch (cause) { toast.error(cause instanceof Error ? cause.message : 'Unable to save the UBEC Assessment Officer settings.'); }
    finally { setSaving(false); }
  };
  const setLimit = (department: string, value: string) => setDraft(current => current && ({ ...current, limits: { ...current.limits, [department]: value } }));
  const setDefaults = (pillar: ImplementedPillar, ids: number[]) => setDraft(current => current && ({ ...current, defaults: { ...current.defaults, [pillar]: ids } }));

  return <SettingsPanel title="UBEC Assessment Officers" description="Officer limits per UBEC department, and who a release assigns to each component. Open a row to set its defaults.">
    {error ? <PanelError title="UBEC Assessment Officer settings unavailable" message={error} onRetry={() => void load()} />
      : !saved || !draft ? <PanelSkeleton rows={4} /> : <>
        <SettingsCard className="overflow-hidden">
          <OfficersTable departments={saved.departments} draft={draft} disabled={saving} onLimit={setLimit} onDefaults={setDefaults} />
        </SettingsCard>
        <SaveBar dirty={dirty || invalid} saving={saving} invalid={invalid ? `Enter limits from ${minLimit} to ${maxLimit}` : undefined}
          onDiscard={() => setDraft(draftOf(saved))} onSave={() => void save()} />
        <ReleasedPlans plans={saved.plans} />
      </>}
  </SettingsPanel>;
}

const date = new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium' });

function ReleasedPlans({ plans }: { plans: ReleasedPlan[] }) {
  return <div className="flex flex-col gap-3">
    <div className="admin-subhead">
      <h3>Plans in department assessment</h3>
      <p>Assign or reassign officers on components still with their Director.</p>
    </div>
    <SettingsCard className="overflow-hidden">
      {plans.length ? <Table>
        <TableHeader><TableRow><TableHead>SUBEB</TableHead><TableHead>Plan</TableHead><TableHead>Released</TableHead><TableHead>With Directors</TableHead><TableHead className="text-right"><span className="sr-only">Action</span></TableHead></TableRow></TableHeader>
        <TableBody>{plans.map(plan => <TableRow key={plan.planId}>
          <TableCell className="font-medium">{plan.state}</TableCell>
          <TableCell>{plan.period} BEAP <Badge variant="secondary" className="ml-1">Submission {plan.round}</Badge></TableCell>
          <TableCell className="text-muted-foreground">{plan.releasedAt ? date.format(new Date(plan.releasedAt)) : '—'}</TableCell>
          <TableCell className="tabular-nums">{plan.atDirector} of {plan.released}</TableCell>
          <TableCell className="text-right"><Button asChild variant="outline" size="sm"><a href={`/ubec/review?plan=${plan.planId}`}>Assign officers<ArrowRightIcon data-icon="inline-end" /></a></Button></TableCell>
        </TableRow>)}</TableBody>
      </Table> : <div className="p-6"><UbecEmpty art={<PipelineIdleArt />} title="No plans in department assessment" compact>Plans appear here once the UBEC BEAP Chair releases them.</UbecEmpty></div>}
    </SettingsCard>
  </div>;
}
