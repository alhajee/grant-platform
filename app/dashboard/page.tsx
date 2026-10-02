"use client";
import "./dashboard.css";

import { useCallback, useEffect, useState } from "react";
import { ArrowRightIcon, ArrowUpRightIcon, CalendarDaysIcon, CircleCheckIcon, FileTextIcon, PencilIcon, PlusIcon, SearchIcon } from "lucide-react";
import { BudgetArtwork, PlansArtwork, SchoolsArtwork } from "@/components/metric-artwork";
import { CreatePlanDialog } from "@/components/create-plan-dialog";
import { EditPlanDialog } from "@/components/edit-plan-dialog";
import { OtherFundingInfo } from "@/components/funding-sources-field";
import { otherFundingTotal } from "@/lib/plan-setup";
import { statePlanOpen } from "@/lib/pillar-review";
import { fromKobo, toKobo, type FundingSource } from "@/lib/funding-policy";
import { SubebHeader } from "@/components/subeb-header";
import { DashboardArtwork } from "@/components/dashboard-artwork";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { PlanStatusBadge } from '@/components/plan-status';
import { emptyInvestmentFilters, investmentFilterCount, InvestmentFilter, type InvestmentArea } from '@/components/investment-filter';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { planHref, planPeriod, type PlanOverview } from "@/lib/action-plans";
import { subebDisplayName } from '@/lib/state-names';
import type { LocalUser } from "@/lib/local-session";

const money = new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 2 });
const compactMoney = new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", notation: "compact", maximumFractionDigits: 2 });
const date = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" });
// Whole naira on the card; kobo only when there is any.
const cardMoney = new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", minimumFractionDigits: 0, maximumFractionDigits: 2 });
const relative = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
const DAY_MS = 86_400_000;
/** "today", "yesterday", "4 days ago"; older than a month falls back to the date. */
function updatedAgo(value: string) {
  const then = new Date(value), days = Math.round((new Date().setHours(0, 0, 0, 0) - new Date(then).setHours(0, 0, 0, 0)) / DAY_MS);
  return days >= 0 && days <= 30 ? relative.format(-days, "day") : `on ${date.format(then)}`;
}

