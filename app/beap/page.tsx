"use client";


import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { currentPlanHref, planHref, planPeriod } from "@/lib/action-plans";
import { PlanSetupSummary } from '@/components/plan-setup-summary';
import { ArrowRightIcon, Building2Icon, BookOpenIcon, GraduationCapIcon, ShieldCheckIcon, TrophyIcon, UsersIcon, MonitorIcon, ClipboardCheckIcon, LeafIcon, ChartNoAxesCombinedIcon } from "lucide-react";
import { SubebHeader } from "@/components/subeb-header";
import { defaultAllocation, infrastructureSplit, percent } from "@/lib/funding-policy";
import { subebDepartmentName } from "@/lib/subeb-departments";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { PlanStatusBadge } from '@/components/plan-status';
import { beapComponents, strategicPillars, componentSections, type BeapSummary, type PillarId, type PillarSummary } from "@/lib/beap-pillars";
import type { LocalUser } from "@/lib/local-session";

const money = new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const componentIcons = { infrastructure: Building2Icon, tlm: BookOpenIcon, quality: ShieldCheckIcon, teachers: GraduationCapIcon, sports: TrophyIcon, monitoring: ClipboardCheckIcon, curriculum: BookOpenIcon, sbmc: UsersIcon, planning: ChartNoAxesCombinedIcon, gscci: LeafIcon };
const pillarDescriptions: Record<string, string> = { quality: 'Better teaching. Richer learning.', access: 'Welcoming schools. Stronger communities.', system: 'Better data. Smarter decisions.' };

