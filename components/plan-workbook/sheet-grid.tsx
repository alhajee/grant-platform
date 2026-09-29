'use client';
import { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react';
import type { ReactTable } from '@tanstack/react-table';
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { WorkbookFeatures } from './features';
import { formatCell, isNumeric, type WorkbookColumn, type WorkbookRow, type WorkbookSheet } from './types';
import { handleGridKey } from './grid-navigation';
import { ColumnFilterMenu } from './column-filter';
import { ContextMenu, ContextMenuTrigger } from '@/components/ui/context-menu';
import { CellMenu, type MenuTarget } from './cell-menu';
import { toTsv } from './selection';
import { useSheetComments } from './comments-context';
import { CommentLayer } from './comment-layer';
import { toast } from 'sonner';

export const GUTTER_WIDTH = 60;
const ROW_HEIGHT = 34;
type Table = ReactTable<WorkbookFeatures, WorkbookRow>;
type Props = {
  table: Table; sheet: WorkbookSheet; expanded: Record<string, boolean>; onToggle: (rowId: string) => void;
  filterOptions: Record<string, { value: string; count: number }[]>; onCopy: () => string | null; onDownloadSheet: () => void;
};

export function SheetGrid({ table, sheet, expanded, onToggle, filterOptions, onCopy, onDownloadSheet }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [menuTarget, setMenuTarget] = useState<MenuTarget>(null);
  const copied = useRef(false);
  const specs = new Map<string, WorkbookColumn>(sheet.columns.map(c => [c.id, c]));
  const rows = table.getRowModel().rows;
  const columns = table.getVisibleLeafColumns();
  const filtered = table.getFilteredRowModel().rows;
  const ranges = table.state.cellSelection;
  const range = ranges[ranges.length - 1];
  const anchorKey = range ? `${range.anchorRowId}:${range.anchorColumnId}` : '';
  const focusKey = range ? `${range.focusRowId}:${range.focusColumnId}` : '';
  const hasFocusedCell = rows.some(row => row.id === range?.anchorRowId);
  const comments = useSheetComments(sheet.key);
  const activeComment = comments?.controller.active?.sheet === sheet.key ? `${comments.controller.active.rowRef}:${comments.controller.active.columnId ?? ''}` : '';
  const labelFor = (rowRef: string, columnId: string | null) => {
    const values = sheet.rows.find(row => row.id === rowRef)?.values ?? {};
    return `${columnId ? specs.get(columnId)?.header ?? columnId : 'Row'} · ${String(values.description ?? values[sheet.columns[0]?.id] ?? rowRef)}`;
  };
  const commentState = (rowId: string, columnId: string | null) => !comments ? null : comments.open.has(`${rowId}:${columnId ?? ''}`) ? 'open' as const : comments.can.start ? 'new' as const : null;
  function openComment(rowId: string, columnId: string | null) {
    if (!comments) return;
    const thread = comments.open.get(`${rowId}:${columnId ?? ''}`);
    if (!thread && !comments.can.start) { toast.info(comments.controller.readOnly ? 'Comments are read-only for this plan.' : 'Only the reviewer currently holding this component can start comments.'); return; }
    if (columnId) table.setFocusedCell(rowId, columnId);
    comments.controller.setActive({ sheet: sheet.key, rowRef: rowId, columnId, threadId: thread?.id ?? null });
  }

  // Keep the viewport width available to full-width detail rows inside the horizontally scrolling grid.
  useLayoutEffect(() => {
    const element = scrollRef.current; if (!element) return;
    const observer = new ResizeObserver(([entry]) => element.style.setProperty('--wb-viewport', `${Math.floor(entry.contentRect.width)}px`));
    observer.observe(element); return () => observer.disconnect();
  }, []);
  // Roving focus: while the grid has keyboard focus, DOM focus follows the active cell and the
  // moving corner of the range stays scrolled into view (scroll-padding accounts for frozen panes).
  useEffect(() => {
    const element = scrollRef.current; if (!element || !anchorKey) return;
    const active = document.activeElement as HTMLElement | null;
    if (!active || !element.contains(active) || active.getAttribute('role') !== 'gridcell') return;
    const anchor = element.querySelector<HTMLElement>(`[data-cell-key="${CSS.escape(anchorKey)}"]`);
    if (anchor && anchor !== active) anchor.focus({ preventScroll: true });
    element.querySelector<HTMLElement>(`[data-cell-key="${CSS.escape(focusKey)}"]`)?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [anchorKey, focusKey]);

  const pageSize = useCallback(() => Math.max(1, Math.floor((scrollRef.current?.clientHeight ?? 400) / ROW_HEIGHT) - 2), []);
  function onKeyDown(event: KeyboardEvent<HTMLElement>) {
    if ((event.target as HTMLElement).getAttribute('role') !== 'gridcell') return;
    // Google Sheets' comment shortcut: Ctrl+Alt+M (⌘⌥M on a Mac) on the focused cell.
    if (comments && (event.ctrlKey || event.metaKey) && event.altKey && event.code === 'KeyM') {
      const [rowId, columnId] = ((event.target as HTMLElement).dataset.cellKey ?? '').split(':');
      if (rowId && columnId) { event.preventDefault(); openComment(rowId, columnId); }
      return;
    }
    handleGridKey(event, { table, rows, columns, pageSize, onToggle, onCopyKey: () => {
      // Browsers fire a copy event for Ctrl/Cmd+C; fall back to the async clipboard if one does not.
      copied.current = false;
      setTimeout(() => { if (!copied.current) { const text = onCopy(); if (text !== null) void navigator.clipboard?.writeText(text).catch(() => {}); } }, 0);
    } });
  }
  function selectRow(event: MouseEvent, rowId: string) {
    if (event.button !== 0 || !columns.length) return;
    const first = columns[0].id, last = columns[columns.length - 1].id;
    const current = table.store.state.cellSelection.at(-1);
    table.selectCellRange(event.shiftKey && current ? { anchorRowId: current.anchorRowId, anchorColumnId: first, focusRowId: rowId, focusColumnId: last } : { anchorRowId: rowId, anchorColumnId: first, focusRowId: rowId, focusColumnId: last });
    requestAnimationFrame(() => scrollRef.current?.querySelector<HTMLElement>('[tabindex="0"][role=gridcell]')?.focus({ preventScroll: true }));
  }
  // Right-click keeps an existing selection (like Excel) and otherwise selects the clicked cell first.
  function openMenu(row: WorkbookRow, columnId: string, selected: boolean) {
    if (!selected) table.setFocusedCell(row.id, columnId);
    setMenuTarget({ row, column: specs.get(columnId)!, expanded: !!expanded[row.id] });
  }
  const setValues = (columnId: string, values: string[]) => table.getColumn(columnId)?.setFilterValue(values.length ? values : undefined);
  const menuActions = {
    copySelection: onCopy,
    copyRow: (row: WorkbookRow) => toTsv([{ rows: [row], columns: columns.map(column => specs.get(column.id)!) }]),
    sort: (columnId: string, direction: 'asc' | 'desc' | false) => table.setSorting(direction ? [{ id: columnId, desc: direction === 'desc' }] : []),
    sorted: (columnId: string) => table.getColumn(columnId)?.getIsSorted() ?? false,
    onlyValue: (columnId: string, value: string) => setValues(columnId, [value]),
    hideValue: (columnId: string, value: string) => {
      const current = (table.getColumn(columnId)?.getFilterValue() as string[] | undefined) ?? (filterOptions[columnId] ?? []).map(option => option.value);
      setValues(columnId, current.filter(v => v !== value));
    },
    clearFilters: () => table.resetColumnFilters(true), filtering: table.state.columnFilters.length > 0,
    filterable: (columnId: string) => !!filterOptions[columnId],
    selectRow: (rowId: string) => selectRow({ button: 0, shiftKey: false } as MouseEvent, rowId),
    selectColumn: (columnId: string) => { if (rows.length) table.selectCellRange({ anchorRowId: rows[0].id, anchorColumnId: columnId, focusRowId: rows[rows.length - 1].id, focusColumnId: columnId }); },
    selectAll: () => table.selectAllCells(), toggleDetails: onToggle, download: onDownloadSheet,
    editHref: sheet.editHref, editLabel: sheet.editLabel,
    ...(comments ? { commentState, comment: openComment } : {}),
  };
  // aria-rowindex counts the header, data rows, open detail rows and the totals row in DOM order.
  const ariaRows: number[] = [], ariaDetails: number[] = [];
  for (const row of rows) { ariaRows.push(ariaRows.length + ariaDetails.length + 2); if (expanded[row.id] && row.original.expandable) ariaDetails.push(ariaRows.length + ariaDetails.length + 1); }
  const detailIndex = new Map(rows.filter(row => expanded[row.id] && row.original.expandable).map((row, i) => [row.id, ariaDetails[i]]));
  const lastAriaRow = (rows.length || 1) + ariaDetails.length + 2;
  const colCount = columns.length + 1;

  return <div ref={scrollRef} className="wb-scroll" style={{ scrollPaddingLeft: GUTTER_WIDTH + (columns[0]?.getSize() ?? 0), scrollPaddingTop: 40, scrollPaddingBottom: 40 }} onKeyDown={onKeyDown}
    onCopy={event => { const text = onCopy(); if (text === null) return; copied.current = true; event.clipboardData.setData('text/plain', text); event.preventDefault(); }}>
    <table role="grid" aria-label={`${sheet.label} sheet`} aria-multiselectable="true" aria-readonly="true" aria-rowcount={lastAriaRow} aria-colcount={colCount} className="wb-grid" style={{ width: GUTTER_WIDTH + table.getTotalSize() }}>
      <colgroup><col style={{ width: GUTTER_WIDTH }} />{columns.map(column => <col key={column.id} style={{ width: column.getSize() }} />)}</colgroup>
      <thead><tr role="row" aria-rowindex={1}>
        <th role="columnheader" aria-colindex={1} className="wb-corner"><button type="button" tabIndex={-1} aria-label="Select all cells" title="Select all (Ctrl+A)" onClick={() => table.selectAllCells()} /></th>
        {table.getHeaderGroups()[0].headers.map((header, index) => {
          const spec = specs.get(header.column.id)!, sorted = header.column.getIsSorted();
          const selected = (filterOptions[spec.id] && (header.column.getFilterValue() as string[] | undefined)) || [];
          return <th key={header.id} role="columnheader" aria-colindex={index + 2} aria-sort={sorted === 'asc' ? 'ascending' : sorted === 'desc' ? 'descending' : 'none'} className={cn(index === 0 && 'wb-frozen', isNumeric(spec.kind) && 'wb-number')} style={index === 0 ? { left: GUTTER_WIDTH } : undefined}>
            <div className="wb-head">
              <button type="button" className="wb-sort" onClick={header.column.getToggleSortingHandler()} title={`Sort by ${spec.header}`}><span>{spec.header}</span>{sorted === 'asc' ? <ArrowUp aria-hidden="true" /> : sorted === 'desc' ? <ArrowDown aria-hidden="true" /> : null}</button>
              {filterOptions[spec.id] && <ColumnFilterMenu label={spec.header} options={filterOptions[spec.id]} selected={selected} onChange={next => header.column.setFilterValue(next.length ? next : undefined)} />}
            </div>
            <div role="separator" aria-orientation="vertical" aria-label={`Resize ${spec.header}`} aria-valuenow={header.getSize()} tabIndex={0} className="wb-resizer" data-resizing={header.column.getIsResizing() || undefined}
              onMouseDown={header.getResizeHandler()} onTouchStart={header.getResizeHandler()} onDoubleClick={() => header.column.resetSize()}
              onKeyDown={event => { if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return; event.preventDefault(); const size = Math.max(64, Math.min(640, header.getSize() + (event.key === 'ArrowRight' ? 16 : -16))); table.setColumnSizing(old => ({ ...old, [header.column.id]: size })); }} />
          </th>;
        })}
      </tr></thead>
      <ContextMenu><ContextMenuTrigger asChild><tbody onContextMenu={event => { if (!(event.target as HTMLElement).closest('[data-cell-key], .wb-gutter')) setMenuTarget(null); }}>
        {!rows.length && <tr role="row" aria-rowindex={2}><td role="gridcell" aria-colindex={1} colSpan={colCount} className="wb-empty">{sheet.rows.length ? `No ${sheet.itemLabel} match your search or filters.` : sheet.empty}</td></tr>}
        {rows.map((row, r) => {
          const open = !!expanded[row.id] && !!row.original.expandable;
          const label = String(row.original.values[columns[0]?.id] ?? row.id);
          const rowThread = comments?.open.get(`${row.id}:`);
          return <Fragment key={row.id}>
            <tr role="row" aria-rowindex={ariaRows[r]} data-open={open || undefined} className={cn(rowThread && 'has-row-comment', activeComment === `${row.id}:` && 'row-comment-open')}>
              <th role="rowheader" aria-colindex={1} className={cn('wb-gutter', rowThread && 'has-comment')} data-row-key={row.id} data-comment-id={rowThread?.id} aria-label={rowThread ? `Row ${r + 1}, has comment` : undefined}
                onMouseDown={event => selectRow(event, row.id)} onClick={() => { if (rowThread) openComment(row.id, null); }} onContextMenu={() => { if (columns[0]) openMenu(row.original, columns[0].id, !!row.getVisibleCells()[0]?.getIsSelected()); }}>
                <div className="wb-gutter-inner">{row.original.expandable && <button type="button" tabIndex={-1} className="wb-expand" aria-expanded={open} aria-controls={`wb-${sheet.key}-${row.id}-details`} aria-label={`${open ? 'Hide' : 'Show'} details for ${label}`} onMouseDown={event => event.stopPropagation()} onClick={() => onToggle(row.id)}>{open ? <ChevronDown /> : <ChevronRight />}</button>}
                <span>{r + 1}</span></div>
              </th>
              {row.getVisibleCells().map((cell, c) => {
                const spec = specs.get(cell.column.id)!, value = row.original.values[spec.id], selected = cell.getIsSelected();
                const edges = selected ? cell.getSelectionEdges() : null, key = `${row.id}:${cell.column.id}`;
                const text = formatCell(spec.kind, value);
                const thread = comments?.open.get(key);
                return <td key={cell.id} role="gridcell" aria-colindex={c + 2} aria-selected={selected} data-cell-key={key} data-row-index={r} data-col-index={c} data-comment-id={thread?.id}
                  tabIndex={hasFocusedCell ? cell.getTabIndex() : r === 0 && c === 0 ? 0 : -1}
                  className={cn(c === 0 && 'wb-frozen', isNumeric(spec.kind) && 'wb-number', selected && 'is-selected', key === anchorKey && 'is-active', edges?.top && 'edge-t', edges?.bottom && 'edge-b', edges?.left && 'edge-l', edges?.right && 'edge-r', thread && 'has-comment', activeComment === key && 'comment-open')}
                  style={c === 0 ? { left: GUTTER_WIDTH } : undefined} title={spec.kind === 'text' && text.length > 18 ? text : undefined}
                  onMouseDown={event => { if (event.button === 0) cell.getSelectionStartHandler()(event); }} onMouseEnter={cell.getSelectionExtendHandler()}
                  onContextMenu={() => openMenu(row.original, cell.column.id, selected)} onClick={event => { if (thread && !event.shiftKey && !event.ctrlKey && !event.metaKey) openComment(row.id, cell.column.id); }}
                  onFocus={() => { if (!table.store.state.cellSelection.length) table.setFocusedCell(row.id, cell.column.id); }}>{text || <span className="wb-blank" aria-label="Blank">—</span>}{thread && <span className="sr-only">, has comment</span>}</td>;
              })}
            </tr>
            {open && <tr role="row" aria-rowindex={detailIndex.get(row.id)} className="wb-detail" id={`wb-${sheet.key}-${row.id}-details`}><td role="gridcell" aria-colindex={1} colSpan={colCount}><div className="wb-detail-inner review-row-details">{sheet.detail?.(row.id)}</div></td></tr>}
          </Fragment>;
        })}
      </tbody></ContextMenuTrigger><CellMenu target={menuTarget} actions={menuActions} /></ContextMenu>
      <tfoot><tr role="row" aria-rowindex={lastAriaRow}>
        <th role="rowheader" aria-colindex={1} className="wb-gutter" aria-label="Totals">Σ</th>
        {columns.map((column, c) => {
          const spec = specs.get(column.id)!;
          const total = spec.total ? filtered.reduce((sum, row) => sum + (typeof row.original.values[spec.id] === 'number' ? Math.round(Number(row.original.values[spec.id]) * 100) : 0), 0) / 100 : null;
          return <td key={column.id} role="gridcell" aria-colindex={c + 2} className={cn(c === 0 && 'wb-frozen', isNumeric(spec.kind) && 'wb-number')} style={c === 0 ? { left: GUTTER_WIDTH } : undefined}>
            {c === 0 ? <><strong>{filtered.length === sheet.rows.length ? 'Total' : 'Filtered total'}</strong> <span className="wb-total-count">{filtered.length} of {sheet.rows.length}</span></> : total !== null ? formatCell(spec.kind, total) : ''}
          </td>;
        })}
      </tr></tfoot>
    </table>
    {comments && <CommentLayer sheet={sheet} comments={comments} scrollRef={scrollRef} labelFor={labelFor} />}
  </div>;
}
