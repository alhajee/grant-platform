import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getPostgres } from '@/lib/postgres';
import { getWorkspaceState } from '@/lib/workspace-state';
import { isSameRequestOrigin } from '@/lib/request-origin';
import { downloadsRatTools } from '@/lib/ubec';
import { maxRatCommentLength, ratRejectionNeedsComment } from '@/lib/rat-review';
import { readRatReview } from '@/lib/rat-review-db';

// UBEC205: UBEC Planning (DPRS) Assessment Officers and their Director accept or reject the RAT tool of a submission while
// it is with UBEC (received or in review); they may change the decision until the UBEC BEAP Chair decides the round.
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
const schema = z.object({ roundId: z.number().int().positive(), decision: z.enum(['accept', 'reject']), comment: z.string().trim().max(maxRatCommentLength).default('') }).strict();

export async function POST(request: NextRequest) {
  try {
    if (!isSameRequestOrigin(request)) return json({ error: 'This request must come from the BEAPMS portal' }, 403);
    const user = await getWorkspaceState(request);
    if (!user) return json({ error: 'Sign in to continue' }, 401);
    if (!downloadsRatTools(user.role, user.department)) return json({ error: 'RAT tools are reviewed by UBEC Planning (DPRS)' }, 403);
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return json({ error: parsed.error.issues[0].message }, 400);
    const input = parsed.data;
    if (input.decision === 'reject' && !input.comment) return json({ error: ratRejectionNeedsComment }, 400);
    return await getPostgres().transaction(async db => {
      const actor = (await db.query<{ display_name: string; role: string; department: string | null }>('SELECT display_name,role,department FROM users WHERE id=$1 AND active AND session_version=$2 FOR SHARE', [user.userId, user.sessionVersion])).rows[0];
      if (!actor || !downloadsRatTools(actor.role, actor.department)) return json({ error: 'RAT tools are reviewed by UBEC Planning (DPRS)' }, 403);
      const round = (await db.query<{ id: number; plan_id: number; status: string; latest: boolean }>('SELECT r.id,r.plan_id,r.status,r.number=(SELECT MAX(number) FROM ubec_rounds WHERE plan_id=r.plan_id) AS latest FROM ubec_rounds r WHERE r.id=$1 FOR UPDATE', [input.roundId])).rows[0];
      if (!round) return json({ error: 'Submission not found' }, 404);
      if (!round.latest || !['received', 'reviewing'].includes(round.status)) return json({ error: 'This submission is no longer open for review' }, 409);
      await db.query(`INSERT INTO ubec_rat_reviews(round_id,decision,comment,reviewer_id,reviewer_name) VALUES($1,$2,$3,$4,$5)
        ON CONFLICT (round_id) DO UPDATE SET decision=EXCLUDED.decision,comment=EXCLUDED.comment,reviewer_id=EXCLUDED.reviewer_id,reviewer_name=EXCLUDED.reviewer_name,decided_at=NOW()`, [round.id, input.decision, input.comment, user.userId, actor.display_name]);
      return json({ review: await readRatReview(db, round.id) });
    });
  } catch (cause) { console.error('RAT review failed', cause); return json({ error: 'The RAT review could not be saved' }, 503); }
}
