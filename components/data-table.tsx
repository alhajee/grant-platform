'use client';

import { useId, useState, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react';
import { useTable, type ColumnDef, type SortingState, type ColumnFiltersState, type ColumnVisibilityState, type PaginationState, type Updater } from '@tanstack/react-table';
import { ChevronDownIcon, ChevronLeftIcon, ChevronRightIcon, ChevronsLeftIcon, ChevronsRightIcon, SearchIcon, SlidersHorizontalIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { InputGroup, InputGroupInput, InputGroupAddon } from '@/components/ui/input-group';
import { Field, FieldLabel } from '@/components/ui/field';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Skeleton } from '@/components/ui/skeleton';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuGroup, DropdownMenuCheckboxItem } from '@/components/ui/dropdown-menu';
import { features, type DataTableFeatures } from './data-table-features';
import { FilterDialog, type DataTableFacet } from './filter-dialog';
import { useSessionState } from './use-session-state';

/** Server-side mode: the parent fetches one page at a time and owns paging, sorting and search. */
export type DataTableServer = {
  rowCount: number;
  pagination: PaginationState;
  onPaginationChange: (value: PaginationState) => void;
  sorting: SortingState;
  onSortingChange: (value: SortingState) => void;
  search: string;
  onSearchChange: (value: string) => void;
  loading?: boolean;
  pageSizes?: readonly number[];
};

const resolve = <T,>(updater: Updater<T>, current: T): T => typeof updater === 'function' ? (updater as (old: T) => T)(current) : updater;

