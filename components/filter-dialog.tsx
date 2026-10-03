'use client';
import './filter-dialog.css';

import { useState, type ReactNode } from 'react';
import { ListFilterIcon, SearchIcon, XIcon } from 'lucide-react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Kbd } from '@/components/ui/kbd';
import { cn } from '@/lib/utils';

export type FilterOption = { value: string; label: string; count?: number };
/** A client-side table facet: the column it filters and its options. */
export type DataTableFacet = { column: string; title: string; options: FilterOption[] };
export type FilterChip = { key: string; label: string; clear: () => void };
/** A checkbox list, or any custom control (with its own chips) such as an amount range. */
export type FilterSection =
  | { id: string; title: string; options: FilterOption[]; selected: string[]; onChange: (values: string[]) => void; columns?: 1 | 2 }
  | { id: string; title: string; content: ReactNode; chips: FilterChip[]; optionCount?: number };

export type FilterDialogProps = {
  sections: FilterSection[];
  onClearAll: () => void;
  /** Footer button text, e.g. "Show 4 plans". */
  showLabel: string;
  triggerLabel?: string;
  triggerClassName?: string;
  /** Also list the active filters as removable chips beside the trigger (tables). */
  inlineChips?: boolean;
};

const SEARCH_FROM = 10;
// Long lists of short labels (states, LGAs) read faster in two columns.
const autoColumns = (options: FilterOption[]) => options.length > 12 && options.every(option => option.label.length <= 18) ? 2 : 1;
const isChecks = (section: FilterSection): section is Extract<FilterSection, { options: FilterOption[] }> => 'options' in section;
const sectionChips = (section: FilterSection): FilterChip[] => isChecks(section)
  ? section.selected.map(value => ({ key: `${section.id}-${value}`, label: section.options.find(option => option.value === value)?.label ?? value, clear: () => section.onChange(section.selected.filter(item => item !== value)) }))
  : section.chips;

function ChipList({ chips, className }: { chips: FilterChip[]; className?: string }) {
  return <ul className={cn('filter-chips', className)} aria-label="Active filters">{chips.map(chip => <li key={chip.key}><span>{chip.label}</span><button type="button" aria-label={`Remove ${chip.label}`} onClick={chip.clear}><XIcon /></button></li>)}</ul>;
}

function CheckSection({ section }: { section: Extract<FilterSection, { options: FilterOption[] }> }) {
  const [query, setQuery] = useState('');
  const needle = query.trim().toLowerCase();
  const shown = needle ? section.options.filter(option => option.label.toLowerCase().includes(needle)) : section.options;
  const toggle = (value: string, on: boolean) => section.onChange(on ? [...section.selected, value] : section.selected.filter(item => item !== value));
  return <>
    {section.options.length > SEARCH_FROM && <div className="filter-search"><SearchIcon aria-hidden="true" /><Input value={query} onChange={event => setQuery(event.target.value)} placeholder={`Search ${section.title.toLowerCase()}…`} aria-label={`Search ${section.title}`} /></div>}
    <FieldGroup data-slot="checkbox-group" className="filter-checks" data-columns={section.columns ?? autoColumns(section.options)}>
      {shown.map(option => <Field key={option.value} orientation="horizontal">
        <Checkbox id={`filter-${section.id}-${option.value}`} checked={section.selected.includes(option.value)} onCheckedChange={checked => toggle(option.value, checked === true)} />
        <FieldLabel htmlFor={`filter-${section.id}-${option.value}`}><span>{option.label}</span>{option.count !== undefined && <small>{option.count.toLocaleString()}</small>}</FieldLabel>
      </Field>)}
      {!shown.length && <p className="filter-none">No matches</p>}
    </FieldGroup>
  </>;
}

/** Filters in a compact dialog: active filters as chips, then collapsible sections of checkboxes. Changes apply as they are chosen. */
export function FilterDialog({ sections, onClearAll, showLabel, triggerLabel = 'Filter', triggerClassName, inlineChips = false }: FilterDialogProps) {
  const [open, setOpen] = useState(false), [expanded, setExpanded] = useState<string[]>([]);
  const chips = sections.flatMap(sectionChips);
  const onOpenChange = (next: boolean) => {
    // Open the sections already in use; otherwise the first two.
    if (next) { const used = sections.filter(section => sectionChips(section).length).map(section => section.id); setExpanded(used.length ? used : sections.slice(0, 2).map(section => section.id)); }
    setOpen(next);
  };
  return <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild><Button type="button" variant="outline" className={cn('filter-trigger', triggerClassName)}><ListFilterIcon data-icon="inline-start" />{triggerLabel}{chips.length > 0 && <Badge variant="secondary">{chips.length}</Badge>}</Button></DialogTrigger>
      <DialogContent className="filter-dialog" showCloseButton={false}>
        <DialogHeader className="filter-dialog-header">
          <DialogTitle>Filters</DialogTitle>
          <Button type="button" variant="link" size="sm" className="filter-clear" disabled={!chips.length} onClick={onClearAll}>Clear all</Button>
          <DialogDescription className="sr-only">Changes apply as you select them.</DialogDescription>
        </DialogHeader>
        <div className="filter-dialog-body">
          {chips.length > 0 && <ChipList chips={chips} />}
          <Accordion type="multiple" value={expanded} onValueChange={setExpanded} className="filter-sections">
            {sections.map(section => {
              const active = sectionChips(section).length, options = isChecks(section) ? section.options.length : section.optionCount;
              return <AccordionItem key={section.id} value={section.id}>
                <AccordionTrigger><span className="filter-section-title">{section.title}{options !== undefined && <small>{options}</small>}</span>{active > 0 && <span className="filter-section-active">{active} {active === 1 ? 'filter' : 'filters'}</span>}</AccordionTrigger>
                <AccordionContent>{isChecks(section) ? <CheckSection section={section} /> : section.content}</AccordionContent>
              </AccordionItem>;
            })}
          </Accordion>
        </div>
        <div className="filter-dialog-footer">
          <span className="filter-keys" aria-hidden="true"><Kbd>Tab</Kbd>to move<Kbd>Space</Kbd>to select</span>
          <DialogClose asChild><Button type="button" size="sm" className="rounded-full">{showLabel}</Button></DialogClose>
        </div>
      </DialogContent>
    </Dialog>
    {inlineChips && chips.length > 0 && <ChipList chips={chips} className="filter-chips-inline" />}
  </>;
}
