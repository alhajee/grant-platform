"use client";
import { useCallback, useEffect, useState } from 'react';
import { BellIcon } from 'lucide-react';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { planHref, planPeriod } from '@/lib/action-plans';
import { reviewActionLabels, type ReviewAction } from '@/lib/plan-review';
type Notification = { id: number; planId: number; startYear: number; endYear: number; action: ReviewAction; actorName: string; actorRole: string };
export function PlanNotifications() {
  const [items, setItems] = useState<Notification[]>([]);
  const [error, setError] = useState(false);
  const load = useCallback(async () => {
    try {
      const response = await fetch('/api/plans/notifications', { cache: 'no-store' });
      if (!response.ok) throw new Error();
      setItems((await response.json() as { notifications: Notification[] }).notifications); setError(false);
    } catch { setError(true); }
  }, []);
  useEffect(() => { void Promise.resolve().then(load); const focus = () => { void load(); }; window.addEventListener('focus', focus); return () => window.removeEventListener('focus', focus); }, [load]);
  if (error) return <Alert className="mb-6"><AlertTitle>Notifications unavailable</AlertTitle><AlertDescription><Button variant="outline" onClick={load}>Try again</Button></AlertDescription></Alert>;
  if (!items.length) return null;
  return <Alert className="mb-6"><BellIcon /><AlertTitle>Plan updates ({items.length})</AlertTitle><AlertDescription><div className="review-notifications">{items.map(item => <a key={item.id} href={planHref('/beap/review', item.planId)}>{planPeriod(item)} · {item.action === 'approve' && item.actorRole === 'UBEC Executive Secretary' ? 'Approved by UBEC' : reviewActionLabels[item.action]}<span>{item.actorName}</span></a>)}</div></AlertDescription></Alert>;
}
