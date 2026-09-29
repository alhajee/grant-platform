import type { KeyboardEvent } from 'react';
import type { Column, ReactTable, Row } from '@tanstack/react-table';
import type { WorkbookFeatures } from './features';
import type { WorkbookRow } from './types';

type Table = ReactTable<WorkbookFeatures, WorkbookRow>;
type Pos = { r: number; c: number };
export type GridContext = {
  table: Table; rows: Row<WorkbookFeatures, WorkbookRow>[]; columns: Column<WorkbookFeatures, WorkbookRow>[];
  pageSize: () => number; onToggle: (rowId: string) => void; onCopyKey: () => void;
};

const clamp = (value: number, max: number) => Math.max(0, Math.min(max, value));
function positionOf(target: EventTarget | null): Pos | null {
  const cell = (target as HTMLElement | null)?.closest?.('[data-row-index]') as HTMLElement | null;
  return cell ? { r: Number(cell.dataset.rowIndex), c: Number(cell.dataset.colIndex) } : null;
}

/** Spreadsheet keyboard model: the anchor is Excel's active cell, the focus corner extends with Shift. */
export function handleGridKey(event: KeyboardEvent<HTMLElement>, ctx: GridContext) {
  const { table, rows, columns } = ctx;
  if (!rows.length || !columns.length) return;
  const lastRow = rows.length - 1, lastCol = columns.length - 1;
  const ranges = table.store.state.cellSelection ?? [];
  const range = ranges[ranges.length - 1];
  const index = (rowId: string, columnId: string): Pos => ({ r: rows.findIndex(row => row.id === rowId), c: columns.findIndex(column => column.id === columnId) });
  const fallback = positionOf(event.target) ?? { r: 0, c: 0 };
  let anchor = range ? index(range.anchorRowId, range.anchorColumnId) : fallback;
  if (anchor.r < 0 || anchor.c < 0) anchor = fallback;
  let focus = range ? index(range.focusRowId, range.focusColumnId) : anchor;
  if (focus.r < 0 || focus.c < 0) focus = anchor;
  const mod = event.ctrlKey || event.metaKey, shift = event.shiftKey, key = event.key;
  const go = (next: Pos, extend: boolean) => {
    event.preventDefault();
    const target = { r: clamp(next.r, lastRow), c: clamp(next.c, lastCol) };
    if (extend) table.selectCellRange({ anchorRowId: rows[anchor.r].id, anchorColumnId: columns[anchor.c].id, focusRowId: rows[target.r].id, focusColumnId: columns[target.c].id });
    else table.setFocusedCell(rows[target.r].id, columns[target.c].id);
  };
  const from = shift ? focus : anchor;
  if (mod && key.toLowerCase() === 'a') { event.preventDefault(); table.selectAllCells(); return; }
  if (mod && key.toLowerCase() === 'c') { ctx.onCopyKey(); return; }
  switch (key) {
    case 'ArrowUp': return go({ r: mod ? 0 : from.r - 1, c: from.c }, shift);
    case 'ArrowDown': return go({ r: mod ? lastRow : from.r + 1, c: from.c }, shift);
    case 'ArrowLeft': return go({ r: from.r, c: mod ? 0 : from.c - 1 }, shift);
    case 'ArrowRight': return go({ r: from.r, c: mod ? lastCol : from.c + 1 }, shift);
    case 'Home': return go({ r: mod ? 0 : from.r, c: 0 }, shift);
    case 'End': return go({ r: mod ? lastRow : from.r, c: lastCol }, shift);
    case 'PageDown': return go({ r: from.r + ctx.pageSize(), c: from.c }, shift);
    case 'PageUp': return go({ r: from.r - ctx.pageSize(), c: from.c }, shift);
    case 'Tab': {
      // Tab walks the row and wraps; at either end of the sheet it lets focus leave the grid.
      const flat = anchor.r * columns.length + anchor.c + (shift ? -1 : 1);
      if (flat < 0 || flat > lastRow * columns.length + lastCol) return;
      return go({ r: Math.floor(flat / columns.length), c: flat % columns.length }, false);
    }
    case 'Enter': {
      const row = rows[anchor.r];
      if (row.original.expandable && !shift) { event.preventDefault(); ctx.onToggle(row.id); return; }
      return go({ r: anchor.r + (shift ? -1 : 1), c: anchor.c }, false);
    }
    case 'Escape':
      if (ranges.length) { event.preventDefault(); table.resetCellSelection(true); }
      return;
  }
}
