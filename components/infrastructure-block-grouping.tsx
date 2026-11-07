'use client';
import { useState } from 'react';
import { BlocksIcon, PlusIcon, Trash2Icon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { blockGroupText, blockGroupingText, classroomBlockCounts, groupIntoBlocks, groupedCounts, hasBlockCounts, toBlockGroups, type BlockClassroomType, type BlockCounts, type BlockGroup, type BlockKind, type InfrastructureInput, type SchoolBasis } from '@/lib/infrastructure-model';

interface BlockGroupingProps {
  input: InfrastructureInput;
  school: SchoolBasis;
  disabled: boolean;
  onChange: (patch: Partial<InfrastructureInput>) => void;
}

const kindCopy: Record<BlockKind, { title: string; what: string }> = {
  construct: { title: 'New construction', what: 'Additional classrooms and toilets to build' },
  renovate: { title: 'Renovation', what: 'Non-functional classrooms to renovate' },
};
const typeLabels: Record<BlockClassroomType, string> = { primary: 'Primary/JSS', eccde: 'ECCDE' };
type NumberKey = 'count' | 'classrooms' | 'offices' | 'stores' | 'toilets';
type Draft = Record<NumberKey, string> & { classroomType: BlockClassroomType };
const whole = (value: string) => value.trim() !== '' && Number.isInteger(Number(value)) && Number(value) >= 0 ? Number(value) : null;
const plural = (n: number, one: string) => `${n} ${n === 1 ? one : `${one}s`}`;
const remaining = (need: BlockCounts, groups: BlockGroup[]): BlockCounts => {
  const done = groupedCounts(groups);
  return { classrooms: need.classrooms - done.classrooms, eccde: need.eccde - done.eccde, toilets: need.toilets - done.toilets };
};
const anyLeft = (left: BlockCounts) => left.classrooms > 0 || left.eccde > 0 || left.toilets > 0;

/** A new group starts with what is left: Primary/JSS blocks of 3, then ECCDE blocks of 2, then toilet blocks of 6, as many as fit. */
function freshDraft(left: BlockCounts): Draft {
  const fit = (n: number, per: number) => String(Math.max(1, Math.floor(n / per)));
  if (left.classrooms > 0) { const per = Math.min(3, left.classrooms); return { count: fit(left.classrooms, per), classrooms: String(per), offices: '1', stores: '1', toilets: '0', classroomType: 'primary' }; }
  if (left.eccde > 0) { const per = Math.min(2, left.eccde); return { count: fit(left.eccde, per), classrooms: String(per), offices: '0', stores: '0', toilets: '0', classroomType: 'eccde' }; }
  const per = Math.max(1, Math.min(6, left.toilets));
  return { count: fit(left.toilets, per), classrooms: '0', offices: '0', stores: '0', toilets: String(per), classroomType: 'primary' };
}

function draftProblems(draft: Draft, left: BlockCounts): Partial<Record<NumberKey, string>> {
  const count = whole(draft.count), classrooms = whole(draft.classrooms), offices = whole(draft.offices), stores = whole(draft.stores), toilets = whole(draft.toilets);
  const problems: Partial<Record<NumberKey, string>> = {
    ...(count === null || count < 1 ? { count: 'Enter at least 1 block' } : count > 100 ? { count: 'Use at most 100 blocks' } : {}),
    ...(classrooms === null ? { classrooms: 'Enter 0 or more' } : classrooms > 30 ? { classrooms: 'Use at most 30 classrooms per block' } : {}),
    ...(offices === null ? { offices: 'Enter 0 or more' } : offices > 10 ? { offices: 'Use at most 10' } : {}),
    ...(stores === null ? { stores: 'Enter 0 or more' } : stores > 10 ? { stores: 'Use at most 10' } : {}),
    ...(toilets === null ? { toilets: 'Enter 0 or more' } : toilets > 30 ? { toilets: 'Use at most 30 toilets per block' } : {}),
  };
  if (!problems.classrooms && !problems.toilets && classrooms === 0 && toilets === 0) problems.classrooms = 'A block needs at least 1 classroom or 1 toilet';
  if (problems.count || problems.classrooms || problems.toilets) return problems;
  const eccde = draft.classroomType === 'eccde', roomsLeft = eccde ? left.eccde : left.classrooms, rooms = count! * classrooms!, loos = count! * toilets!;
  const noun = eccde ? 'ECCDE classroom' : 'classroom';
  if (rooms > roomsLeft) problems.classrooms = roomsLeft > 0 ? `${plural(count!, 'block')} of ${classrooms} hold ${plural(rooms, noun)}; only ${roomsLeft} ${roomsLeft === 1 ? 'is' : 'are'} left` : `Every ${noun} is already in a block`;
  if (loos > left.toilets) problems.toilets = left.toilets > 0 ? `${plural(count!, 'block')} of ${toilets} hold ${plural(loos, 'toilet')}; only ${left.toilets} ${left.toilets === 1 ? 'is' : 'are'} left` : 'Every toilet is already in a block';
  return problems;
}

/** "12 of 24 classrooms · 2 of 2 ECCDE · 6 of 10 toilets", only for what the kind has. */
function progressText(need: BlockCounts, done: BlockCounts) {
  return [need.classrooms > 0 ? `${done.classrooms} of ${plural(need.classrooms, 'classroom')}` : '', need.eccde > 0 ? `${done.eccde} of ${need.eccde} ECCDE` : '', need.toilets > 0 ? `${done.toilets} of ${plural(need.toilets, 'toilet')}` : ''].filter(Boolean).join(' · ');
}
/** "4 classrooms, 2 toilets" for what is left (or too many). */
const countsText = (c: BlockCounts) => [c.classrooms ? plural(c.classrooms, 'classroom') : '', c.eccde ? plural(c.eccde, 'ECCDE classroom') : '', c.toilets ? plural(c.toilets, 'toilet') : ''].filter(Boolean).join(', ');

/**
 * UBEC171 (revised 7 November 2026, client: "classroom, office, store, toilet"): on the Whole School Gaps step, what is built
 * (Additional) and renovated (non-functional) is shared into groups of blocks of different sizes, added one group at a time
 * until everything is in a block. A group says how many blocks and what one block holds: classrooms (Primary/JSS or ECCDE),
 * offices, stores and toilets; a block of toilets alone is allowed. Every Primary/JSS classroom, ECCDE classroom and toilet
 * of a grouped kind must be in a block (offices and stores are free); Continue and Save package wait until they are.
 */
export function ClassroomBlockGrouping({ input, school, disabled, onChange }: BlockGroupingProps) {
  const counts = classroomBlockCounts(input, school);
  const [open, setOpen] = useState<BlockKind | null>(null);
  const [groups, setGroups] = useState<BlockGroup[]>([]);
  const [draft, setDraft] = useState<Draft>(freshDraft({ classrooms: 3, eccde: 0, toilets: 0 }));
  const [tried, setTried] = useState(false);
  const kinds = (['construct', 'renovate'] as const).filter(kind => hasBlockCounts(counts[kind]));
  if (!kinds.length) return null;

  const need = open ? counts[open] : { classrooms: 0, eccde: 0, toilets: 0 };
  const done = groupedCounts(groups), left = remaining(need, groups);
  const total = need.classrooms + need.eccde + need.toilets, placed = Math.min(done.classrooms, need.classrooms) + Math.min(done.eccde, need.eccde) + Math.min(done.toilets, need.toilets);
  const over = { classrooms: Math.max(0, -left.classrooms), eccde: Math.max(0, -left.eccde), toilets: Math.max(0, -left.toilets) };
  const problems = draftProblems(draft, left);
  const begin = (kind: BlockKind) => {
    const stored = toBlockGroups(counts[kind].classrooms, input.blocks?.[kind]);
    setGroups(stored); setDraft(freshDraft(remaining(counts[kind], stored))); setTried(false); setOpen(kind);
  };
  const store = (kind: BlockKind, next: BlockGroup[]) => {
    const rest = Object.fromEntries(Object.entries(input.blocks ?? {}).filter(([k]) => k !== kind));
    onChange({ blocks: next.length ? { ...rest, [kind]: next } : rest });
  };
  const update = (next: BlockGroup[]) => { setGroups(next); setDraft(freshDraft(remaining(need, next))); setTried(false); };
  function addGroup() {
    setTried(true);
    if (Object.keys(problems).length) return;
    const classrooms = Number(draft.classrooms);
    update([...groups, { count: Number(draft.count), classrooms, offices: Number(draft.offices), stores: Number(draft.stores), toilets: Number(draft.toilets), classroomType: classrooms > 0 ? draft.classroomType : 'primary' }]);
  }
  function save() { if (open) store(open, groups); setOpen(null); }

  const numberField = (key: NumberKey, label: string) => <Field data-invalid={tried && problems[key] ? true : undefined}>
    <FieldLabel htmlFor={'block-' + key}>{label}<span className="text-destructive" aria-hidden="true">*</span></FieldLabel>
    <Input id={'block-' + key} type="number" inputMode="numeric" min={key === 'count' ? 1 : 0} step={1} required aria-required="true" aria-invalid={tried && problems[key] ? true : undefined}
      value={draft[key]} onChange={e => setDraft(d => ({ ...d, [key]: e.target.value }))} />
    {tried && problems[key] && <FieldError>{problems[key]}</FieldError>}
  </Field>;
  // The classroom type is asked only when the kind has ECCDE classrooms (otherwise every classroom is Primary/JSS).
  const showType = need.eccde > 0;
  // Only what the kind has: renovation has no toilets (they are not civil works), and a kind may have toilets alone.
  const showRooms = need.classrooms + need.eccde > 0, showToilets = need.toilets > 0;

  return <section className="infra-block-grouping flex flex-col gap-3" aria-labelledby="infra-block-grouping-heading">
    <div className="flex flex-col gap-1">
      <h3 id="infra-block-grouping-heading" className="flex items-center gap-2 font-semibold"><BlocksIcon aria-hidden="true" className="size-4" />Group by block</h3>
      <p className="text-sm text-muted-foreground">Add groups of blocks, of any size, until every classroom and toilet is in a block. A block can hold classrooms, offices, stores and toilets, or toilets on their own</p>
    </div>
    {kinds.map(kind => {
      const grouping = groupIntoBlocks(counts[kind], input.blocks?.[kind]);
      const off = grouping ? { short: { classrooms: Math.max(0, grouping.left.classrooms), eccde: Math.max(0, grouping.left.eccde), toilets: Math.max(0, grouping.left.toilets) }, extra: { classrooms: Math.max(0, -grouping.left.classrooms), eccde: Math.max(0, -grouping.left.eccde), toilets: Math.max(0, -grouping.left.toilets) } } : null;
      const unfinished = !!off && (anyLeft(off.short) || anyLeft(off.extra));
      return <div key={kind} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3" data-kind={kind} data-unfinished={unfinished || undefined}>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{kindCopy[kind].title}</span>
            <Badge variant="secondary" className="h-auto max-w-full whitespace-normal">{countsText(counts[kind])}</Badge>
            {grouping && <Badge variant={unfinished ? 'destructive' : 'outline'} className="h-auto max-w-full whitespace-normal">{progressText(counts[kind], grouping.grouped)}</Badge>}
          </div>
          <p className="text-sm text-muted-foreground">{grouping ? blockGroupingText(grouping) : `${kindCopy[kind].what}: not grouped by block`}</p>
          {off && anyLeft(off.short) && <p className="text-sm text-destructive">Put the other {countsText(off.short)} into blocks before continuing</p>}
          {off && !anyLeft(off.short) && anyLeft(off.extra) && <p className="text-sm text-destructive">The blocks hold {countsText(off.extra)} too many. Remove or change a group</p>}
        </div>
        <div className="flex gap-2">
          {grouping && <Button variant="ghost" size="sm" className="action-remove" disabled={disabled} onClick={() => store(kind, [])}>Remove</Button>}
          <Button variant="outline" size="sm" disabled={disabled} onClick={() => begin(kind)}>{grouping ? 'Change' : 'Group by block'}</Button>
        </div>
      </div>;
    })}
    <Dialog open={!!open} onOpenChange={value => { if (!value) setOpen(null); }}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Group by block · {open ? kindCopy[open].title : ''}</DialogTitle>
          <DialogDescription>{open ? `${kindCopy[open].what}: ${countsText(need)}. Add groups of blocks until each is in a block` : ''}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2" aria-live="polite">
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm"><span>{progressText(need, done)}</span><span className={!anyLeft(left) && !anyLeft(over) ? 'text-muted-foreground' : 'font-medium text-destructive'}>{anyLeft(over) ? `${countsText(over)} too many` : anyLeft(left) ? `${countsText(left)} left` : 'All grouped'}</span></div>
          <Progress value={total ? Math.min(100, (placed / total) * 100) : 0} aria-label="Classrooms and toilets in blocks" />
        </div>
        {groups.length > 0 && <ul className="flex flex-col divide-y rounded-lg border">
          {groups.map((group, index) => <li key={index} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
            <span>{blockGroupText(group)}{group.classrooms > 0 && group.count > 1 && <span className="text-muted-foreground"> · {plural(group.count * group.classrooms, group.classroomType === 'eccde' ? 'ECCDE classroom' : 'classroom')}</span>}{group.toilets > 0 && group.count > 1 && <span className="text-muted-foreground"> · {plural(group.count * group.toilets, 'toilet')}</span>}</span>
            <Button variant="ghost" size="icon-sm" aria-label={`Remove ${blockGroupText(group)}`} onClick={() => update(groups.filter((_, i) => i !== index))}><Trash2Icon /></Button>
          </li>)}
        </ul>}
        {anyLeft(left) && <form id="infra-block-form" noValidate className="rounded-lg border bg-muted/40 p-3" onSubmit={e => { e.preventDefault(); addGroup(); }}>
          <FieldGroup>
            <p className="text-sm text-muted-foreground">How many blocks, and what one block has</p>
            {showType && showRooms && <Field className="sm:max-w-60">
              <FieldLabel htmlFor="block-classroomType">Classroom type</FieldLabel>
              <Select value={draft.classroomType} onValueChange={value => setDraft(d => ({ ...d, classroomType: value as BlockClassroomType }))}>
                <SelectTrigger id="block-classroomType" className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent><SelectGroup>{(['primary', 'eccde'] as const).map(type => <SelectItem key={type} value={type}>{typeLabels[type]}</SelectItem>)}</SelectGroup></SelectContent>
              </Select>
            </Field>}
            <div className={`grid grid-cols-2 gap-3 ${showRooms && showToilets ? 'sm:grid-cols-5' : 'sm:grid-cols-4'}`}>
              {numberField('count', 'Blocks')}
              {showRooms && numberField('classrooms', 'Classrooms')}
              {numberField('offices', 'Offices')}
              {numberField('stores', 'Stores')}
              {showToilets && numberField('toilets', 'Toilets')}
            </div>
            <Button type="submit" variant="secondary" className="self-start"><PlusIcon data-icon="inline-start" />Add blocks</Button>
          </FieldGroup>
        </form>}
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(null)}>Cancel</Button>
          <Button onClick={save}>{groups.length ? 'Save grouping' : 'Save without blocks'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </section>;
}
