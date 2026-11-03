// The Executive Chairman's signature and cover letter for a submission to UBEC (UBEC132, migration 087): both are
// required to send the plan. The signature is drawn on screen or uploaded as an image; the cover letter, on the SUBEB's
// letterhead, is uploaded. Shared by the API, the Send to UBEC dialog and the UBEC plan page.

export const submissionLetterKinds = ['signature', 'cover_letter'] as const;
export type SubmissionLetterKind = typeof submissionLetterKinds[number];
export const submissionLetterLabels: Record<SubmissionLetterKind, string> = { signature: 'Signature', cover_letter: 'Cover letter' };
/** File types per kind: the signature is an image; the cover letter a PDF, Word document or image. */
export const submissionLetterTypes: Record<SubmissionLetterKind, Record<string, string>> = {
  signature: { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg' },
  cover_letter: { pdf: 'application/pdf', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg' },
};
export const submissionLetterTypeErrors: Record<SubmissionLetterKind, string> = {
  signature: 'Upload the signature as a PNG or JPG image',
  cover_letter: 'Upload the cover letter as a PDF, Word (.docx) or image (.png or .jpg) file',
};
export const submissionLetterAccept: Record<SubmissionLetterKind, string> = { signature: '.png,.jpg,.jpeg', cover_letter: '.pdf,.docx,.png,.jpg,.jpeg' };
export const maxSubmissionLetterBytes = 10 * 1024 * 1024;

export type SubmissionLetter = { id: string; kind: SubmissionLetterKind; name: string; size: number; drawn: boolean; uploadedByName: string; createdAt: string };

/** Labels of the kinds not attached yet. */
export const missingSubmissionLetters = (letters: readonly { kind: SubmissionLetterKind }[]) =>
  submissionLetterKinds.filter(kind => !letters.some(l => l.kind === kind)).map(kind => submissionLetterLabels[kind]);

export const submissionLetterProblem = (letters: readonly { kind: SubmissionLetterKind }[]) => {
  const missing = missingSubmissionLetters(letters);
  return missing.length ? `Add your ${missing.map(m => m.toLowerCase()).join(' and ')} before sending the plan to UBEC` : null;
};

/** Where a letter is downloaded from. */
export const submissionLetterHref = (planId: number, id: string, download = false) => `/api/plans/submission-letter?plan=${planId}&id=${id}${download ? '&download=1' : ''}`;
