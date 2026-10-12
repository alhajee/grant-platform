'use client';
import type { ReactNode } from 'react';
import { RefreshCw } from 'lucide-react';
import { UbecShell } from '@/components/ubec-shell';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import type { UbecDashboard } from '@/lib/ubec';

/** The funding-year filter and Refresh. Pages with their own hero (the Overview) place it themselves. */
export function YearControls({ years, year, onYear, onRefresh, loading }: { years: readonly number[]; year: string; onYear: (year: string) => void; onRefresh: () => void; loading: boolean }) {
  return <div className="national-dashboard-filters">
    <Select value={year} onValueChange={onYear}><SelectTrigger aria-label="Funding year"><SelectValue placeholder="Funding year" /></SelectTrigger><SelectContent><SelectGroup><SelectItem value="all">All funding years</SelectItem>{years.map(value => <SelectItem key={value} value={String(value)}>{value}</SelectItem>)}</SelectGroup></SelectContent></Select>
    <Button variant="outline" size="sm" onClick={onRefresh} disabled={loading}><RefreshCw data-icon="inline-start" />Refresh</Button>
  </div>;
}

/**
 * One UBEC page: the shell, a title with the funding-year filter and Refresh, the loading and error states, then
 * the page's content once the dashboard data is in.
 */
export function UbecPageFrame({ eyebrow, title, hideTitle = false, data, error, loading, year, onYear, onRefresh, children }: {
  eyebrow: string; title: string; /** The page's own hero carries the heading; the title stays for screen readers */ hideTitle?: boolean; data: UbecDashboard | null; error: string; loading: boolean;
  year: string; onYear: (year: string) => void; onRefresh: () => void; children: (data: UbecDashboard) => ReactNode;
}) {
  return <UbecShell user={data?.user}>
    <div className="national-page-title" data-compact={hideTitle || undefined}>
      <div className={hideTitle ? 'sr-only' : undefined}><span className="national-eyebrow">{eyebrow}</span><h1>{title}</h1></div>
      {!hideTitle && <YearControls years={data?.years ?? []} year={year} onYear={onYear} onRefresh={onRefresh} loading={loading} />}
    </div>
    {error && <Alert variant="destructive"><AlertTitle>Unable to load</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
    {loading && !data ? <div className="national-kpis"><Skeleton className="h-44" /><Skeleton className="h-44" /><Skeleton className="h-44" /></div> : data && !error && children(data)}
  </UbecShell>;
}
