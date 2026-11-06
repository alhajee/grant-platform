import type { WorkbookColumn, WorkbookRow } from './types';
import type { Worksheet, Row, Fill, Borders } from 'exceljs';

export type ExportSheet = { name: string; columns: WorkbookColumn[]; rows: WorkbookRow[]; totals?: boolean };
/** V2 UBEC06: the Summary sheet that opens the whole-workbook download. */
export type ExportCover = {
  title: string; subtitle?: string;
  /** Plan facts as label/value pairs; `money` values use the naira format. */
  facts: { label: string; value: string | number | null; money?: boolean }[];
  /** One row per component sheet in the download. */
  components: { name: string; lines: number; schools: number; amount: number }[];
  /** Distinct schools across all the components listed, when known. */
  schoolTotal?: number;
};

const moneyFormat = '"₦"#,##0.0000';
const numberFormat = '#,##0';
// Brand palette (UBEC green, as on the portal) and the zebra/totals tints derived from it.
const brand = 'FF004540', brandInk = 'FFFFFFFF', zebra = 'FFF3F7F6', totalsFill = 'FFE3EEEC', rule = 'FFD5DEDC', muted = 'FF5B6B68';
const solid = (argb: string): Fill => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });
const hairline: Partial<Borders> = { bottom: { style: 'thin', color: { argb: rule } } };
const font = { name: 'Calibri', size: 11 };

// Worksheet names: max 31 characters, none of []:*?/\
const sheetName = (name: string, used: Set<string>) => {
  const base = name.replace(/[[\]:*?/\\]/g, ' ').slice(0, 31).trim() || 'Sheet';
  let candidate = base; for (let i = 2; used.has(candidate.toLowerCase()); i++) candidate = `${base.slice(0, 28)} ${i}`;
  used.add(candidate.toLowerCase()); return candidate;
};
const columnLetter = (index: number) => { let n = index + 1, out = ''; while (n) { const r = (n - 1) % 26; out = String.fromCharCode(65 + r) + out; n = Math.floor((n - 1) / 26); } return out; };

/** Landscape A4, fitted to one page wide, header row repeated on every printed page. */
function printSetup(ws: Worksheet, repeatRows?: string) {
  ws.pageSetup = { orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0, horizontalCentered: true,
    margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.25, footer: 0.25 }, ...(repeatRows ? { printTitlesRow: repeatRows } : {}) };
  ws.headerFooter = { oddFooter: '&L&8BEAPMS · &A&R&8Page &P of &N' };
}

function styleHeader(row: Row, alignRight: (col: number) => boolean = () => false) {
  row.height = 30;
  row.eachCell((cell, col) => {
    cell.font = { ...font, bold: true, color: { argb: brandInk } };
    cell.fill = solid(brand);
    cell.alignment = { vertical: 'middle', wrapText: true, horizontal: alignRight(col) ? 'right' : 'left' };
    cell.border = { bottom: { style: 'medium', color: { argb: brand } } };
  });
}

/** Width from the header and the longest value (text wraps past 60 characters); money and numbers get room for their format. */
function columnWidth(column: WorkbookColumn, rows: readonly WorkbookRow[]) {
  const longest = rows.reduce((max, row) => {
    const value = row.values[column.id];
    if (value === undefined || value === '') return max;
    const length = column.kind === 'money' ? `₦${Number(value).toLocaleString('en-NG', { minimumFractionDigits: 4 })}`.length : String(value).length;
    return Math.max(max, length);
  }, 0);
  const base = Math.max(column.header.length + 4, longest + 2, column.kind === 'money' ? 18 : 10);
  return Math.min(column.kind === 'text' ? 60 : 28, base);
}

