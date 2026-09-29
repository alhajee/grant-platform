'use client';
import { useRef } from 'react';
import { MessageSquarePlus, MessageSquareText, ArrowDownAZ, ArrowUpAZ, ArrowUpDown, ChevronsUpDown, ClipboardCopy, Copy, Download, Eye, EyeOff, FilterX, ListFilter, PencilIcon, Rows3, Columns3, SquareDashedMousePointer } from 'lucide-react';
import { toast } from 'sonner';
import { ContextMenuContent, ContextMenuGroup, ContextMenuItem, ContextMenuLabel, ContextMenuSeparator, ContextMenuShortcut } from '@/components/ui/context-menu';
import { formatCell, isNumeric, type CellValue, type WorkbookColumn, type WorkbookRow } from './types';

/** The cell the menu was opened on; null when the sheet is empty. */
export type MenuTarget = { row: WorkbookRow; column: WorkbookColumn; expanded: boolean } | null;
export type CellMenuActions = {
  copySelection: () => string | null; copyRow: (row: WorkbookRow) => string;
  sort: (columnId: string, direction: 'asc' | 'desc' | false) => void; sorted: (columnId: string) => 'asc' | 'desc' | false;
  onlyValue: (columnId: string, value: string) => void; hideValue: (columnId: string, value: string) => void;
  clearFilters: () => void; filtering: boolean; filterable: (columnId: string) => boolean;
  selectRow: (rowId: string) => void; selectColumn: (columnId: string) => void; selectAll: () => void;
  toggleDetails: (rowId: string) => void; download: () => void; editHref?: string; editLabel?: string;
  /** 'open' shows an existing thread, 'new' starts one, null hides the item (no permission). */
  commentState?: (rowId: string, columnId: string | null) => 'open' | 'new' | null; comment?: (rowId: string, columnId: string | null) => void;
};

const shortcut = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl+';
async function write(text: string | null, message: string) {
  if (text === null) return;
  try { await navigator.clipboard.writeText(text); toast.success(message); }
  catch { toast.error('Copying is blocked by the browser. Use Ctrl+C instead.'); }
}
const raw = (value: CellValue | undefined) => value === undefined ? '' : String(value);
const short = (text: string) => text.length > 28 ? `${text.slice(0, 27)}…` : text;

