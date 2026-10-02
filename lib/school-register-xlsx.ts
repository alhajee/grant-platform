import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import { schoolClasses, schoolLevels, schoolLocations, schoolTypes, maxImportRows, type SchoolClassKey } from './school-register';

// Server-only: builds the sample template and reads filled templates for /api/schools.
// Layout follows the client's school template: two header rows (class names over Male / Female / Total).

export class SchoolImportError extends Error {}

const baseColumns = [
  { key: 'sn', header: 'S/N', width: 6 },
  { key: 'longitude', header: 'Longitude', width: 12 },
  { key: 'latitude', header: 'Latitude', width: 12 },
  { key: 'name', header: 'School name', width: 40 },
  { key: 'town', header: 'Town', width: 18 },
  { key: 'lga', header: 'LGA', width: 18 },
  { key: 'category', header: 'Type of school', width: 14 },
  { key: 'location', header: 'Location', width: 11 },
  { key: 'level', header: 'Level', width: 10 },
  { key: 'schoolCode', header: 'School code', width: 16 },
] as const;
type BaseKey = typeof baseColumns[number]['key'];
const subHeaders = ['Male', 'Female', 'Total'] as const;
const templateRows = 300;
const normal = (value: string) => value.replace(/\s+/g, ' ').trim().toLowerCase();
const headerAliases: Record<string, BaseKey | 'total'> = {
  's/n': 'sn', 'sn': 'sn', 's/no': 'sn', 'longitude': 'longitude', 'long': 'longitude', 'latitude': 'latitude', 'lat': 'latitude',
  'school name': 'name', 'name of school': 'name', 'town': 'town', 'lga': 'lga', 'type of school': 'category', 'type': 'category',
  'location': 'location', 'location (urban/rural)': 'location', 'level': 'level', 'school level': 'level', 'school code': 'schoolCode',
  'emis code': 'schoolCode', 'dnemis code': 'schoolCode', 'school code (emis/dnemis)': 'schoolCode', 'total enrolment': 'total', 'total enrollment': 'total',
};
/** Header text → column, ignoring bracketed hints such as "(PUBLIC OR PRIVATE)". */
function aliasFor(text: string): BaseKey | 'total' | undefined {
  const plain = text.replace(/\(.*?\)/g, ' ').replace(/\s+/g, ' ').trim();
  if (headerAliases[text]) return headerAliases[text];
  if (headerAliases[plain]) return headerAliases[plain];
  if (plain.startsWith('type of school')) return 'category';
  if (plain.startsWith('location')) return 'location';
  if (plain.startsWith('school code') || plain.startsWith('emis')) return 'schoolCode';
  if (plain.startsWith('level')) return 'level';
  if (plain.startsWith('total enrol')) return 'total';
  return undefined;
}
const classAliases = new Map<string, SchoolClassKey>(schoolClasses.flatMap(item => [[normal(item.label), item.key], [normal(item.label.replace(' ', '')), item.key], [normal(item.key), item.key]] as [string, SchoolClassKey][]));
classAliases.set('pry 1', 'P1'); classAliases.set('pry 2', 'P2'); classAliases.set('pry 3', 'P3'); classAliases.set('pry 4', 'P4'); classAliases.set('pry 5', 'P5'); classAliases.set('pry 6', 'P6');

