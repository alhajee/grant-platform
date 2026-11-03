// UBEC132 (migration 087): every submission to UBEC needs the Executive Chairman's signature and cover letter. Tests
// that send plans to UBEC add both straight to the database before the submit (the upload API has its own test,
// scripts/test-submission-letter.mjs). Takes the plan id or a URL path with ?plan=.
const png = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8ffff3f0005fe02fea7d6a4f50000000049454e44ae426082', 'hex');
export async function signForUbec(db, planOrPath) {
  const planId = Number(typeof planOrPath === 'number' ? planOrPath : /[?&]plan=(\d+)/.exec(planOrPath)?.[1]);
  if (!planId) throw new Error(`signForUbec: no plan in ${planOrPath}`);
  for (const [kind, name] of [['signature', 'signature.png'], ['cover_letter', 'cover-letter.png']])
    await db.query(`INSERT INTO plan_submission_letters(id,plan_id,kind,name,media_type,content,size,drawn,uploaded_by_name)
      SELECT gen_random_uuid(),$1,$2,$3,'image/png',$4,$5,$2='signature','Test Executive Chairman'
      WHERE NOT EXISTS (SELECT 1 FROM plan_submission_letters WHERE plan_id=$1 AND kind=$2 AND ubec_round_id IS NULL AND removed_at IS NULL)`, [planId, kind, name, png, png.length]);
}
