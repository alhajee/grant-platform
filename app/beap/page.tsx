"use client";


import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { currentPlanHref, planHref, planPeriod } from "@/lib/action-plans";
import { PlanSetupSummary } from '@/components/plan-setup-summary';
import { ArrowRightIcon } from "lucide-react";
import { PillarIllustration } from "@/components/pillar-illustration";
import { InfrastructureIllustration } from "@/components/infrastructure-illustration";
import { BudgetArtwork, PlansArtwork, SchoolsArtwork } from "@/components/metric-artwork";
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
          {summary && !error && <Button asChild><Link href={planHref('/beap/review', summary.plan.id)}>Review plan<ArrowRightIcon /></Link></Button>}
        </header>
        <section className="plan-kpis" aria-label="Plan at a glance">
          {[
            {label:'Proposed budget',value:total ? money.format(total.budget) : '—',Artwork:BudgetArtwork,tone:'sage'},
            {label:'Available funding',value:summary?.plan.fundingTotal != null ? money.format(Number(summary.plan.fundingTotal)) : '—',Artwork:BudgetArtwork,tone:'peach'},
            {label:'Schools',value:total ? String(total.schoolCount) : '—',Artwork:SchoolsArtwork,tone:'lilac'},
            {label:'Budget lines',value:total ? String(total.lineCount) : '—',Artwork:PlansArtwork,tone:'blue'},
          ].map(({label,value,Artwork,tone})=><div className="plan-kpi" data-tone={tone} key={label}><Artwork /><dl><dt>{label}</dt><dd>{loading ? <Skeleton className="h-7 w-24" /> : error ? '—' : value}</dd></dl></div>)}
        </section>
        {summary && !error && <details className="pillar-plan-details plan-details-disclosure"><summary>Funding details & assessment documents <span>Implementation · {summary.plan.implementationYear ?? '—'}</span></summary><PlanSetupSummary setup={summary.plan} compact /></details>}

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
                  const share = id === 'infrastructure' ? percent(sectionIndex === 0 ? split.infrastructure : split.tlm) : percent(allocation.shares[id]);
                  const canOpen = !!section.href && !!summary && !error;
                  return <Card key={id+'-'+sectionIndex} className="pillar-component-card" data-component={key} data-available={!!section.href}>
                    <CardHeader>
                      <div className="pillar-card-top"><div className="pillar-card-artwork">{key === 'infrastructure' ? <InfrastructureIllustration kind="new" /> : <PillarIllustration pillar={key} standalone />}</div><span className="component-allocation" title={id === 'teachers' ? 'Shared allocation for Teacher Development and ICT' : 'Share of total funding'}>{share}%{id === 'teachers' ? ' shared' : ''}</span></div>
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