/** The downloadable sample template: an Entry sheet with dropdowns and totals, plus a Guide sheet. */
// The client's school list layout ("TLMs list 2025"): a title over rows 1-2, header block rows 3-6, data from row 7.
// Their columns come first in their order; all classes are offered, and the optional Level and School code columns come last.
const templateHeaders: Record<BaseKey, string> = {
  sn: 'S/N', longitude: 'Longitude', latitude: 'Latitude', name: 'SCHOOL NAME', town: 'TOWN', lga: 'LGA',
  category: 'TYPE OF SCHOOL(PUBLIC OR PRIVATE)', location: 'LOCATION (URBAN OR RURAL)', level: 'LEVEL (ECCDE, PRIMARY OR JSS)', schoolCode: 'SCHOOL CODE (EMIS/DNEMIS)',
};
const firstDataRow = 7;
export async function buildSchoolTemplate(stateName: string, lgas: string[]) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'BEAPMS';
  const sheet = workbook.addWorksheet('Schools', { views: [{ state: 'frozen', xSplit: 4, ySplit: firstDataRow - 1 }] });
  // Columns: A S/N · B-C coordinates · D-H school details · class triples · total · level · school code.
  const column: Record<BaseKey, number> = { sn: 1, longitude: 2, latitude: 3, name: 4, town: 5, lga: 6, category: 7, location: 8, level: 0, schoolCode: 0 };
  const classStart = 9, totalColumn = classStart + schoolClasses.length * 3;
  column.level = totalColumn + 1; column.schoolCode = totalColumn + 2;
  const lastColumn = column.schoolCode;
  const widths: [number, number][] = [[1, 6], [2, 12], [3, 12], [4, 40], [5, 18], [6, 18], [7, 16], [8, 14], [totalColumn, 12], [column.level, 16], [column.schoolCode, 18]];
  for (const [index, width] of widths) sheet.getColumn(index).width = width;
  sheet.getCell(1, 1).value = `${stateName.toUpperCase()} SCHOOL LIST`;
  sheet.mergeCells(1, 1, 2, lastColumn);
  const block = (key: BaseKey) => { sheet.getCell(3, column[key]).value = templateHeaders[key]; sheet.mergeCells(3, column[key], 6, column[key]); };
  (['sn', 'name', 'town', 'lga', 'category', 'location', 'level', 'schoolCode'] as const).forEach(block);
  sheet.getCell(3, 2).value = 'SCHOOL COORDINATES'; sheet.mergeCells(3, 2, 5, 3);
  sheet.getCell(6, 2).value = templateHeaders.longitude; sheet.getCell(6, 3).value = templateHeaders.latitude;
  sheet.getCell(3, classStart).value = 'ENROLMENT BY CLASS'; sheet.mergeCells(3, classStart, 3, totalColumn - 1);
  schoolClasses.forEach((item, index) => {
    const first = classStart + index * 3;
    sheet.getCell(4, first).value = item.label; sheet.mergeCells(4, first, 5, first + 2);
    subHeaders.forEach((label, offset) => { sheet.getCell(6, first + offset).value = label.toUpperCase(); sheet.getColumn(first + offset).width = 8; });
  });
  sheet.getCell(3, totalColumn).value = 'TOTAL ENROLMENT'; sheet.mergeCells(3, totalColumn, 6, totalColumn);
  for (const rowNumber of [1, 2, 3, 4, 5, 6]) {
    const row = sheet.getRow(rowNumber);
    row.font = { bold: true, size: rowNumber < 3 ? 14 : 11 }; row.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    if (rowNumber >= 3) for (let index = 1; index <= lastColumn; index++) { const cell = row.getCell(index); cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8EEF6' } }; cell.border = { top: { style: 'thin', color: { argb: 'FF9AA9BC' } }, bottom: { style: 'thin', color: { argb: 'FF9AA9BC' } }, left: { style: 'thin', color: { argb: 'FF9AA9BC' } }, right: { style: 'thin', color: { argb: 'FF9AA9BC' } } }; }
  }
  const guide = workbook.addWorksheet('Guide');
  guide.getColumn(1).width = 28; guide.getColumn(2).width = 90;
  const lists = [['LGA', ...lgas], ['Type of school', ...schoolTypes], ['Location', ...schoolLocations], ['Level', ...schoolLevels]];
  const rows: [string, string][] = [
    ['School register template', stateName],
    ['How to use', `Enter one school per row on the Schools sheet, starting on row ${firstDataRow}. Keep the header rows unchanged. Lists in the same layout (for example "TLMs list 2025") can be uploaded as they are.`],
    ['Required', 'School name, LGA, Type of school (Public or Private) and Location (Urban or Rural).'],
    ['Optional', 'Longitude, Latitude, Town, enrolment by class, Level and School code (EMIS/DNEMIS).'],
    ['Level', 'ECCDE, Primary or JSS. If left blank it is worked out from the classes with learners (Primary when Primary classes are filled).'],
    ['Coordinates', 'Decimal degrees, for example Longitude 11.9608 and Latitude 11.7469. Longitude comes first.'],
    ['Enrolment', 'Enter male and female learners for each class. The Total columns add up automatically.'],
    ['Errors', 'Every row is checked first. If any row has an error, nothing is added until the file is corrected.'],
    ['Duplicates', 'A school already in the register (same school code, or same name, LGA and level) is skipped.'],
    ['S/N', 'Optional row number for your own reference; it is not saved.'],
  ];
  rows.forEach(([label, value], index) => { const row = guide.getRow(index + 1); row.getCell(1).value = label; row.getCell(2).value = value; row.getCell(1).font = { bold: true }; row.getCell(2).alignment = { wrapText: true }; });
  // Allowed values sit in hidden columns of the Guide sheet so the dropdowns can reference them.
  lists.forEach(([title, ...values], index) => {
    const listColumn = guide.getColumn(5 + index); listColumn.hidden = true;
    guide.getCell(1, 5 + index).value = title; values.forEach((value, offset) => { guide.getCell(2 + offset, 5 + index).value = value; });
  });
  const letter = (index: number) => guide.getColumn(index).letter;
  const listRange = (index: number, length: number) => `Guide!$${letter(5 + index)}$2:$${letter(5 + index)}$${Math.max(2, length + 1)}`;
  const validations: [BaseKey, number, number][] = [['lga', 0, lgas.length], ['category', 1, schoolTypes.length], ['location', 2, schoolLocations.length], ['level', 3, schoolLevels.length]];
  for (let rowNumber = firstDataRow; rowNumber < firstDataRow + templateRows; rowNumber++) {
    const row = sheet.getRow(rowNumber);
    for (const [key, index, length] of validations) {
      if (key === 'lga' && !lgas.length) continue;
      row.getCell(column[key]).dataValidation = { type: 'list', allowBlank: true, formulae: [listRange(index, length)], showErrorMessage: true, errorTitle: 'Choose from the list', error: 'Choose one of the listed values.' };
    }
    const totals: string[] = [];
    schoolClasses.forEach((_, index) => {
      const first = classStart + index * 3;
      const male = sheet.getColumn(first).letter, female = sheet.getColumn(first + 1).letter;
      sheet.getCell(rowNumber, first + 2).value = { formula: `IF(COUNT(${male}${rowNumber}:${female}${rowNumber}),SUM(${male}${rowNumber}:${female}${rowNumber}),"")` };
      totals.push(`${male}${rowNumber}:${female}${rowNumber}`);
    });
    sheet.getCell(rowNumber, totalColumn).value = { formula: `IF(COUNT(${totals.join(',')}),SUM(${totals.join(',')}),"")` };
  }
  return await workbook.xlsx.writeBuffer() as ArrayBuffer;
}

