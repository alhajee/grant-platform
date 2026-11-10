'use client';
import './phe-training-schools.css';
import { useMemo, useState } from 'react';
import { ChevronDownIcon, PlusIcon, SchoolIcon, XIcon } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import type { SportsSchool } from '@/lib/sports';
import { DistributionListUpload } from '@/components/distribution-list-upload';
import { SchoolFilters, allLevels, allLgas, filterSchools, schoolMatches, type SchoolLevelChoice, type SchoolLgaChoice } from '@/components/school-level-filter';

type School = Pick<SportsSchool, 'id' | 'name' | 'lga' | 'level' | 'code'>;

/**
 * UBEC74: the PHE officer training distribution list (a list of schools, like TLM's). Shown in the Sports editor while
 * the plan has Training of PHE Officers lines (or a list already). Search the state's schools, tick several and add
 * them; remove one at a time. Saves through POST /api/sports/training-schools.
 */
export function PheTrainingSchools({ planHref, schools, listed, disabled, required, onChanged }: {
  planHref: (path: string) => string; schools: readonly School[]; listed: readonly School[]; disabled: boolean; required: boolean; onChanged: () => Promise<unknown>;
}) {
  const [query, setQuery] = useState(''), [level, setLevel] = useState<SchoolLevelChoice>(allLevels), [lga, setLga] = useState<SchoolLgaChoice>(allLgas), [picked, setPicked] = useState<number[]>([]), [busy, setBusy] = useState(false), [open, setOpen] = useState(true);
  const listedIds = useMemo(() => new Set(listed.map(s => s.id)), [listed]);
  const matches = useMemo(() => {
    const filtering = query.trim() || level !== allLevels || lga !== allLgas;
    return filtering ? filterSchools(schools, level, lga).filter(s => !listedIds.has(s.id) && schoolMatches(s, query)).slice(0, 30) : [];
  }, [query, level, lga, schools, listedIds]);
  async function send(body: object, done: string) {
    if (busy) return;
    setBusy(true);
    try {
      const response = await fetch(planHref('/api/sports/training-schools'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const result = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(result.error || 'The PHE training list could not be saved');
      await onChanged(); toast.success(done);
    } catch (cause) { toast.error(cause instanceof Error ? cause.message : 'The PHE training list could not be saved'); }
    finally { setBusy(false); }
  }
  // UBEC222: the panel folds away (chevron), and the editor shows it only for Training of PHE Officers items.
  return <Collapsible asChild open={open} onOpenChange={setOpen}><section className="phe-schools" aria-labelledby="phe-schools-title" data-missing={(required && !listed.length) || undefined} data-open={open || undefined}>
    <header><div className="phe-schools-title-row"><h3 id="phe-schools-title"><SchoolIcon aria-hidden="true" />PHE training schools <Badge variant="secondary">{listed.length}</Badge></h3>
      <CollapsibleTrigger asChild><Button size="icon-sm" variant="ghost" className="phe-schools-toggle" aria-label={open ? 'Collapse PHE training schools' : 'Expand PHE training schools'}><ChevronDownIcon /></Button></CollapsibleTrigger></div>
      <p>{required && !listed.length ? 'Add the schools the Training of PHE Officers is for. Sports, Quiz & Debate cannot be sent until there is at least one' : 'The schools the Training of PHE Officers is for'}</p></header>
    <CollapsibleContent className="phe-schools-body">
    {!disabled && <div className="phe-schools-add">
      <DistributionListUpload workstream="phe" planHref={planHref} disabled={disabled || busy} onAdd={ids => send({ action: 'add', schoolIds: ids }, `${ids.length} ${ids.length === 1 ? 'school' : 'schools'} added`)} />
      <Input type="search" aria-label="Search schools for the PHE training" placeholder="Search by school, LGA or DNEMIS code…" value={query} onChange={e => setQuery(e.target.value)} />
      <SchoolFilters schools={schools} level={level} onLevelChange={setLevel} lga={lga} onLgaChange={setLga} />
      {matches.length > 0 && <ul className="phe-schools-matches">{matches.map(s => <li key={s.id}><label><Checkbox checked={picked.includes(s.id)} onCheckedChange={on => setPicked(list => on === true ? [...list, s.id] : list.filter(id => id !== s.id))} /><span><b>{s.name}</b><small>{[s.lga, s.level, s.code].filter(Boolean).join(' · ')}</small></span></label></li>)}</ul>}
      {(query.trim() || level !== allLevels || lga !== allLgas) && !matches.length && <p className="phe-schools-none">No schools match</p>}
      <Button size="sm" className="rounded-full self-start" disabled={!picked.length || busy} onClick={() => void send({ action: 'add', schoolIds: picked }, `${picked.length} ${picked.length === 1 ? 'school' : 'schools'} added`).then(() => { setPicked([]); setQuery(''); })}>{busy ? <Spinner data-icon="inline-start" /> : <PlusIcon data-icon="inline-start" />}Add {picked.length || ''} {picked.length === 1 ? 'school' : 'schools'}</Button>
    </div>}
    {listed.length > 0 && <ul className="phe-schools-list">{listed.map(s => <li key={s.id}><span><b>{s.name}</b><small>{s.lga} · {s.level}</small></span>{!disabled && <Button size="icon-sm" variant="ghost" aria-label={`Remove ${s.name}`} disabled={busy} onClick={() => void send({ action: 'remove', schoolId: s.id }, 'School removed')}><XIcon /></Button>}</li>)}</ul>}
    </CollapsibleContent>
  </section></Collapsible>;
}
