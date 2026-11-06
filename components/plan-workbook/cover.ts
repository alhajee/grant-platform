import type { Snapshot } from '@/lib/plan-review';
import { summarizeSnapshot } from '@/lib/plan-summary';
import { sheetPillar } from '@/lib/plan-comments';
import { formatQuarters } from '@/lib/format-quarters';
import type { ExportCover } from './export-xlsx';
import type { WorkbookSheet } from './types';

const amount = (value: string | null | undefined) => value == null || value === '' ? null : Number(value);

/**
 * V2 UBEC06: the Summary sheet of the whole-workbook download, from the snapshot shown: the plan's funding and one row
 * per component sheet (the components the viewer sees) with its lines, schools and proposed amount.
 */
export function workbookCover(snapshot: Snapshot, sheets: readonly WorkbookSheet[], title: string): ExportCover {
  const totals = summarizeSnapshot(snapshot), setup = snapshot.setup;
  const components = sheets.filter(sheet => sheetPillar[sheet.key] === sheet.key).map(sheet => {
    const part = totals[sheetPillar[sheet.key]];
    return { name: sheet.label, lines: part.lineCount, schools: part.schoolCount, amount: part.budget };
  });
  const proposed = components.reduce((sum, c) => sum + c.amount, 0), funding = amount(setup?.fundingTotal);
  const everyComponent = components.length === Object.keys(totals).length - 1;
  return {
    title,
    facts: [
      { label: 'Plan', value: setup?.beapName || title },
      { label: 'Implementation year', value: setup?.implementationYear ?? null },
      { label: 'Quarters', value: setup?.fundingQuarters?.length ? formatQuarters(setup.fundingQuarters) : null },
      { label: 'State contribution', value: amount(setup?.stateLodgment), money: true },
      { label: 'Matching Grant Fund', value: funding, money: true },
      { label: 'Proposed in these components', value: proposed, money: true },
      ...(funding != null && everyComponent ? [{ label: 'Not yet proposed', value: Math.max(0, funding - proposed), money: true }] : []),
    ],
    components,
    ...(everyComponent ? { schoolTotal: totals.total.schoolCount } : {}),
  };
}
