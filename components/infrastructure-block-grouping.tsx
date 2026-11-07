'use client';
import { useState } from 'react';
import { BlocksIcon, PlusIcon, Trash2Icon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { blockGroupText, blockGroupingText, classroomBlockCounts, groupIntoBlocks, toBlockGroups, type BlockGroup, type BlockKind, type InfrastructureInput, type SchoolBasis } from '@/lib/infrastructure-model';

interface BlockGroupingProps {
  input: InfrastructureInput;
  school: SchoolBasis;
  disabled: boolean;
  onChange: (patch: Partial<InfrastructureInput>) => void;
}

const kindCopy: Record<BlockKind, { title: string; what: string; verb: string }> = {
  construct: { title: 'New construction', what: 'Additional classrooms to build', verb: 'build' },
  renovate: { title: 'Renovation', what: 'Non-functional classrooms to renovate', verb: 'renovate' },
};
type Draft = { count: string; classrooms: string; offices: string; stores: string };
const whole = (value: string) => value.trim() !== '' && Number.isInteger(Number(value)) && Number(value) >= 0 ? Number(value) : null;
const plural = (n: number, one: string) => `${n} ${n === 1 ? one : `${one}s`}`;
const groupedIn = (groups: BlockGroup[]) => groups.reduce((total, g) => total + g.count * g.classrooms, 0);

/** A new group starts with blocks of 3 (or fewer when fewer are left), as many as fit. */
function freshDraft(left: number): Draft {
  const classrooms = Math.max(1, Math.min(3, left));
  return { count: String(Math.max(1, Math.floor(left / classrooms))), classrooms: String(classrooms), offices: '1', stores: '1' };
}

function draftProblems(draft: Draft, left: number): Partial<Record<keyof Draft, string>> {
  const count = whole(draft.count), classrooms = whole(draft.classrooms), offices = whole(draft.offices), stores = whole(draft.stores);
  const problems: Partial<Record<keyof Draft, string>> = {
    ...(count === null || count < 1 ? { count: 'Enter at least 1 block' } : count > 100 ? { count: 'Use at most 100 blocks' } : {}),
    ...(classrooms === null || classrooms < 1 ? { classrooms: 'Enter at least 1 classroom per block' } : classrooms > 30 ? { classrooms: 'Use at most 30 classrooms per block' } : {}),
    ...(offices === null ? { offices: 'Enter 0 or more' } : offices > 10 ? { offices: 'Use at most 10' } : {}),
    ...(stores === null ? { stores: 'Enter 0 or more' } : stores > 10 ? { stores: 'Use at most 10' } : {}),
  };
  if (!problems.count && !problems.classrooms && count! * classrooms! > left) problems.count = left > 0 ? `${plural(count!, 'block')} of ${classrooms} hold ${count! * classrooms!} classrooms; only ${left} ${left === 1 ? 'is' : 'are'} left` : 'Every classroom is already in a block';
  return problems;
}

/**
 * UBEC171 (revised 7 November 2026, client: "some blocks will be three classrooms, some four, some six"): on the Whole School
 * Gaps step, the Primary/JSS classrooms to build (Additional) and to renovate (non-functional) are each shared into groups of
 * blocks of different sizes, added one group at a time until every classroom is in a block (like sharing TLM items out to
 * schools). Each group says how many blocks, and the classrooms, offices and stores of one block. Continue and Save package
 * wait until a grouped kind has all its classrooms in blocks. A kind with no classrooms is not offered.
 */
export function ClassroomBlockGrouping({ input, school, disabled, onChange }: BlockGroupingProps) {
  const counts = classroomBlockCounts(input, school);
  const [open, setOpen] = useState<BlockKind | null>(null);
  const [groups, setGroups] = useState<BlockGroup[]>([]);
  const [draft, setDraft] = useState<Draft>(freshDraft(3));
  const [tried, setTried] = useState(false);
  const kinds = (['construct', 'renovate'] as const).filter(kind => counts[kind] > 0);
  if (!kinds.length) return null;

  const total = open ? counts[open] : 0, grouped = groupedIn(groups), left = total - grouped;
  const problems = draftProblems(draft, left);
  const begin = (kind: BlockKind) => {
    const stored = toBlockGroups(counts[kind], input.blocks?.[kind]);
    setGroups(stored); setDraft(freshDraft(counts[kind] - groupedIn(stored))); setTried(false); setOpen(kind);
  };
  const store = (kind: BlockKind, next: BlockGroup[]) => {
    const rest = Object.fromEntries(Object.entries(input.blocks ?? {}).filter(([k]) => k !== kind));
    onChange({ blocks: next.length ? { ...rest, [kind]: next } : rest });
  };
  function addGroup() {
    setTried(true);
    if (Object.keys(problems).length) return;
    const group: BlockGroup = { count: Number(draft.count), classrooms: Number(draft.classrooms), offices: Number(draft.offices), stores: Number(draft.stores) };
    const next = [...groups, group];
    setGroups(next); setDraft(freshDraft(total - groupedIn(next))); setTried(false);
  }
  function removeGroup(index: number) {
    const next = groups.filter((_, i) => i !== index);
    setGroups(next); setDraft(freshDraft(total - groupedIn(next))); setTried(false);
  }
  function save() { if (open) store(open, groups); setOpen(null); }

  const numberField = (key: keyof Draft, label: string) => <Field data-invalid={tried && problems[key] ? true : undefined}>
    <FieldLabel htmlFor={'block-' + key}>{label}<span className="text-destructive" aria-hidden="true">*</span></FieldLabel>
    <Input id={'block-' + key} type="number" inputMode="numeric" min={key === 'count' || key === 'classrooms' ? 1 : 0} step={1} required aria-required="true" aria-invalid={tried && problems[key] ? true : undefined}
      value={draft[key]} disabled={left <= 0} onChange={e => setDraft(d => ({ ...d, [key]: e.target.value }))} />
    {tried && problems[key] && <FieldError>{problems[key]}</FieldError>}
  </Field>;

  return <section className="infra-block-grouping flex flex-col gap-3" aria-labelledby="infra-block-grouping-heading">
    <div className="flex flex-col gap-1">
      <h3 id="infra-block-grouping-heading" className="flex items-center gap-2 font-semibold"><BlocksIcon aria-hidden="true" className="size-4" />Group classrooms by block</h3>
      <p className="text-sm text-muted-foreground">Add groups of blocks, of any size, until every classroom is in a block. The blocks are shown in the costing</p>
    </div>
    {kinds.map(kind => {
      const grouping = groupIntoBlocks(counts[kind], input.blocks?.[kind]);
      const unfinished = grouping && grouping.left !== 0;
      return <div key={kind} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3" data-kind={kind} data-unfinished={unfinished || undefined}>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{kindCopy[kind].title}</span>
            <Badge variant="secondary">{plural(counts[kind], 'classroom')}</Badge>
            {grouping && <Badge variant={unfinished ? 'destructive' : 'outline'}>{grouping.grouped} of {counts[kind]} in blocks</Badge>}
          </div>
          <p className="text-sm text-muted-foreground">{grouping ? blockGroupingText(grouping) : `${kindCopy[kind].what}: not grouped by block`}</p>
          {unfinished && <p className="text-sm text-destructive">{grouping.left > 0 ? `Put the other ${plural(grouping.left, 'classroom')} into blocks before continuing` : `The blocks hold ${-grouping.left} more than the ${counts[kind]} classrooms. Remove or change a group`}</p>}
        </div>
        <div className="flex gap-2">
          {grouping && <Button variant="ghost" size="sm" className="action-remove" disabled={disabled} onClick={() => store(kind, [])}>Remove</Button>}
          <Button variant="outline" size="sm" disabled={disabled} onClick={() => begin(kind)}>{grouping ? 'Change' : 'Group by block'}</Button>
        </div>
      </div>;
    })}
    <Dialog open={!!open} onOpenChange={value => { if (!value) setOpen(null); }}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Group by block · {open ? kindCopy[open].title : ''}</DialogTitle>
          <DialogDescription>{open ? `${kindCopy[open].what}: ${total}. Add groups of blocks, of any size, until every classroom is in a block` : ''}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2" aria-live="polite">
          <div className="flex items-center justify-between text-sm"><span>{grouped} of {total} classrooms in blocks</span><span className={left === 0 ? 'text-muted-foreground' : 'font-medium text-destructive'}>{left > 0 ? `${left} left` : left === 0 ? 'All grouped' : `${-left} too many`}</span></div>
          <Progress value={total ? Math.min(100, (grouped / total) * 100) : 0} aria-label="Classrooms in blocks" />
        </div>
        {groups.length > 0 && <ul className="flex flex-col divide-y rounded-lg border">
          {groups.map((group, index) => <li key={index} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
            <span>{blockGroupText(group)}<span className="text-muted-foreground"> · {plural(group.count * group.classrooms, 'classroom')}</span></span>
            <Button variant="ghost" size="icon-sm" aria-label={`Remove ${blockGroupText(group)}`} onClick={() => removeGroup(index)}><Trash2Icon /></Button>
          </li>)}
        </ul>}
        {left > 0 && <form id="infra-block-form" noValidate className="rounded-lg border bg-muted/40 p-3" onSubmit={e => { e.preventDefault(); addGroup(); }}>
          <FieldGroup>
            <p className="text-sm text-muted-foreground">How many blocks, and what one block has</p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {numberField('count', 'Blocks')}
              {numberField('classrooms', 'Classrooms')}
              {numberField('offices', 'Offices')}
              {numberField('stores', 'Stores')}
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
