'use client';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { UbecPageFrame } from '@/components/ubec/dashboard/page-frame';
import { PlanFiltersBar, SubmissionsTable, filterItems, isNational, type PlanFilters } from '@/components/ubec/dashboard/sections';
import { initialParam, useUbecDashboard } from '@/components/ubec/dashboard/use-dashboard';

/** UBEC Submissions: the latest submission of every plan in a table, with search, stage and state filters. */
export default function SubmissionsPage() {
  const [year, setYear] = useState('all');
  const [filters, setFilters] = useState<PlanFilters>(() => ({ search: '', status: initialParam('stage'), state: initialParam('state') }));
  const { data, error, loading, load } = useUbecDashboard(year);
  return <UbecPageFrame eyebrow="UBEC" title="Submissions" data={data} error={error} loading={loading} year={year} onYear={value => { setYear(value); setFilters({ search: '', status: 'all', state: 'all' }); }} onRefresh={load}>
    {d => { const items = filterItems(d.items, filters); return <section className="national-panel" aria-labelledby="ubec-submissions-title">
      <div className="national-section-heading"><h2 id="ubec-submissions-title">Latest submissions <Badge variant="secondary">{items.length}</Badge></h2><span>Proposed, not disbursed funding</span></div>
      <PlanFiltersBar value={filters} onChange={setFilters} national={isNational(d.user.role)} />
      <SubmissionsTable data={d} items={items} />
    </section>; }}
  </UbecPageFrame>;
}