export function DataTable<TData extends { id: string | number }>({ data, columns, searchColumn = 'name', searchPlaceholder = 'Search…', itemLabel = 'records', columnLabels = {}, server, toolbar, facets = [], filters, persistKey, empty, onRowClick, rowLabel, rowSelected, stickyHeader = false }: {
  data: TData[];
  columns: ColumnDef<DataTableFeatures, TData>[];
  searchColumn?: string;
  searchPlaceholder?: string;
  itemLabel?: string;
  columnLabels?: Record<string, string>;
  server?: DataTableServer;
  toolbar?: ReactNode;
  /** Client-side multi-select filters; each column needs a filterFn that accepts the selected values (string[]). */
  facets?: DataTableFacet[];
  /** Filters the parent controls (server mode), shown next to the search box. */
  filters?: ReactNode;
  /** Remember search and filters (client mode) for the browser-tab session under this key. */
  persistKey?: string;
  empty?: ReactNode;
  /** Makes whole rows open the record (click or Enter); clicks on controls inside the row are left alone. */
  onRowClick?: (row: TData) => void;
  rowLabel?: (row: TData) => string;
  /** Highlights ticked rows. */
  rowSelected?: (row: TData) => boolean;
  /** Scroll the rows inside a window-high area so the header stays in view on long pages. */
  stickyHeader?: boolean;
}) {
  const id = useId();
  const [localSorting, setLocalSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useSessionState<ColumnFiltersState>(persistKey && !server ? `${persistKey}:filters` : undefined, []);
  const [columnVisibility, setColumnVisibility] = useState<ColumnVisibilityState>({});
  const [localPagination, setLocalPagination] = useState({ pageIndex: 0, pageSize: 10 });
  const sorting = server?.sorting ?? localSorting;
  const pagination = server?.pagination ?? localPagination;
  const table = useTable({
    features, data, columns,
    getRowId: row => String(row.id),
    state: { sorting, columnFilters, columnVisibility, pagination },
    ...(server ? { manualPagination: true, manualSorting: true, manualFiltering: true, rowCount: server.rowCount } : {}),
    onPaginationChange: updater => server ? server.onPaginationChange(resolve(updater, server.pagination)) : setLocalPagination(updater),
    onSortingChange: updater => server ? server.onSortingChange(resolve(updater, server.sorting)) : setLocalSorting(updater),
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
  });
  const rows = table.getRowModel().rows;
  const visibleColumns = table.getVisibleLeafColumns().length;
  const loadingRows = server?.loading && !rows.length ? Math.min(pagination.pageSize, 8) : 0;
  const pageCount = Math.max(1, table.getPageCount());
  const firstRow = server && server.rowCount ? pagination.pageIndex * pagination.pageSize + 1 : 0;
  const lastRow = server ? Math.min(server.rowCount, (pagination.pageIndex + 1) * pagination.pageSize) : 0;
  const searchValue = server ? server.search : (table.getColumn(searchColumn)?.getFilterValue() as string) ?? '';
  return <div className="flex min-w-0 flex-col gap-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
      <Field className="w-full sm:w-72">
        <FieldLabel htmlFor={`${id}-search`} className="sr-only">{searchPlaceholder}</FieldLabel>
        <InputGroup className="rounded-full bg-card">
          <InputGroupInput id={`${id}-search`} type={server ? 'search' : undefined} placeholder={searchPlaceholder} value={searchValue} onChange={e => { if (server) { server.onSearchChange(e.target.value); return; } table.getColumn(searchColumn)?.setFilterValue(e.target.value); table.setPageIndex(0); }} />
          <InputGroupAddon><SearchIcon aria-hidden="true" /></InputGroupAddon>
        </InputGroup>
      </Field>
      {filters}
      {!server && facets.length > 0 && <FilterDialog inlineChips
        sections={facets.flatMap(facet => { const column = table.getColumn(facet.column); return column ? [{ id: facet.column, title: facet.title, options: facet.options, selected: (column.getFilterValue() as string[] | undefined) ?? [], onChange: (values: string[]) => { column.setFilterValue(values.length ? values : undefined); table.setPageIndex(0); } }] : []; })}
        onClearAll={() => { facets.forEach(facet => table.getColumn(facet.column)?.setFilterValue(undefined)); table.setPageIndex(0); }}
        showLabel={`Show ${table.getFilteredRowModel().rows.length} ${itemLabel}`} />}
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        {toolbar}
        <DropdownMenu>
          <DropdownMenuTrigger asChild><Button variant="outline" size="sm"><SlidersHorizontalIcon data-icon="inline-start" />Columns<ChevronDownIcon data-icon="inline-end" /></Button></DropdownMenuTrigger>
          <DropdownMenuContent align="end"><DropdownMenuGroup>
            {table.getAllColumns().filter(column => column.getCanHide()).map(column =>
              <DropdownMenuCheckboxItem key={column.id} checked={column.getIsVisible()} onCheckedChange={value => column.toggleVisibility(!!value)}>
                {columnLabels[column.id] ?? column.id}
              </DropdownMenuCheckboxItem>)}
          </DropdownMenuGroup></DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
    <div className={cn('overflow-hidden rounded-md border bg-card', stickyHeader && '[&>[data-slot=table-container]]:max-h-[max(24rem,calc(100dvh-11rem))] [&>[data-slot=table-container]]:overflow-y-auto')}>
      <Table className="min-w-[720px]" aria-busy={server?.loading || undefined}>
        <TableHeader className={cn('bg-[color-mix(in_oklab,var(--muted)_60%,var(--card))] [&_tr]:hover:bg-transparent', stickyHeader && 'sticky top-0 z-10 shadow-[0_1px_0_var(--border)]')}>{table.getHeaderGroups().map(group => <TableRow key={group.id}>
          {group.headers.map(header => <TableHead key={header.id} className="px-4" aria-sort={header.column.getIsSorted() === 'asc' ? 'ascending' : header.column.getIsSorted() === 'desc' ? 'descending' : undefined}>
            {header.isPlaceholder ? null : <table.FlexRender header={header} />}
          </TableHead>)}
        </TableRow>)}</TableHeader>
        <TableBody className={server?.loading && rows.length ? 'opacity-60 transition-opacity' : undefined}>{loadingRows ? Array.from({ length: loadingRows }, (_, index) =>
          <TableRow key={`loading-${index}`}>{Array.from({ length: visibleColumns }, (_, cell) => <TableCell key={cell} className="px-4 py-3"><Skeleton className="h-4 w-full max-w-32" /></TableCell>)}</TableRow>
        ) : rows.length ? rows.map(row =>
          <TableRow key={row.id} data-state={rowSelected?.(row.original) ? 'selected' : undefined} className={cn('data-[state=selected]:bg-primary/[0.07] data-[state=selected]:hover:bg-primary/10', onRowClick && 'cursor-pointer focus-visible:bg-muted/50 focus-visible:outline-none')} {...onRowClick ? {
            tabIndex: 0, 'aria-label': rowLabel?.(row.original),
            // Portalled menus and dialogs bubble through React, so act only on clicks inside the row itself.
            onClick: (event: MouseEvent<HTMLTableRowElement>) => { const target = event.target as Element; if (event.currentTarget.contains(target) && !target.closest('button,a,input,label,[role=checkbox],[role=menuitem]')) onRowClick(row.original); },
            onKeyDown: (event: KeyboardEvent<HTMLTableRowElement>) => { if (event.key === 'Enter' && event.target === event.currentTarget) onRowClick(row.original); },
          } : {}}>{row.getVisibleCells().map(cell => <TableCell key={cell.id} className="px-4 py-3"><table.FlexRender cell={cell} /></TableCell>)}</TableRow>
        ) : <TableRow><TableCell colSpan={visibleColumns} className="h-24 text-center">{empty ?? `No matching ${itemLabel}.`}</TableCell></TableRow>}</TableBody>
      </Table>
    </div>
    <div className="flex flex-wrap items-center justify-between gap-4">
      <p className="text-sm text-muted-foreground" role="status">{server ? (server.rowCount ? `Showing ${firstRow}–${lastRow} of ${server.rowCount} ${itemLabel}` : `0 ${itemLabel}`) : `${table.getFilteredRowModel().rows.length} of ${data.length} ${itemLabel}`}</p>
      <div className="flex flex-wrap items-center gap-4">
        <Field orientation="horizontal" className="w-auto">
          <FieldLabel htmlFor={`${id}-page-size`}>Per page</FieldLabel>
          <NativeSelect className="rounded-full bg-card" id={`${id}-page-size`} value={pagination.pageSize} onChange={e => server ? server.onPaginationChange({ pageIndex: 0, pageSize: Number(e.target.value) }) : table.setPageSize(Number(e.target.value))}>
            {(server?.pageSizes ?? [10, 20, 50]).map(size => <NativeSelectOption key={size} value={size}>{size}</NativeSelectOption>)}
          </NativeSelect>
        </Field>
        <span className="text-sm">Page {pagination.pageIndex + 1} of {pageCount}</span>
        <div className="flex gap-2">
          {server && <Button variant="outline" size="icon-sm" aria-label="First page" disabled={!table.getCanPreviousPage()} onClick={() => table.setPageIndex(0)}><ChevronsLeftIcon /></Button>}
          <Button variant="outline" size="icon-sm" aria-label="Previous page" disabled={!table.getCanPreviousPage()} onClick={() => table.previousPage()}><ChevronLeftIcon /></Button>
          <Button variant="outline" size="icon-sm" aria-label="Next page" disabled={!table.getCanNextPage()} onClick={() => table.nextPage()}><ChevronRightIcon /></Button>
          {server && <Button variant="outline" size="icon-sm" aria-label="Last page" disabled={!table.getCanNextPage()} onClick={() => table.setPageIndex(pageCount - 1)}><ChevronsRightIcon /></Button>}
        </div>
      </div>
    </div>
  </div>;
}