// ExcelJS expects unprefixed spreadsheet elements; some tools write valid x: prefixes (same fix as spreadsheet-preview).
async function normalisedWorkbook(bytes: ArrayBuffer) {
  const archive = await JSZip.loadAsync(bytes);
  if (!archive.file('xl/workbook.xml')) throw new SchoolImportError('Upload the school template as an Excel (.xlsx) workbook.');
  archive.remove('docProps/app.xml'); archive.remove('docProps/core.xml');
  for (const [name, entry] of Object.entries(archive.files)) {
    if (!name.startsWith('xl/') || !name.endsWith('.xml')) continue;
    let xml = await entry.async('string');
    const namespaces = [...xml.matchAll(/xmlns:([\w.-]+)="http:\/\/schemas.openxmlformats.org\/spreadsheetml\/2006\/main"/g)];
    for (const match of namespaces) {
      const prefix = match[1].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      xml = xml.replace(new RegExp(`(<\\/?)${prefix}:`, 'g'), '$1').replace(match[0], 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"');
    }
    if (namespaces.length) archive.file(name, xml);
  }
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await archive.generateAsync({ type: 'arraybuffer' }));
  return workbook;
}

/** A cell as entered: text for text cells, numbers for numeric cells, the cached result for formulas (undefined when not calculated). */
function cellValue(cell: ExcelJS.Cell): string | number | undefined {
  const value = cell.value;
  if (value === null || value === undefined) return undefined;
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return value.trim() || undefined;
  if (typeof value === 'boolean') return String(value);
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object' && 'formula' in value) { const result = (value as ExcelJS.CellFormulaValue).result; return typeof result === 'number' ? result : typeof result === 'string' ? result.trim() || undefined : undefined; }
  if (typeof value === 'object' && 'sharedFormula' in value) { const result = (value as ExcelJS.CellSharedFormulaValue).result; return typeof result === 'number' ? result : undefined; }
  return cell.text.trim() || undefined;
}

export type ParsedSchoolRow = {
  row: number; base: Partial<Record<BaseKey, string | number>>; classes: Partial<Record<SchoolClassKey, { male?: string | number; female?: string | number; total?: string | number }>>; total?: string | number;
};

