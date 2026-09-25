"use client";


import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { currentPlanHref, planHref, planPeriod } from "@/lib/action-plans";
import { PlanSetupSummary } from '@/components/plan-setup-summary';
import { ArrowRightIcon } from "lucide-react";
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
      <main className="beap-main" id="main-content">
        <Button asChild variant="ghost" size="sm" className="mb-3"><Link href="/dashboard">← Dashboard</Link></Button>
        <header className="beap-heading">
          <div>
            <p className="beap-period">{summary ? planPeriod(summary.plan) : "Action plan"} <span aria-hidden="true">/</span> Matching Grant</p>
            <div className="beap-title"><h1>{summary && summary.plan.startYear !== summary.plan.endYear ? "Multi-year action plan" : "Annual action plan"}</h1>{summary && <PlanStatusBadge status={summary.plan.status} />}</div>
            <p className="beap-intro">{summary?.canEdit ? 'Choose a component to start or continue your plan.' : 'View your saved plan and review history.'}</p>
          </div>
          <div className="beap-total" aria-live="polite">
            <span>Saved plan budget</span>
            {loading ? <Skeleton className="mt-2 h-8 w-56" /> : <strong>{error || !total ? "—" : money.format(total.budget)}</strong>}
            <small>{loading ? "Loading saved projects…" : error || !total ? "Unavailable" : `${total.lineCount} budget ${total.lineCount === 1 ? "line" : "lines"} · ${total.schoolCount} ${total.schoolCount === 1 ? "school" : "schools"}`}</small>
          </div>
        </header>
        {summary && !error && <><PlanSetupSummary setup={summary.plan} /><div className="review-entry"><Button asChild><Link href={planHref('/beap/review', summary.plan.id)}>Review components & progress</Link></Button></div></>}

        {error && <Alert variant="destructive" className="mb-6"><AlertTitle>Unable to load your plan</AlertTitle><AlertDescription>{error}<Button variant="outline" size="sm" onClick={() => { setLoading(true); setError(""); void loadOverview(); }}>Try again</Button></AlertDescription></Alert>}

        <section aria-labelledby="pillars-title">
          <div className="beap-section-heading"><h2 id="pillars-title">Plan by pillar</h2></div>
          <div className="flex flex-col gap-5">
            {visiblePillars.map((pillar,index)=><Card key={pillar.id}>
              <CardHeader><div className="flex items-center justify-between gap-4"><CardTitle><h3>{index+1}. {pillar.name}</h3></CardTitle><Badge variant="secondary">{percent(pillar.components.reduce((sum,id)=>sum+allocation.shares[id],0))}%</Badge></div></CardHeader>
              <CardContent className="flex flex-col gap-5">
                {pillar.components.map(id=>{const component=beapComponents.find(c=>c.id===id)!;const stats=pillarSummaries[id];return <section key={id} className="rounded-xl border p-4" aria-labelledby={'component-'+id}>
                  <div className="mb-3 flex items-center justify-between gap-4"><h4 id={'component-'+id} className="font-medium">{component.name}</h4><span className="tabular-nums text-muted-foreground">{percent(allocation.shares[id])}%</span></div>
                  <div className="flex flex-col gap-3">{componentSections[id].map((section,sectionIndex)=>canSeeSection(id,section.department)&&<div key={section.name} className="flex flex-wrap items-center justify-between gap-3">
                    <div><p className="text-sm">{section.name}{id==='infrastructure'&&<span className="ml-2 text-muted-foreground">{percent(sectionIndex===0?split.infrastructure:split.tlm)}% of total</span>}</p><p className="text-xs text-muted-foreground">{subebDepartmentName(section.department)}</p></div>
                    {section.href ? <div className="flex flex-wrap items-center gap-3"><span className="text-sm tabular-nums text-muted-foreground">{loading?'Loading…':error||!stats?'—':money.format((id==='infrastructure'&&sectionIndex===1?summary?.tlm?.budget:stats.budget)??0)+' proposed'}</span>{summary&&!error&&<Button asChild variant="outline" size="sm"><Link href={planHref(section.href,summary.plan.id)}>{summary.editablePillars.some(p=>p===(id==='infrastructure'&&sectionIndex===1?'tlm':id))?'Open component':'View component'}<ArrowRightIcon data-icon="inline-end"/></Link></Button>}</div>:<Badge variant="outline">Not available yet</Badge>}
                  </div>)}</div>
                </section>;})}
              </CardContent>
            </Card>)}
          </div>
        </section>
      </main>
    </div>
  );
}
