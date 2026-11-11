'use client';
import './phe-training-schools.css';
import { useMemo, useState, type ReactNode } from 'react';
import { ChevronDownIcon, PlusIcon, SchoolIcon, XIcon } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import type { SportsSchool } from '@/lib/sports';
import { DistributionListUpload } from '@/components/distribution-list-upload';
import { SchoolFilters, allLevels, allLgas, filterSchools, schoolMatches, type SchoolLevelChoice, type SchoolLgaChoice } from '@/components/school-level-filter';

type School = Pick<SportsSchool, 'id' | 'name' | 'lga' | 'level' | 'code'>;

/** Wording of one Sports school list. */
type ListCopy = { title: string; noun: string; empty: string; hint: string };
const copy: Record<'phe' | 'sports', ListCopy> = {
  phe: { title: 'PHE training schools', noun: 'the PHE training', empty: 'Add the schools the Training of PHE Officers is for. Sports, Quiz & Debate cannot be sent until there is at least one', hint: 'The schools the Training of PHE Officers is for' },
  sports: { title: 'Beneficiary schools list', noun: 'the Sports equipment', empty: 'Add the schools that get Sports equipment, then share each item across them under Items for schools', hint: 'The schools that get Sports equipment. Share each item across them under Items for schools' },
};

/**
 * A Sports school list (a list of schools, like TLM's), saved through POST /api/sports/training-schools: the PHE officer
 * training list (UBEC74, shown while the plan has Training of PHE Officers lines) and the beneficiary schools list the
 * equipment is shared across (UBEC249). Search the state's schools (or upload a list), tick several and add them; remove
 * one at a time. Removing a beneficiary school that holds items asks first, since its items are taken back.
 */
export function PheTrainingSchools({ planHref, schools, listed, disabled, required, onChanged, list = 'phe', itemsBySchool, defaultOpen = true, footer }: {
  planHref: (path: string) => string; schools: readonly School[]; listed: readonly School[]; disabled: boolean; required: boolean; onChanged: () => Promise<unknown>;
  list?: 'phe' | 'sports'; /** Beneficiary list: the equipment items each school holds. */ itemsBySchool?: ReadonlyMap<number, number>; defaultOpen?: boolean; footer?: ReactNode;
}) {
  const text = copy[list];
  const [confirm, setConfirm] = useState<School | null>(null);
  const [query, setQuery] = useState(''), [level, setLevel] = useState<SchoolLevelChoice>(allLevels), [lga, setLga] = useState<SchoolLgaChoice>(allLgas), [picked, setPicked] = useState<number[]>([]), [busy, setBusy] = useState(false), [open, setOpen] = useState(defaultOpen);
  const listedIds = useMemo(() => new Set(listed.map(s => s.id)), [listed]);
  const matches = useMemo(() => {
    const filtering = query.trim() || level !== allLevels || lga !== allLgas;
    return filtering ? filterSchools(schools, level, lga).filter(s => !listedIds.has(s.id) && schoolMatches(s, query)).slice(0, 30) : [];
  }, [query, level, lga, schools, listedIds]);
  async function send(body: object, done: string) {
    if (busy) return;
    setBusy(true);
    try {
      const response = await fetch(planHref('/api/sports/training-schools'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body, list }) });
      const result = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(result.error || 'The school list could not be saved');
      await onChanged(); toast.success(done);
    } catch (cause) { toast.error(cause instanceof Error ? cause.message : 'The school list could not be saved'); }
    finally { setBusy(false); }
  }
  // UBEC222: the panel folds away (chevron), and the editor shows it only for Training of PHE Officers items.
  return <Collapsible asChild open={open} onOpenChange={setOpen}><section className="phe-schools" aria-labelledby={`${list}-schools-title`} data-missing={(required && !listed.length) || undefined} data-open={open || undefined}>
    <header><div className="phe-schools-title-row"><h3 id={`${list}-schools-title`}><SchoolIcon aria-hidden="true" />{text.title} <Badge variant="secondary">{listed.length}</Badge></h3>
      <CollapsibleTrigger asChild><Button size="icon-sm" variant="ghost" className="phe-schools-toggle" aria-label={`${open ? 'Collapse' : 'Expand'} ${text.title}`}><ChevronDownIcon /></Button></CollapsibleTrigger></div>
      <p>{required && !listed.length ? text.empty : text.hint}</p></header>
    <CollapsibleContent className="phe-schools-body">
    {!disabled && <div className="phe-schools-add">
      <DistributionListUpload workstream={list} planHref={planHref} disabled={disabled || busy} onAdd={ids => send({ action: 'add', schoolIds: ids }, `${ids.length} ${ids.length === 1 ? 'school' : 'schools'} added`)} />
      <Input type="search" aria-label={`Search schools for ${text.noun}`} placeholder="Search by school, LGA or DNEMIS code…" value={query} onChange={e => setQuery(e.target.value)} />
      <SchoolFilters schools={schools} level={level} onLevelChange={setLevel} lga={lga} onLgaChange={setLga} />
      {matches.length > 0 && <ul className="phe-schools-matches">{matches.map(s => <li key={s.id}><label><Checkbox checked={picked.includes(s.id)} onCheckedChange={on => setPicked(list => on === true ? [...list, s.id] : list.filter(id => id !== s.id))} /><span><b>{s.name}</b><small>{[s.lga, s.level, s.code].filter(Boolean).join(' · ')}</small></span></label></li>)}</ul>}
      {(query.trim() || level !== allLevels || lga !== allLgas) && !matches.length && <p className="phe-schools-none">No schools match</p>}
      <Button size="sm" className="rounded-full self-start" disabled={!picked.length || busy} onClick={() => void send({ action: 'add', schoolIds: picked }, `${picked.length} ${picked.length === 1 ? 'school' : 'schools'} added`).then(() => { setPicked([]); setQuery(''); })}>{busy ? <Spinner data-icon="inline-start" /> : <PlusIcon data-icon="inline-start" />}Add {picked.length || ''} {picked.length === 1 ? 'school' : 'schools'}</Button>
    </div>}
    {listed.length > 0 && <ul className="phe-schools-list">{listed.map(s => {
      const items = itemsBySchool?.get(s.id) ?? 0;
      return <li key={s.id}><span><b>{s.name}</b><small>{[s.lga, s.level].filter(Boolean).join(' · ')}{itemsBySchool && <> · {items ? `${items.toLocaleString('en-NG')} ${items === 1 ? 'item' : 'items'}` : <em className="phe-schools-no-items">No items yet</em>}</>}</small></span>
        {!disabled && <Button size="icon-sm" variant="ghost" aria-label={`Remove ${s.name}`} disabled={busy} onClick={() => items ? setConfirm(s) : void send({ action: 'remove', schoolId: s.id }, 'School removed')}><XIcon /></Button>}</li>;
    })}</ul>}
    {footer}
    </CollapsibleContent>
    <AlertDialog open={confirm !== null} onOpenChange={next => { if (!next) setConfirm(null); }}>
      <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Remove {confirm?.name}?</AlertDialogTitle>
        <AlertDialogDescription>Its {(confirm && itemsBySchool?.get(confirm.id) || 0).toLocaleString('en-NG')} equipment items are taken back and can be shared with other schools</AlertDialogDescription></AlertDialogHeader>
        <AlertDialogFooter><AlertDialogCancel>Keep it</AlertDialogCancel><AlertDialogAction variant="destructive" onClick={() => { if (confirm) void send({ action: 'remove', schoolId: confirm.id }, 'School removed'); setConfirm(null); }}>Remove school</AlertDialogAction></AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </section></Collapsible>;
}