function addDataSheet(workbook: import('exceljs').Workbook, sheet: ExportSheet, used: Set<string>) {
  const ws = workbook.addWorksheet(sheetName(sheet.name, used), { views: [{ state: 'frozen', xSplit: 1, ySplit: 1, zoomScale: 100 }], properties: { tabColor: { argb: brand } } });
  ws.columns = sheet.columns.map(c => ({ header: c.header, key: c.id, width: columnWidth(c, sheet.rows), style: { font, ...(c.kind === 'money' ? { numFmt: moneyFormat } : c.kind === 'number' ? { numFmt: numberFormat } : {}) } }));
  styleHeader(ws.getRow(1), col => sheet.columns[col - 1]?.kind !== 'text');
  sheet.rows.forEach((row, index) => {
    const added = ws.addRow(Object.fromEntries(sheet.columns.map(c => [c.id, row.values[c.id] === '' ? null : row.values[c.id]])));
    added.eachCell({ includeEmpty: true }, (cell, col) => {
      const kind = sheet.columns[col - 1]?.kind;
      cell.alignment = { vertical: 'top', wrapText: kind === 'text', horizontal: kind === 'text' ? 'left' : 'right' };
      cell.border = hairline;
      if (index % 2 === 1) cell.fill = solid(zebra);
    });
  });
  if (sheet.columns.length) ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: Math.max(1, sheet.rows.length + 1), column: sheet.columns.length } };
  if (sheet.totals !== false && sheet.rows.length) {
    const last = sheet.rows.length + 1;
    const totals = ws.addRow(Object.fromEntries(sheet.columns.map((c, i) => [c.id, i === 0 ? `Total · ${sheet.rows.length} ${sheet.rows.length === 1 ? 'row' : 'rows'}` : c.total ? { formula: `SUBTOTAL(9,${columnLetter(i)}2:${columnLetter(i)}${last})`, result: sheet.rows.reduce((sum, r) => sum + (typeof r.values[c.id] === 'number' ? Number(r.values[c.id]) : 0), 0) } : null])));
    totals.height = 22;
    totals.eachCell({ includeEmpty: true }, (cell, col) => {
      cell.font = { ...font, bold: true, color: { argb: brand } };
      cell.fill = solid(totalsFill);
      cell.border = { top: { style: 'medium', color: { argb: brand } }, bottom: { style: 'thin', color: { argb: brand } } };
      cell.alignment = { vertical: 'middle', horizontal: sheet.columns[col - 1]?.kind === 'text' ? 'left' : 'right' };
    });
  }
  printSetup(ws, '1:1');
}

