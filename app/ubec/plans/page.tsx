'use client';
import { useState } from 'react';
import { UbecPageFrame } from '@/components/ubec/dashboard/page-frame';
import { PlanFiltersBar, PlansSection, filterItems, isNational, type PlanFilters } from '@/components/ubec/dashboard/sections';
import { initialParam, useUbecDashboard } from '@/components/ubec/dashboard/use-dashboard';

/** UBEC Plans: every plan the viewer can see, as cards, with search, stage and state filters. */
export default function PlansPage() {
  const [year, setYear] = useState('all');
  const [filters, setFilters] = useState<PlanFilters>(() => ({ search: '', status: initialParam('stage'), state: initialParam('state') }));
  const { data, error, loading, load } = useUbecDashboard(year);
  return <UbecPageFrame eyebrow="UBEC" title="Plans" data={data} error={error} loading={loading} year={year} onYear={value => { setYear(value); setFilters({ search: '', status: 'all', state: 'all' }); }} onRefresh={load}>
    {d => <>
      <PlanFiltersBar value={filters} onChange={setFilters} national={isNational(d.user.role)} />
      <PlansSection data={d} items={filterItems(d.items, filters)} filtered={filters.search !== '' || filters.status !== 'all' || filters.state !== 'all'} />
    </>}
  </UbecPageFrame>;
}
