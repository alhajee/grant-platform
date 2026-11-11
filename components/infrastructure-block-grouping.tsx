'use client';
import { useState } from 'react';
import { BlocksIcon, PencilIcon, PlusIcon, SaveIcon, Trash2Icon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldLegend, FieldSet } from '@/components/ui/field';
import { blockFacilityCounts, blockFacilityKeys, blockRoomCounts, blockGroupText, classroomBlockCounts, deliverableInfo, facilityText, groupIntoBlocks, groupedCounts, groupedFacilities, hasBlockCounts, toBlockGroups, type BlockClassroomType, type BlockCounts, type BlockFacility, type BlockGroup, type BlockKind, type InfrastructureInput, type SchoolBasis } from '@/lib/infrastructure-model';

interface BlockGroupingProps {
  input: InfrastructureInput;
  school: SchoolBasis;
  disabled: boolean;
  onChange: (patch: Partial<InfrastructureInput>) => void;
}

type FacilityCounts = Partial<Record<BlockFacility, number>>;
/** Offices and stores still free to put in blocks (UBEC252: limited to the audit). */
type RoomsLeft = { offices: number; stores: number };
const roomsLeftOf = (limit: RoomsLeft, groups: BlockGroup[]): RoomsLeft => ({ offices: limit.offices - groups.reduce((t, g) => t + g.count * g.offices, 0), stores: limit.stores - groups.reduce((t, g) => t + g.count * g.stores, 0) });
const kindCopy: Record<BlockKind, { title: string; what: string }> = {
  construct: { title: 'New construction', what: 'Additional classrooms and toilets to build' },
  renovate: { title: 'Renovation', what: 'Non-functional classrooms to renovate' },
};
const typeLabels: Record<BlockClassroomType, string> = { primary: 'Primary/JSS', eccde: 'ECCDE' };
type NumberKey = 'count' | 'classrooms' | 'offices' | 'stores' | 'toilets';
type Draft = Record<NumberKey, string> & { classroomType: BlockClassroomType; facilities: Partial<Record<BlockFacility, string>> };
type Problems = Partial<Record<NumberKey | BlockFacility, string>>;
const whole = (value: string | undefined) => value !== undefined && value.trim() !== '' && Number.isInteger(Number(value)) && Number(value) >= 0 ? Number(value) : null;
const plural = (n: number, one: string) => `${n} ${n === 1 ? one : `${one}s`}`;
const remaining = (need: BlockCounts, groups: BlockGroup[]): BlockCounts => {
  const done = groupedCounts(groups);
  return { classrooms: need.classrooms - done.classrooms, eccde: need.eccde - done.eccde, toilets: need.toilets - done.toilets };
};
const facilitiesLeft = (available: FacilityCounts, groups: BlockGroup[]): FacilityCounts => {
  const held = groupedFacilities(groups);
  return Object.fromEntries(blockFacilityKeys.filter(key => available[key] !== undefined || (held[key] ?? 0) > 0).map(key => [key, (available[key] ?? 0) - (held[key] ?? 0)]));
};
const anyLeft = (left: BlockCounts) => left.classrooms > 0 || left.eccde > 0 || left.toilets > 0;
const anyFacilityLeft = (left: FacilityCounts) => Object.values(left).some(n => (n ?? 0) > 0);
const facilityLabel = (key: BlockFacility) => deliverableInfo(key)?.label ?? key;

