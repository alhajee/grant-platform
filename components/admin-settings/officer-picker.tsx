'use client';

import { useState } from 'react';
import { CheckIcon, PlusIcon, UserRoundPenIcon, XIcon } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { initialsOf, officerLabel, type Officer } from './officers-model';

/** Avatar + short name; the full name and email in a tooltip. */
export function OfficerChip({ officer, disabled, onRemove }: { officer: Officer; disabled: boolean; onRemove?: () => void }) {
  const label = officerLabel(officer.name);
  return <Tooltip>
    <TooltipTrigger asChild>
      <span className="admin-officer-chip" tabIndex={onRemove ? undefined : 0}>
        <Avatar size="sm"><AvatarFallback className="text-[10px]">{initialsOf(label)}</AvatarFallback></Avatar>
        <span className="truncate">{label}</span>
        {onRemove && <Button type="button" variant="ghost" size="icon-xs" className="-mr-1 size-5 text-muted-foreground" disabled={disabled} aria-label={`Remove ${officer.name}`} onClick={onRemove}><XIcon /></Button>}
      </span>
    </TooltipTrigger>
    <TooltipContent><span className="font-medium">{officer.name}</span><br />{officer.email}</TooltipContent>
  </Tooltip>;
}

/** Default officers of one component: chips plus a searchable multi-select picker. Empty means the Director assigns. */
export function OfficerPicker({ component, officers, value, disabled, onChange }: {
  component: string; officers: Officer[]; value: number[]; disabled: boolean; onChange: (ids: number[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const chosen = value.map(id => officers.find(o => o.id === id)).filter((o): o is Officer => Boolean(o));
  const toggle = (id: number) => onChange(value.includes(id) ? value.filter(v => v !== id) : [...value, id]);
  return <div className="admin-officer-picker">
    {chosen.length ? chosen.map(officer => <OfficerChip key={officer.id} officer={officer} disabled={disabled} onRemove={() => toggle(officer.id)} />)
      : <span className="admin-officer-empty">Director assigns</span>}
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="ghost" size="xs" className="text-muted-foreground" disabled={disabled} aria-label={`Choose default officers for ${component}`}>
          {chosen.length ? <UserRoundPenIcon data-icon="inline-start" /> : <PlusIcon data-icon="inline-start" />}{chosen.length ? 'Change' : 'Add'}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="start">
        <Command>
          <CommandInput placeholder="Search officers…" />
          <CommandList>
            <CommandEmpty>No officer matches your search.</CommandEmpty>
            <CommandGroup heading={`Default for ${component}`}>
              {officers.map(officer => {
                const selected = value.includes(officer.id), label = officerLabel(officer.name);
                return <CommandItem key={officer.id} value={`${officer.name} ${officer.email}`} onSelect={() => toggle(officer.id)}>
                  <Avatar size="sm"><AvatarFallback className="text-[10px]">{initialsOf(label)}</AvatarFallback></Avatar>
                  <span className="flex min-w-0 flex-1 flex-col"><span className="truncate">{label}</span><small className="truncate text-muted-foreground">{officer.email}</small></span>
                  <CheckIcon className={selected ? 'text-primary' : 'invisible'} />
                </CommandItem>;
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  </div>;
}
