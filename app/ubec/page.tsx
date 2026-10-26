'use client';
import { useEffect, useState } from 'react';
import { NationalGlance, NationalHero } from '@/components/ubec/dashboard/national-hero';
import { UbecPageFrame, YearControls } from '@/components/ubec/dashboard/page-frame';
import { ActivityCard, PlansSection, WorkloadCard, isNational } from '@/components/ubec/dashboard/sections';
import { useUbecDashboard } from '@/components/ubec/dashboard/use-dashboard';
import { RatToolsCard } from '@/components/ubec/dashboard/rat-tools';
import { ObservationPlansCard } from '@/components/ubec/dashboard/observation-plans';
import { observationViewer } from '@/lib/observation-requests';
import { LevelMappingCard } from '@/components/level-mapping-card';
import { sumMappings } from '@/lib/level-mapping';
import { departmentLabel, downloadsRatTools, ubecRoleTitle, ubecRoles } from '@/lib/ubec';

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
        <div className="nh-sheet"><NationalGlance data={d} />{/* UBEC127: national spending by school level across the submitted plans. */}<LevelMappingCard className="ubec-level-mapping" mapping={sumMappings(d.items.flatMap(i => i.levels ? [i.levels] : []))} description={`Across the ${d.items.length} submitted ${d.items.length === 1 ? 'plan' : 'plans'}: ECCDE, Primary, JSS and what is not school-specific`} />{/* Observations asked before sending to UBEC (row 156): the UBEC BEAP Chair follows them. */}{observationViewer(d.user.role, d.user.department) && <ObservationPlansCard hideEmpty />}<div className="national-lower-grid"><WorkloadCard data={d} /><ActivityCard data={d} limit={6} moreHref="/ubec/activity" /></div></div>
      </> : <>
        {/* UBEC Planning (DPRS) downloads each submitted plan's RAT tool (UBEC139). */}
        {downloadsRatTools(d.user.role, d.user.department) && <RatToolsCard />}
        {/* Audit, Procurement and Finance: observations an Executive Chairman asked for before sending (row 156). */}
        {observationViewer(d.user.role, d.user.department) && <ObservationPlansCard />}
        <LevelMappingCard className="ubec-level-mapping" mapping={sumMappings(d.items.flatMap(i => i.levels ? [i.levels] : []))} description="Across the plans you review: ECCDE, Primary, JSS and what is not school-specific" />
        <PlansSection data={d} items={d.items} limit={6} moreHref="/ubec/plans" />
        <div className="national-lower-grid"><WorkloadCard data={d} /><ActivityCard data={d} limit={6} moreHref="/ubec/activity" /></div>
      </>}
    </>}
  </UbecPageFrame>;
}
