import type { CellValue, WorkbookColumn, WorkbookRow } from './types';
import { money } from './types';

export type Bounds = { minRowIndex: number; maxRowIndex: number; minColumnIndex: number; maxColumnIndex: number };
type Block = { columns: WorkbookColumn[]; rows: WorkbookRow[] };

/** Resolves selection rectangles (display-order indexes) into the rows and columns they cover. */
export function selectedBlocks(bounds: Bounds[], rows: WorkbookRow[], columns: WorkbookColumn[]): Block[] {
  return bounds.map(b => ({ rows: rows.slice(b.minRowIndex, b.maxRowIndex + 1), columns: columns.slice(b.minColumnIndex, b.maxColumnIndex + 1) }));
}

// Excel/Sheets TSV: quote a field only when it holds a tab, newline or quote.
const tsvField = (value: CellValue | undefined) => {
  const raw = value === undefined ? '' : String(value);
  return /[\t\n\r"]/.test(raw) ? `"${raw.replace(/"/g, '""')}"` : raw;
};
/** Raw values (plain numbers, not currency strings) so a paste into Excel stays numeric. */
export function toTsv(blocks: Block[]) {
  return blocks.map(block => block.rows.map(row => block.columns.map(column => tsvField(row.values[column.id])).join('\t')).join('\n')).join('\n\n');
}

export type SelectionStats = { count: number; numeric: number; sum: number; average: number; money: boolean };
export function selectionStats(blocks: Block[]): SelectionStats {
  let count = 0, numeric = 0, sumCents = 0, allMoney = true;
  for (const block of blocks) for (const row of block.rows) for (const column of block.columns) {
    const value = row.values[column.id];
    if (value === undefined || value === '') continue;
    count++;
    if (column.kind === 'text' || typeof value !== 'number') continue;
    numeric++; sumCents += Math.round(value * 100);
    if (column.kind !== 'money') allMoney = false;
  }
  return { count, numeric, sum: sumCents / 100, average: numeric ? sumCents / 100 / numeric : 0, money: numeric > 0 && allMoney };
}
const plain = new Intl.NumberFormat('en-NG', { maximumFractionDigits: 2 });
export const formatStat = (value: number, isMoney: boolean) => isMoney ? money.format(value) : plain.format(value);
