// UBEC132 (migration 087): every submission to UBEC needs the Executive Chairman's signature and cover letter, and since
// UBEC217 the three SUBEB Finance documents (bank statement, notification of lodgement, 50% utilisation report). Tests
// that send plans to UBEC add all of them straight to the database before the submit (the upload APIs have their own
// tests, scripts/test-submission-letter.mjs and scripts/test-finance-documents.mjs). Takes the plan id or a URL path
// with ?plan=.
const png = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8ffff3f0005fe02fea7d6a4f50000000049454e44ae426082', 'hex');
const pdf = Buffer.from('%PDF-1.4\nQA finance\n%%EOF');
const planIdOf = (planOrPath, who) => {
  const planId = Number(typeof planOrPath === 'number' ? planOrPath : /[?&]plan=(\d+)/.exec(planOrPath)?.[1]);
  if (!planId) throw new Error(`${who}: no plan in ${planOrPath}`);
  return planId;
};
/** UBEC217: the three Finance documents, as if SUBEB Finance had uploaded them. */
export async function uploadFinanceDocuments(db, planOrPath) {
  const planId = planIdOf(planOrPath, 'uploadFinanceDocuments');
  for (const kind of ['bank_statement', 'lodgement_notification', 'utilisation_report'])
    await db.query(`INSERT INTO plan_finance_documents(id,plan_id,kind,name,media_type,content,size,uploaded_by_name)
      SELECT gen_random_uuid(),$1,$2,$3,'application/pdf',$4,$5,'Test Finance'
      WHERE NOT EXISTS (SELECT 1 FROM plan_finance_documents WHERE plan_id=$1 AND kind=$2 AND removed_at IS NULL)`, [planId, kind, `${kind}.pdf`, pdf, pdf.length]);
}
export async function signForUbec(db, planOrPath, { finance = true } = {}) {
  const planId = planIdOf(planOrPath, 'signForUbec');
  for (const [kind, name] of [['signature', 'signature.png'], ['cover_letter', 'cover-letter.png']])
    await db.query(`INSERT INTO plan_submission_letters(id,plan_id,kind,name,media_type,content,size,drawn,uploaded_by_name)
      SELECT gen_random_uuid(),$1,$2,$3,'image/png',$4,$5,$2='signature','Test Executive Chairman'
      WHERE NOT EXISTS (SELECT 1 FROM plan_submission_letters WHERE plan_id=$1 AND kind=$2 AND ubec_round_id IS NULL AND removed_at IS NULL)`, [planId, kind, name, png, png.length]);
  if (finance) await uploadFinanceDocuments(db, planId);
}