/** A new group starts with what is left: Primary/JSS blocks of 3, then ECCDE blocks of 2, then toilet blocks of 6, as many as fit; with only facilities left, one block of them. */
function freshDraft(left: BlockCounts, facilities: FacilityCounts, free: RoomsLeft = { offices: 0, stores: 0 }): Draft {
  const fit = (n: number, per: number) => String(Math.max(1, Math.floor(n / per)));
  // One office and one store per block when the audit has enough for every block, else none.
  const each = (free: number, blocks: string) => String(free >= Number(blocks) ? 1 : 0);
  const none = { facilities: {} };
  if (left.classrooms > 0) { const per = Math.min(3, left.classrooms), count = fit(left.classrooms, per); return { ...none, count, classrooms: String(per), offices: each(free.offices, count), stores: each(free.stores, count), toilets: '0', classroomType: 'primary' }; }
  if (left.eccde > 0) { const per = Math.min(2, left.eccde); return { ...none, count: fit(left.eccde, per), classrooms: String(per), offices: '0', stores: '0', toilets: '0', classroomType: 'eccde' }; }
  if (left.toilets > 0) { const per = Math.min(6, left.toilets); return { ...none, count: fit(left.toilets, per), classrooms: '0', offices: '0', stores: '0', toilets: String(per), classroomType: 'primary' }; }
  const rooms = Object.fromEntries(Object.entries(facilities).filter(([, n]) => (n ?? 0) > 0).map(([key, n]) => [key, String(n)]));
  return { facilities: rooms, count: '1', classrooms: '0', offices: '0', stores: '0', toilets: '0', classroomType: 'primary' };
}
/** A saved group loaded into the form for editing. */
const groupDraft = (g: BlockGroup): Draft => ({
  count: String(g.count), classrooms: String(g.classrooms), offices: String(g.offices), stores: String(g.stores), toilets: String(g.toilets), classroomType: g.classroomType,
  facilities: Object.fromEntries(Object.entries(g.facilities ?? {}).map(([key, n]) => [key, String(n)])),
});

function draftProblems(draft: Draft, left: BlockCounts, roomsLeft: FacilityCounts, officesLeft: RoomsLeft): Problems {
  const count = whole(draft.count), classrooms = whole(draft.classrooms), offices = whole(draft.offices), stores = whole(draft.stores), toilets = whole(draft.toilets);
  const problems: Problems = {
    ...(count === null || count < 1 ? { count: 'Enter at least 1 block' } : count > 100 ? { count: 'Use at most 100 blocks' } : {}),
    ...(classrooms === null ? { classrooms: 'Enter 0 or more' } : classrooms > 30 ? { classrooms: 'Use at most 30 classrooms per block' } : {}),
    ...(offices === null ? { offices: 'Enter 0 or more' } : offices > 10 ? { offices: 'Use at most 10' } : {}),
    ...(stores === null ? { stores: 'Enter 0 or more' } : stores > 10 ? { stores: 'Use at most 10' } : {}),
    ...(toilets === null ? { toilets: 'Enter 0 or more' } : toilets > 30 ? { toilets: 'Use at most 30 toilets per block' } : {}),
  };
  for (const [key, one] of [['offices', 'office'], ['stores', 'store']] as const) {
    const n = key === 'offices' ? offices : stores, max = officesLeft[key];
    if (problems[key] || n === null || count === null || count < 1 || count * n <= max) continue;
    problems[key] = max > 0 ? `${plural(count, 'block')} of ${n} hold ${plural(count * n, one)}; only ${max} ${max === 1 ? 'is' : 'are'} left` : `No ${one}s are left in the audit`;
  }
  let rooms = 0;
  for (const key of Object.keys(roomsLeft) as BlockFacility[]) {
    const n = whole(draft.facilities[key] ?? '0'), max = roomsLeft[key] ?? 0;
    if (n === null) { problems[key] = 'Enter 0 or more'; continue; }
    if (n > 10) { problems[key] = 'Use at most 10'; continue; }
    rooms += n;
    if (count !== null && count >= 1 && count * n > max) problems[key] = max > 0 ? `${plural(count, 'block')} of ${n} hold ${facilityText(key, count * n)}; only ${max} ${max === 1 ? 'is' : 'are'} left` : 'Every one is already in a block';
  }
  if (!problems.classrooms && !problems.toilets && classrooms === 0 && toilets === 0 && rooms === 0) problems.classrooms = 'A block needs at least 1 classroom, toilet or other facility';
  if (problems.count || problems.classrooms || problems.toilets) return problems;
  const eccde = draft.classroomType === 'eccde', classroomsLeft = eccde ? left.eccde : left.classrooms, inRooms = count! * classrooms!, loos = count! * toilets!;
  const noun = eccde ? 'ECCDE classroom' : 'classroom';
  if (inRooms > classroomsLeft) problems.classrooms = classroomsLeft > 0 ? `${plural(count!, 'block')} of ${classrooms} hold ${plural(inRooms, noun)}; only ${classroomsLeft} ${classroomsLeft === 1 ? 'is' : 'are'} left` : `Every ${noun} is already in a block`;
  if (loos > left.toilets) problems.toilets = left.toilets > 0 ? `${plural(count!, 'block')} of ${toilets} hold ${plural(loos, 'toilet')}; only ${left.toilets} ${left.toilets === 1 ? 'is' : 'are'} left` : 'Every toilet is already in a block';
  return problems;
}

