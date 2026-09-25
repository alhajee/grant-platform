import { NextRequest } from "next/server";
import { getPostgres } from "@/lib/postgres";
import type { ActionPlan } from "@/lib/action-plans";

export const planSetupFields = (alias='action_plans') => `${alias}.implementation_year AS "implementationYear", ${alias}.funding_quarters AS "fundingQuarters", ${alias}.state_lodgment::text AS "stateLodgment", ${alias}.other_funding::text AS "otherFunding", ${alias}.funding_total::text AS "fundingTotal", ${alias}.beap_name AS "beapName", (SELECT jsonb_build_object('id',fp.id,'allocation',fp.allocation,'createdAt',fp.created_at,'createdBy',fp.actor_name) FROM funding_policies fp WHERE fp.id=${alias}.funding_policy_id) AS "fundingPolicy", COALESCE((SELECT jsonb_agg(jsonb_build_object('id',d.id,'name',d.name,'size',d.size) ORDER BY d.created_at,d.id) FROM plan_documents d WHERE d.plan_id=${alias}.id),'[]'::jsonb) AS documents`;
export const planFields = `id, start_year AS "startYear", end_year AS "endYear", created_at AS "createdAt", status, version, submission_number AS "submissionNumber", ${planSetupFields()}`;
export async function resolveActionPlan(request: NextRequest, stateCode: string): Promise<ActionPlan | null> {
  const requested = request.nextUrl.searchParams.get("plan");
  const db = getPostgres();
  if (requested !== null) {
    if (!/^[1-9]\d*$/.test(requested) || !Number.isSafeInteger(Number(requested))) return null;
    return (await db.query<ActionPlan>(`SELECT ${planFields} FROM action_plans WHERE id = $1 AND state_code = $2`, [Number(requested), stateCode])).rows[0] ?? null;
  }
  // Compatibility for the original editor URLs; new flows always pass a plan ID.
  const legacy = await db.query<ActionPlan>(`SELECT ${planFields} FROM action_plans WHERE state_code = $1 AND start_year = 2025 AND end_year = 2025`, [stateCode]);
  return legacy.rows.length === 1 ? legacy.rows[0] : null;
}
