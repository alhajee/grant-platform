'use client';
import { useState } from 'react';
import { UbecPageFrame } from '@/components/ubec/dashboard/page-frame';
import { ActivityCard, WorkloadCard } from '@/components/ubec/dashboard/sections';
import { useUbecDashboard } from '@/components/ubec/dashboard/use-dashboard';

/** UBEC Activity: the latest review steps and each department's workload. */
export default function ActivityPage() {
  const [year, setYear] = useState('all');
  const { data, error, loading, load } = useUbecDashboard(year);
  return <UbecPageFrame eyebrow="UBEC" title="Activity" data={data} error={error} loading={loading} year={year} onYear={setYear} onRefresh={load}>
    {d => <div className="national-lower-grid"><ActivityCard data={d} /><WorkloadCard data={d} /></div>}
  </UbecPageFrame>;
}
