// UBEC229: every item on an activity that buys goods needs a proforma invoice before its component is sent (always,
// whatever the Supporting documents setting). Tests that are about something else call `withProformas` at the top of
// their api() helper: before a send step (submit, endorse, forward, the UBEC submission) it attaches a tiny PDF proforma
// to each item of the plan that still has none. scripts/test-activity-rules-nov.mjs and test-line-proformas.mjs test the rule.

/** The Procurement price-list activities (lib/procurement.ts `priceListActivities`) except TLM (UBEC250) and Curriculum (UBEC257). */
export const proformaActivities = {
  quality: [0], ict: [0], monitoring: [0, 1], planning: [4], sbmc: [15],
};
const pairs = Object.entries(proformaActivities).flatMap(([workstream, activities]) => activities.map(activity => `('${workstream}',${activity})`)).join(',');
const sendActions = new Set(['submit', 'endorse', 'forward']);

/** Attaches a proforma invoice to every item of the plan that needs one and has none. Returns how many were added. */
export async function attachProformas(db, planId) {
  const { rowCount } = await db.query(`INSERT INTO activity_line_documents(id,plan_id,line_id,component,name,media_type,content,size,kind)
    SELECT gen_random_uuid(), l.plan_id, l.id, l.workstream, 'proforma.pdf', 'application/pdf', convert_to('%PDF-1.4 proforma', 'UTF8'), 17, 'proforma'
    FROM activity_plan_lines l WHERE l.plan_id=$1 AND (l.workstream, l.activity) IN (VALUES ${pairs})
      AND NOT EXISTS (SELECT 1 FROM activity_line_documents d WHERE d.line_id=l.id AND d.kind='proforma' AND d.removed_at IS NULL)`, [planId]);
  return rowCount;
}

/** Call first in a test's api(who, path, body): before a send step to the plan or UBEC review, attach the missing proformas. */
export async function withProformas(db, path, body) {
  if (!body || typeof body !== 'object' || body instanceof FormData || !sendActions.has(body.action)) return;
  if (!/^\/api\/(plans|ubec)\/review(\?|$)/.test(path)) return;
  const plan = Number(body.plan ?? new URL(path, 'http://test.local').searchParams.get('plan'));
  if (Number.isSafeInteger(plan) && plan > 0) await attachProformas(db, plan);
}
