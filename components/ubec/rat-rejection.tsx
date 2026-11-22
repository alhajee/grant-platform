import { FileSpreadsheetIcon } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import type { RatReview } from '@/lib/rat-review';

const date = new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium' });

/** UBEC Planning's rejection of the RAT tool, in full (bug sheet 24: the chair's bar clipped the reason). */
export function RatRejection({ review }: { review: RatReview }) {
  return <Alert variant="destructive" className="ubec-rat-rejection"><FileSpreadsheetIcon /><AlertTitle>UBEC Planning rejected the RAT tool</AlertTitle>
    <AlertDescription><p className="ubec-rat-rejection-text">{review.comment}</p><span>{review.reviewerName} · {date.format(new Date(review.decidedAt))}</span></AlertDescription>
  </Alert>;
}
