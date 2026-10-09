import JSZip from 'jszip';

// Governed line documents (ICT, Teacher Development) accept only PDF and Excel files (migration 038); optional supporting
// documents (migration 057) also take .docx, .png and .jpg. Both the extension and the file signature must match; an
// .xlsx must also open as a workbook and a .docx as a Word document.
export const lineDocumentTypes: Record<string, string> = {
  pdf: 'application/pdf',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};
export const lineDocumentTypeError = 'Upload a valid PDF or Excel (.xls or .xlsx) file.';
/** Optional supporting documents (migration 057) also take Word documents and photos. */
export const supportingDocumentTypes: Record<string, string> = {
  ...lineDocumentTypes,
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
};
export const supportingDocumentTypeError = 'Upload a valid PDF, Excel (.xls or .xlsx), Word (.docx) or image (.png or .jpg) file.';

export async function validLineDocument(ext: string, bytes: Buffer) {
  const hex = (n: number) => bytes.subarray(0, n).toString('hex');
  if (ext === 'pdf') return bytes.subarray(0, 5).toString() === '%PDF-';
  if (ext === 'xls') return hex(8) === 'd0cf11e0a1b11ae1';
  if (ext === 'png') return hex(8) === '89504e470d0a1a0a';
  if (ext === 'jpg' || ext === 'jpeg') return hex(3) === 'ffd8ff';
  const part = ext === 'xlsx' ? 'xl/workbook.xml' : ext === 'docx' ? 'word/document.xml' : null;
  if (!part || hex(4) !== '504b0304') return false;
  try { return Boolean((await JSZip.loadAsync(bytes)).file(part)); } catch { return false; }
}
export const safeFileName = (name: string) => name.replace(/[\x00-\x1f\x7f/\\]/g, '_').slice(-180);
