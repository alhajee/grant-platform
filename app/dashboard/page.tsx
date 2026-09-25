"use client";
import "./dashboard.css";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRightIcon, ArrowUpRightIcon, CalendarDaysIcon, CircleCheckIcon, FileTextIcon, PlusIcon, SearchIcon } from "lucide-react";
import { BudgetArtwork, PlansArtwork, SchoolsArtwork, ReviewArtwork } from "@/components/metric-artwork";
import { CreatePlanDialog } from "@/components/create-plan-dialog";
import { SubebHeader } from "@/components/subeb-header";
import { DashboardArtwork } from "@/components/dashboard-artwork";
import { Button } from "@/components/ui/button";
import { PlanStatusBadge } from '@/components/plan-status';
import { PlanNotifications } from '@/components/plan-notifications';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { planHref, planPeriod, type PlanOverview } from "@/lib/action-plans";
import type { LocalUser } from "@/lib/local-session";

const money = new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 2 });
const compactMoney = new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", notation: "compact", maximumFractionDigits: 2 });
const date = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" });

export default function DashboardPage() {
  const [user, setUser] = useState<LocalUser | null>(null);
  const [stateName, setStateName] = useState("");
  const [plans, setPlans] = useState<PlanOverview[]>([]);
  const [targetedSchools, setTargetedSchools] = useState(0);
  const [canCreatePlan, setCanCreatePlan] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
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
  const actionQueue = plans.flatMap(plan=>(plan.pendingActions??[]).map(action=>({...action,plan})));
  const totalBudget = plans.reduce((sum, p) => sum + p.budget, 0);
  const latest = plans[0];
  const infrastructure = plans.reduce((sum, p) => sum + p.infrastructureBudget, 0);
  const sbmc = plans.reduce((sum,p)=>sum+(p.sbmcBudget??0),0);
  const tlm = plans.reduce((sum,p)=>sum+(p.tlmBudget??0),0);
  const sports = plans.reduce((sum, p) => sum + p.sportsBudget, 0);
  const visiblePlans = plans.filter((p) => `${planPeriod(p)} action plan ${p.status}`.includes(query.toLowerCase().trim()) || (/^\d{4}$/.test(query.trim()) && Number(query) >= p.startYear && Number(query) <= p.endYear));
  const unavailable = loading || Boolean(error);

  return <div className="dashboard-page">
    <SubebHeader user={user} />
    <main className="dashboard-main" id="main-content">
      <section className="dashboard-hero" aria-labelledby="hero-title">
        <div className="dashboard-hero-copy"><div><h1 id="hero-title">{loading ? <span className="sr-only">Loading state…</span> : stateName ? `${stateName} SUBEB` : "State unavailable"}</h1></div>{canCreatePlan && <Button className="hero-create" onClick={beginPlan} disabled={unavailable}><PlusIcon />Create action plan</Button>}</div>
        <DashboardArtwork />
        <section className="dashboard-stats" aria-label="Workspace totals">
          {[{ label: "Action plans", value: String(plans.length), artwork: PlansArtwork, tone: "ivory" }, { label: "Total proposed budget", value: compactMoney.format(totalBudget), artwork: BudgetArtwork, tone: "teal" }, { label: "Targeted schools", value: String(targetedSchools), artwork: SchoolsArtwork, tone: "sage" }].map((stat) => (
            <Card className="dashboard-stat" data-tone={stat.tone} key={stat.label}>
              <CardHeader><CardTitle className="stat-label"><stat.artwork />{stat.label}</CardTitle></CardHeader>
              <CardContent>
                {loading ? <Skeleton className="h-8 w-24" /> : <strong title={stat.label === "Total proposed budget" ? money.format(totalBudget) : undefined}>{error ? "—" : stat.value}</strong>}
              </CardContent>
            </Card>
          ))}
        </section>
      </section>

      {error && <Alert variant="destructive"><AlertTitle>Dashboard unavailable</AlertTitle><AlertDescription>{error}<Button variant="outline" onClick={() => { setLoading(true); void load(); }}>Try again</Button></AlertDescription></Alert>}

      {!unavailable && <PlanNotifications />}
      {isOfficer && !user?.department && <Alert className="mb-6"><AlertTitle>Department assignment needed</AlertTitle><AlertDescription>Your Director or Executive Chairman can assign your department in Users. Until then, you can view saved plans but cannot edit or submit them.</AlertDescription></Alert>}
      <div className="dashboard-body">
        <section className="dashboard-plans" id="action-plans" aria-labelledby="plans-title">
          <div className="dashboard-section-title"><div><h2 id="plans-title">Your action plans <span>{unavailable ? "—" : plans.length}</span></h2></div>{canCreatePlan && <Button variant="outline" size="sm" onClick={beginPlan} disabled={unavailable}><PlusIcon />New plan</Button>}</div>
          <div className="plan-search"><SearchIcon aria-hidden="true" /><Input aria-label="Search action plans by year" placeholder="Find a plan by year…" value={query} onChange={(e) => setQuery(e.target.value)} disabled={unavailable} /></div>
          {loading ? <div className="dashboard-plan-list"><Skeleton className="h-48 w-full rounded-xl" /><Skeleton className="h-48 w-full rounded-xl" /></div> : error ? <div className="dashboard-empty">Your plans will appear here when the connection is restored.</div> : <div className="dashboard-plan-list">
            {visiblePlans.map((plan, index) => <Card className="dashboard-plan-card" key={plan.id}>
              <CardHeader><div className="plan-card-top"><span className="plan-calendar"><CalendarDaysIcon /></span><PlanStatusBadge status={plan.status} /></div><CardTitle><h3>{planPeriod(plan)} action plan</h3></CardTitle><CardDescription>{plan.startYear === plan.endYear ? "Annual" : `${plan.endYear - plan.startYear + 1}-year`} planning period · Matching Grant</CardDescription></CardHeader>
              <CardContent><div className="plan-budget"><span>Proposed budget</span><strong>{money.format(plan.budget)}</strong></div><div className="plan-counts"><span>{plan.lineCount} budget {plan.lineCount === 1 ? "line" : "lines"}</span><span>{plan.schoolCount} {plan.schoolCount === 1 ? "school" : "schools"}</span></div><div className="plan-card-bottom"><span>{index === 0 && !query ? "Latest activity" : "Updated"}<small>{date.format(new Date(plan.updatedAt))}</small></span><Button asChild size="sm" variant="outline"><a href={planHref(isOfficer && ['draft', 'changes_requested'].includes(plan.status) ? "/beap" : "/beap/review", plan.id)}>{!isOfficer && plan.status === 'awaiting_review' ? "Review plan" : !isOfficer || ['awaiting_review', 'awaiting_chairman', 'approved'].includes(plan.status) ? "View plan" : plan.lineCount ? "Continue" : "Start planning"}<ArrowUpRightIcon /></a></Button></div></CardContent>
            </Card>)}
            {canCreatePlan && visiblePlans.length > 0 && !query && <Button variant="outline" className="dashboard-new-plan" onClick={beginPlan}><span className="new-plan-symbol"><PlusIcon /></span><strong>Plan what comes next.</strong><span>Choose your year and quarters.<br />Build your next action plan.</span><span className="new-plan-link">Create a new plan<ArrowRightIcon /></span></Button>}
            {!visiblePlans.length && <div className="dashboard-empty"><FileTextIcon /><h3>{query ? "No matching plans" : "No action plans yet"}</h3><p>{query ? "Try a different year or clear your search." : canCreatePlan ? "Create an action plan so your state team can start filling its pillars." : "Your Executive Chairman or an authorized colleague must create a plan before you can start filling it."}</p>{(query || canCreatePlan) && <Button variant="outline" onClick={query ? () => setQuery("") : beginPlan}>{query ? "Clear search" : "Create action plan"}</Button>}</div>}
          </div>}
        </section>
        <aside className="dashboard-aside">
      {!unavailable && actionQueue.length > 0 && <Card className="review-queue">
        <CardHeader><div className="review-queue-heading"><ReviewArtwork /><div><CardTitle>Needs your attention</CardTitle><CardDescription>{actionQueue.length} {actionQueue.length === 1 ? 'item' : 'items'} waiting for you</CardDescription></div></div></CardHeader>
        <CardContent><div className="review-queue-list">{actionQueue.map(action => <div className="review-queue-row" key={action.href}><div><p className="font-medium">{action.label}</p><p className="text-sm text-muted-foreground">{planPeriod(action.plan)} action plan</p></div><Button asChild variant="outline" size="sm"><Link href={action.href}>Open<ArrowUpRightIcon data-icon="inline-end" /></Link></Button></div>)}</div></CardContent>
      </Card>}
          <Card className="budget-allocation"><CardHeader><CardTitle><h2>Where your plans invest</h2></CardTitle><CardDescription>Proposed budget across all periods</CardDescription></CardHeader><CardContent>
            <div className="allocation-donut" role="img" aria-label={unavailable ? "Budget breakdown unavailable" : `Infrastructure ${money.format(infrastructure)}; Sports development ${money.format(sports)}; SBMC ${money.format(sbmc)}; TLM ${money.format(tlm)}`} style={{ background: unavailable || !totalBudget ? "var(--muted)" : `conic-gradient(var(--primary) 0 ${infrastructure / totalBudget * 100}%, var(--dashboard-sage) ${infrastructure / totalBudget * 100}% ${(infrastructure+sports)/totalBudget*100}%, var(--lilac) ${(infrastructure+sports)/totalBudget*100}% ${(infrastructure+sports+sbmc)/totalBudget*100}%, var(--peach) ${(infrastructure+sports+sbmc)/totalBudget*100}% 100%)` }}><div><span>{unavailable ? "—" : compactMoney.format(totalBudget)}</span><small>Total proposed</small></div></div>
            <div className="allocation-legend"><div><span><i />Infrastructure</span><strong>{unavailable ? "—" : compactMoney.format(infrastructure)}</strong></div><div><span><i />Sports development</span><strong>{unavailable ? "—" : compactMoney.format(sports)}</strong></div><div><span><i style={{background:"var(--lilac)"}}/>SBMC</span><strong>{unavailable?"—":compactMoney.format(sbmc)}</strong></div><div><span><i style={{background:"var(--peach)"}}/>TLM</span><strong>{unavailable?"—":compactMoney.format(tlm)}</strong></div></div>
          </CardContent></Card>
          <div className="dashboard-next"><span className="next-icon"><CircleCheckIcon /></span><h3>{latest ? "Progress saved" : "One workspace. Three pillars."}</h3><p>{latest ? `Your ${planPeriod(latest)} plan is saved. Return to your pillars whenever you're ready.` : "Bring your education priorities together, one pillar at a time."}</p>{latest && !unavailable && <Button asChild variant="link"><a href={planHref("/beap", latest.id)}>Back to your plan<ArrowRightIcon /></a></Button>}</div>
        </aside>
      </div>
      <footer className="dashboard-footer"><span>Universal Basic Education Commission</span><span>© {new Date().getFullYear()}</span></footer>
    </main>
    {open && <CreatePlanDialog stateName={stateName} plans={plans} onClose={() => setOpen(false)} />}
  </div>;
}
