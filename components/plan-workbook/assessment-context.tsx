'use client';
import { createContext, useContext, type ReactNode } from 'react';
import type { ImplementedPillar } from '@/lib/beap-pillars';
import type { ItemDecisionValue } from '@/lib/ubec-flow';
import type { SheetKey, WorkbookColumn, WorkbookSheet } from './types';

export type RowDecision = { decision: ItemDecisionValue; note: string; officerName: string };
/**
 * UBEC item assessment inside the workbook (UBEC plan page): each released component's own sheet gets Decision /
 * Decision note columns; the assigned Assessment Officers accept or reject rows from the sheet toolbar or the
 * right-click menu. Row ids are the decision row refs (`componentItems` in lib/ubec-flow.ts).
 */
export type WorkbookAssessment = {
  pillars: readonly ImplementedPillar[];
  decisions: (pillar: ImplementedPillar) => ReadonlyMap<string, RowDecision>;
  previous: (pillar: ImplementedPillar) => ReadonlyMap<string, RowDecision>;
  canDecide: (pillar: ImplementedPillar) => boolean;
  /** Saves one decision for every row; null clears. Resolves false when any row failed (already reported). */
  decide: (pillar: ImplementedPillar, rowRefs: readonly string[], decision: ItemDecisionValue | null, note?: string) => Promise<boolean>;
  canComplete: (pillar: ImplementedPillar) => boolean;
  complete: (pillar: ImplementedPillar) => void;
};
export type SheetAssessment = Omit<WorkbookAssessment, 'pillars'> & { pillar: ImplementedPillar };

export const decisionColumn = 'ubecDecision', noteColumn = 'ubecNote', previousColumn = 'ubecPrevious';
/** Assessment columns are not plan data: comments on them go on the row instead. */
export const isAssessmentColumn = (columnId: string | null) => columnId === decisionColumn || columnId === noteColumn || columnId === previousColumn;
export const decisionLabels: Record<ItemDecisionValue | 'open', string> = { accept: 'Accepted', reject: 'Rejected', open: 'To decide' };

const Context = createContext<WorkbookAssessment | null>(null);
export function AssessmentProvider({ value, children }: { value: WorkbookAssessment | null; children: ReactNode }) {
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
/** The assessment of a component's own sheet (distribution and detail sheets have none). */
export function useSheetAssessment(sheet: SheetKey): SheetAssessment | null {
  const value = useContext(Context);
  const pillar = value?.pillars.find(p => p === sheet);
  return value && pillar ? { ...value, pillar } : null;
}

const noteText = (d: RowDecision | undefined) => !d ? '' : d.note ? `${d.note} · ${d.officerName}` : d.officerName;

/** Adds the decision columns and values to the assessed component sheets. */
export function withDecisions(sheets: WorkbookSheet[], assessment: WorkbookAssessment | null): WorkbookSheet[] {
  if (!assessment) return sheets;
  return sheets.map(sheet => {
    const pillar = assessment.pillars.find(p => p === sheet.key);
    if (!pillar) return sheet;
    const decisions = assessment.decisions(pillar), previous = assessment.previous(pillar);
    // Decision sits next to the frozen first column so it stays in view; the note and the previous round go last.
    const [first, ...rest] = sheet.columns;
    const columns: WorkbookColumn[] = [
      ...(first ? [first] : []),
      { id: decisionColumn, header: 'Decision', kind: 'text', size: 116, filter: true },
      ...rest,
      { id: noteColumn, header: 'Decision note', kind: 'text', size: 220 },
      ...(previous.size ? [{ id: previousColumn, header: 'Previous submission', kind: 'text' as const, size: 180, filter: true }] : []),
    ];
    return { ...sheet, columns, rows: sheet.rows.map(row => {
      const d = decisions.get(row.id), before = previous.get(row.id), label = decisionLabels[d?.decision ?? 'open'];
      const earlier = before ? `${decisionLabels[before.decision]}${before.note ? `: ${before.note}` : ''}` : '';
      return { ...row, decision: d?.decision ?? 'open', search: `${row.search} ${label.toLowerCase()}`, values: { ...row.values, [decisionColumn]: label, [noteColumn]: noteText(d), ...(previous.size ? { [previousColumn]: earlier } : {}) } };
    }) };
  });
}
