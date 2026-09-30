'use client';
import type { Column, RowData } from '@tanstack/react-table';
import { ArrowDownIcon, ArrowUpIcon, ArrowUpDownIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { DataTableFeatures } from './data-table-features';

export function DataTableColumnHeader<TData extends RowData, TValue>({ column, title, align = 'start' }: { column: Column<DataTableFeatures, TData, TValue>; title: string; align?: 'start' | 'end' }) {
  const Icon = column.getIsSorted() === 'asc' ? ArrowUpIcon : column.getIsSorted() === 'desc' ? ArrowDownIcon : ArrowUpDownIcon;
  const button = <Button variant="ghost" size="sm" className={cn(align === 'end' ? '-mr-3' : '-ml-3')} onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}>
    {title}<Icon data-icon="inline-end" />
  </Button>;
  return align === 'end' ? <div className="flex justify-end">{button}</div> : button;
}
