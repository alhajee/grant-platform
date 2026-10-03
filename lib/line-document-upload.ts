import JSZip from 'jszip';

// Quality Assurance and ICT line documents accept only PDF and Excel files (migration 038). Both the extension and
// the file signature must match; an .xlsx must also open as a workbook.
export const lineDocumentTypes: Record<string, string> = {
  pdf: 'application/pdf',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};
export const lineDocumentTypeError = 'Upload a valid PDF or Excel (.xls or .xlsx) file.';

export async function validLineDocument(ext: string, bytes: Buffer) {
  const hex = (n: number) => bytes.subarray(0, n).toString('hex');
  if (ext === 'pdf') return bytes.subarray(0, 5).toString() === '%PDF-';
  if (ext === 'xls') return hex(8) === 'd0cf11e0a1b11ae1';
  if (ext !== 'xlsx' || hex(4) !== '504b0304') return false;
  try { return Boolean((await JSZip.loadAsync(bytes)).file('xl/workbook.xml')); } catch { return false; }
}
export const safeFileName = (name: string) => name.replace(/[\x00-\x1f\x7f/\\]/g, '_').slice(-180);
