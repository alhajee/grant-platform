import { NextRequest, NextResponse } from 'next/server';
import { getWorkspaceState } from '@/lib/workspace-state';
import { getPostgres } from '@/lib/postgres';
import { ubecSeesPillarSql } from '@/lib/ubec-flow-db';
import { approvalLetter } from '@/lib/approval-letter';
import { approvalLetterPdf } from '@/lib/approval-letter-pdf';
import type { Snapshot } from '@/lib/plan-review';

// UBEC268: GET ?plan= downloads UBEC's approval letter (PDF) for the plan's latest approved round. Anyone at the plan's
// SUBEB, and UBEC users who see that round. The number comes from ubec_approval_letters (given at approval, migration 104).
const error = (message: string, status = 400) => NextResponse.json({ error: message }, { status });

export async function GET(request: NextRequest) {
  try {
    const user = await getWorkspaceState(request);
    if (!user) return error('Sign in to continue', 401);
    const plan = request.nextUrl.searchParams.get('plan');
    if (!plan || !/^[1-9]\d{0,9}$/.test(plan)) return error('Choose a valid plan');
    const db = getPostgres();
    const row = (await db.query<{ state_code: string; start_year: number; funding_quarters: number[] | null; snapshot: Snapshot; year: number; serial: number; issued_at: Date; number: number }>(
      `SELECT p.state_code, p.start_year, p.funding_quarters, r.snapshot, r.number, l.year, l.serial, l.issued_at
       FROM ubec_rounds r JOIN action_plans p ON p.id = r.plan_id JOIN ubec_approval_letters l ON l.round_id = r.id
       WHERE r.plan_id = $1 AND r.status = 'approved'
         AND (p.state_code = $2 OR ${ubecSeesPillarSql('r', 'NULL::text', '$3::text', '$5::int', '$4::text')})
       ORDER BY r.number DESC LIMIT 1`, [plan, user.stateCode, user.role, user.department, user.userId])).rows[0];
    if (!row) return error('No approval letter for this plan yet', 404);
    const letter = approvalLetter({ stateCode: row.state_code, planYear: row.start_year, quarters: row.funding_quarters, snapshot: row.snapshot, year: row.year, serial: row.serial, issuedAt: new Date(row.issued_at) });
    const pdf = await approvalLetterPdf(letter);
    const name = `UBEC approval letter ${row.state_code} ${row.start_year} (submission ${row.number}).pdf`;
    const inline = request.nextUrl.searchParams.get('download') !== '1';
    return new NextResponse(new Uint8Array(pdf), { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(name)}`, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } });
  } catch (cause) { console.error('Approval letter failed', cause); return error('Unable to prepare the approval letter', 503); }
}
