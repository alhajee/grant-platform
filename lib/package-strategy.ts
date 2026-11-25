// Client, 25 November 2026: the Infrastructure sheet's Strategy column showed "Request for quotation" for every package:
// the package's own field is New Construction's classroom strategy, which Whole School and Furniture packages never ask
// (their default), while each costed item carries the strategy actually chosen. Procurement read the column as the plan's
// strategy. The row now shows the strategies (and durations) of the items that are costed.

type Item = { key?: string; strategy?: string; duration?: string; total?: number | string; notCosted?: boolean; provision?: string };
type PackageLine = { strategy?: string | null; package?: { kind?: string; input?: { duration?: string; furnitureStrategy?: string } | null; result?: { items?: readonly Item[] } | null } | null };

const costed = (line: PackageLine) => (line.package?.result?.items ?? []).filter(item => !item.notCosted && !item.provision && (Number(item.total) || 0) > 0);
const distinct = (values: readonly (string | undefined)[]) => [...new Set(values.map(v => (v ?? '').trim()).filter(Boolean))];

/** The implementation strategy (or strategies, most items first) of a saved Infrastructure line. */
export function packageStrategy(line: PackageLine): string {
  if (!line.package) return line.strategy ?? '';
  if (line.package.kind === 'furniture' && line.package.input?.furnitureStrategy) return line.package.input.furnitureStrategy;
  const items = costed(line), counts = new Map<string, number>();
  for (const item of items) { const s = (item.strategy ?? '').trim(); if (s) counts.set(s, (counts.get(s) ?? 0) + 1); }
  const strategies = [...counts].sort((a, b) => b[1] - a[1]).map(([s]) => s);
  if (strategies.length) return strategies.join(', ');
  // Furniture saved before it asked for a strategy has none; never show New Construction's default for it.
  return line.package.kind === 'new' ? line.strategy ?? '' : '';
}

/** The duration of a saved Infrastructure line: the package's own, else its costed items' (one, or "Per intervention"). */
export function packageDuration(line: PackageLine & { duration?: number | string }): string {
  if (!line.package) return line.duration ? `${line.duration} weeks` : '';
  if (line.package.input?.duration) return line.package.input.duration;
  const durations = distinct(costed(line).map(item => item.duration));
  return durations.length === 1 ? durations[0] : durations.length ? 'Per intervention' : '';
}
