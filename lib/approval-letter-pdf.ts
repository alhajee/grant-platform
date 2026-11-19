// UBEC268: draws the approval letter (lib/approval-letter.ts) on the Executive Secretary's letterhead, A4, like the
// client's samples: reference and date under the header, addressee, bold title, the fund table, closing, signature.
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import { letterDate, type ApprovalLetter } from './approval-letter.ts';
import { letterheadJpeg, signaturePng } from './letters/letterhead-assets.ts';

const A4 = { width: 595.28, height: 841.89 };
const left = 70, right = A4.width - 66, ink = rgb(0.12, 0.12, 0.14);
const roman = ['i.', 'ii.', 'iii.', 'iv.', 'v.', 'vi.', 'vii.', 'viii.', 'ix.', 'x.', 'xi.', 'xii.'];

function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/)) {
    const next = line ? `${line} ${word}` : word;
    if (line && font.widthOfTextAtSize(next, size) > width) { lines.push(line); line = word; } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

/** Justified paragraph (last line left), returns the y below it. */
function paragraph(page: PDFPage, text: string, font: PDFFont, size: number, y: number, lead = size * 1.45): number {
  const width = right - left, lines = wrap(text, font, size, width);
  lines.forEach((line, i) => {
    const words = line.split(' ');
    if (i === lines.length - 1 || words.length < 2) { page.drawText(line, { x: left, y, size, font, color: ink }); }
    else {
      const gap = (width - words.reduce((sum, w) => sum + font.widthOfTextAtSize(w, size), 0)) / (words.length - 1);
      let x = left;
      for (const w of words) { page.drawText(w, { x, y, size, font, color: ink }); x += font.widthOfTextAtSize(w, size) + gap; }
    }
    y -= lead;
  });
  return y;
}

const percent = (value: number) => `${Number.isInteger(value) ? value : value.toFixed(2)}`;

/** An uploaded letterhead or signature (Admin > Settings > Approval letter, migration 105); absent = the built-in one. */
export type LetterImage = { content: Uint8Array; mime: 'image/jpeg' | 'image/png' };
export type LetterImages = { letterhead?: LetterImage | null; signature?: LetterImage | null };

export async function approvalLetterPdf(letter: ApprovalLetter, images: LetterImages = {}): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(letter.title); pdf.setAuthor('Universal Basic Education Commission'); pdf.setSubject(letter.reference);
  const page = pdf.addPage([A4.width, A4.height]);
  const embed = (image: LetterImage) => image.mime === 'image/png' ? pdf.embedPng(image.content) : pdf.embedJpg(image.content);
  const background = images.letterhead ? await embed(images.letterhead) : await pdf.embedJpg(Buffer.from(letterheadJpeg, 'base64'));
  page.drawImage(background, { x: 0, y: 0, width: A4.width, height: A4.height });
  const regular = await pdf.embedFont(StandardFonts.Helvetica), bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  let y = 650;
  page.drawText(letter.reference, { x: left, y, size: 11, font: bold, color: ink });
  const date = letterDate(letter.date);
  page.drawText(date, { x: right - bold.widthOfTextAtSize(date, 11), y, size: 11, font: bold, color: ink });
  y -= 34;
  letter.addressee.forEach((line, i) => { page.drawText(line, { x: left, y, size: 11, font: i === 0 ? bold : regular, color: ink }); y -= 16; });
  y -= 22;
  const titleSize = 11.5, titleWidth = bold.widthOfTextAtSize(letter.title, titleSize);
  page.drawText(letter.title, { x: (A4.width - titleWidth) / 2, y, size: titleSize, font: bold, color: ink });
  y -= 22;
  y = paragraph(page, letter.intro, regular, 11, y);
  y -= 10;

  const size = 11, lead = 19, numberX = left + 20, labelX = left + 58, subX = left + 72, partX = left + 300, shareX = right - 70;
  letter.rows.forEach((row, i) => {
    page.drawText(roman[i] ?? `${i + 1}.`, { x: numberX, y, size, font: regular, color: ink });
    page.drawText(row.label, { x: labelX, y, size, font: bold, color: ink });
    const share = percent(row.percent);
    page.drawText(share, { x: shareX - bold.widthOfTextAtSize(share, size), y, size, font: bold, color: ink });
    page.drawText('%', { x: shareX + 10, y, size, font: regular, color: ink });
    y -= lead;
    for (const part of row.parts ?? []) {
      page.drawText('-', { x: labelX + 2, y, size, font: regular, color: ink });
      page.drawText(part.label, { x: subX, y, size, font: bold, color: ink });
      page.drawText(`(${part.percent.toFixed(2)}%)`, { x: partX, y, size, font: bold, color: ink });
      y -= lead;
    }
  });
  y -= 10;
  for (const text of letter.closing) y = paragraph(page, text, regular, 11, y) - 10;

  // The signature sits over the name printed on the letterhead (bottom left).
  const signature = images.signature ? await embed(images.signature) : await pdf.embedPng(Buffer.from(signaturePng, 'base64'));
  const width = 92, height = width * signature.height / signature.width;
  page.drawImage(signature, { x: 66, y: 76, width, height });
  return pdf.save();
}
