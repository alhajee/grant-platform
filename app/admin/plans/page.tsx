'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { SearchIcon, Trash2Icon } from 'lucide-react';
import { toast } from 'sonner';
import { AdminHeader, useAdminMe } from '@/components/admin-header';
import { EmptySubmissionsArt } from '@/components/empty-art/ubec';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { planStatusLabels } from '@/lib/action-plans';
import type { PlanStatus } from '@/lib/action-plans';
import { formatQuarters } from '@/lib/format-quarters';
import { stateDisplayName } from '@/lib/state-names';

type AdminPlan = { id: number; stateCode: string; startYear: number; implementationYear: number | null; status: PlanStatus; createdAt: string; createdBy: string | null; quarters: number[]; lines: number; ubecRounds: number };

const withUbec = new Set<string>(['submitted_ubec', 'ubec_review', 'ubec_approved']);
const stateName = (code: string) => stateDisplayName(code).replace(/ State$/, '');
const planTitle = (plan: AdminPlan) => `${plan.startYear} · ${plan.quarters.length ? `${formatQuarters(plan.quarters)} ` : ''}BEAP`;
const dateFormat = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Africa/Lagos' });

/** Admin > Plans: every state's plans; the Super Admin may delete any of them, including plans already sent to UBEC. */
export default function AdminPlansPage() {
  const { me, error: meError } = useAdminMe();
  const [plans, setPlans] = useState<AdminPlan[] | null>(null), [error, setError] = useState(''), [search, setSearch] = useState('');
  const [target, setTarget] = useState<AdminPlan | null>(null), [confirm, setConfirm] = useState(''), [busy, setBusy] = useState(false), [problem, setProblem] = useState('');
  const load = useCallback(async () => {
    setError('');
    try {
      const response = await fetch('/api/admin/plans', { cache: 'no-store' });
      if (response.status === 401) { window.location.replace('/'); return; }
      const body = await response.json().catch(() => ({})) as { plans?: AdminPlan[]; error?: string };
      if (!response.ok || !body.plans) throw Error(body.error || 'Unable to load the plans');
      setPlans(body.plans);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to load the plans'); }
  }, []);
  useEffect(() => { if (me && !me.impersonating) void Promise.resolve().then(load); }, [me, load]);
  const shown = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (plans ?? []).filter(plan => !query || `${stateName(plan.stateCode)} ${plan.stateCode} ${planTitle(plan)} ${planStatusLabels[plan.status] ?? plan.status}`.toLowerCase().includes(query));
  }, [plans, search]);

  function open(plan: AdminPlan) { setTarget(plan); setConfirm(''); setProblem(''); }
  async function remove() {
    if (!target || busy) return;
    setBusy(true); setProblem('');
    try {
      const response = await fetch('/api/admin/plans', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: target.id, confirm }) });
      const body = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw Error(body.error || 'The plan could not be deleted. Please try again.');
      toast.success(`${stateName(target.stateCode)} ${planTitle(target)} was deleted`);
      setTarget(null);
      await load();
    } catch (cause) { setProblem(cause instanceof Error ? cause.message : 'The plan could not be deleted. Please try again.'); }
    finally { setBusy(false); }
  }

  const confirmed = !!target && confirm.trim().toUpperCase() === target.stateCode;
  return <div className="beap-page min-h-screen w-full"><AdminHeader current="plans" user={me?.user ?? null} /><main id="main-content" className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 pb-12 pt-8">
    <div className="flex flex-wrap items-end justify-between gap-4">
      <h1 className="text-3xl font-semibold tracking-tight">Plans</h1>
      <div className="relative w-full max-w-xs"><SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input className="bg-card pl-9" placeholder="Search state, year or status" aria-label="Search plans" value={search} onChange={event => setSearch(event.target.value)} /></div>
    </div>
    {(error || meError) && <Alert variant="destructive"><AlertTitle>Plans unavailable</AlertTitle><AlertDescription>{error || meError}<Button variant="outline" size="sm" onClick={() => void load()}>Try again</Button></AlertDescription></Alert>}
    {me?.impersonating ? <Alert><AlertTitle>You are using another account</AlertTitle><AlertDescription>Return to your administrator account to manage plans</AlertDescription></Alert>
      : !plans && !error ? <Skeleton className="h-80 w-full" />
      : plans && (shown.length === 0
        ? <div className="flex flex-col items-center gap-3 rounded-xl border bg-card py-12 text-center text-sm text-muted-foreground"><EmptySubmissionsArt label={plans.length ? 'No matching plans' : 'No plans yet'} /><p>{plans.length ? 'No plans match your search' : 'No state has created a plan yet'}</p></div>
        : <div className="overflow-hidden rounded-xl border bg-card"><Table>
          <TableHeader><TableRow><TableHead>State</TableHead><TableHead>Plan</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Items</TableHead><TableHead>Created</TableHead><TableHead className="w-0"><span className="sr-only">Actions</span></TableHead></TableRow></TableHeader>
          <TableBody>{shown.map(plan => <TableRow key={plan.id}>
            <TableCell className="font-medium">{stateName(plan.stateCode)}</TableCell>
            <TableCell>{planTitle(plan)}{plan.implementationYear && plan.implementationYear !== plan.startYear && <span className="text-muted-foreground"> · implemented {plan.implementationYear}</span>}</TableCell>
            <TableCell><div className="flex flex-wrap items-center gap-1.5"><span>{planStatusLabels[plan.status] ?? plan.status}</span>{plan.ubecRounds > 0 && !withUbec.has(plan.status) && <Badge variant="secondary">{plan.ubecRounds === 1 ? 'Sent to UBEC before' : `Sent to UBEC ${plan.ubecRounds} times`}</Badge>}</div></TableCell>
            <TableCell className="text-right tabular-nums">{plan.lines}</TableCell>
            <TableCell className="text-muted-foreground">{dateFormat.format(new Date(plan.createdAt))}{plan.createdBy && <> · {plan.createdBy}</>}</TableCell>
            <TableCell><Button variant="ghost" size="sm" className="action-remove" aria-label={`Delete the ${stateName(plan.stateCode)} ${planTitle(plan)}`} onClick={() => open(plan)}><Trash2Icon data-icon="inline-start" />Delete</Button></TableCell>
          </TableRow>)}</TableBody>
        </Table></div>)}
    <AlertDialog open={!!target} onOpenChange={next => { if (!next && !busy) setTarget(null); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete the {target && `${stateName(target.stateCode)} ${planTitle(target)}`}?</AlertDialogTitle>
          <AlertDialogDescription>Its {target?.lines ?? 0} items, documents, comments, review history and notifications are deleted with it.{target && target.ubecRounds > 0 && ' It has been sent to UBEC, so its UBEC submissions, assessments and decisions are deleted too.'} This cannot be undone.</AlertDialogDescription>
        </AlertDialogHeader>
        {target && <div className="flex flex-col gap-2"><Label htmlFor="admin-plan-confirm">Type <span className="font-mono font-semibold">{target.stateCode}</span> to confirm</Label><Input id="admin-plan-confirm" autoComplete="off" value={confirm} onChange={event => setConfirm(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && confirmed) { event.preventDefault(); void remove(); } }} /></div>}
        {problem && <p role="alert" className="text-sm text-destructive">{problem}</p>}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
          <AlertDialogAction variant="destructive" disabled={busy || !confirmed} onClick={event => { event.preventDefault(); void remove(); }}>{busy && <Spinner data-icon="inline-start" />}Delete plan</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </main></div>;
}