/** Excel-style right-click menu for a workbook cell. */
export function CellMenu({ target, actions }: { target: MenuTarget; actions: CellMenuActions }) {
  const column = target?.column, row = target?.row;
  const value = row && column ? raw(row.values[column.id]) : '';
  const shown = row && column ? formatCell(column.kind, row.values[column.id]) : '';
  const sorted = column ? actions.sorted(column.id) : false;
  const text = column && !isNumeric(column.kind);
  const cellComment = row && column && actions.commentState ? actions.commentState(row.id, column.id) : null;
  const rowComment = row && actions.commentState ? actions.commentState(row.id, null) : null;
  const commentKey = shortcut === '⌘' ? '⌘⌥M' : 'Ctrl+Alt+M';
  // The comment popover opens once the menu has closed: a closing menu still traps focus and would dismiss it.
  const pending = useRef<(() => void) | null>(null);
  const comment = (rowId: string, columnId: string | null) => { pending.current = () => actions.comment?.(rowId, columnId); };
  return <ContextMenuContent className="wb-cell-menu" onCloseAutoFocus={event => { const run = pending.current; if (!run) return; pending.current = null; event.preventDefault(); run(); }}
    // Releasing the right button (or Ctrl+click on a Mac) over a menu that shifted under the pointer must not pick an item.
    onPointerUpCapture={event => { if (event.button === 2 || event.ctrlKey) event.preventDefault(); }}>
    {column && row && <ContextMenuLabel className="wb-cell-menu-label">{column.header}: <span>{short(shown || '(Blank)')}</span></ContextMenuLabel>}
    <ContextMenuGroup>
      <ContextMenuItem onSelect={() => void write(actions.copySelection(), 'Selection copied')}><Copy />Copy selection<ContextMenuShortcut>{shortcut}C</ContextMenuShortcut></ContextMenuItem>
      {column && row && <ContextMenuItem onSelect={() => void write(value, 'Cell copied')}><ClipboardCopy />Copy cell value</ContextMenuItem>}
      {row && <ContextMenuItem onSelect={() => void write(actions.copyRow(row), 'Row copied')}><Rows3 />Copy row</ContextMenuItem>}
    </ContextMenuGroup>
    {row && (cellComment || rowComment) && <><ContextMenuSeparator /><ContextMenuGroup>
      {column && cellComment && <ContextMenuItem onSelect={() => comment(row.id, column.id)}>{cellComment === 'open' ? <MessageSquareText /> : <MessageSquarePlus />}{cellComment === 'open' ? 'Show comment' : 'Comment'}<ContextMenuShortcut>{commentKey}</ContextMenuShortcut></ContextMenuItem>}
      {rowComment && <ContextMenuItem onSelect={() => comment(row.id, null)}>{rowComment === 'open' ? <MessageSquareText /> : <MessageSquarePlus />}{rowComment === 'open' ? 'Show row comment' : 'Comment on row'}</ContextMenuItem>}
    </ContextMenuGroup></>}
    {column && <><ContextMenuSeparator /><ContextMenuGroup>
      <ContextMenuItem disabled={sorted === 'asc'} onSelect={() => actions.sort(column.id, 'asc')}>{text ? <ArrowDownAZ /> : <ArrowUpDown />}Sort {text ? 'A → Z' : 'smallest → largest'}</ContextMenuItem>
      <ContextMenuItem disabled={sorted === 'desc'} onSelect={() => actions.sort(column.id, 'desc')}>{text ? <ArrowUpAZ /> : <ArrowUpDown />}Sort {text ? 'Z → A' : 'largest → smallest'}</ContextMenuItem>
      {sorted && <ContextMenuItem onSelect={() => actions.sort(column.id, false)}><ChevronsUpDown />Clear sort</ContextMenuItem>}
    </ContextMenuGroup></>}
    {column && (actions.filterable(column.id) || actions.filtering) && <><ContextMenuSeparator /><ContextMenuGroup>
      {actions.filterable(column.id) && <>
        <ContextMenuItem onSelect={() => actions.onlyValue(column.id, value)}><ListFilter />Show only “{short(shown || '(Blank)')}”</ContextMenuItem>
        <ContextMenuItem onSelect={() => actions.hideValue(column.id, value)}><EyeOff />Hide “{short(shown || '(Blank)')}”</ContextMenuItem>
      </>}
      {actions.filtering && <ContextMenuItem onSelect={actions.clearFilters}><FilterX />Clear all filters</ContextMenuItem>}
    </ContextMenuGroup></>}
    <ContextMenuSeparator />
    <ContextMenuGroup>
      {row && <ContextMenuItem onSelect={() => actions.selectRow(row.id)}><Rows3 />Select row</ContextMenuItem>}
      {column && <ContextMenuItem onSelect={() => actions.selectColumn(column.id)}><Columns3 />Select column</ContextMenuItem>}
      <ContextMenuItem onSelect={actions.selectAll}><SquareDashedMousePointer />Select all<ContextMenuShortcut>{shortcut}A</ContextMenuShortcut></ContextMenuItem>
      {row?.expandable && <ContextMenuItem onSelect={() => actions.toggleDetails(row.id)}><Eye />{target?.expanded ? 'Hide details' : 'Show details'}<ContextMenuShortcut>Enter</ContextMenuShortcut></ContextMenuItem>}
    </ContextMenuGroup>
    <ContextMenuSeparator />
    <ContextMenuGroup>
      <ContextMenuItem onSelect={actions.download}><Download />Download sheet as .xlsx</ContextMenuItem>
      {actions.editHref && <ContextMenuItem asChild><a href={actions.editHref}><PencilIcon />Edit {actions.editLabel}</a></ContextMenuItem>}
    </ContextMenuGroup>
  </ContextMenuContent>;
}