/** The Summary sheet: the plan's title, its funding facts and one row per component with lines, schools and amount. */
function addCoverSheet(workbook: import('exceljs').Workbook, cover: ExportCover, used: Set<string>) {
  const ws = workbook.addWorksheet(sheetName('Summary', used), { views: [{ showGridLines: false }], properties: { tabColor: { argb: brand } } });
  ws.columns = [{ width: 4 }, { width: 44 }, { width: 14 }, { width: 14 }, { width: 26 }, { width: 14 }];
  ws.mergeCells('B2:F2');
  const title = ws.getCell('B2');
  title.value = cover.title; title.font = { ...font, size: 20, bold: true, color: { argb: brand } };
  ws.getRow(2).height = 32;
  ws.mergeCells('B3:F3');
  const subtitle = ws.getCell('B3');
  subtitle.value = cover.subtitle ?? `Plan workbook · downloaded ${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}`;
  subtitle.font = { ...font, color: { argb: muted } };
  for (let col = 2; col <= 6; col++) ws.getCell(4, col).border = { bottom: { style: 'medium', color: { argb: brand } } };

  let r = 6;
  for (const fact of cover.facts) {
    const label = ws.getCell(r, 2), value = ws.getCell(r, 5);
    label.value = fact.label; label.font = { ...font, color: { argb: muted } };
    ws.mergeCells(r, 5, r, 6);
    value.value = fact.value ?? '—'; value.font = { ...font, bold: true };
    value.alignment = { horizontal: 'right' };
    if (fact.money && typeof fact.value === 'number') value.numFmt = moneyFormat;
    for (let col = 2; col <= 6; col++) ws.getCell(r, col).border = hairline;
    r++;
  }

  r += 1;
  const head = ws.getRow(r);
  ['', 'Component', 'Lines', 'Schools', 'Proposed amount', 'Share'].forEach((text, i) => { if (i) head.getCell(i + 1).value = text; });
  styleHeader(head, col => col > 2);
  head.getCell(1).fill = { type: 'pattern', pattern: 'none' }; head.getCell(1).border = {};
  const first = r + 1, lastRow = r + cover.components.length, grand = cover.components.reduce((sum, c) => sum + c.amount, 0);
  cover.components.forEach((component, index) => {
    const row = ws.getRow(first + index);
    row.getCell(2).value = component.name;
    row.getCell(3).value = component.lines; row.getCell(3).numFmt = numberFormat;
    row.getCell(4).value = component.schools; row.getCell(4).numFmt = numberFormat;
    row.getCell(5).value = component.amount; row.getCell(5).numFmt = moneyFormat;
    row.getCell(6).value = { formula: `IF($E$${lastRow + 1}=0,0,E${first + index}/$E$${lastRow + 1})`, result: grand ? component.amount / grand : 0 }; row.getCell(6).numFmt = '0.0%';
    for (let col = 2; col <= 6; col++) {
      const cell = row.getCell(col);
      cell.font = font; cell.border = hairline;
      cell.alignment = { vertical: 'middle', horizontal: col === 2 ? 'left' : 'right' };
      if (index % 2 === 1) cell.fill = solid(zebra);
    }
  });
  const total = ws.getRow(lastRow + 1);
  total.getCell(2).value = 'Total';
  if (cover.components.length) {
    total.getCell(3).value = { formula: `SUM(C${first}:C${lastRow})`, result: cover.components.reduce((s, c) => s + c.lines, 0) };
    // Distinct schools across the components (a school in two components counts once), when known.
    if (cover.schoolTotal != null) total.getCell(4).value = cover.schoolTotal;
    total.getCell(5).value = { formula: `SUM(E${first}:E${lastRow})`, result: grand };
    total.getCell(6).value = { formula: `IF(E${lastRow + 1}=0,0,1)`, result: grand ? 1 : 0 };
  }
  total.getCell(3).numFmt = numberFormat; total.getCell(4).numFmt = numberFormat; total.getCell(5).numFmt = moneyFormat; total.getCell(6).numFmt = '0.0%';
  for (let col = 2; col <= 6; col++) {
    const cell = total.getCell(col);
    cell.font = { ...font, bold: true, color: { argb: brand } }; cell.fill = solid(totalsFill);
    cell.border = { top: { style: 'medium', color: { argb: brand } }, bottom: { style: 'thin', color: { argb: brand } } };
    cell.alignment = { vertical: 'middle', horizontal: col === 2 ? 'left' : 'right' };
  }
  total.height = 22;
  const note = ws.getCell(lastRow + 3, 2);
  note.value = 'Each component has its own sheet. Amounts are in naira; schools count distinct schools in the component';
  note.font = { ...font, size: 9, italic: true, color: { argb: muted } };
  printSetup(ws);
  ws.pageSetup.orientation = 'portrait';
}

/** Builds a real multi-sheet .xlsx in the browser. exceljs is loaded only when this runs. */
export async function buildWorkbook(sheets: ExportSheet[], cover?: ExportCover) {
  const loaded = await import('exceljs');
  const ExcelJS = (loaded as unknown as { default?: typeof loaded }).default ?? loaded;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'BEAPMS Portal'; workbook.created = new Date();
  const used = new Set<string>();
  if (cover) addCoverSheet(workbook, cover, used);
  for (const sheet of sheets) addDataSheet(workbook, sheet, used);
  return workbook.xlsx.writeBuffer();
}

export async function downloadWorkbook(fileName: string, sheets: ExportSheet[], cover?: ExportCover) {
  const buffer = await buildWorkbook(sheets, cover);
  const url = URL.createObjectURL(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  const link = document.createElement('a');
  link.href = url; link.download = fileName.replace(/[\\/:*?"<>|]+/g, '-');
  document.body.appendChild(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
