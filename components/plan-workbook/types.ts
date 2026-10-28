import type { ComponentType, ReactNode } from 'react';
import { nairaFormat } from '@/lib/money-format';

export type SheetKey = import('@/lib/plan-comments').CommentSheet;
export type CellValue = string | number;
export type ColumnKind = 'text' | 'number' | 'money';
/** One spreadsheet column. `value` returns the raw value used for sorting, copying and export. */
/** `cell` draws the cell (e.g. a map link) in place of the formatted value, which still serves copying, search and export. */
export type WorkbookColumn = { id: string; header: string; kind: ColumnKind; size?: number; filter?: boolean; total?: boolean; cell?: (row: WorkbookRow) => ReactNode };
/** `decision`: the UBEC item decision, on assessed component sheets only (assessment-context.tsx). */
export type WorkbookRow = { id: string; values: Record<string, CellValue>; search: string; expandable?: boolean; decision?: 'accept' | 'reject' | 'open'; /** UBEC195: rejected on the previous submission and corrected since. */ corrected?: boolean };
export type WorkbookSheet = {
  key: SheetKey; label: string; hash: string; icon: ComponentType<{ className?: string }>;
  itemLabel: string; empty: string; columns: WorkbookColumn[]; rows: WorkbookRow[];
  detail?: (rowId: string) => ReactNode; editHref?: string; editLabel?: string;
};

export const money = nairaFormat;
const count = new Intl.NumberFormat('en-NG', { maximumFractionDigits: 2 });
export const formatCell = (kind: ColumnKind, value: CellValue | undefined) => value === undefined || value === '' ? '' : kind === 'money' ? money.format(Number(value)) : kind === 'number' ? count.format(Number(value)) : String(value);
export const isNumeric = (kind: ColumnKind) => kind !== 'text';
