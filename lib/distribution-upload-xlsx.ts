import ExcelJS from 'exceljs';
import { cellValue, normalisedWorkbook, SchoolImportError } from './school-register-xlsx';
import { maxUploadRows, type UploadRow } from './distribution-upload';

// Server-only (UBEC248): the school list template for distribution lists and PHE training schools, and reading it back.
// One "Schools" sheet with DNEMIS code and School name (prefilled with the schools already listed), plus a Guide sheet.

export class ListUploadError extends SchoolImportError {}
const headers = ['DNEMIS code', 'School name', 'LGA (optional)'] as const;
const normal = (text: string) => text.replace(/\s+/g, ' ').trim().toLowerCase();
const codeHeaders = new Set(['dnemis code', 'dnemis school code', 'school code', 'emis code', 'code', 'school code (emis/dnemis)']);
const nameHeaders = new Set(['school name', 'name of school', 'name of schools', 'name']);

export type TemplateSchool = { code: string | null; name: string; lga: string };

export async function buildListTemplate(title: string, listed: readonly TemplateSchool[]): Promise<ArrayBuffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'BEAPMS';
  const sheet = workbook.addWorksheet('Schools', { views: [{ state: 'frozen', ySplit: 1 }] });
  sheet.columns = [{ width: 18 }, { width: 50 }, { width: 22 }];
  sheet.getColumn(1).numFmt = '@';
  const header = sheet.getRow(1);
  headers.forEach((text, index) => { const cell = header.getCell(index + 1); cell.value = text; cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }; cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F6B45' } }; });
  listed.forEach((school, index) => { const row = sheet.getRow(index + 2); row.getCell(1).value = school.code ?? ''; row.getCell(2).value = school.name; row.getCell(3).value = school.lga; });
  sheet.autoFilter = { from: 'A1', to: 'C1' };
  const guide = workbook.addWorksheet('Guide');
  guide.getColumn(1).width = 20; guide.getColumn(2).width = 90;
  const rows: [string, string][] = [
    [title, 'School list template'],
    ['How to use', 'Enter one school per row on the Schools sheet, under the header row. Keep the header row unchanged'],
    ['DNEMIS code', 'The school\'s DNEMIS school code, as shown in the School list. Required'],
    ['School name', 'The school\'s name as in the School list. Case, spaces and punctuation do not matter. Required'],
    ['Checks', 'A school is added only when its DNEMIS code and name both match the same school. Rows that do not match are shown before anything is added'],
    ['Listed schools', 'Schools already on the list are filled in. Uploading never removes a school; remove schools in the editor'],
  ];
  rows.forEach(([label, value], index) => { const row = guide.getRow(index + 1); row.getCell(1).value = label; row.getCell(2).value = value; row.getCell(1).font = { bold: true }; row.getCell(2).alignment = { wrapText: true }; });
  return await workbook.xlsx.writeBuffer() as ArrayBuffer;
}

/** Reads the DNEMIS code and School name of every filled row (the header may be on any of the first 10 rows). */
export async function readListRows(bytes: ArrayBuffer): Promise<UploadRow[]> {
  let workbook: ExcelJS.Workbook;
  try { workbook = await normalisedWorkbook(bytes, 'Upload the school list as an Excel (.xlsx) workbook'); }
  catch (cause) { if (cause instanceof SchoolImportError) throw new ListUploadError(cause.message); throw new ListUploadError('The file could not be read. Save it as an Excel (.xlsx) workbook and try again'); }
  for (const sheet of [...workbook.worksheets].sort((a, b) => Number(b.name === 'Schools') - Number(a.name === 'Schools'))) {
    for (let headerRow = 1; headerRow <= Math.min(10, sheet.rowCount); headerRow++) {
      const row = sheet.getRow(headerRow);
      let codeColumn = 0, nameColumn = 0;
      for (let column = 1; column <= Math.min(row.cellCount, 40); column++) {
        const text = normal(row.getCell(column).text);
        if (!codeColumn && codeHeaders.has(text)) codeColumn = column;
        else if (!nameColumn && nameHeaders.has(text)) nameColumn = column;
      }
      if (!codeColumn || !nameColumn) continue;
      const rows: UploadRow[] = [];
      for (let rowNumber = headerRow + 1; rowNumber <= sheet.rowCount; rowNumber++) {
        const data = sheet.getRow(rowNumber);
        const code = String(cellValue(data.getCell(codeColumn)) ?? '').trim(), name = String(cellValue(data.getCell(nameColumn)) ?? '').trim();
        if (!code && !name) continue;
        rows.push({ row: rowNumber, code, name });
        if (rows.length > maxUploadRows) throw new ListUploadError(`Upload at most ${maxUploadRows.toLocaleString('en-NG')} schools at a time`);
      }
      if (!rows.length) throw new ListUploadError('The file has no schools. Fill in the DNEMIS code and School name on the Schools sheet');
      return rows;
    }
  }
  throw new ListUploadError('The "DNEMIS code" and "School name" columns were not found. Use the template from this page');
}
