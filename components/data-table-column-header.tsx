'use client';
import type { Column, RowData } from '@tanstack/react-table';
import { ArrowDownIcon, ArrowUpIcon, ArrowUpDownIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { DataTableFeatures } from './data-table-features';

export function DataTableColumnHeader<TData extends RowData, TValue>({ column, title }: { column: Column<DataTableFeatures, TData, TValue>; title: string }) {
  const Icon = column.getIsSorted() === 'asc' ? ArrowUpIcon : column.getIsSorted() === 'desc' ? ArrowDownIcon : ArrowUpDownIcon;
  return <Button variant="ghost" size="sm" className="-ml-3" onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}>
    {title}<Icon data-icon="inline-end" />
  </Button>;
}