/** Finds the template's header rows and returns every non-empty data row with its spreadsheet row number. */
export async function readSchoolRows(bytes: ArrayBuffer): Promise<ParsedSchoolRow[]> {
  let workbook: ExcelJS.Workbook;
  try { workbook = await normalisedWorkbook(bytes); } catch (cause) { if (cause instanceof SchoolImportError) throw cause; throw new SchoolImportError('The file could not be read. Save it as an Excel (.xlsx) workbook and try again.'); }
  const sheet = workbook.worksheets.find(item => /school/i.test(item.name) && item.rowCount > 0) ?? workbook.worksheets[0];
  if (!sheet) throw new SchoolImportError('The workbook has no sheets.');
  let headerRow = 0;
  for (let rowNumber = 1; rowNumber <= Math.min(15, sheet.rowCount); rowNumber++) {
    const row = sheet.getRow(rowNumber);
    if (Array.from({ length: Math.min(row.cellCount, 80) }, (_, index) => normal(row.getCell(index + 1).text)).includes('school name')) { headerRow = rowNumber; break; }
  }
  if (!headerRow) throw new SchoolImportError('The "School name" column was not found. Use the BEAPMS school template and keep its header rows.');
  // The header block runs from the "School name" row to the row with Male / Female (or Longitude) labels, if any.
  let subRow = headerRow;
  for (let rowNumber = headerRow + 1; rowNumber <= Math.min(headerRow + 4, sheet.rowCount); rowNumber++) {
    const texts = Array.from({ length: Math.min(sheet.getRow(rowNumber).cellCount, 80) }, (_, index) => normal(sheet.getRow(rowNumber).getCell(index + 1).text));
    if (texts.includes('male') || texts.includes('female') || texts.includes('longitude')) { subRow = rowNumber; break; }
  }
  const blockRows = Array.from({ length: subRow - headerRow + 1 }, (_, index) => sheet.getRow(headerRow + index));
  const width = Math.min(Math.max(...blockRows.map(row => row.cellCount)), 80);
  const base = new Map<number, BaseKey>(), classes = new Map<number, { key: SchoolClassKey; part: 'male' | 'female' | 'total' }>();
  let totalColumn = 0, lastClass: SchoolClassKey | undefined;
  for (let column = 1; column <= width; column++) {
    // Merged header cells repeat their text, so each column sees every heading above it.
    const texts = blockRows.map(row => normal(row.getCell(column).text)).filter(Boolean);
    const part = subRow > headerRow ? normal(sheet.getRow(subRow).getCell(column).text) : '';
    const classKey = texts.map(text => classAliases.get(text)).find(Boolean);
    if (classKey) lastClass = classKey;
    if ((part === 'male' || part === 'female' || part === 'total') && (classKey ?? lastClass)) { classes.set(column, { key: (classKey ?? lastClass)!, part }); continue; }
    lastClass = undefined;
    const alias = [...texts].reverse().map(aliasFor).find(Boolean);
    if (alias === 'total') totalColumn = column; else if (alias && ![...base.values()].includes(alias)) base.set(column, alias);
  }
  for (const required of ['name', 'lga', 'category', 'location'] as const) if (![...base.values()].includes(required)) throw new SchoolImportError(`The "${baseColumns.find(column => column.key === required)!.header}" column was not found. Use the BEAPMS school template.`);
  const firstData = subRow + 1;
  const rows: ParsedSchoolRow[] = [];
  for (let rowNumber = firstData; rowNumber <= sheet.rowCount; rowNumber++) {
    const row = sheet.getRow(rowNumber);
    const parsed: ParsedSchoolRow = { row: rowNumber, base: {}, classes: {} };
    let filled = false;
    for (const [column, key] of base) { const value = cellValue(row.getCell(column)); if (value !== undefined) { parsed.base[key] = value; if (key !== 'sn') filled = true; } }
    for (const [column, { key, part }] of classes) { const value = cellValue(row.getCell(column)); if (value !== undefined) { (parsed.classes[key] ??= {})[part] = value; if (part !== 'total') filled = true; } }
    if (totalColumn) parsed.total = cellValue(row.getCell(totalColumn));
    if (!filled) continue;
    rows.push(parsed);
    if (rows.length > maxImportRows) throw new SchoolImportError(`Upload at most ${maxImportRows.toLocaleString()} schools at a time.`);
  }
  return rows;
}
