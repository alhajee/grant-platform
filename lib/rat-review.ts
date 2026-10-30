// RAT tool review (UBEC205, bug round 10, 30 October 2026): UBEC Planning (DPRS) accepts or rejects the RAT tool sent
// with each UBEC submission, with a comment (required to reject). A rejection holds the UBEC BEAP Chair's approval; once
// the plan is returned the SUBEB sees the comment and must upload a new RAT (Edit plan, UBEC204) before resubmitting.

export type RatDecision = 'accept' | 'reject';
export type RatReview = { decision: RatDecision; comment: string; reviewerName: string; decidedAt: string };
export const maxRatCommentLength = 2000;

export const ratRejectedForApproval = 'UBEC Planning rejected the RAT tool of this submission. Return the plan so the SUBEB can upload a corrected RAT';
export const ratRejectionNeedsComment = 'Say why the RAT tool is rejected';

/** Why the SUBEB cannot resubmit yet: UBEC rejected the RAT and no new one has been uploaded since. */
export function ratResubmitProblem(review: RatReview | null, replacedSince: boolean): string | null {
  if (review?.decision !== 'reject' || replacedSince) return null;
  return `UBEC Planning rejected the RAT tool: “${review.comment}”. Upload a corrected RAT in Edit plan before sending to UBEC`;
}
