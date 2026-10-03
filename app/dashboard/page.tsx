"use client";
import "./dashboard.css";

import { useCallback, useEffect, useState } from "react";
import { ArrowRightIcon, FileTextIcon, PlusIcon, SearchIcon } from "lucide-react";
import { BudgetArtwork, PlansArtwork, SchoolsArtwork } from "@/components/metric-artwork";
import { CreatePlanDialog } from "@/components/create-plan-dialog";
import { EditPlanDialog } from "@/components/edit-plan-dialog";
import { OtherFundingInfo } from "@/components/funding-sources-field";
import { ComponentBudgets } from "@/components/dashboard/component-budgets";
import { PlanCard } from "@/components/dashboard/plan-card";
import { RecentActivity } from "@/components/dashboard/recent-activity";
import type { PlanActivity } from "@/lib/plan-activity";
import { otherFundingTotal } from "@/lib/plan-setup";
import { fromKobo, toKobo, type FundingSource } from "@/lib/funding-policy";
import { SubebHeader } from "@/components/subeb-header";
import { DashboardArtwork } from "@/components/dashboard-artwork";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { emptyInvestmentFilters, investmentFilterCount, InvestmentFilter, type InvestmentArea } from '@/components/investment-filter';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { planPeriod, type PlanOverview } from "@/lib/action-plans";
import { subebDisplayName } from '@/lib/state-names';
import type { LocalUser } from "@/lib/local-session";

const money = new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 2 });
const compactMoney = new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", notation: "compact", maximumFractionDigits: 2 });

