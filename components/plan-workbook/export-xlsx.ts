import type { WorkbookColumn, WorkbookRow } from './types';

export type ExportSheet = { name: string; columns: WorkbookColumn[]; rows: WorkbookRow[]; totals?: boolean };
const moneyFormat = '"₦"#,##0.00';
const numberFormat = '#,##0';
// Worksheet names: max 31 characters, none of []:*?/\
const sheetName = (name: string, used: Set<string>) => {
  const base = name.replace(/[[\]:*?/\\]/g, ' ').slice(0, 31).trim() || 'Sheet';
  let candidate = base; for (let i = 2; used.has(candidate.toLowerCase()); i++) candidate = `${base.slice(0, 28)} ${i}`;
  used.add(candidate.toLowerCase()); return candidate;
};
const columnLetter = (index: number) => { let n = index + 1, out = ''; while (n) { const r = (n - 1) % 26; out = String.fromCharCode(65 + r) + out; n = Math.floor((n - 1) / 26); } return out; };

/** Builds a real multi-sheet .xlsx in the browser. exceljs is loaded only when this runs. */
export async function buildWorkbook(sheets: ExportSheet[]) {
  const loaded = await import('exceljs');
  const ExcelJS = (loaded as unknown as { default?: typeof loaded }).default ?? loaded;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'BEAPMS Portal'; workbook.created = new Date();
  const used = new Set<string>();
  for (const sheet of sheets) {
    const ws = workbook.addWorksheet(sheetName(sheet.name, used), { views: [{ state: 'frozen', xSplit: 1, ySplit: 1 }] });
    ws.columns = sheet.columns.map(c => ({ header: c.header, key: c.id, width: Math.max(10, Math.min(60, Math.round((c.size ?? 140) / 7))), style: c.kind === 'money' ? { numFmt: moneyFormat } : c.kind === 'number' ? { numFmt: numberFormat } : {} }));
    const header = ws.getRow(1);
    header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF004540' } };
    for (const row of sheet.rows) ws.addRow(Object.fromEntries(sheet.columns.map(c => [c.id, row.values[c.id] === '' ? null : row.values[c.id]])));
    if (sheet.columns.length) ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: sheet.columns.length } };
    if (sheet.totals !== false && sheet.rows.length) {
      const last = sheet.rows.length + 1;
      const totals = ws.addRow(Object.fromEntries(sheet.columns.map((c, i) => [c.id, i === 0 ? `Total · ${sheet.rows.length} rows` : c.total ? { formula: `SUM(${columnLetter(i)}2:${columnLetter(i)}${last})`, result: sheet.rows.reduce((sum, r) => sum + (typeof r.values[c.id] === 'number' ? Number(r.values[c.id]) : 0), 0) } : null])));
      totals.font = { bold: true };
      totals.border = { top: { style: 'thin' } };
    }
  }
  return workbook.xlsx.writeBuffer();
}

export async function downloadWorkbook(fileName: string, sheets: ExportSheet[]) {
  const buffer = await buildWorkbook(sheets);
  const url = URL.createObjectURL(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  const link = document.createElement('a');
  link.href = url; link.download = fileName.replace(/[\\/:*?"<>|]+/g, '-');
  document.body.appendChild(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
