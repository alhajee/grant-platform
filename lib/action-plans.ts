import { formatQuarters } from './format-quarters';
export type PlanStatus = 'draft' | 'awaiting_review' | 'awaiting_beap_chair' | 'awaiting_chairman' | 'changes_requested' | 'approved' | 'submitted_ubec' | 'ubec_review' | 'ubec_approved';
export const planStatusLabels: Record<PlanStatus, string> = { draft: 'Draft', awaiting_review: 'Department review', awaiting_beap_chair: 'BEAP Chair review', awaiting_chairman: 'Executive Chairman review', changes_requested: 'Changes requested', approved: 'Ready to send to UBEC', submitted_ubec: 'Sent to UBEC', ubec_review: 'Under UBEC review', ubec_approved: 'Approved by UBEC' };
export const canEditPlan = (role: string | undefined, status: PlanStatus | undefined) => Boolean(status) && (role === 'Data Entry Staff' || role === 'Director') && !['submitted_ubec','ubec_review','ubec_approved'].includes(status!);
export type ActionPlan = { id: number; startYear: number; endYear: number; createdAt: string; status: PlanStatus; version: number; submissionNumber: number } & Partial<import('./plan-setup').PlanSetup>;
export type PlanOverview = ActionPlan & { pendingActions?: {label:string;href:string}[]; pendingReview: boolean; infrastructureBudget: number; sportsBudget: number; sbmcBudget?: number; tlmBudget?: number; monitoringBudget?: number; gscciBudget?: number; curriculumBudget?: number; qualityBudget?: number; teachersBudget?: number; ictBudget?: number; budget: number; lineCount: number; schoolCount: number; schoolIds?: number[]; updatedAt: string };
export function planPeriod(plan: Pick<ActionPlan, "startYear" | "endYear" | "fundingQuarters">) {
  return plan.startYear === plan.endYear ? `${plan.startYear}${plan.fundingQuarters?.length ? ` · ${formatQuarters(plan.fundingQuarters)}` : ''}` : `${plan.startYear}–${plan.endYear}`;
}
export function planHref(path: string, id: number) { return `${path}?plan=${id}`; }
// Read at action time so all editor requests keep the currently selected plan.
export function currentPlanHref(path: string) {
  const id = typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("plan");
  return id ? `${path}?plan=${encodeURIComponent(id)}` : path;
}