export default function BeapPage() {
  const [user, setUser] = useState<LocalUser | null>(null);
  const [summary, setSummary] = useState<BeapSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadOverview = useCallback(async () => {
    try {
      const [sessionResponse, planResponse] = await Promise.all([
        fetch("/api/auth/session", { cache: "no-store" }),
        fetch(currentPlanHref("/api/beap"), { cache: "no-store" }),
      ]);
      if (sessionResponse.status === 401 || planResponse.status === 401) { window.location.replace("/"); return; }
      if (!sessionResponse.ok || !planResponse.ok) throw new Error();
      const session = await sessionResponse.json() as { user: LocalUser };
      setUser(session.user);
      setSummary(await planResponse.json() as BeapSummary);
    } catch { setError("We couldn't load your saved plan. Check your connection and try again."); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void Promise.resolve().then(loadOverview); }, [loadOverview]);
  const total = summary?.total;
  const allocation = summary?.plan.fundingPolicy?.allocation ?? defaultAllocation;
  const split = infrastructureSplit(allocation);
  const pillarSummaries: Partial<Record<PillarId, PillarSummary>> = summary ?? {};

  const canSeeSection = (_id: PillarId, department: string) => !!summary && (summary.wholeState || (['Data Entry Staff','Director'].includes(summary.role) && summary.department === department));
  const visiblePillars = strategicPillars.map(p => ({...p, components:p.components.filter(id=>componentSections[id].some(section=>canSeeSection(id,section.department)))})).filter(p=>p.components.length);

  return (
    <div className="beap-page">
      <SubebHeader user={user} plan />
      <main className="beap-main pillar-overview" id="main-content">
        <Button asChild variant="ghost" size="sm" className="mb-3"><Link href="/dashboard">← Dashboard</Link></Button>
        <header className="beap-heading">
          <div>
            <p className="beap-period">{summary ? planPeriod(summary.plan) : "Action plan"} <span aria-hidden="true">/</span> Matching Grant</p>
            <div className="beap-title"><h1>{summary && summary.plan.startYear !== summary.plan.endYear ? "Multi-year action plan" : "Annual action plan"}</h1>{summary && <PlanStatusBadge status={summary.plan.status} />}</div>
            <p className="beap-intro">{summary?.canEdit ? 'Choose a component to start or continue your plan.' : 'View your saved plan and review history.'}</p>
          </div>
          <div className="beap-total" aria-live="polite">
            <span>Proposed budget</span>
            {loading ? <Skeleton className="mt-2 h-8 w-56" /> : <strong>{error || !total ? "—" : money.format(total.budget)}</strong>}
            <small>{loading ? "Loading saved projects…" : error || !total ? "Unavailable" : `${total.lineCount} budget ${total.lineCount === 1 ? "line" : "lines"} · ${total.schoolCount} ${total.schoolCount === 1 ? "school" : "schools"}`}</small>
          </div>
        </header>
        {summary && !error && <div className="pillar-plan-details"><PlanSetupSummary setup={summary.plan} compact /><div className="review-entry"><Button asChild><Link href={planHref('/beap/review', summary.plan.id)}>Review plan<ArrowRightIcon /></Link></Button></div></div>}

        {error && <Alert variant="destructive" className="mb-6"><AlertTitle>Unable to load your plan</AlertTitle><AlertDescription>{error}<Button variant="outline" size="sm" onClick={() => { setLoading(true); setError(""); void loadOverview(); }}>Try again</Button></AlertDescription></Alert>}

        <section aria-labelledby="pillars-title">
          <div className="beap-section-heading"><h2 id="pillars-title">Plan by pillar</h2></div>
          <div className="pillar-sections">
            {loading && <div className="pillar-card-grid">{[1,2,3,4].map(n => <Skeleton key={n} className="aspect-square rounded-2xl" />)}</div>}
            {visiblePillars.map((pillar,index)=><section key={pillar.id} className="pillar-section" data-pillar={pillar.id} aria-labelledby={'pillar-'+pillar.id}>
              <header className="pillar-section-header">
                <span className="pillar-number">{String(index+1).padStart(2,'0')}</span>
                <div><h3 id={'pillar-'+pillar.id}>{pillar.name}</h3><p>{pillarDescriptions[pillar.id]}</p></div>
                <span className="pillar-share">{percent(pillar.components.reduce((sum,id)=>sum+allocation.shares[id],0))}% <small>allocation</small></span>
              </header>
              <div className="pillar-card-grid">
                {pillar.components.flatMap(id => componentSections[id].map((section,sectionIndex) => {
                  if (!canSeeSection(id,section.department)) return null;
                  const key = id === 'infrastructure' && sectionIndex === 1 ? 'tlm' : id;
                  const stats = pillarSummaries[key];
                  const Icon = id === 'teachers' && sectionIndex === 1 ? MonitorIcon : componentIcons[key as keyof typeof componentIcons];
                  const share = id === 'infrastructure' ? percent(sectionIndex === 0 ? split.infrastructure : split.tlm) : percent(allocation.shares[id]);
                  const canOpen = !!section.href && !!summary && !error;
                  return <Card key={id+'-'+sectionIndex} className="pillar-component-card" data-available={!!section.href}>
                    <CardHeader>
                      <div className="pillar-card-top"><span className="pillar-component-icon"><Icon aria-hidden="true" /></span><span className="component-allocation" title={id === 'teachers' ? 'Shared allocation for Teacher Development and ICT' : 'Share of total funding'}>{share}%{id === 'teachers' ? ' shared' : ''}</span></div>
                      <CardTitle><h4>{section.name}</h4></CardTitle>
                      <p className="pillar-department">{subebDepartmentName(section.department)}</p>
                    </CardHeader>
                    <CardContent>
                      {section.href ? <div className="pillar-card-budget"><span>Proposed</span><strong>{stats ? money.format(stats.budget) : '—'}</strong></div> : <p className="pillar-coming-soon">{beapComponents.find(c=>c.id===id)?.description}</p>}
                      {canOpen ? <Button asChild variant="outline" className="pillar-card-action"><Link href={planHref(section.href!,summary!.plan.id)}>{summary!.editablePillars.some(p=>p===key)?'Open':'View'}<span className="sr-only"> {section.name}</span><ArrowRightIcon /></Link></Button> : <Badge variant="secondary" className="pillar-unavailable">Coming soon</Badge>}
                    </CardContent>
                  </Card>;
                }))}
              </div>
            </section>)}
          </div>
        </section>
      </main>
    </div>
  );
}
