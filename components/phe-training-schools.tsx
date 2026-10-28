'use client';
import './phe-training-schools.css';
import { useMemo, useState } from 'react';
import { PlusIcon, SchoolIcon, XIcon } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import type { SportsSchool } from '@/lib/sports';

type School = Pick<SportsSchool, 'id' | 'name' | 'lga' | 'level'>;

/**
 * UBEC74: the PHE officer training distribution list (a list of schools, like TLM's). Shown in the Sports editor while
 * the plan has Training of PHE Officers lines (or a list already). Search the state's schools, tick several and add
 * them; remove one at a time. Saves through POST /api/sports/training-schools.
 */
export function PheTrainingSchools({ planHref, schools, listed, disabled, required, onChanged }: {
  planHref: (path: string) => string; schools: readonly School[]; listed: readonly School[]; disabled: boolean; required: boolean; onChanged: () => Promise<unknown>;
}) {
  const [query, setQuery] = useState(''), [picked, setPicked] = useState<number[]>([]), [busy, setBusy] = useState(false);
  const listedIds = useMemo(() => new Set(listed.map(s => s.id)), [listed]);
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? schools.filter(s => !listedIds.has(s.id) && `${s.name} ${s.lga} ${s.level}`.toLowerCase().includes(q)).slice(0, 30) : [];
  }, [query, schools, listedIds]);
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
  return <section className="phe-schools" aria-labelledby="phe-schools-title" data-missing={(required && !listed.length) || undefined}>
    <header><h3 id="phe-schools-title"><SchoolIcon aria-hidden="true" />PHE training schools <Badge variant="secondary">{listed.length}</Badge></h3>
      <p>{required && !listed.length ? 'Add the schools the Training of PHE Officers is for. Sports, Quiz & Debate cannot be sent until there is at least one' : 'The schools the Training of PHE Officers is for'}</p></header>
    {!disabled && <div className="phe-schools-add">
      <Input type="search" aria-label="Search schools for the PHE training" placeholder="Search by school, LGA or level…" value={query} onChange={e => setQuery(e.target.value)} />
      {matches.length > 0 && <ul className="phe-schools-matches">{matches.map(s => <li key={s.id}><label><Checkbox checked={picked.includes(s.id)} onCheckedChange={on => setPicked(list => on === true ? [...list, s.id] : list.filter(id => id !== s.id))} /><span><b>{s.name}</b><small>{s.lga} · {s.level}</small></span></label></li>)}</ul>}
      {query.trim() && !matches.length && <p className="phe-schools-none">No schools match</p>}
      <Button size="sm" className="rounded-full self-start" disabled={!picked.length || busy} onClick={() => void send({ action: 'add', schoolIds: picked }, `${picked.length} ${picked.length === 1 ? 'school' : 'schools'} added`).then(() => { setPicked([]); setQuery(''); })}>{busy ? <Spinner data-icon="inline-start" /> : <PlusIcon data-icon="inline-start" />}Add {picked.length || ''} {picked.length === 1 ? 'school' : 'schools'}</Button>
    </div>}
    {listed.length > 0 && <ul className="phe-schools-list">{listed.map(s => <li key={s.id}><span><b>{s.name}</b><small>{s.lga} · {s.level}</small></span>{!disabled && <Button size="icon-sm" variant="ghost" aria-label={`Remove ${s.name}`} disabled={busy} onClick={() => void send({ action: 'remove', schoolId: s.id }, 'School removed')}><XIcon /></Button>}</li>)}</ul>}
  </section>;
}
