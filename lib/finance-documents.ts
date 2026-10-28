// Finance documents of a plan (UBEC130, migration 073): uploaded by the SUBEB Finance department, submitted to the
// BEAP Chair, never required to send the plan to UBEC (the Executive Chairman is warned), and seen at UBEC only by the
// Finance Oversight Director and Finance Assessment Officers.
import { ubecRoles } from './ubec';

export const financeDocumentKinds = ['bank_statement', 'lodgement_notification', 'utilisation_report'] as const;
export type FinanceDocumentKind = typeof financeDocumentKinds[number];
export const financeDocumentLabels: Record<FinanceDocumentKind, string> = {
  bank_statement: 'Bank statement',
  lodgement_notification: 'Notification of lodgement',
  utilisation_report: '50% utilisation report',
};
export type FinanceDocument = { id: string; kind: FinanceDocumentKind; name: string; size: number; uploadedByName: string; createdAt: string };
export type FinanceDocuments = {
  documents: FinanceDocument[];
  submittedAt: string | null; submittedByName: string | null;
  /** The viewer uploads and submits (SUBEB Finance, at any stage). */
  canEdit: boolean;
  /** Labels of the documents not uploaded yet. */
  missing: string[];
};

type Viewer = { role: string; department?: string | null; departments?: readonly string[] | null; isBeapChair?: boolean };
const holds = (viewer: Viewer, department: string) => viewer.department === department || !!viewer.departments?.includes(department);

/** SUBEB Finance: Data Entry Staff or a Director holding the Finance department. */
export const isStateFinance = (viewer: Viewer) => ['Data Entry Staff', 'Director'].includes(viewer.role) && holds(viewer, 'finance');
/** Who at the SUBEB sees them: Finance, the BEAP Chair (they are submitted to them) and the Executive Chairman. */
export const seesStateFinance = (viewer: Viewer) => isStateFinance(viewer) || viewer.role === 'Executive Chairman' || (viewer.role === 'Director' && !!viewer.isBeapChair);
/** Who at UBEC sees them: only the Finance Oversight Director and Finance Assessment Officers. */
export const seesUbecFinance = (viewer: Viewer) => (viewer.role === ubecRoles.oversight || viewer.role === ubecRoles.officer) && viewer.department === 'finance';

export const missingFinanceDocuments = (documents: readonly { kind: FinanceDocumentKind }[]) =>
  financeDocumentKinds.filter(kind => !documents.some(d => d.kind === kind)).map(kind => financeDocumentLabels[kind]);

/** A plan sent to UBEC with its Finance documents, for UBEC Finance's overview (UBEC94, app/api/ubec/finance-documents). */
export type FinancePlan = { planId: number; state: string; period: string; submittedAt: string; status: string; documents: { id: string; kind: FinanceDocumentKind; label: string; name: string; size: number }[]; missing: string[] };
