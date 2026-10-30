'use client';
import '@/components/observations/observations.css';
import { useEffect, useState } from 'react';
import { ChevronRightIcon } from 'lucide-react';
import { NoItemsArt, UbecEmpty } from '@/components/empty-art/ubec-flow';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { listDepartments, type ObservationPlan } from '@/lib/observation-requests';
import { oversightList } from '@/lib/ubec';

const date = new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium' });
type User = { name: string; role: string; department?: string | null };

/**
 * Plans whose Executive Chairman asked UBEC Audit, Procurement or Finance for observations before sending (row 156), for
 * those departments and the UBEC BEAP Chair (app/api/ubec/observations). `hideEmpty` leaves it out of the overview when
 * there is nothing to show.
 */
export function ObservationPlansCard({ limit, hideEmpty = false, onUser, base = '/ubec/observations' }: { limit?: number; hideEmpty?: boolean; onUser?: (user: User) => void; /** Where a plan opens: /ubec/observations, or /beap/observations for SUBEB departments (UBEC168) */ base?: string }) {
  const [plans, setPlans] = useState<ObservationPlan[] | null>(null), [department, setDepartment] = useState<string | null>(null), [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    void fetch('/api/ubec/observations', { cache: 'no-store' }).then(async response => {
      if (response.status === 401) { window.location.replace('/'); return; }
      const body = await response.json().catch(() => ({})) as { plans?: ObservationPlan[]; department?: string | null; user?: User; error?: string };
      if (!response.ok) throw Error(body.error || 'Unable to load the observation requests');
      if (!active) return;
      setPlans(body.plans ?? []); setDepartment(body.department ?? null);
      if (body.user) onUser?.(body.user);
    }).catch(cause => { if (active) setError(cause instanceof Error ? cause.message : 'Unable to load the observation requests'); });
    return () => { active = false; };
  }, [onUser]);
  if (hideEmpty && plans && !plans.length) return null;
  const shown = plans ? (limit ? plans.slice(0, limit) : plans) : [];
  const waiting = (p: ObservationPlan) => p.departments.some(d => !d.completedAt && (!department || d.department === department));
  return <Card className="observations-card"><CardHeader><CardTitle>Observation requests {plans && <Badge variant="secondary">{plans.filter(waiting).length} waiting</Badge>}</CardTitle>
    <CardDescription>Plans a SUBEB Executive Chairman asked {department ? 'your department' : oversightList('or')} to look at before sending to UBEC</CardDescription></CardHeader><CardContent>
    {error ? <p className="text-sm text-destructive" role="alert">{error}</p>
      : !plans ? <Skeleton className="h-24 w-full rounded-xl" />
      : !plans.length ? <UbecEmpty art={<NoItemsArt />} title="No observation requests" compact>Requests appear here when an Executive Chairman asks before sending a plan</UbecEmpty>
      : <ul className="observation-plans">{shown.map(p => <li key={p.planId}><a href={`${base}?plan=${p.planId}`}>
        <div><strong>{p.state} · {p.period}</strong><small>Asked by {p.requestedByName} · {date.format(new Date(p.requestedAt))}</small></div>
        <span className="observation-plan-depts">{p.departments.map(d => <Badge key={d.department} variant={d.completedAt ? 'secondary' : 'warning'}>{listDepartments([d.department])} · {d.completedAt ? 'Sent back' : 'Waiting'}</Badge>)}<ChevronRightIcon aria-hidden="true" className="size-4 text-muted-foreground" /></span>
      </a></li>)}</ul>}
  </CardContent></Card>;
}
