'use client';
import { useEffect, useState } from 'react';
import { NationalGlance, NationalHero } from '@/components/ubec/dashboard/national-hero';
import { UbecPageFrame, YearControls } from '@/components/ubec/dashboard/page-frame';
import { ActivityCard, PlansSection, WorkloadCard, isNational } from '@/components/ubec/dashboard/sections';
import { useUbecDashboard } from '@/components/ubec/dashboard/use-dashboard';
import { departmentLabel, ubecRoleTitle, ubecRoles } from '@/lib/ubec';

/** UBEC Overview: the national picture (ES and BEAP Chair), a preview of plans, workload and activity. */
export default function Dashboard() {
  const [year, setYear] = useState('all');
  const { data, error, loading, load } = useUbecDashboard(year);
  // Older links pointed at sections of this page; they now have pages of their own.
  useEffect(() => { const section = window.location.hash.slice(1); if (['plans', 'submissions', 'activity'].includes(section)) window.location.replace(`/ubec/${section}`); }, []);
  const role = data?.user.role ?? '';
  const eyebrow = data ? (data.user.department ? departmentLabel(data.user.department) : role === ubecRoles.es ? 'NATIONAL OVERVIEW' : 'UBEC') : '';
  const title = !data || role === ubecRoles.es ? 'Overview' : ubecRoleTitle(role, data.user.department).replace(/ · .*/, '');
  return <UbecPageFrame eyebrow={eyebrow} title={title} hideTitle={isNational(role)} data={data} error={error} loading={loading} year={year} onYear={setYear} onRefresh={load}>
    {d => <>
      {isNational(d.user.role) ? <>
        <NationalHero data={d} controls={<YearControls years={d.years} year={year} onYear={setYear} onRefresh={load} loading={loading} />} />
        {/* The rest slides up over the map as the page scrolls */}
        <div className="nh-sheet"><NationalGlance data={d} /><div className="national-lower-grid"><WorkloadCard data={d} /><ActivityCard data={d} limit={6} moreHref="/ubec/activity" /></div></div>
      </> : <>
        <PlansSection data={d} items={d.items} limit={6} moreHref="/ubec/plans" />
        <div className="national-lower-grid"><WorkloadCard data={d} /><ActivityCard data={d} limit={6} moreHref="/ubec/activity" /></div>
      </>}
    </>}
  </UbecPageFrame>;
}
