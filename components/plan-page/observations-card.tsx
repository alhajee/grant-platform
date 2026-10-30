'use client';
import '@/components/observations/observations.css';
import { useCallback, useEffect, useState } from 'react';
import { ScanEyeIcon } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ObservationRequests } from '@/components/observations/observation-requests';
import { waitingDepartments, type ObservationStatus } from '@/lib/observation-requests';

export type PlanObservations = ObservationStatus & { canRequest: boolean };

/** The plan's observation requests (row 156) for the Executive Chairman and the BEAP Chair; null for everyone else. */
export function usePlanObservations(planId: number | undefined, enabled: boolean, reloadKey: unknown) {
  const [data, setData] = useState<PlanObservations | null>(null);
  const load = useCallback(async () => {
    if (!planId || !enabled) { setData(null); return; }
    try {
      const response = await fetch(`/api/plans/observations?plan=${planId}`, { cache: 'no-store' });
      setData(response.ok ? await response.json() as PlanObservations : null);
    } catch { setData(null); }
  }, [planId, enabled]);
  useEffect(() => { void Promise.resolve().then(load); }, [load, reloadKey]);
  return { data, reload: load };
}

/** Where the observations asked of the oversight departments stand (the SUBEB's own since UBEC168). Shown once a request has been made. */
export function ObservationsCard({ data }: { data: PlanObservations | null }) {
  if (!data?.requests.length) return null;
  const waiting = waitingDepartments(data.requests).length;
  return <Card className="plan-status-panel observations-card">
    <CardHeader><CardTitle><h2><ScanEyeIcon aria-hidden="true" />Observations before UBEC</h2></CardTitle>
      <CardDescription>{waiting ? 'The plan can be sent to UBEC once every department asked replies' : data.openComments ? `${data.openComments} open ${data.openComments === 1 ? 'observation' : 'observations'} to resolve before sending to UBEC` : 'All observations are in and resolved'}</CardDescription></CardHeader>
    <CardContent className="observations-card-body"><ObservationRequests requests={data.requests} limit={3} /></CardContent>
  </Card>;
}
