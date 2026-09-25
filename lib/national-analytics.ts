import type { NationalItem } from './ubec';

export function coversPlanningYear(start: number, end: number, year: number | null) {
  return year === null || (start <= year && end >= year);
}

export function normalizeStateCode(code: string) {
  const value = code.trim().toUpperCase().replace(/^NG-/, '');
  return value === 'FCT' ? 'FC' : value;
}

export function summarizePlans(items: NationalItem[]) {
  return {
    plans: items.length,
    budget: items.reduce((sum, item) => sum + item.budget, 0),
    schools: new Set(items.flatMap(item => item.schools)).size,
    received: items.filter(item => item.status === 'received').length,
    reviewing: items.filter(item => item.status === 'reviewing').length,
    returned: items.filter(item => item.status === 'returned').length,
    approved: items.filter(item => item.status === 'approved').length,
  };
}

export function needsDecision(item: NationalItem) {
  return item.status === 'reviewing' && item.completed > 0 && item.pending === 0;
}
