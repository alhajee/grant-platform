'use client';
import { ArrowUpRight, EyeIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { nationalStatusLabels, type UbecDashboard } from '@/lib/ubec';

/**
 * UBEC149: other units' plans. Every UBEC unit sees every released component and may leave observative comments on it;
 * they are for information and never hold up the review (only the component's own unit and the Oversight Departments do).
 */
export function ObservingPlans({ plans }: { plans: NonNullable<UbecDashboard['observing']> }) {
  return <Card className="observing-plans"><CardHeader><CardTitle><EyeIcon aria-hidden="true" />Other units&apos; plans <Badge variant="secondary">{plans.length}</Badge></CardTitle>
    <CardDescription>See every component and leave observative comments. They are for information and do not hold the review up</CardDescription></CardHeader>
    <CardContent><ul className="observing-plans-list">{plans.map(p => <li key={p.planId}><a href={`/ubec/review?plan=${p.planId}`}><span><strong>{p.state}</strong><small>{p.period} BEAP · Submission {p.round}</small><Badge variant={p.status === 'returned' ? 'warning' : p.status === 'approved' ? 'default' : 'secondary'} className="mt-1 self-start">{nationalStatusLabels[p.status] ?? p.status}</Badge></span><ArrowUpRight aria-hidden="true" /></a></li>)}</ul></CardContent>
  </Card>;
}