/** "12 of 24 classrooms · 2 of 2 ECCDE · 6 of 10 toilets", only for what the kind has. */
function progressText(need: BlockCounts, done: BlockCounts) {
  return [need.classrooms > 0 ? `${done.classrooms} of ${plural(need.classrooms, 'classroom')}` : '', need.eccde > 0 ? `${done.eccde} of ${need.eccde} ECCDE` : '', need.toilets > 0 ? `${done.toilets} of ${plural(need.toilets, 'toilet')}` : ''].filter(Boolean).join(' · ');
}
/** "4 classrooms, 2 toilets" for what is left (or too many). */
const countsText = (c: BlockCounts) => [c.classrooms ? plural(c.classrooms, 'classroom') : '', c.eccde ? plural(c.eccde, 'ECCDE classroom') : '', c.toilets ? plural(c.toilets, 'toilet') : ''].filter(Boolean).join(', ');
/** What a group holds in all, after its make-up ("· 6 classrooms · 2 staff rooms"), when there is more than one block. */
function groupTotals(group: BlockGroup) {
  if (group.count < 2) return '';
  const parts = [group.classrooms > 0 ? plural(group.count * group.classrooms, group.classroomType === 'eccde' ? 'ECCDE classroom' : 'classroom') : '', group.toilets > 0 ? plural(group.count * group.toilets, 'toilet') : '',
    ...Object.entries(groupedFacilities([group])).map(([key, n]) => facilityText(key as BlockFacility, n ?? 0))].filter(Boolean);
  return parts.length ? ` · ${parts.join(' · ')}` : '';
}

/**
 * UBEC171 (revised 7 November 2026, client: "classroom, office, store, toilet"): on the Whole School Gaps step, what is built
 * (Additional) and renovated (non-functional) is shared into groups of blocks of different sizes, added one group at a time
 * until everything is in a block. A group says how many blocks and what one block holds: classrooms (Primary/JSS or ECCDE),
 * offices, stores, toilets and (UBEC252) other facilities such as staff rooms, laboratories and the library; a block of toilets
 * alone is allowed. Every Primary/JSS classroom, ECCDE classroom and toilet of a grouped kind must be in a block (offices, stores
 * and other facilities are optional, never more than the audit has); Continue and Save package wait until they are. UBEC252: a
 * group is edited in place (pencil) without removing it, here and on the Gaps step.
 */