export default function DashboardPage() {
  const [user, setUser] = useState<LocalUser | null>(null);
  const [stateName, setStateName] = useState("");
  const [plans, setPlans] = useState<PlanOverview[]>([]);
  const [targetedSchools, setTargetedSchools] = useState(0);
  const [recentActivity, setRecentActivity] = useState<PlanActivity[]>([]);
  const [canCreatePlan, setCanCreatePlan] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [investmentFilters, setInvestmentFilters] = useState(emptyInvestmentFilters);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<number | null>(null);
  const load = useCallback(async () => {
    setError("");
    try {
      const [session, response] = await Promise.all([fetch("/api/auth/session", { cache: "no-store" }), fetch("/api/plans", { cache: "no-store" })]);
      if (session.status === 401 || response.status === 401) { window.location.replace("/"); return; }
      if (!session.ok || !response.ok) throw new Error();
      const loggedIn = (await session.json() as { user: LocalUser }).user;
      if (loggedIn.role.startsWith('UBEC ')) { window.location.replace('/ubec'); return; }
      setUser(loggedIn);
      const dashboard = await response.json() as { plans: PlanOverview[]; recentActivity?: PlanActivity[]; stateName: string; targetedSchools: number; role: string; canCreatePlan: boolean };
      setCanCreatePlan(dashboard.canCreatePlan);
      setUser(previous => previous ? { ...previous, role: dashboard.role } : previous);
      setPlans(dashboard.plans);
      setRecentActivity(dashboard.recentActivity ?? []);
      setStateName(dashboard.stateName);
      setTargetedSchools(dashboard.targetedSchools);
    } catch { setError("We couldn't load your dashboard. Please check your connection and try again."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void Promise.resolve().then(load); }, [load]);

  function beginPlan() { setOpen(true); }
  const isOfficer = user?.role === 'Data Entry Staff';
  const activeInvestmentFilters = investmentFilterCount(investmentFilters);
  const dashboardPlans = plans.filter(plan => {
    const quarters = plan.fundingQuarters ?? [1, 2, 3, 4];
    const matchesArea = !investmentFilters.areas.length || investmentFilters.areas.some(area => ({
      infrastructure: plan.infrastructureBudget,
      sports: plan.sportsBudget,
      sbmc: plan.sbmcBudget ?? 0,
      tlm: plan.tlmBudget ?? 0,
      monitoring: plan.monitoringBudget ?? 0,
      gscci: plan.gscciBudget ?? 0,
      curriculum: plan.curriculumBudget ?? 0,
      quality: plan.qualityBudget ?? 0,
      ict: plan.ictBudget ?? 0,
    })[area] > 0);
    return (!investmentFilters.years.length || investmentFilters.years.some(year => year >= plan.startYear && year <= plan.endYear))
      && (!investmentFilters.quarters.length || investmentFilters.quarters.some(quarter => quarters.includes(quarter)))
      && (!investmentFilters.statuses.length || investmentFilters.statuses.includes(plan.status))
      && matchesArea
      && (!investmentFilters.minimumBudget || plan.budget >= Number(investmentFilters.minimumBudget))
      && (!investmentFilters.maximumBudget || plan.budget <= Number(investmentFilters.maximumBudget))
      && (!investmentFilters.hasBudgetLines || plan.lineCount > 0)
      && (!investmentFilters.hasSchools || plan.schoolCount > 0);
  });
  const totalFunding = dashboardPlans.reduce((sum, plan) => sum + Number(plan.fundingTotal ?? 0), 0);
  // Other funding across the shown plans, one line per component and funder.
  const groupedSources = [...dashboardPlans.flatMap(plan => plan.fundingSources ?? []).reduce((map, source) => { const key = `${source.component}|${source.funder.toLowerCase()}`; const prior = map.get(key); return new Map(map).set(key, { ...source, id: undefined, amount: fromKobo(toKobo(prior?.amount ?? '0') + toKobo(source.amount)) }); }, new Map<string, FundingSource>()).values()];
  const otherFunding = { otherFunding: fromKobo(dashboardPlans.reduce((sum, plan) => sum + toKobo(plan.otherFunding ?? '0'), BigInt(0))), fundingSources: groupedSources };
  const dashboardSchoolCount = activeInvestmentFilters ? new Set(dashboardPlans.flatMap(plan => plan.schoolIds ?? [])).size : targetedSchools;
  const areaAmounts: Record<InvestmentArea, number> = {
    infrastructure: dashboardPlans.reduce((sum, plan) => sum + plan.infrastructureBudget, 0),
    sports: dashboardPlans.reduce((sum, plan) => sum + plan.sportsBudget, 0),
    sbmc: dashboardPlans.reduce((sum, plan) => sum + (plan.sbmcBudget ?? 0), 0),
    tlm: dashboardPlans.reduce((sum, plan) => sum + (plan.tlmBudget ?? 0), 0),
    monitoring: dashboardPlans.reduce((sum, plan) => sum + (plan.monitoringBudget ?? 0), 0),
    gscci: dashboardPlans.reduce((sum, plan) => sum + (plan.gscciBudget ?? 0), 0),
    curriculum: dashboardPlans.reduce((sum, plan) => sum + (plan.curriculumBudget ?? 0), 0),
    quality: dashboardPlans.reduce((sum, plan) => sum + (plan.qualityBudget ?? 0), 0),
    ict: dashboardPlans.reduce((sum, plan) => sum + (plan.ictBudget ?? 0), 0),
  };
  const allAreas: InvestmentArea[] = ["infrastructure", "sports", "sbmc", "tlm", "monitoring", "gscci", "curriculum", "quality", "ict"];
  const visiblePlans = dashboardPlans.filter((p) => `${planPeriod(p)} action plan ${p.status}`.includes(query.toLowerCase().trim()) || (/^\d{4}$/.test(query.trim()) && Number(query) >= p.startYear && Number(query) <= p.endYear));
  const unavailable = loading || Boolean(error);

  return <div className="dashboard-page">
    <SubebHeader user={user} />
    <main className="dashboard-main" id="main-content">
      <section className="dashboard-hero" aria-labelledby="hero-title">
        <div className="dashboard-hero-copy"><div><h1 id="hero-title">{loading ? <span className="sr-only">Loading state…</span> : stateName ? subebDisplayName(stateName) : "State unavailable"}</h1></div>{canCreatePlan && <Button className="hero-create" onClick={beginPlan} disabled={unavailable}><PlusIcon />Create action plan</Button>}</div>
        <DashboardArtwork />
        <section className="dashboard-stats" aria-label="Workspace totals">
          {[{ label: "Basic Education Action Plans", value: String(dashboardPlans.length), artwork: PlansArtwork, tone: "ivory" }, { label: "Total plan funding", value: compactMoney.format(totalFunding), artwork: BudgetArtwork, tone: "teal" }, { label: "Targeted schools", value: String(dashboardSchoolCount), artwork: SchoolsArtwork, tone: "sage" }].map((stat) => (
            <Card className="dashboard-stat" data-tone={stat.tone} key={stat.label}>
              <CardHeader><CardTitle className="stat-label"><stat.artwork />{stat.label}</CardTitle></CardHeader>
              <CardContent>
                {loading ? <Skeleton className="h-8 w-24" /> : <strong title={stat.label === "Total plan funding" ? money.format(totalFunding) : undefined}>{error ? "—" : stat.value}</strong>}
                {stat.label === "Total plan funding" && !loading && !error && <span className="stat-sub" title={money.format(Number(otherFundingTotal(otherFunding)))}>Other funding {compactMoney.format(Number(otherFundingTotal(otherFunding)))}<OtherFundingInfo setup={otherFunding} /></span>}
              </CardContent>
            </Card>
          ))}
        </section>
      </section>

      {error && <Alert variant="destructive"><AlertTitle>Dashboard unavailable</AlertTitle><AlertDescription>{error}<Button variant="outline" onClick={() => { setLoading(true); void load(); }}>Try again</Button></AlertDescription></Alert>}

      {isOfficer && !user?.department && <Alert className="mb-6"><AlertTitle>Department assignment needed</AlertTitle><AlertDescription>Your Director or Executive Chairman can assign your department in Users. Until then, you can view saved plans but cannot edit or submit them.</AlertDescription></Alert>}
      <div className="dashboard-body">
        <section className="dashboard-plans" id="action-plans" aria-labelledby="plans-title">
          <div className="dashboard-section-title"><div><h2 id="plans-title">Your Basic Education Action Plans <span>{unavailable ? "—" : dashboardPlans.length}</span></h2></div>{canCreatePlan && <Button variant="outline" size="sm" onClick={beginPlan} disabled={unavailable}><PlusIcon />New plan</Button>}</div>
          <div className="plan-search"><SearchIcon aria-hidden="true" /><Input aria-label="Search action plans by year" placeholder="Find a plan by year…" value={query} onChange={(e) => setQuery(e.target.value)} disabled={unavailable} /></div>
          {loading ? <div className="dashboard-plan-list"><Skeleton className="h-48 w-full rounded-xl" /><Skeleton className="h-48 w-full rounded-xl" /></div> : error ? <div className="dashboard-empty">Your plans will appear here when the connection is restored.</div> : <div className="dashboard-plan-list">
            {visiblePlans.map(plan => <PlanCard key={plan.id} plan={plan} isOfficer={isOfficer} canEdit={canCreatePlan} onEdit={setEditing} />)}
            {canCreatePlan && visiblePlans.length > 0 && !query && !activeInvestmentFilters && <Button variant="outline" className="dashboard-new-plan" onClick={beginPlan}><span className="new-plan-symbol"><PlusIcon /></span><strong>Plan what comes next.</strong><span>Choose your year and quarters.<br />Build your next action plan.</span><span className="new-plan-link">Create a new plan<ArrowRightIcon /></span></Button>}
            {!visiblePlans.length && <div className="dashboard-empty"><FileTextIcon /><h3>{query ? "No matching plans" : activeInvestmentFilters ? "No plans match your filters" : "No action plans yet"}</h3><p>{query ? "Try a different year or clear your search." : activeInvestmentFilters ? "Adjust or clear the dashboard filters to see more plans." : canCreatePlan ? "Create an action plan so your state team can start filling its pillars." : "Your Executive Chairman or an authorized colleague must create a plan before you can start filling it."}</p>{(query || activeInvestmentFilters || canCreatePlan) && <Button variant="outline" onClick={query ? () => setQuery("") : activeInvestmentFilters ? () => setInvestmentFilters(emptyInvestmentFilters) : beginPlan}>{query ? "Clear search" : activeInvestmentFilters ? "Clear filters" : "Create action plan"}</Button>}</div>}
          </div>}
        </section>
        <aside className="dashboard-aside">
          <div className="investment-filter-bar"><InvestmentFilter plans={plans} value={investmentFilters} onChange={setInvestmentFilters} matchCount={dashboardPlans.length} /></div>
          <div className="dashboard-aside-content">
          <Card className="budget-allocation"><CardHeader><CardTitle><h2>Where your plans invest</h2></CardTitle><CardDescription>{activeInvestmentFilters ? `${dashboardPlans.length} matching ${dashboardPlans.length === 1 ? "plan" : "plans"}` : "Share of each component's funding already proposed"}</CardDescription></CardHeader><CardContent>
            <ComponentBudgets plans={dashboardPlans} areas={allAreas} amounts={areaAmounts} totalFunding={totalFunding} unavailable={unavailable} selected={investmentFilters.areas} onToggle={area => setInvestmentFilters(current => ({ ...current, areas: current.areas.length === 1 && current.areas[0] === area ? [] : [area] }))} />
          </CardContent></Card>
          {!unavailable && <RecentActivity items={recentActivity} />}
          </div>
        </aside>
      </div>
      <Separator className="dashboard-footer-separator" />
      <footer className="dashboard-footer"><span>Universal Basic Education Commission</span><span>© {new Date().getFullYear()}</span></footer>
    </main>
    {editing !== null && <EditPlanDialog planId={editing} onClose={() => setEditing(null)} onSaved={() => void load()} />}
    {open && <CreatePlanDialog stateName={stateName} plans={plans} onClose={() => setOpen(false)} />}
  </div>;
}
