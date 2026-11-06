'use client';
import { useState } from 'react';
import { BlocksIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { blockGroupingText, classroomBlockCounts, groupIntoBlocks, type BlockKind, type ClassroomBlock, type InfrastructureInput, type SchoolBasis } from '@/lib/infrastructure-model';

interface BlockGroupingProps {
  input: InfrastructureInput;
  school: SchoolBasis;
  disabled: boolean;
  onChange: (patch: Partial<InfrastructureInput>) => void;
}

const kindCopy: Record<BlockKind, { title: string; what: string }> = {
  construct: { title: 'New construction', what: 'Additional classrooms to build' },
  renovate: { title: 'Renovation', what: 'Non-functional classrooms to renovate' },
};
type Draft = { classrooms: string; offices: string; stores: string };
const toDraft = (block?: ClassroomBlock): Draft => ({ classrooms: String(block?.classrooms ?? 3), offices: String(block?.offices ?? 1), stores: String(block?.stores ?? 1) });
const whole = (value: string) => value.trim() !== '' && Number.isInteger(Number(value)) && Number(value) >= 0 ? Number(value) : null;

function draftProblems(draft: Draft): Partial<Record<keyof Draft, string>> {
  const classrooms = whole(draft.classrooms), offices = whole(draft.offices), stores = whole(draft.stores);
  return {
    ...(classrooms === null || classrooms < 1 ? { classrooms: 'Enter at least 1 classroom per block' } : classrooms > 30 ? { classrooms: 'Use at most 30 classrooms per block' } : {}),
    ...(offices === null ? { offices: 'Enter the offices per block (0 or more)' } : offices > 10 ? { offices: 'Use at most 10 offices per block' } : {}),
    ...(stores === null ? { stores: 'Enter the stores per block (0 or more)' } : stores > 10 ? { stores: 'Use at most 10 stores per block' } : {}),
  };
}

/**
 * UBEC171: on the Whole School Gaps step, the Primary/JSS classrooms to build (Additional) and to renovate (non-functional)
 * can each be grouped by block. A dialog asks how many classrooms, offices and stores make up one block; the costing
 * step then shows the blocks. A kind with no classrooms is not offered.
 */
export function ClassroomBlockGrouping({ input, school, disabled, onChange }: BlockGroupingProps) {
  const counts = classroomBlockCounts(input, school);
  const [open, setOpen] = useState<BlockKind | null>(null);
  const [draft, setDraft] = useState<Draft>(toDraft());
  const [tried, setTried] = useState(false);
  const kinds = (['construct', 'renovate'] as const).filter(kind => counts[kind] > 0);
  if (!kinds.length) return null;

  const begin = (kind: BlockKind) => { setDraft(toDraft(input.blocks?.[kind])); setTried(false); setOpen(kind); };
  const setBlock = (kind: BlockKind, block: ClassroomBlock | undefined) => {
    const rest = Object.fromEntries(Object.entries(input.blocks ?? {}).filter(([k]) => k !== kind));
    onChange({ blocks: block ? { ...rest, [kind]: block } : rest });
  };
  const problems = draftProblems(draft);
  const valid = Object.keys(problems).length === 0;
  const preview = valid && open ? groupIntoBlocks(counts[open], { classrooms: Number(draft.classrooms), offices: Number(draft.offices), stores: Number(draft.stores) }) : null;
  function save() {
    setTried(true);
    if (!valid || !open) return;
    setBlock(open, { classrooms: Number(draft.classrooms), offices: Number(draft.offices), stores: Number(draft.stores) });
    setOpen(null);
  }
  const numberField = (key: keyof Draft, label: string, help: string) => <Field data-invalid={tried && problems[key] ? true : undefined}>
    <FieldLabel htmlFor={'block-' + key}>{label}<span className="text-destructive" aria-hidden="true">*</span></FieldLabel>
    <Input id={'block-' + key} type="number" inputMode="numeric" min={key === 'classrooms' ? 1 : 0} step={1} required aria-required="true" aria-invalid={tried && problems[key] ? true : undefined}
      value={draft[key]} onChange={e => setDraft(d => ({ ...d, [key]: e.target.value }))} />
    {tried && problems[key] ? <FieldError>{problems[key]}</FieldError> : <FieldDescription>{help}</FieldDescription>}
  </Field>;

  return <section className="infra-block-grouping flex flex-col gap-3" aria-labelledby="infra-block-grouping-heading">
    <div className="flex flex-col gap-1">
      <h3 id="infra-block-grouping-heading" className="flex items-center gap-2 font-semibold"><BlocksIcon aria-hidden="true" className="size-4" />Group classrooms by block</h3>
      <p className="text-sm text-muted-foreground">Say how many classrooms, offices and stores make up one block. The blocks are shown in the costing</p>
    </div>
    {kinds.map(kind => {
      const grouping = groupIntoBlocks(counts[kind], input.blocks?.[kind]);
      return <div key={kind} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3" data-kind={kind}>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2"><span className="font-medium">{kindCopy[kind].title}</span><Badge variant="secondary">{counts[kind]} classroom{counts[kind] === 1 ? '' : 's'}</Badge></div>
          <p className="text-sm text-muted-foreground">{grouping ? blockGroupingText(grouping) : `${kindCopy[kind].what}: not grouped by block`}</p>
        </div>
        <div className="flex gap-2">
          {grouping && <Button variant="ghost" size="sm" disabled={disabled} onClick={() => setBlock(kind, undefined)}>Remove</Button>}
          <Button variant="outline" size="sm" disabled={disabled} onClick={() => begin(kind)}>{grouping ? 'Change' : 'Group by block'}</Button>
        </div>
      </div>;
    })}
    <Dialog open={!!open} onOpenChange={value => { if (!value) setOpen(null); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Group by block · {open ? kindCopy[open].title : ''}</DialogTitle>
          <DialogDescription>{open ? `${kindCopy[open].what}: ${counts[open]}. How many classrooms, offices and stores make up one block?` : ''}</DialogDescription>
        </DialogHeader>
        <form id="infra-block-form" noValidate onSubmit={e => { e.preventDefault(); save(); }}>
          <FieldGroup>
            {numberField('classrooms', 'Classrooms per block', 'For example 3 for a block of 3 classrooms')}
            <div className="grid grid-cols-2 gap-4">
              {numberField('offices', 'Offices per block', 'Counted with the Office row')}
              {numberField('stores', 'Stores per block', 'Counted with the Store row')}
            </div>
          </FieldGroup>
        </form>
        {preview && <p className="rounded-md bg-muted p-3 text-sm" aria-live="polite">{blockGroupingText(preview)}{preview.remainder > 0 ? `. ${counts[open!]} classrooms do not fill whole blocks, so the last block has ${preview.remainder}` : ''}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(null)}>Cancel</Button>
          <Button type="submit" form="infra-block-form">Save grouping</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </section>;
}