export function ClassroomBlockGrouping({ input, school, disabled, onChange }: BlockGroupingProps) {
  const counts = classroomBlockCounts(input, school), facilityCounts = blockFacilityCounts(input, school);
  const [open, setOpen] = useState<BlockKind | null>(null);
  const [groups, setGroups] = useState<BlockGroup[]>([]);
  const [editing, setEditing] = useState<number | null>(null);
  const [draft, setDraft] = useState<Draft>(freshDraft({ classrooms: 3, eccde: 0, toilets: 0 }, {}));
  const [tried, setTried] = useState(false);
  const kinds = (['construct', 'renovate'] as const).filter(kind => hasBlockCounts(counts[kind]));
  if (!kinds.length) return null;

  const need = open ? counts[open] : { classrooms: 0, eccde: 0, toilets: 0 };
  const available = open ? facilityCounts[open] : {};
  // While a group is edited, what is left counts every other group, so the edited group can take back what it holds.
  const others = editing === null ? groups : groups.filter((_, i) => i !== editing);
  const done = groupedCounts(groups), left = remaining(need, groups), formLeft = remaining(need, others);
  const roomsLeft = facilitiesLeft(available, others);
  const roomLimit = open ? blockRoomCounts(input, school)[open] : { offices: 0, stores: 0 }, officesLeft = roomsLeftOf(roomLimit, others);
  const total = need.classrooms + need.eccde + need.toilets, placed = Math.min(done.classrooms, need.classrooms) + Math.min(done.eccde, need.eccde) + Math.min(done.toilets, need.toilets);
  const over = { classrooms: Math.max(0, -left.classrooms), eccde: Math.max(0, -left.eccde), toilets: Math.max(0, -left.toilets) };
  const problems = draftProblems(draft, formLeft, roomsLeft, officesLeft);
  const kindGroups = (kind: BlockKind) => toBlockGroups(counts[kind].classrooms, input.blocks?.[kind]);
  const begin = (kind: BlockKind, edit: number | null = null) => {
    const stored = kindGroups(kind);
    setGroups(stored); setEditing(edit); setTried(false); setOpen(kind);
    setDraft(edit === null ? freshDraft(remaining(counts[kind], stored), facilitiesLeft(facilityCounts[kind], stored), roomsLeftOf(blockRoomCounts(input, school)[kind], stored)) : groupDraft(stored[edit]));
  };
  const store = (kind: BlockKind, next: BlockGroup[]) => {
    const rest = Object.fromEntries(Object.entries(input.blocks ?? {}).filter(([k]) => k !== kind));
    onChange({ blocks: next.length ? { ...rest, [kind]: next } : rest });
  };
  const update = (next: BlockGroup[]) => { setGroups(next); setEditing(null); setDraft(freshDraft(remaining(need, next), facilitiesLeft(available, next), roomsLeftOf(roomLimit, next))); setTried(false); };
  function draftGroup(): BlockGroup {
    const classrooms = Number(draft.classrooms);
    const facilities = Object.fromEntries(Object.keys(roomsLeft).map(key => [key, whole(draft.facilities[key as BlockFacility] ?? '0') ?? 0]).filter(([, n]) => Number(n) > 0));
    return { count: Number(draft.count), classrooms, offices: Number(draft.offices), stores: Number(draft.stores), toilets: Number(draft.toilets), classroomType: classrooms > 0 ? draft.classroomType : 'primary', ...(Object.keys(facilities).length ? { facilities } : {}) };
  }
  function submitGroup() {
    setTried(true);
    if (Object.keys(problems).length) return;
    const group = draftGroup();
    // Editing replaces the group where it is, so the list keeps its order.
    update(editing === null ? [...groups, group] : groups.map((g, i) => i === editing ? group : g));
  }
  function cancelEdit() { setEditing(null); setTried(false); setDraft(freshDraft(left, facilitiesLeft(available, groups), roomsLeftOf(roomLimit, groups))); }
  function removeGroup(index: number) {
    const next = groups.filter((_, i) => i !== index);
    if (editing === index) { update(next); return; }
    setGroups(next);
    if (editing !== null && index < editing) setEditing(editing - 1);
  }
  function save() { if (open) store(open, groups); setOpen(null); setEditing(null); }

  const numberField = (key: NumberKey, label: string) => <Field data-invalid={tried && problems[key] ? true : undefined}>
    <FieldLabel htmlFor={'block-' + key}>{label}<span className="text-destructive" aria-hidden="true">*</span></FieldLabel>
    <Input id={'block-' + key} type="number" inputMode="numeric" min={key === 'count' ? 1 : 0} step={1} required aria-required="true" aria-invalid={tried && problems[key] ? true : undefined}
      value={draft[key]} onChange={e => setDraft(d => ({ ...d, [key]: e.target.value }))} />
    {(key === 'offices' || key === 'stores') && <FieldDescription>{Math.max(0, officesLeft[key])} left</FieldDescription>}
    {tried && problems[key] && <FieldError>{problems[key]}</FieldError>}
  </Field>;
  // The classroom type is asked only when the kind has ECCDE classrooms (otherwise every classroom is Primary/JSS).
  const showType = need.eccde > 0;
  // Only what the kind has (renovation has toilets only when some are non-functional), and a kind may have toilets alone.
  const showRooms = need.classrooms + need.eccde > 0, showToilets = need.toilets > 0;
  const facilityKeys = Object.keys(roomsLeft) as BlockFacility[];
  const showForm = editing !== null || anyLeft(left) || anyFacilityLeft(facilitiesLeft(available, groups));

  return <section className="infra-block-grouping flex flex-col gap-3" aria-labelledby="infra-block-grouping-heading">
    <div className="flex flex-col gap-1">
      <h3 id="infra-block-grouping-heading" className="flex items-center gap-2 font-semibold"><BlocksIcon aria-hidden="true" className="size-4" />Group by block</h3>
      <p className="text-sm text-muted-foreground">Add groups of blocks, of any size, until every classroom and toilet is in a block. A block can hold classrooms, offices, stores, toilets and other facilities such as a staff room, library or laboratory</p>
    </div>
    {kinds.map(kind => {
      const grouping = groupIntoBlocks(counts[kind], input.blocks?.[kind]);
      const off = grouping ? { short: { classrooms: Math.max(0, grouping.left.classrooms), eccde: Math.max(0, grouping.left.eccde), toilets: Math.max(0, grouping.left.toilets) }, extra: { classrooms: Math.max(0, -grouping.left.classrooms), eccde: Math.max(0, -grouping.left.eccde), toilets: Math.max(0, -grouping.left.toilets) } } : null;
      const unfinished = !!off && (anyLeft(off.short) || anyLeft(off.extra));
      const saved = grouping?.groups ?? [];
      const removeSaved = (index: number) => store(kind, saved.filter((_, i) => i !== index));
      return <div key={kind} className="flex flex-col gap-2 rounded-lg border p-3" data-kind={kind} data-unfinished={unfinished || undefined}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{kindCopy[kind].title}</span>
              <Badge variant="secondary" className="h-auto max-w-full whitespace-normal">{countsText(counts[kind])}</Badge>
              {grouping && <Badge variant={unfinished ? 'destructive' : 'outline'} className="h-auto max-w-full whitespace-normal">{progressText(counts[kind], grouping.grouped)}</Badge>}
            </div>
            {!grouping && <p className="text-sm text-muted-foreground">{kindCopy[kind].what}: not grouped by block</p>}
          </div>
          <div className="flex gap-2">
            {grouping && <Button variant="ghost" size="sm" className="action-remove" disabled={disabled} onClick={() => store(kind, [])}>Remove all</Button>}
            <Button variant="outline" size="sm" disabled={disabled} onClick={() => begin(kind)}>{grouping ? 'Add or change' : 'Group by block'}</Button>
          </div>
        </div>
        {saved.length > 0 && <ul className="flex flex-col divide-y rounded-md border bg-muted/30" aria-label={`${kindCopy[kind].title} groups of blocks`}>
          {saved.map((group, index) => <li key={index} className="flex items-center justify-between gap-2 px-3 py-1.5 text-sm">
            <span>{blockGroupText(group)}<span className="text-muted-foreground">{groupTotals(group)}</span></span>
            <span className="flex shrink-0 gap-1">
              <Button variant="ghost" size="icon-sm" disabled={disabled} aria-label={`Edit ${blockGroupText(group)}`} title="Edit" onClick={() => begin(kind, index)}><PencilIcon /></Button>
              <Button variant="ghost" size="icon-sm" disabled={disabled} aria-label={`Remove ${blockGroupText(group)}`} onClick={() => removeSaved(index)}><Trash2Icon /></Button>
            </span>
          </li>)}
        </ul>}
        {off && anyLeft(off.short) && <p className="text-sm text-destructive">Put the other {countsText(off.short)} into blocks before continuing</p>}
        {off && !anyLeft(off.short) && anyLeft(off.extra) && <p className="text-sm text-destructive">The blocks hold {countsText(off.extra)} too many. Remove or change a group</p>}
      </div>;
    })}
    <Dialog open={!!open} onOpenChange={value => { if (!value) { setOpen(null); setEditing(null); } }}>
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
          {groups.map((group, index) => <li key={index} className="flex items-center justify-between gap-3 px-3 py-2 text-sm" data-editing={editing === index || undefined} aria-current={editing === index || undefined}>
            <span className={editing === index ? 'font-medium' : undefined}>{blockGroupText(group)}<span className="text-muted-foreground">{groupTotals(group)}</span>{editing === index && <Badge variant="outline" className="ml-2">Editing</Badge>}</span>
            <span className="flex shrink-0 gap-1">
              <Button variant="ghost" size="icon-sm" aria-label={`Edit ${blockGroupText(group)}`} title="Edit" aria-pressed={editing === index} onClick={() => { setEditing(index); setTried(false); setDraft(groupDraft(group)); }}><PencilIcon /></Button>
              <Button variant="ghost" size="icon-sm" aria-label={`Remove ${blockGroupText(group)}`} onClick={() => removeGroup(index)}><Trash2Icon /></Button>
            </span>
          </li>)}
        </ul>}
        {showForm && <form id="infra-block-form" noValidate className="rounded-lg border bg-muted/40 p-3" onSubmit={e => { e.preventDefault(); submitGroup(); }}>
          <FieldGroup>
            <p className="text-sm text-muted-foreground">{editing === null ? 'How many blocks, and what one block has' : `Editing ${blockGroupText(groups[editing])}`}</p>
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
            {facilityKeys.length > 0 && <FieldSet className="gap-3">
              <FieldLegend variant="label">Other facilities in one block</FieldLegend>
              <FieldDescription>Rooms from the audit built as part of a block. What a block holds comes off its own row</FieldDescription>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {facilityKeys.map(key => <Field key={key} data-invalid={tried && problems[key] ? true : undefined}>
                  <FieldLabel htmlFor={'block-facility-' + key}>{facilityLabel(key)}</FieldLabel>
                  <Input id={'block-facility-' + key} type="number" inputMode="numeric" min={0} max={10} step={1} aria-invalid={tried && problems[key] ? true : undefined}
                    aria-describedby={'block-facility-left-' + key} value={draft.facilities[key] ?? '0'} onChange={e => setDraft(d => ({ ...d, facilities: { ...d.facilities, [key]: e.target.value } }))} />
                  <FieldDescription id={'block-facility-left-' + key}>{Math.max(0, roomsLeft[key] ?? 0)} left</FieldDescription>
                  {tried && problems[key] && <FieldError>{problems[key]}</FieldError>}
                </Field>)}
              </div>
            </FieldSet>}
            <div className="flex flex-wrap gap-2">
              <Button type="submit" variant="secondary">{editing === null ? <><PlusIcon data-icon="inline-start" />Add blocks</> : <><SaveIcon data-icon="inline-start" />Update blocks</>}</Button>
              {editing !== null && <Button type="button" variant="ghost" onClick={cancelEdit}>Cancel edit</Button>}
            </div>
          </FieldGroup>
        </form>}
        <DialogFooter>
          <Button variant="outline" onClick={() => { setOpen(null); setEditing(null); }}>Cancel</Button>
          <Button onClick={save} disabled={editing !== null} title={editing !== null ? 'Update or cancel the group you are editing first' : undefined}>{groups.length ? 'Save grouping' : 'Save without blocks'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </section>;
}
