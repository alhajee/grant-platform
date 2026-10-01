'use client';

import { useEffect, useRef, useState } from 'react';
import { PlusCircleIcon } from 'lucide-react';
import { useFilterGroup } from './data-table-filter-group';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Separator } from '@/components/ui/separator';

export type FacetOption = { label: string; value: string; count?: number };
export type DataTableFacet = { column: string; title: string; options: FacetOption[] };

const MAX_BADGES = 2;

/** shadcn "faceted filter": a dashed button that opens a searchable multi-select of column values. */
export function DataTableFacetedFilter({ title, options, selected, onChange }: { title: string; options: FacetOption[]; selected: string[]; onChange: (values: string[]) => void }) {
  const chosen = new Set(selected);
  const toggle = (value: string) => onChange(chosen.has(value) ? selected.filter(item => item !== value) : [...selected, value]);
  const [open, setOpen] = useState(false);
  const group = useFilterGroup(), report = group?.report, reported = useRef(false);
  // Tell an enclosing DataTableFilterGroup while this list is open (and release it on unmount).
  useEffect(() => { if (!report || reported.current === open) return; reported.current = open; report(open); }, [open, report]);
  useEffect(() => () => { if (reported.current) report?.(false); }, [report]);
  // Inside a collapsed filter group, only filters in use stay visible.
  if (group && !group.engaged && !open && !chosen.size) return null;
  return <Popover open={open} onOpenChange={setOpen}>
    <PopoverTrigger asChild>
      <Button variant="outline" size="sm" className="border-dashed">
        <PlusCircleIcon data-icon="inline-start" />{title}
        {chosen.size > 0 && <>
          <Separator orientation="vertical" className="mx-1 h-4" />
          <Badge variant="secondary" className="h-5 min-w-5 justify-center rounded-full px-1 tabular-nums lg:hidden">{chosen.size}</Badge>
          <span className="hidden gap-1 lg:flex">{chosen.size > MAX_BADGES ? <Badge variant="secondary">{chosen.size} selected</Badge> : options.filter(option => chosen.has(option.value)).map(option => <Badge key={option.value} variant="secondary">{option.label}</Badge>)}</span>
        </>}
      </Button>
    </PopoverTrigger>
    <PopoverContent className="w-60 p-0" align="start">
      <Command>
        <CommandInput placeholder={title} />
        <CommandList>
          <CommandEmpty>No matches.</CommandEmpty>
          <CommandGroup>{options.map(option => <CommandItem key={option.value} value={option.label} onSelect={() => toggle(option.value)}>
            <Checkbox checked={chosen.has(option.value)} tabIndex={-1} aria-hidden="true" className="pointer-events-none [&_svg]:text-primary-foreground!" />
            <span className="min-w-0 flex-1 truncate">{option.label}</span>
            {option.count !== undefined && <span className="ml-auto font-mono text-xs tabular-nums text-muted-foreground">{option.count}</span>}
          </CommandItem>)}</CommandGroup>
          {chosen.size > 0 && <><CommandSeparator /><CommandGroup><CommandItem onSelect={() => onChange([])} className="justify-center text-center">Clear filter</CommandItem></CommandGroup></>}
        </CommandList>
      </Command>
    </PopoverContent>
  </Popover>;
}
