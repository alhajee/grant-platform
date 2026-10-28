import { NextRequest, NextResponse } from 'next/server';
import { getWorkspaceState } from '@/lib/workspace-state';
import { getPostgres } from '@/lib/postgres';
import { stateDisplayName } from '@/lib/state-names';
import { planPeriod } from '@/lib/action-plans';
import { financeDocumentKinds, financeDocumentLabels, seesUbecFinance, type FinanceDocumentKind, type FinancePlan } from '@/lib/finance-documents';

// UBEC94 (client, 28 October 2026: "similar to what happens for the RAT"): every plan sent to UBEC with its SUBEB Finance
// documents (bank statement, notification of lodgement, 50% utilisation report), newest submission first, for the UBEC
// Finance Oversight Director and Finance Assessment Officers. Files download through /api/plans/finance?plan=&id=.
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

export async function GET(request: NextRequest) {
  try {
    const user = await getWorkspaceState(request);
    if (!user) return json({ error: 'Sign in to continue' }, 401);
    if (!seesUbecFinance(user)) return json({ error: 'Finance documents are for UBEC Finance' }, 403);
    const db = getPostgres();
    const plans = (await db.query<{ id: number; state_code: string; start_year: number; end_year: number; funding_quarters: number[] | null; status: string; submitted_at: Date }>(`SELECT p.id,p.state_code,p.start_year,p.end_year,p.funding_quarters,r.status,r.submitted_at
      FROM ubec_rounds r JOIN action_plans p ON p.id=r.plan_id WHERE r.number=(SELECT MAX(number) FROM ubec_rounds WHERE plan_id=r.plan_id) ORDER BY r.submitted_at DESC`)).rows;
    const files = plans.length ? (await db.query<{ id: string; plan_id: number; kind: FinanceDocumentKind; name: string; size: number }>('SELECT id,plan_id,kind,name,size FROM plan_finance_documents WHERE plan_id=ANY($1::int[]) AND removed_at IS NULL ORDER BY created_at', [plans.map(p => p.id)])).rows : [];
    const body: FinancePlan[] = plans.map(p => {
      const documents = files.filter(f => f.plan_id === p.id).map(f => ({ id: f.id, kind: f.kind, label: financeDocumentLabels[f.kind], name: f.name, size: f.size }));
      return { planId: p.id, state: stateDisplayName(p.state_code), period: `${planPeriod({ startYear: p.start_year, endYear: p.end_year, fundingQuarters: p.funding_quarters })} BEAP`, submittedAt: p.submitted_at.toISOString(), status: p.status,
        documents, missing: financeDocumentKinds.filter(kind => !documents.some(d => d.kind === kind)).map(kind => financeDocumentLabels[kind]) };
    });
    return json({ plans: body });
  } catch (cause) { console.error('Finance document list failed', cause); return json({ error: 'Unable to load the finance documents' }, 503); }
}
