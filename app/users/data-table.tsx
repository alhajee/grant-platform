'use client';

import { useMemo, useState } from 'react';
import { useTable, type SortingState, type ColumnFiltersState, type ColumnVisibilityState } from '@tanstack/react-table';
import { ChevronDownIcon, ChevronLeftIcon, ChevronRightIcon, SearchIcon, SlidersHorizontalIcon } from 'lucide-react';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { InputGroup, InputGroupInput, InputGroupAddon } from '@/components/ui/input-group';
import { Field, FieldLabel } from '@/components/ui/field';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuGroup, DropdownMenuCheckboxItem } from '@/components/ui/dropdown-menu';
import { features } from './data-table-features';
import { userColumns, type User } from './columns';

export function UsersDataTable({ users, actorId, actorRole, actorDepartment, onEdit, onReset }: {
  users: User[]; actorId: number; actorRole: string; actorDepartment: string | null;
  onEdit: (user: User) => void; onReset: (user: User) => void;
}) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = useState<ColumnVisibilityState>({});
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 10 });
  const columns = useMemo(() => userColumns(actorId, actorRole, actorDepartment, onEdit, onReset), [actorId, actorRole, actorDepartment, onEdit, onReset]);
  const table = useTable({
    features, data: users, columns,
    getRowId: row => String(row.id),
    state: { sorting, columnFilters, columnVisibility, pagination },
    onPaginationChange: setPagination,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
  });
  return <div className="flex flex-col gap-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <Field className="w-full sm:max-w-xs">
        <FieldLabel htmlFor="user-search" className="sr-only">Search users</FieldLabel>
        <InputGroup>
          <InputGroupInput id="user-search" placeholder="Search users…" value={(table.getColumn('name')?.getFilterValue() as string) ?? ''} onChange={e => { table.getColumn('name')?.setFilterValue(e.target.value); table.setPageIndex(0); }} />
          <InputGroupAddon><SearchIcon aria-hidden="true" /></InputGroupAddon>
        </InputGroup>
      </Field>
      <DropdownMenu>
        <DropdownMenuTrigger asChild><Button variant="outline" size="sm"><SlidersHorizontalIcon data-icon="inline-start" />Columns<ChevronDownIcon data-icon="inline-end" /></Button></DropdownMenuTrigger>
        <DropdownMenuContent align="end"><DropdownMenuGroup>
          {table.getAllColumns().filter(column => column.getCanHide()).map(column =>
            <DropdownMenuCheckboxItem key={column.id} checked={column.getIsVisible()} onCheckedChange={value => column.toggleVisibility(!!value)}>
              {{ role: 'Role', department: 'Department', status: 'Status', planCreation: 'Create plans' }[column.id] ?? column.id}
            </DropdownMenuCheckboxItem>)}
        </DropdownMenuGroup></DropdownMenuContent>
      </DropdownMenu>
    </div>
    <div className="overflow-hidden rounded-md border">
      <Table className="min-w-[720px]">
        <TableHeader>{table.getHeaderGroups().map(group => <TableRow key={group.id}>
          {group.headers.map(header => <TableHead key={header.id} className="px-4" aria-sort={header.column.getIsSorted() === 'asc' ? 'ascending' : header.column.getIsSorted() === 'desc' ? 'descending' : undefined}>
            {header.isPlaceholder ? null : <table.FlexRender header={header} />}
          </TableHead>)}
        </TableRow>)}</TableHeader>
        <TableBody>{table.getRowModel().rows.length ? table.getRowModel().rows.map(row =>
          <TableRow key={row.id}>{row.getVisibleCells().map(cell => <TableCell key={cell.id} className="px-4 py-3"><table.FlexRender cell={cell} /></TableCell>)}</TableRow>
        ) : <TableRow><TableCell colSpan={table.getVisibleLeafColumns().length} className="h-24 text-center">No matching users.</TableCell></TableRow>}</TableBody>
      </Table>
    </div>
    <div className="flex flex-wrap items-center justify-between gap-4">
      <p className="text-sm text-muted-foreground" role="status">{table.getFilteredRowModel().rows.length} of {users.length} users</p>
      <div className="flex flex-wrap items-center gap-4">
        <Field orientation="horizontal" className="w-auto">
          <FieldLabel htmlFor="users-page-size">Rows per page</FieldLabel>
          <NativeSelect id="users-page-size" value={pagination.pageSize} onChange={e => table.setPageSize(Number(e.target.value))}>
            {[10, 20, 50].map(size => <NativeSelectOption key={size} value={size}>{size}</NativeSelectOption>)}
          </NativeSelect>
        </Field>
        <span className="text-sm">Page {pagination.pageIndex + 1} of {Math.max(1, table.getPageCount())}</span>
        <div className="flex gap-2">
          <Button variant="outline" size="icon-sm" aria-label="Previous page" disabled={!table.getCanPreviousPage()} onClick={() => table.previousPage()}><ChevronLeftIcon /></Button>
          <Button variant="outline" size="icon-sm" aria-label="Next page" disabled={!table.getCanNextPage()} onClick={() => table.nextPage()}><ChevronRightIcon /></Button>
        </div>
      </div>
    </div>
  </div>;
}
