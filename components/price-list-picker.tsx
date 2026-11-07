'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { CheckIcon, ChevronsUpDownIcon, ExternalLinkIcon, XIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { nairaFormat } from '@/lib/money-format';
import { procurementItemSearch, type ProcurementItem } from '@/lib/procurement';

export type PriceList = { items: ProcurementItem[]; required: boolean };

/** The state's approved Procurement price list (UBEC130/UBEC244), loaded once while `enabled`; null until loaded or on failure. */
export function usePriceList(enabled: boolean): PriceList | null {
  const [list, setList] = useState<PriceList | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    void fetch('/api/procurement/items', { cache: 'no-store' })
      .then(response => response.ok ? response.json() as Promise<PriceList> : null)
      .then(body => { if (live && body) setList({ items: body.items.filter(item => item.status === 'approved'), required: body.required }); })
      .catch(() => {});
    return () => { live = false; };
  }, [enabled]);
  return enabled ? list : null;
}

const details = (item: ProcurementItem) => [item.maker, item.modelYear ? String(item.modelYear) : ''].filter(Boolean).join(' · ');

type PriceListFieldProps = {
  id: string; list: PriceList; value: string; required: boolean; disabled?: boolean; requiredMark?: ReactNode;
  onPick: (item: ProcurementItem | null) => void;
};

/**
 * "Item from the price list": a searchable list of the approved items (name, maker, year, description and price).
 * Picking one fills the unit cost (read-only) and an empty description; "Type the cost instead" clears it.
 */
export function PriceListField({ id, list, value, required, disabled, requiredMark, onPick }: PriceListFieldProps) {
  const [open, setOpen] = useState(false);
  const picked = list.items.find(item => String(item.id) === value);
  const choose = (item: ProcurementItem | null) => { onPick(item); setOpen(false); };
  return <Field>
    <FieldLabel htmlFor={id}>Item from the price list {required && requiredMark}</FieldLabel>
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button id={id} type="button" variant="outline" role="combobox" aria-expanded={open} disabled={disabled} className="h-auto min-h-9 w-full justify-between border-input py-1.5 text-left font-normal hover:border-ring hover:bg-background hover:text-foreground">
          {picked ? <span className="flex min-w-0 flex-col"><span className="truncate font-medium">{picked.name}{details(picked) && <span className="font-normal text-muted-foreground"> · {details(picked)}</span>}</span><small className="tabular-nums text-muted-foreground">{nairaFormat.format(picked.unitPrice)}</small></span>
            : <span className="truncate text-muted-foreground">{value ? 'Saved item (no longer on the list)' : required ? 'Choose an item…' : 'Not from the price list'}</span>}
          <ChevronsUpDownIcon className="shrink-0 opacity-50" aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-(--radix-popover-trigger-width) min-w-80 p-0" align="start">
        <Command>
          <CommandInput placeholder="Search item, maker or description…" />
          <CommandList className="max-h-80">
            <CommandEmpty>No item on the price list matches</CommandEmpty>
            {!required && value && <CommandGroup><CommandItem value="__none" onSelect={() => choose(null)}><XIcon aria-hidden="true" />Not from the price list (type the cost)</CommandItem></CommandGroup>}
            <CommandGroup heading={`${list.items.length} approved ${list.items.length === 1 ? 'item' : 'items'}`}>
              {list.items.map(item => <CommandItem key={item.id} value={`${item.id} ${procurementItemSearch(item)}`} onSelect={() => choose(item)} className="items-start">
                <CheckIcon className={String(item.id) === value ? 'mt-0.5 text-primary' : 'invisible'} aria-hidden="true" />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="font-medium">{item.name}{details(item) && <span className="font-normal text-muted-foreground"> · {details(item)}</span>}</span>
                  {item.description && <small className="line-clamp-2 text-muted-foreground">{item.description}</small>}
                </span>
                <span className="shrink-0 tabular-nums">{nairaFormat.format(item.unitPrice)}</span>
              </CommandItem>)}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
    <FieldDescription>
      {!list.items.length ? `Procurement has not approved any items yet${required ? '. Ask Procurement to add the item' : ''}` : picked ? 'The unit cost is the price on the list' : 'Pick the item and its price is filled in. If it is not listed, ask Procurement to add it'}
      {' · '}<a href="/procurement" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 underline underline-offset-2">See the price list<ExternalLinkIcon className="size-3" aria-hidden="true" /></a>
    </FieldDescription>
  </Field>;
}
