'use client';
import { ListFilter } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuGroup, DropdownMenuCheckboxItem, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';

/** Excel-style per-column value filter. An empty selection means "show all". */
export function ColumnFilterMenu({ label, options, selected, onChange }: { label: string; options: { value: string; count: number }[]; selected: string[]; onChange: (next: string[]) => void }) {
  const active = selected.length > 0;
  const toggle = (value: string, checked: boolean) => onChange(checked ? [...selected, value] : selected.filter(v => v !== value));
  return <DropdownMenu>
    <DropdownMenuTrigger asChild><Button variant="ghost" size="icon-xs" className="wb-filter-trigger" data-active={active || undefined} aria-label={`Filter ${label}${active ? ` (${selected.length} selected)` : ''}`} title={`Filter ${label}`}><ListFilter /></Button></DropdownMenuTrigger>
    <DropdownMenuContent align="start" className="wb-filter-menu">
      <DropdownMenuLabel>Filter {label}</DropdownMenuLabel>
      <DropdownMenuGroup>
        {options.map(option => <DropdownMenuCheckboxItem key={option.value} checked={selected.includes(option.value)} onCheckedChange={checked => toggle(option.value, !!checked)} onSelect={event => event.preventDefault()}>
          <span className="wb-filter-value">{option.value || '(Blank)'}</span><span className="wb-filter-count">{option.count}</span>
        </DropdownMenuCheckboxItem>)}
      </DropdownMenuGroup>
      <DropdownMenuSeparator />
      <DropdownMenuItem disabled={!active} onSelect={() => onChange([])}>Clear filter</DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>;
}
