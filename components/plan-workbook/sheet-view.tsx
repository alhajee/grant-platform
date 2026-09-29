'use client';
import { useMemo, useState } from 'react';
import { useTable, type ColumnDef, type FilterFn, type SortFn } from '@tanstack/react-table';
import { ChevronDown, Download, MessageSquareWarning, Search, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { Spinner } from '@/components/ui/spinner';
import { EditComponentButton } from '@/components/activity-review-content';
import { workbookFeatures, type WorkbookFeatures } from './features';
import { SheetGrid } from './sheet-grid';
import { formatStat, selectedBlocks, selectionStats, toTsv, type Bounds } from './selection';
import type { WorkbookRow, WorkbookSheet } from './types';
import { useSheetComments } from './comments-context';
import { CommentsPanel } from './comments-panel';
import type { PlanCommentThread } from '@/lib/plan-comments';

type Def = ColumnDef<WorkbookFeatures, WorkbookRow>;
const order = (a: number, b: number) => (a > b ? 1 : 0) - (a < b ? 1 : 0);
const textSort: SortFn<WorkbookFeatures, WorkbookRow> = (a, b, id) => String(a.getValue(id) ?? '').localeCompare(String(b.getValue(id) ?? ''), 'en', { numeric: true, sensitivity: 'base' });
const numberSort: SortFn<WorkbookFeatures, WorkbookRow> = (a, b, id) => { const x = a.getValue(id), y = b.getValue(id); return order(x === '' ? -Infinity : Number(x), y === '' ? -Infinity : Number(y)); };
const valueFilter: FilterFn<WorkbookFeatures, WorkbookRow> = (row, id, value: string[]) => !value?.length || value.includes(String(row.getValue(id) ?? ''));
const searchFilter: FilterFn<WorkbookFeatures, WorkbookRow> = (row, _id, value: string) => row.original.search.includes(String(value ?? '').trim().toLowerCase());

// On phones the frozen first column starts narrower so the grid still shows a second column.
const narrowFirstColumn = (sheet: WorkbookSheet): Record<string, number> => typeof window !== 'undefined' && window.innerWidth < 600 && sheet.columns[0] ? { [sheet.columns[0].id]: 150 } : {};

export type DownloadRequest = (scope: 'sheet' | 'all', sheet?: { rows: WorkbookRow[] }) => Promise<void>;

export function SheetView({ sheet, visited, onDownload, onRequestChanges }: { sheet: WorkbookSheet; visited: boolean; onDownload: DownloadRequest; onRequestChanges?: () => void }) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState<'sheet' | 'all' | null>(null);
  const columns = useMemo<Def[]>(() => sheet.columns.map(c => ({ id: c.id, header: c.header, accessorFn: (row: WorkbookRow) => row.values[c.id], size: c.size ?? 140, minSize: 64, maxSize: 640, sortDescFirst: false, sortFn: c.kind === 'text' ? textSort : numberSort, enableColumnFilter: !!c.filter, filterFn: valueFilter })), [sheet.columns]);
  const table = useTable({ features: workbookFeatures, data: sheet.rows, columns, getRowId: row => row.id, columnResizeMode: 'onChange', globalFilterFn: searchFilter, enableMultiSort: false, initialState: { columnSizing: narrowFirstColumn(sheet) } });
  const filterOptions = useMemo(() => Object.fromEntries(sheet.columns.filter(c => c.filter).map(c => {
    const counts = new Map<string, number>();
    for (const row of sheet.rows) { const value = String(row.values[c.id] ?? ''); counts.set(value, (counts.get(value) ?? 0) + 1); }
    return [c.id, [...counts].sort(([a], [b]) => a.localeCompare(b, 'en', { numeric: true })).map(([value, count]) => ({ value, count }))];
  })), [sheet.columns, sheet.rows]);
  const query = String(table.state.globalFilter ?? '');
  const filtering = table.state.columnFilters.length > 0;
  const blocks = () => {
    const rows = table.getRowModel().rows.map(row => row.original);
    const order = table.getVisibleLeafColumns().map(column => sheet.columns.find(c => c.id === column.id)!);
    return selectedBlocks(table.getCellSelectionBounds() as Bounds[], rows, order);
  };
  const current = table.state.cellSelection.length ? selectionStats(blocks()) : null;
  const copy = () => table.state.cellSelection.length ? toTsv(blocks()) : null;
  async function download(scope: 'sheet' | 'all') {
    setBusy(scope);
    try { await onDownload(scope, { rows: table.getRowModel().rows.map(row => row.original) }); }
    catch (cause) { console.error(cause); toast.error('Unable to create the Excel file. Please try again.'); }
    finally { setBusy(null); }
  }
  const comments = useSheetComments(sheet.key);
  // Panel navigation: make the row visible, select its cell (or row) and open the thread.
  function goTo(thread: PlanCommentThread) {
    if (!table.getRowModel().rows.some(row => row.id === thread.rowRef)) { table.setGlobalFilter(''); table.resetColumnFilters(true); }
    const all = table.getVisibleLeafColumns();
    if (thread.columnId) table.setFocusedCell(thread.rowRef, thread.columnId);
    else if (all.length) table.selectCellRange({ anchorRowId: thread.rowRef, anchorColumnId: all[0].id, focusRowId: thread.rowRef, focusColumnId: all[all.length - 1].id });
    requestAnimationFrame(() => comments?.controller.setActive({ sheet: sheet.key, rowRef: thread.rowRef, columnId: thread.columnId, threadId: thread.id }));
  }
  const toggle = (rowId: string) => setExpanded(previous => ({ ...previous, [rowId]: !previous[rowId] }));
  return <div className="wb-sheet" data-sheet={sheet.key}>
    <div className="review-table-toolbar wb-toolbar">
      <div className="wb-toolbar-filters">
        <InputGroup className="review-table-search"><InputGroupInput aria-label={`Search ${sheet.label}`} placeholder={`Search ${sheet.itemLabel}…`} value={query} onChange={event => table.setGlobalFilter(event.target.value)} /><InputGroupAddon><Search /></InputGroupAddon></InputGroup>
        {filtering && <Button variant="ghost" size="sm" onClick={() => table.resetColumnFilters(true)}><X data-icon="inline-start" />Clear filters</Button>}
      </div>
      <div className="wb-toolbar-actions">
        <DropdownMenu><DropdownMenuTrigger asChild><Button variant="outline" className="rounded-full" disabled={!!busy}>{busy ? <Spinner data-icon="inline-start" /> : <Download data-icon="inline-start" />}Download .xlsx<ChevronDown data-icon="inline-end" /></Button></DropdownMenuTrigger>
          <DropdownMenuContent align="end"><DropdownMenuGroup>
            <DropdownMenuItem onSelect={() => void download('sheet')}>This sheet · as shown</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => void download('all')}>All sheets</DropdownMenuItem>
          </DropdownMenuGroup></DropdownMenuContent>
        </DropdownMenu>
        {comments && <CommentsPanel sheet={sheet} comments={comments} onNavigate={goTo} />}
        {onRequestChanges && <Button variant="outline" className="rounded-full" onClick={onRequestChanges}><MessageSquareWarning data-icon="inline-start" />Request changes</Button>}
        {sheet.editHref && sheet.editLabel && <EditComponentButton href={sheet.editHref} label={sheet.editLabel} />}
      </div>
    </div>
    {visited && <SheetGrid table={table} sheet={sheet} expanded={expanded} onToggle={toggle} filterOptions={filterOptions} onCopy={copy} onDownloadSheet={() => void download('sheet')} />}
    {visited && <div className="wb-status" role="status" aria-live="polite">
      <span className="wb-status-rows">{table.getFilteredRowModel().rows.length === sheet.rows.length ? `${sheet.rows.length} ${sheet.itemLabel}` : `${table.getFilteredRowModel().rows.length} of ${sheet.rows.length} ${sheet.itemLabel}`}</span>
      <span className="wb-status-hint">Drag or Shift+click to select · Right-click for options{comments?.can.start ? ' or to comment' : ''} · Ctrl+C copies{sheet.detail ? ' · Enter shows details' : ''}</span>
      {current && <span className="wb-status-stats">{current.numeric > 0 && <span>Average: <strong data-stat="average">{formatStat(current.average, current.money)}</strong></span>}<span>Count: <strong data-stat="count">{current.count}</strong></span>{current.numeric > 0 && <span>Sum: <strong data-stat="sum">{formatStat(current.sum, current.money)}</strong></span>}</span>}
    </div>}
  </div>;
}