export default function DashboardPage() {
  const [user, setUser] = useState<LocalUser | null>(null);
  const [stateName, setStateName] = useState("");
  const [plans, setPlans] = useState<PlanOverview[]>([]);
  const [targetedSchools, setTargetedSchools] = useState(0);
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
      const dashboard = await response.json() as { plans: PlanOverview[]; stateName: string; targetedSchools: number; role: string; canCreatePlan: boolean };
      setCanCreatePlan(dashboard.canCreatePlan);
      setUser(previous => previous ? { ...previous, role: dashboard.role } : previous);
      setPlans(dashboard.plans);
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
  const latest = dashboardPlans[0];
  const areaAmounts: Record<InvestmentArea, number> = {
    infrastructure: dashboardPlans.reduce((sum, plan) => sum + plan.infrastructureBudget, 0),
    sports: dashboardPlans.reduce((sum, plan) => sum + plan.sportsBudget, 0),
    sbmc: dashboardPlans.reduce((sum, plan) => sum + (plan.sbmcBudget ?? 0), 0),
    tlm: dashboardPlans.reduce((sum, plan) => sum + (plan.tlmBudget ?? 0), 0),
    monitoring: dashboardPlans.reduce((sum, plan) => sum + (plan.monitoringBudget ?? 0), 0),
    gscci: dashboardPlans.reduce((sum, plan) => sum + (plan.gscciBudget ?? 0), 0),
    curriculum: dashboardPlans.reduce((sum, plan) => sum + (plan.curriculumBudget ?? 0), 0),
  };
  const selectedAreas = investmentFilters.areas.length ? investmentFilters.areas : ["infrastructure", "sports", "sbmc", "tlm", "monitoring", "gscci", "curriculum"] as InvestmentArea[];
  const areaDetails: Record<InvestmentArea, { label: string; color: string }> = {
    infrastructure: { label: "Infrastructure", color: "var(--primary)" },
    sports: { label: "Sports development", color: "var(--dashboard-sage)" },
    sbmc: { label: "SBMC", color: "var(--lilac)" },
    tlm: { label: "TLM", color: "var(--peach)" },
    monitoring: { label: "Supervision & Monitoring", color: "var(--butter)" },
    gscci: { label: "Greening & Safeguards", color: "#9fc7a4" },
    curriculum: { label: "Curriculum", color: "var(--blush)" },
  };
  const investmentTotal = selectedAreas.reduce((sum, area) => sum + areaAmounts[area], 0);
  let investmentCursor = 0;
  const investmentGradient = investmentTotal ? `conic-gradient(${selectedAreas.map(area => { const start = investmentCursor; investmentCursor += areaAmounts[area] / investmentTotal * 100; return `${areaDetails[area].color} ${start}% ${investmentCursor}%`; }).join(", ")})` : "var(--muted)";
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
            {visiblePlans.map(plan => {
              const funding = Number(plan.fundingTotal ?? 0), other = Number(otherFundingTotal(plan));
              const share = funding > 0 ? Math.round(plan.budget / funding * 100) : 0;
              return <Card className="dashboard-plan-card" key={plan.id}>
                <CardHeader className="plan-card-header">
                  <span className="plan-calendar" aria-hidden="true"><CalendarDaysIcon /></span>
                  <div className="min-w-0"><CardTitle><h3>{planPeriod(plan)} BEAP</h3></CardTitle><CardDescription>{plan.startYear === plan.endYear ? "Annual" : `${plan.endYear - plan.startYear + 1}-year`} plan · Matching Grant</CardDescription></div>
                  <PlanStatusBadge status={plan.status} />
                </CardHeader>
                <CardContent>
                  <div className="plan-budget"><span>Available funding</span><strong>{cardMoney.format(funding)}</strong></div>
                  {plan.lineCount > 0 || plan.budget > 0 ? <div className="plan-proposed"><Progress value={Math.min(share, 100)} aria-label={`${share}% of available funding proposed`} /><p><strong>{compactMoney.format(plan.budget)}</strong> proposed<span>{share}%</span></p></div>
                    : <p className="plan-proposed plan-proposed-empty">Nothing proposed yet</p>}
                  {(plan.lineCount > 0 || plan.schoolCount > 0 || other > 0) ? <ul className="plan-chips" aria-label="Plan contents">
                    {plan.lineCount > 0 && <li>{plan.lineCount} budget {plan.lineCount === 1 ? "line" : "lines"}</li>}
                    {plan.schoolCount > 0 && <li>{plan.schoolCount} {plan.schoolCount === 1 ? "school" : "schools"}</li>}
                    {other > 0 && <li>{compactMoney.format(other)} other funding<OtherFundingInfo setup={plan} /></li>}
                  </ul> : <div className="plan-chips" aria-hidden="true" />}
                  <div className="plan-card-bottom"><time dateTime={plan.updatedAt} title={date.format(new Date(plan.updatedAt))}>Updated {updatedAgo(plan.updatedAt)}</time><span className="plan-card-actions">{canCreatePlan && statePlanOpen(plan.status) && <Button size="sm" variant="ghost" onClick={() => setEditing(plan.id)}><PencilIcon />Edit plan</Button>}<Button asChild size="sm" variant="outline"><a href={planHref(isOfficer && ['draft', 'changes_requested'].includes(plan.status) ? "/beap" : "/beap/review", plan.id)}>{!isOfficer && ['awaiting_review','awaiting_beap_chair'].includes(plan.status) ? "Review plan" : !isOfficer || ['awaiting_review', 'awaiting_beap_chair', 'awaiting_chairman', 'approved'].includes(plan.status) ? "View plan" : plan.lineCount ? "Continue" : "Start planning"}<ArrowUpRightIcon /></a></Button></span></div>
                </CardContent>
              </Card>;
            })}
            {canCreatePlan && visiblePlans.length > 0 && !query && !activeInvestmentFilters && <Button variant="outline" className="dashboard-new-plan" onClick={beginPlan}><span className="new-plan-symbol"><PlusIcon /></span><strong>Plan what comes next.</strong><span>Choose your year and quarters.<br />Build your next action plan.</span><span className="new-plan-link">Create a new plan<ArrowRightIcon /></span></Button>}
            {!visiblePlans.length && <div className="dashboard-empty"><FileTextIcon /><h3>{query ? "No matching plans" : activeInvestmentFilters ? "No plans match your filters" : "No action plans yet"}</h3><p>{query ? "Try a different year or clear your search." : activeInvestmentFilters ? "Adjust or clear the dashboard filters to see more plans." : canCreatePlan ? "Create an action plan so your state team can start filling its pillars." : "Your Executive Chairman or an authorized colleague must create a plan before you can start filling it."}</p>{(query || activeInvestmentFilters || canCreatePlan) && <Button variant="outline" onClick={query ? () => setQuery("") : activeInvestmentFilters ? () => setInvestmentFilters(emptyInvestmentFilters) : beginPlan}>{query ? "Clear search" : activeInvestmentFilters ? "Clear filters" : "Create action plan"}</Button>}</div>}
          </div>}
        </section>
        <aside className="dashboard-aside">
          <div className="investment-filter-bar"><InvestmentFilter plans={plans} value={investmentFilters} onChange={setInvestmentFilters} /></div>
          <div className="dashboard-aside-content">
          <Card className="budget-allocation"><CardHeader><CardTitle><h2>Where your plans invest</h2></CardTitle><CardDescription>{activeInvestmentFilters ? `${dashboardPlans.length} matching ${dashboardPlans.length === 1 ? "plan" : "plans"}` : "Proposed budget across all periods"}</CardDescription></CardHeader><CardContent>
            <div className="allocation-donut" role="img" aria-label={unavailable ? "Budget breakdown unavailable" : selectedAreas.map(area => `${areaDetails[area].label} ${money.format(areaAmounts[area])}`).join("; ")} style={{ background: unavailable ? "var(--muted)" : investmentGradient }}><div><span>{unavailable ? "—" : compactMoney.format(investmentTotal)}</span><small>{activeInvestmentFilters ? "Filtered proposed" : "Total proposed"}</small></div></div>
            <div className="allocation-legend">{selectedAreas.map(area => <div key={area}><span><i style={{ background: areaDetails[area].color }} />{areaDetails[area].label}</span><strong>{unavailable ? "—" : compactMoney.format(areaAmounts[area])}</strong></div>)}</div>
          </CardContent></Card>
          <div className="dashboard-next"><span className="next-icon"><CircleCheckIcon /></span><h3>{latest ? "Progress saved" : "One workspace. Three pillars."}</h3><p>{latest ? `Your ${planPeriod(latest)} plan is saved. Return to your pillars whenever you're ready.` : "Bring your education priorities together, one pillar at a time."}</p>{latest && !unavailable && <Button asChild variant="link"><a href={planHref("/beap", latest.id)}>Back to your plan<ArrowRightIcon /></a></Button>}</div>
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
